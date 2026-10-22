// Turns the raw text that on-device OCR reads from a bank receipt and from the orders screen
// into fields. Pure functions, so they are tested in Node with real OCR output.

export interface Receipt {
  bank: string | null; transactionId: string | null; amount: number | null; commission: number | null; total: number | null;
  paidAt: string | null; sender: string | null; senderCard: string | null; recipient: string | null; recipientCard: string | null; status: string | null;
}
export interface Order { clientName: string | null; code: string | null; orderNo: string | null; transport: string | null; weight: string | null; amount: number | null }

const NUM = /(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d{1,2}))?/;
const NUM_G = new RegExp(NUM.source, 'g');

/** "44 600" -> 44600, "200,7" -> 200.7, "44 800,7" -> 44800.7 */
export function parseNumber(s: string): number | null {
  const m = s.match(NUM);
  if (!m) return null;
  const whole = Number(m[1].replace(/\D/g, ''));
  return m[2] ? Number(`${whole}.${m[2]}`) : whole;
}

const BANKS: Array<[RegExp, string]> = [
  [/\balif\b/i, 'Alif'], [/\bclick\b/i, 'Click'], [/\bpayme\b/i, 'Payme'], [/\buzum\b/i, 'Uzum'], [/kapital/i, 'Kapitalbank'],
  [/\banor\b/i, 'Anorbank'], [/\btbc\b/i, 'TBC'], [/hamkor/i, 'Hamkorbank'], [/ipak\s*yo/i, 'Ipak Yoʻli'], [/aloqa/i, 'Aloqabank'],
  [/xalq|халк/i, 'Xalq banki'], [/\bpaynet\b/i, 'Paynet'], [/\boson\b/i, 'Oson'], [/\bapelsin\b/i, 'Apelsin'], [/agrobank/i, 'Agrobank'],
  [/asaka/i, 'Asakabank'], [/infin/i, 'InFinBank'], [/davr/i, 'Davr bank'], [/trastbank|трастбанк/i, 'Trastbank'], [/milliy|nbu|нбу/i, 'Milliy bank'],
];

const KEY = {
  amount: /(сумма|summa|miqdor|amount|сумма перевода|o.?tkazma)/i,
  commission: /(комисс|komissiya|commission|xizmat haqi)/i,
  total: /(итого|jami|всего|total|umumiy|списано|yechildi)/i,
  txn: /(транзакц|tranzaksiya|transaction|операц|operatsiya|номер чека|chek raqami|check|receipt|kvitansiya|квитанц|\bid\b|\brrn\b)/i,
  sender: /(отправител|авитель|yuboruvchi|jo.?natuvchi|sender|откуда|qayerdan|плательщик|to.?lovchi)/i,
  recipient: /(получател|учатель|qabul qiluvchi|oluvchi|recipient|куда|qayerga|beneficiary)/i,
  status: /(исполнено|успешно|выполнен|muvaffaqiyatli|bajarildi|amalga oshirildi|success|o.?tkazildi)/i,
};
const CARD = /(uzcard|humo|visa|master\s*card|mc)?[\s:]*(?:\d{4}\s*)?[*•·.xх]{2,}\s*(\d{4})/i;

