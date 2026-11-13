// Reading the kassa's own Excel files (rows as read-excel-file gives them) into rows for the
// /payments/import and /expenses/import endpoints. Pure code, no browser APIs.

type Cell = string | number | boolean | Date | null | undefined;

const isoDay = (v: Cell): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  }
  return null;
};
const num = (v: Cell) => {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string' && v.trim()) { const n = Number(v.replace(/[\s'  ]/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n) : 0; }
  return 0;
};

export interface OtchyotRow { date: string; code: string; method: 'cash' | 'card'; amount: number; trips: number | null; note: string }

/** "otchyot": sana | id | reyslar soni | naxt | karta | opshiy kassa — the date only on a day's first row, then the red sum row. */
export function parseOtchyot(rows: Cell[][]): OtchyotRow[] {
  const head = (rows[0] || []).map((h) => String(h ?? '').toLowerCase().trim());
  const col = (re: RegExp, fallback: number) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : fallback; };
  const idx = { date: col(/sana|date/, 0), code: col(/^id|kod|code/, 1), trips: col(/reys/, 2), cash: col(/naxt|naqd|cash/, 3), card: col(/karta|card/, 4) };
  const out: OtchyotRow[] = [];
  let day: string | null = null;
  for (const r of rows.slice(1)) {
    day = isoDay(r[idx.date]) ?? day;
    const code = String(r[idx.code] ?? '').replace(/\s+/g, '').replace(/\.0+$/, '').toUpperCase();
    if (!code || !day) continue; // the day's sum row has no id
    const trips = r[idx.trips] === null || r[idx.trips] === undefined || r[idx.trips] === '' ? null : num(r[idx.trips]);
    const cash = num(r[idx.cash]), card = num(r[idx.card]);
    // Reyslar soni belongs to the client's row once, even when it was paid partly in cash and partly by card.
    if (cash > 0) out.push({ date: day, code, method: 'cash', amount: cash, trips, note: '' });
    if (card > 0) out.push({ date: day, code, method: 'card', amount: card, trips: cash > 0 ? (trips === null ? null : 0) : trips, note: '' });
  }
  return out;
}

export interface KassaBookRow { date: string; kind: 'expense' | 'opening'; source: 'cash' | 'card'; category: string; amount: number; note: string }
export interface KassaBookDay { date: string; income: number; expense: number }

const CATEGORY_RULES: Array<[RegExp, string]> = [
  // The card kassa's "avto 9.10 5ta" / "avia 30.10 1ta" lines pay for the goods themselves.
  [/tovar o[bp] kel|tovar olib kel/i, 'tovar_olib_kelish'],
  [/to[gʻ'‘`]*am(ga)?\b/i, 'togamga'],
  [/arofat/i, 'arofat'],
  [/\bavto\b|\bavia\b/i, 'tovar'],
  [/\bkassa 0\b|kassa nol/i, 'inkassa'],
  [/ob kel|olib kel|dostavka|yetkaz|kargo|reys|yo'?l kira/i, 'yetkazish'],
  [/paket|qadoq|skotch|skoch|lenta/i, 'paket'],
  [/tovar/i, 'tovar'],
  [/taksi|taxi|benzin|yoqilg|metan|propan/i, 'yoqilgi'],
  [/arenda|ijara/i, 'ijara'],
  [/oylik|avans|maosh|zarplat/i, 'oylik'],
  [/svet|gaz|internet|telefon|kommunal|suv/i, 'kommunal'],
  [/inkassa|topshir/i, 'inkassa'],
];
/** "250000 muxlisa opchaga avans" → "250000 Avans (Muxlisa opcha)", as the kassa writes advances. */
const tidyNote = (line: string) => line.replace(/^(\d[\d\s]*\s)?(\S+) (opcha|aka|opa|uka)ga avans$/i,
  (_m, sum = '', name: string, who: string) => `${sum}Avans (${name[0].toUpperCase()}${name.slice(1).toLowerCase()} ${who.toLowerCase()})`);
export const guessCategory = (note: string) => CATEGORY_RULES.find(([re]) => re.test(note))?.[1] ?? 'boshqa';

/**
 * "kassa naxt" / "kassa karta": sana | bor boʻlgan summa | tushgan | ishlatilgan | qolgan | (izoh).
 * The first day's "bor boʻlgan summa" becomes the opening balance; every spent sum becomes an expense
 * with the note as written. A note listing several sums that add up to the day's spending
 * ("105000 naxt / 30000 paket") becomes one expense per line. `month` (YYYY-MM) moves every date
 * to that month, for a book whose dates were left on the wrong month.
 */
export function parseKassaBook(rows: Cell[][], source: 'cash' | 'card', month?: string): { rows: KassaBookRow[]; days: KassaBookDay[]; fileMonth: string | null } {
  const out: KassaBookRow[] = [];
  const days: KassaBookDay[] = [];
  let fileMonth: string | null = null;
  let first = true;
  for (const r of rows.slice(1)) {
    const raw = isoDay(r[0]);
    if (!raw) continue;
    fileMonth ??= raw.slice(0, 7);
    const date = month ? `${month}-${raw.slice(8, 10)}` : raw;
    if (month && Number.isNaN(Date.parse(date))) continue; // e.g. the 31st moved into a 30-day month
    if (first) {
      out.push({ date, kind: 'opening', source, category: '', amount: num(r[1]), note: '' });
      first = false;
    }
    const income = num(r[2]), expense = num(r[3]);
    const note = String(r[5] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    days.push({ date, income, expense });
    if (expense <= 0) continue;
    // A line without its own sum ("22.10 2ta") continues the line above it.
    const parts: Array<{ line: string; amount: number }> = [];
    for (const l of note) {
      const amount = Number(l.match(/^\d{4,}(?:\s\d{3})*(?=\s|$)/)?.[0].replace(/\s/g, '') || 0);
      if (!amount && parts.length) parts[parts.length - 1].line += `\n${l}`;
      else parts.push({ line: tidyNote(l), amount });
    }
    if (parts.length > 1 && parts.every((p) => p.amount > 0) && parts.reduce((s, p) => s + p.amount, 0) === expense) {
      for (const p of parts) out.push({ date, kind: 'expense', source, category: guessCategory(p.line), amount: p.amount, note: p.line });
    } else {
      const text = parts.map((p) => p.line).join('\n') || `${expense} rasxod`;
      out.push({ date, kind: 'expense', source, category: guessCategory(text), amount: expense, note: text });
    }
  }
  return { rows: out, days, fileMonth };
}

/** Which kassa a book is: from its sheet name or file name ("kassa naxt", "kassa_naxt.xlsx", "kassa karta"). */
export const bookSource = (names: string[]): 'cash' | 'card' | null => {
  const text = names.join(' ').toLowerCase();
  if (/naxt|naqd|nalich|cash/.test(text)) return 'cash';
  if (/karta|card|plastik/.test(text)) return 'card';
  return null;
};
