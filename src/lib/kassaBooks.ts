import type { BalanceMonth, Payment } from './types';
import { buildXlsx, type XCell, type XSheet, type XStyle } from './xlsx.js';

// The Excel books laid out cell for cell like the kassa's own hand-kept files: "kassa naxt.xlsx",
// "kassa karta.xlsx" (the two kassas) and the daily "otchyot.xlsx". Same sheet names, column widths,
// font colours, number formats and formulas. Pure code, shared by the browser and the server, so
// nothing here may import browser-only modules.

const MONEY = '#,##0.00\\ [$soʻm-443]';
const RED = 'FF0000';
const PURPLE = '7030A0';
const GREEN = '00B050';
const BLUE = '0070C0';
const BLUE_DARK = '1F4E79'; // "Blue, accent 5, darker 50%" in their file
const GREEN_DARK = '375623'; // "Green, accent 6, darker 50%"
const GREEN_MID = '548235'; // "Green, accent 6, darker 25%"

const tzDate = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const monthEnd = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const groupDigits = (n: number) => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const cell = (v: XCell['v'], s?: XStyle): XCell => ({ v, s });

/** Text for the kassa's last column: every expense of the day on its own line, as written. */
function expenseLine(e: { amount: number; note: string | null; category: string }, categoryLabel: (c: string) => string) {
  const note = (e.note || '').trim();
  // Imported from their book the note already starts with the amount ("260000 tovar ob kelishga").
  const lead = note.match(/^\d+/);
  if (lead && Number(lead[0]) === Number(e.amount)) return note;
  return `${e.amount} ${note || categoryLabel(e.category).toLowerCase()}`;
}

/** One kassa (cash = "kassa naxt", card = "kassa karta") for a span of days, plus "tushum umumiy" when both kassas are visible. */
export function kassaBook(data: BalanceMonth, source: 'cash' | 'card', categoryLabel: (c: string) => string, today: string): XSheet[] {
  const flow = (day: string, src: 'cash' | 'card') => data.days.find((r) => r.day === day && r.source === src);
  // A month that is still running is shown to its last day, as in the hand-kept book: the coming
  // days carry only the date and the formulas.
  const until = data.first.slice(0, 7) === data.last.slice(0, 7) && data.last >= today ? monthEnd(data.last) : data.last;
  const days: string[] = [];
  for (let d = data.first; d <= until; d = addDays(d, 1)) days.push(d);

  const head = (text: string, format: string) => cell(text, { color: RED, format });
  const rows: XSheet['rows'] = [[head('sana', 'dd\\.mm\\.yy;@'), head("bor bo'lgan summa", MONEY), head('tushgan summa', MONEY), head('ishlatilgan summa', MONEY), head('qolgan summa', MONEY)]];
  const heights: Record<number, number> = {};
  let balance = Number(data.opening[source] || 0);
  days.forEach((day, i) => {
    const r = i + 2;
    const f = flow(day, source);
    const income = Number(f?.income || 0), expense = Number(f?.expense || 0), adjustment = Number(f?.adjustment || 0);
    // A correction has no column of its own in the book: a plus goes in with the takings, a minus with
    // the spending, and the reason is written in the notes, so the running balance stays right.
    const inC = income + Math.max(adjustment, 0), inD = expense + Math.max(-adjustment, 0);
    const lines = [
      ...data.expenses.filter((e) => e.source === source && tzDate(e.spent_at) === day).map((e) => expenseLine(e, categoryLabel)),
      ...data.adjustments.filter((a) => (a.source === 'cash') === (source === 'cash') && tzDate(a.at) === day)
        .map((a) => `${a.amount > 0 ? '+' : '−'}${groupDigits(a.amount)} tuzatish${a.note ? ` (${a.note})` : ''}`),
    ];
    const active = day <= data.last && (income || expense || adjustment || lines.length);
    const open = balance;
    const close = open + (day <= data.last ? inC - inD : 0);
    rows.push([
      cell({ date: day }, { format: 'dd\\.mm\\.yy;@' }),
      i === 0 ? cell(open, { color: BLUE_DARK, format: MONEY }) : cell({ formula: `SUM(E${r - 1})`, value: open }, { color: BLUE_DARK, format: MONEY }),
      active ? cell(inC, { format: MONEY }) : null,
      active ? cell(inD, { format: MONEY }) : null,
      cell({ formula: `SUM(B${r}+C${r}-D${r})`, value: close }, { color: PURPLE, format: MONEY }),
      lines.length ? cell(lines.join('\n'), lines.length > 1 ? { wrap: true } : undefined) : null,
    ]);
    if (lines.length > 1) heights[r] = 15 * lines.length;
    balance = close;
  });

  const sheets: XSheet[] = [{
    name: source === 'cash' ? 'kassa naxt' : 'kassa karta', rows, heights, freezeRows: 1,
    widths: [8.140625, 19.7109375, 21, 18.85546875, 17.28515625, 28.85546875],
  }];

  if (!data.sources || data.sources.length === 2) {
    const first = 3, last = days.length + 2;
    const tot = { cash: 0, card: 0 };
    const body = days.map((day, i) => {
      const r = i + first;
      const cash = Number(flow(day, 'cash')?.income || 0), card = Number(flow(day, 'card')?.income || 0);
      tot.cash += cash; tot.card += card;
      return [
        cell({ date: day }, { color: GREEN_DARK, format: 'dd/mm\\ yyyy;@' }),
        cash ? cell(cash, { format: MONEY }) : null,
        card ? cell(card, { format: MONEY }) : null,
        cell({ formula: `SUM(B${r}:C${r})`, value: cash + card }, { color: RED, format: MONEY }),
      ];
    });
    const sum = (col: string, value: number) => cell({ formula: `SUM(${col}${first}:${col}${last})`, value }, { color: GREEN, format: MONEY });
    sheets.push({
      name: 'tushum umumiy', freezeRows: 1, widths: [10, 17.7109375, 18.85546875, 20.140625],
      rows: [
        [cell('sana', { color: RED, format: 'dd/mm\\ yyyy;@' }), cell('naxt tushum', { color: RED, format: MONEY }), cell('karta tushum', { color: RED, format: MONEY }), cell('umumiy tushum', { color: RED, format: MONEY })],
        [null, sum('B', tot.cash), sum('C', tot.card), sum('D', tot.cash + tot.card)],
        ...body,
      ],
    });
  }
  return sheets;
}