function cardOf(line: string): string | null {
  const m = line.match(CARD);
  if (!m) return null;
  return `${m[1] ? m[1].toUpperCase().replace(/\s/g, '') : ''}**${m[2]}`;
}
const after = (line: string, re: RegExp) => line.slice((line.match(re)?.index ?? 0) + (line.match(re)?.[0].length ?? 0)).trim();
/** Name as printed, without card numbers and stray OCR marks ("ь Akbarova |." -> "Akbarova I."). */
function cleanName(s: string): string | null {
  const words = s.replace(CARD, '').replace(/\|/g, 'I').replace(/[^\p{L}\s.'ʻʼ-]/gu, ' ').split(/\s+/).filter(Boolean);
  while (words.length && words[0].replace(/\W/g, '').length < 2) words.shift();
  while (words.length && /^[-.'ʻʼ]+$/.test(words[words.length - 1])) words.pop();
  return words.join(' ') || null;
}

export function parseReceipt(text: string): Receipt {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const r: Receipt = { bank: null, transactionId: null, amount: null, commission: null, total: null, paidAt: null, sender: null, senderCard: null, recipient: null, recipientCard: null, status: null };
  r.bank = BANKS.find(([re]) => re.test(text))?.[1] ?? null;
  const st = text.match(KEY.status);
  if (st) r.status = st[0][0].toUpperCase() + st[0].slice(1).toLowerCase();

  const d = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})[\s,г.]*(?:(\d{1,2}):(\d{2}))?/);
  if (d) {
    const time = d[4] ? `${d[4].padStart(2, '0')}:${d[5]}` : (text.match(/\b(\d{1,2}):(\d{2})\b/)?.slice(1, 3).map((x) => x.padStart(2, '0')).join(':') ?? '00:00');
    r.paidAt = `${d[3]}-${d[2]}-${d[1]}T${time}`;
  }

  lines.forEach((line, i) => {
    const next = lines[i + 1] || '';
    if (KEY.commission.test(line)) r.commission ??= parseNumber(after(line, KEY.commission));
    else if (KEY.total.test(line)) r.total ??= parseNumber(after(line, KEY.total));
    else if (KEY.amount.test(line)) r.amount ??= parseNumber(after(line, KEY.amount)) ?? parseNumber(next);
    if (KEY.txn.test(line) && !r.transactionId) {
      const tokens = `${after(line, KEY.txn)} ${KEY.txn.test(next) ? '' : next}`.match(/[0-9A-Z]{6,}/g)?.filter((t) => /\d{4}/.test(t));
      if (tokens?.length) r.transactionId = tokens[0];
    }
    if (KEY.sender.test(line) && !r.sender) {
      r.sender = cleanName(after(line, KEY.sender));
      r.senderCard = cardOf(line) ?? cardOf(next);
    }
    if (KEY.recipient.test(line) && !r.recipient) {
      r.recipient = cleanName(after(line, KEY.recipient));
      r.recipientCard = cardOf(line) ?? cardOf(next);
    }
  });
  if (r.amount != null) r.amount = Math.round(r.amount);
  // Receipts that print one sum only (no "Сумма" line): take the largest sum written with a currency.
  if (r.amount == null) {
    const sums = lines.filter((l) => /(сум|so.?m|uzs|сўм)/i.test(l) && !KEY.commission.test(l)).map(parseNumber).filter((n): n is number => n != null && n >= 100);
    if (sums.length) r.amount = Math.round(Math.max(...sums));
  }
  return r;
}

// ---------- orders screen ----------

const CODE = /([A-Z$5]{2,4})\s?[-—–]\s?(\d{5,7})\b/;
const SOM = /(\d{1,3}(?:[  ]\d{3})+|\d{4,})\s*[s5$З3з][oо0]/i;

function fixPrefix(p: string) {
  return p.replace(/\$/g, 'S').replace(/5/g, 'S');
}

export function parseOrders(text: string): { orders: Order[]; total: number | null } {
  const orders: Order[] = [];
  let total: number | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (/(kutilayotgan|jami|итого)/i.test(line)) {
      const m = line.match(SOM);
      if (m) total = parseNumber(m[1]);
      continue;
    }
    const code = line.match(CODE);
    // A row has a client code or an order number; the column headings have neither.
    if (!code && !/buyurtma\s*\S{0,3}\s*\d{4,}/i.test(line)) continue;
    const som = line.match(SOM);
    const order = line.match(/buyurtma\s*\S{0,3}\s*(\d{4,8})/i);
    const weight = line.match(/(\d+[.,]\d+|\d+)\s*kg/i);
    const transport = line.match(/\b(avia|avto|temir yo.?l|poyezd|dengiz)\b/i);
    const nameEnd = code?.index ?? line.search(/buyurtma/i);
    orders.push({
      clientName: cleanName(line.slice(0, Math.max(0, nameEnd))),
      code: code ? `${fixPrefix(code[1])}-${code[2]}` : null,
      orderNo: order?.[1] ?? null,
      transport: transport ? transport[1][0].toUpperCase() + transport[1].slice(1).toLowerCase() : null,
      weight: weight ? `${weight[1].replace(',', '.')} kg` : null,
      amount: som ? parseNumber(som[1]) : null,
    });
  }
  return { orders, total };
}

const mode = <T,>(values: T[]): T | null => {
  const counts = new Map<string, { v: T; n: number }>();
  for (const v of values) {
    if (v == null) continue;
    const k = JSON.stringify(v);
    counts.set(k, { v, n: (counts.get(k)?.n || 0) + 1 });
  }
  let best: { v: T; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.v ?? null;
};

/** Character-by-character majority among readings of the same value (lengths that disagree with most are dropped). */
function voteChars(values: Array<string | null>): string | null {
  const list = values.filter((v): v is string => Boolean(v));
  const len = mode(list.map((v) => v.length));
  if (len == null) return null;
  const same = list.filter((v) => v.length === len);
  return Array.from({ length: len }, (_, i) => mode(same.map((v) => v[i]))).join('');
}

/** The same screenshot read several ways (scale, contrast): keep, per field, what most readings agree on. */
export function voteOrders(readings: Array<{ orders: Order[]; total: number | null }>): { orders: Order[]; total: number | null; codeReadings: string[][] } {
  const count = mode(readings.map((r) => r.orders.length).filter((n) => n > 0)) ?? 0;
  const same = readings.filter((r) => r.orders.length === count);
  const orders: Order[] = [];
  for (let i = 0; i < count; i++) {
    const field = <K extends keyof Order>(k: K) => mode(same.map((r) => r.orders[i][k])) as Order[K];
    const chars = (k: 'code' | 'orderNo') => voteChars(same.map((r) => r.orders[i][k]));
    const amount = voteChars(same.map((r) => (r.orders[i].amount == null ? null : String(r.orders[i].amount))));
    orders.push({ clientName: field('clientName'), code: chars('code'), orderNo: chars('orderNo'), transport: field('transport'), weight: field('weight'), amount: amount ? Number(amount) : null });
  }
  // Every way each row's client code was read, so the kassa can check which of them is a real client.
  const codeReadings = orders.map((_, i) => [...new Set(same.map((r) => r.orders[i].code).filter((c): c is string => Boolean(c)))]);
  return { orders, total: mode(readings.map((r) => r.total)), codeReadings };
}

// OCR mixes up these digits on small screenshots, 0 and 8 above all.
const CONFUSE: Record<string, string[]> = { '0': ['8', '6', '9'], '8': ['0', '3', '6'], '6': ['0', '8', '5'], '9': ['0'], '3': ['8'], '5': ['6'], '1': ['7'], '7': ['1'] };

/** Every number one or two confusable digits away from `n`, with how many digits changed. */
export function variants(n: number, maxEdits = 2): Array<{ value: number; edits: number }> {
  const out = new Map<number, number>([[n, 0]]);
  let frontier = [String(n)];
  for (let e = 1; e <= maxEdits; e++) {
    const nextFrontier: string[] = [];
    for (const s of frontier) {
      for (let i = 0; i < s.length; i++) {
        for (const c of CONFUSE[s[i]] || []) {
          const t = s.slice(0, i) + c + s.slice(i + 1);
          if (t[0] === '0') continue;
          const v = Number(t);
          if (!out.has(v)) { out.set(v, e); nextFrontier.push(t); }
        }
      }
    }
    frontier = nextFrontier;
  }
  return [...out].map(([value, edits]) => ({ value, edits }));
}

/**
 * When the order prices do not add up to the receipt, find the smallest set of OCR digit fixes
 * that makes them add up exactly. Returns null when there is no single best answer.
 */
export function reconcile(amounts: number[], target: number): number[] | null {
  if (!amounts.length || amounts.some((a) => !a)) return null;
  if (amounts.reduce((s, a) => s + a, 0) === target) return amounts;
  if (amounts.length > 6) return null;
  // Prices are round (…800, …400); a fix that lands on a round number is preferred.
  const options = amounts.map((a) => variants(a).map((o) => ({ ...o, edits: o.edits + (o.value % 100 ? 0.5 : 0) })).sort((x, y) => x.edits - y.edits));
  let best: { values: number[]; edits: number } | null = null;
  let tie = false;
  const walk = (i: number, values: number[], sum: number, edits: number) => {
    if (best && edits > best.edits) return;
    if (i === options.length) {
      if (sum !== target) return;
      if (!best || edits < best.edits) { best = { values: [...values], edits }; tie = false; }
      else if (edits === best.edits) tie = true;
      return;
    }
    for (const o of options[i]) walk(i + 1, [...values, o.value], sum + o.value, edits + o.edits);
  };
  walk(0, [], 0, 0);
  return best && !tie ? (best as { values: number[] }).values : null;
}

/** Single-digit OCR alternatives of a client ID, to look up which one really exists. */
export function codeVariants(code: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < code.length; i++) {
    for (const c of CONFUSE[code[i]] || []) out.add(code.slice(0, i) + c + code.slice(i + 1));
  }
  out.delete(code);
  return [...out];
}

/** "TTT-102315" -> "102315": the kassa keeps one ID per client (same rule as server/receipts.ts). */
export function clientCodeOf(code: string | null | undefined): string {
  const raw = String(code || '').toUpperCase().replace(/\s+/g, '');
  const digits = raw.match(/\d{3,}/g);
  if (digits) return digits[digits.length - 1];
  return raw.replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}