/** The daily report ("otchyot"): one row per payment under its day, then the day's sums in red. */
export function otchyotBook(payments: Payment[]): XSheet[] {
  const active = payments.filter((p) => !p.voided_at).sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());
  const center = (extra: XStyle = {}): XStyle => ({ align: 'center', ...extra });
  const head = (text: string, money = true) => cell(text, center({ color: RED, ...(money ? { format: MONEY } : {}) }));
  const rows: XSheet['rows'] = [[
    cell('sana', { color: RED, format: 'dd/mm/yy;@' }), head('id', false), head('reyslar soni', false),
    head('naxt'), head('karta'), head('opshiy kassa'), head('10 kunlik kassa'),
  ]];
  const byDay = new Map<string, Payment[]>();
  for (const p of active) {
    const day = tzDate(p.paid_at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(p);
  }
  for (const [day, list] of byDay) {
    const start = rows.length + 1;
    let cash = 0, card = 0;
    // A client who paid part in cash and part by card right after is one line, as in the book.
    const lines: Array<{ code: string; trips: number; cash: number | null; card: number | null }> = [];
    for (const p of list) {
      const isCash = p.method === 'cash';
      const amount = Number(p.amount);
      if (isCash) cash += amount; else card += amount;
      const last = lines[lines.length - 1];
      if (last && last.code === p.client_code && (isCash ? last.cash === null : last.card === null)) {
        if (isCash) last.cash = amount; else last.card = amount;
        last.trips += p.trips ?? 0;
      } else {
        lines.push({ code: p.client_code, trips: p.trips ?? 1, cash: isCash ? amount : null, card: isCash ? null : amount });
      }
    }
    lines.forEach((l, i) => {
      const code = /^\d{1,15}$/.test(l.code) ? Number(l.code) : l.code;
      const money = (n: number | null) => (n === null ? null : cell(n, center({ format: MONEY })));
      rows.push([
        i === 0 ? cell({ date: day }, { color: GREEN_MID, format: 'dd/mm/yy;@' }) : null,
        cell(code, center({ color: BLUE })),
        cell(l.trips, center()),
        money(l.cash),
        money(l.card),
      ]);
    });
    const end = rows.length, r = end + 1;
    const total = (formula: string, value: number) => cell({ formula, value }, center({ color: RED, format: MONEY }));
    rows.push([null, null, null, total(`SUM(D${start}:D${end})`, cash), total(`SUM(E${start}:E${end})`, card), total(`SUM(D${r}:E${r})`, cash + card)]);
  }
  return [{ name: 'Лист1', rows, freezeRows: 1, widths: [9.140625, 8.85546875, 11, 16.140625, 17, 17.28515625, 15.7109375] }];
}

export const kassaFileName = (source: 'cash' | 'card', first: string, last: string) => `kassa_${source === 'cash' ? 'naxt' : 'karta'}_${first}_${last}.xlsx`;
export const otchyotFileName = (first: string, last: string) => `otchyot_${first}_${last}.xlsx`;

export const kassaXlsx = (data: BalanceMonth, source: 'cash' | 'card', categoryLabel: (c: string) => string, today: string) =>
  buildXlsx(kassaBook(data, source, categoryLabel, today));
export const otchyotXlsx = (payments: Payment[]) => buildXlsx(otchyotBook(payments));
