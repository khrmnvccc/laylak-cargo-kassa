import type { BalanceMonth, Payment } from './types';

// Pure sheet builders shared by the browser (download buttons) and the server (the evening Telegram
// report), so nothing here may import browser-only code such as ./format or ./i18n.

// Laid out like the kassa's own hand-kept workbook: one block per day, one row per client,
// the sum under its payment type, then the day's totals in red and the day's kassa in purple.
const MONEY = '#,##0 "soʻm"';
const RED = '#e03131';
const PURPLE = '#7048e8';
const HEAD = '#c92a2a';
const COLS = ['cash', 'card', 'yandex', 'pochta'] as const;

type Col = typeof COLS[number];
type ClientRow = { code: string; name: string; count: number } & Record<Col, number>;

const tzParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` };
};
const dateOf = (iso: string) => tzParts(iso).date;
const timeOf = (iso: string) => tzParts(iso).time;
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const groupDigits = (value: number) => (value < 0 ? '−' : '') + Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
const METHOD_LABELS: Record<string, string> = { cash: 'Naqd', card: 'Karta', yandex: 'Karta · Yandex', pochta: 'Karta · Pochta' };
const methodLabel = (m: string) => METHOD_LABELS[m] ?? m;

export const EXPENSE_LABELS: Record<string, string> = {
  tovar: 'Tovar xaridi', paket: 'Paket va qadoq', yetkazish: 'Yetkazib berish', yoqilgi: 'Yoqilgʻi va transport', ijara: 'Ijara',
  oylik: 'Oylik va avans', kommunal: 'Kommunal va aloqa', inkassa: 'Inkassa (pul topshirildi)', boshqa: 'Boshqa',
};

export type XlsxSheet = { data: any; sheet: string; columns?: Array<{ width: number }>; stickyRowsCount?: number; orientation?: 'landscape' };
export const XLSX_OPTIONS = { fontFamily: 'Calibri', fontSize: 11 };

const short = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(2, 4)}`;
const sumCell = (n: number, color?: string) => (n ? { value: n, type: Number, format: MONEY, textColor: color, fontWeight: color ? 'bold' as const : undefined } : null);

/** "Kunlik kassa" (per day, per client) and "Operatsiyalar" (every payment, cancelled ones too). */
export function kassaSheets(payments: Payment[]): XlsxSheet[] {
  const active = payments.filter((p) => !p.voided_at).sort((a, b) => a.paid_at.localeCompare(b.paid_at));

  // Day → client → sums, keeping the order in which clients first paid that day.
  const days = new Map<string, Map<string, ClientRow>>();
  for (const p of active) {
    const day = dateOf(p.paid_at);
    if (!days.has(day)) days.set(day, new Map());
    const clients = days.get(day)!;
    const row = clients.get(p.client_code)
      || { code: p.client_code, name: p.client_name || '', count: 0, cash: 0, card: 0, yandex: 0, pochta: 0 };
    row.count += 1;
    row[p.method as Col] += p.amount;
    if (!row.name && p.client_name) row.name = p.client_name;
    clients.set(p.client_code, row);
  }

  const header = ['Sana', 'ID', 'Mijoz', 'Toʻlovlar soni', 'Naqd', 'Karta', 'Yandex', 'Pochta', 'Kunlik kassa']
    .map((value) => ({ value, fontWeight: 'bold' as const, textColor: HEAD, align: 'center' as const, bottomBorderStyle: 'thin' as const }));
  const daily: unknown[][] = [header];
  const grand = { cash: 0, card: 0, yandex: 0, pochta: 0 };
  for (const [day, clients] of days) {
    const total = { cash: 0, card: 0, yandex: 0, pochta: 0 };
    let first = true;
    for (const c of clients.values()) {
      for (const k of COLS) total[k] += c[k];
      daily.push([
        first ? { value: short(day), type: String, fontWeight: 'bold' as const } : null,
        { value: c.code, type: String, align: 'center' as const },
        c.name || null,
        { value: c.count, type: Number, align: 'center' as const },
        ...COLS.map((k) => sumCell(c[k])),
        null,
      ]);
      first = false;
    }
    const kassa = COLS.reduce((s, k) => s + total[k], 0);
    for (const k of COLS) grand[k] += total[k];
    daily.push([
      null, null, { value: `${short(day)} jami`, type: String, textColor: RED, fontWeight: 'bold' as const }, null,
      ...COLS.map((k) => sumCell(total[k], RED) ?? { value: 0, type: Number, format: MONEY, textColor: RED }),
      { value: kassa, type: Number, format: MONEY, textColor: PURPLE, fontWeight: 'bold' as const },
    ]);
    daily.push([]);
  }
  if (days.size > 1) {
    const all = COLS.reduce((s, k) => s + grand[k], 0);
    daily.push([
      null, null, { value: 'Davr jami', type: String, fontWeight: 'bold' as const }, null,
      ...COLS.map((k) => ({ value: grand[k], type: Number, format: MONEY, fontWeight: 'bold' as const, topBorderStyle: 'thin' as const })),
      { value: all, type: Number, format: MONEY, textColor: PURPLE, fontWeight: 'bold' as const, topBorderStyle: 'thin' as const },
    ]);
  }

  // Second sheet: every payment on its own row, cancelled ones included, for checking.
  const list: unknown[][] = [['Sana', 'Vaqt', 'Mijoz ID', 'Mijoz ismi', 'Toʻlov turi', 'Summa', 'Ishchi', 'Izoh', 'Holat']
    .map((value) => ({ value, fontWeight: 'bold' as const }))];
  for (const p of [...payments].sort((a, b) => a.paid_at.localeCompare(b.paid_at))) {
    list.push([
      short(dateOf(p.paid_at)), timeOf(p.paid_at), p.client_code, p.client_name || null, methodLabel(p.method),
      { value: p.amount, type: Number, format: MONEY }, p.created_by_name, p.note || null,
      p.voided_at ? `Bekor qilingan: ${p.void_reason || ''}` : 'Faol',
    ]);
  }

  return [
    { data: daily as any, sheet: 'Kunlik kassa', orientation: 'landscape', stickyRowsCount: 1, columns: [{ width: 10 }, { width: 13 }, { width: 24 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }] },
    { data: list as any, sheet: 'Operatsiyalar', orientation: 'landscape', stickyRowsCount: 1, columns: [{ width: 10 }, { width: 7 }, { width: 11 }, { width: 24 }, { width: 16 }, { width: 15 }, { width: 14 }, { width: 28 }, { width: 14 }] },
  ];
}

const GREEN = '#2b8a3e';
const head = (value: string) => ({ value, fontWeight: 'bold' as const, textColor: HEAD, align: 'center' as const, alignVertical: 'center' as const, wrap: true, bottomBorderStyle: 'thin' as const });
const money0 = (n: number, extra: object = {}) => ({ value: n, type: Number, format: MONEY, alignVertical: 'top' as const, ...extra });
const signedText = (n: number) => `${n > 0 ? '+' : '−'}${groupDigits(Math.abs(n))}`;

/**
 * The kassa for any span of days (usually a month) as the cashier used to keep it by hand: for each account a sheet with one row per
 * day (what was there, what came in, what was spent and on what, what was left), then the day's
 * income split cash/card. Each account's expenses get a sheet of their own.
 */
export function monthSheets(data: BalanceMonth, categoryLabel: (c: string) => string): XlsxSheet[] {
  const days: string[] = [];
  for (let d = data.first; d <= data.last; d = addDays(d, 1)) days.push(d);
  const flow = (day: string, src: 'cash' | 'card') => data.days.find((r) => r.day === day && r.source === src) || { income: 0, expense: 0, adjustment: 0 };
  const reason = (amount: number, category: string, note: string | null) => {
    const label = categoryLabel(category);
    return `${groupDigits(amount)} — ${label}${note && note !== label ? ` (${note})` : ''}`;
  };

  function accountSheet(src: 'cash' | 'card') {
    const adjusts = data.adjustments.filter((a) => (a.source === 'cash') === (src === 'cash'));
    const withAdjust = adjusts.length > 0;
    const rows: unknown[][] = [[
      head('Sana'), head('Bor boʻlgan summa'), head('Tushgan summa'), head('Ishlatilgan summa'),
      ...(withAdjust ? [head('Tuzatish (±)')] : []), head('Qolgan summa'), head('Rasxod sabablari'),
    ]];
    let balance = data.opening[src];
    let income = 0, expense = 0, adjustment = 0;
    for (const day of days) {
      const f = flow(day, src);
      const lines = [
        ...data.expenses.filter((e) => e.source === src && dateOf(e.spent_at) === day).map((e) => reason(e.amount, e.category, e.note)),
        ...adjusts.filter((a) => dateOf(a.at) === day).map((a) => `Tuzatish ${signedText(a.amount)}${a.note ? ` (${a.note})` : ''}`),
      ];
      const close = balance + f.income - f.expense + f.adjustment;
      const height = lines.length > 1 ? 15 * lines.length : undefined;
      rows.push([
        { value: short(day), type: String, alignVertical: 'top' as const, height },
        money0(balance), money0(f.income), money0(f.expense, f.expense ? { textColor: RED } : {}),
        ...(withAdjust ? [f.adjustment ? money0(f.adjustment) : null] : []),
        money0(close, { textColor: PURPLE, fontWeight: 'bold' as const }),
        lines.length ? { value: lines.join('\n'), type: String, wrap: true, alignVertical: 'top' as const } : null,
      ]);
      income += f.income; expense += f.expense; adjustment += f.adjustment; balance = close;
    }
    const top = { topBorderStyle: 'thin' as const, fontWeight: 'bold' as const };
    rows.push([
      { value: 'Jami', type: String, ...top }, money0(data.opening[src], top), money0(income, { ...top, textColor: GREEN }), money0(expense, { ...top, textColor: RED }),
      ...(withAdjust ? [money0(adjustment, top)] : []), money0(balance, { ...top, textColor: PURPLE }), { value: '', type: String, ...top },
    ]);
    const columns = [{ width: 10 }, { width: 19 }, { width: 18 }, { width: 18 }, ...(withAdjust ? [{ width: 14 }] : []), { width: 18 }, { width: 46 }];
    return { data: rows as any, columns, sheet: src === 'cash' ? 'Naqd kassa' : 'Karta kassa', stickyRowsCount: 1, orientation: 'landscape' as const };
  }

  // Income per day, the month's totals on top in green, as on the hand-kept "naxt karta" sheet.
  const totals = days.reduce((t, d) => ({ cash: t.cash + flow(d, 'cash').income, card: t.card + flow(d, 'card').income }), { cash: 0, card: 0 });
  const income: unknown[][] = [
    [head('Sana'), head('Naqd tushum'), head('Karta tushum'), head('Umumiy tushum')],
    [{ value: 'Jami', type: String, fontWeight: 'bold' as const }, ...[totals.cash, totals.card, totals.cash + totals.card].map((n) => money0(n, { textColor: GREEN, fontWeight: 'bold' as const }))],
    ...days.map((d) => {
      const cash = flow(d, 'cash').income, card = flow(d, 'card').income;
      return [short(d), money0(cash), money0(card), money0(cash + card, { textColor: RED })];
    }),
  ];

  // Expenses on their own sheet per account, oldest first, with the month's total at the bottom.
  function expenseSheet(src: 'cash' | 'card') {
    const own = data.expenses.filter((e) => e.source === src);
    const rows: unknown[][] = [[head('Sana'), head('Vaqt'), head('Summa'), head('Toifa'), head('Izoh'), head('Kim yozdi')]];
    for (const e of own) rows.push([short(dateOf(e.spent_at)), timeOf(e.spent_at), money0(e.amount), categoryLabel(e.category), e.note || null, e.created_by_name]);
    if (own.length) {
      const top = { topBorderStyle: 'thin' as const, fontWeight: 'bold' as const };
      rows.push([{ value: 'Jami', type: String, ...top }, { value: '', type: String, ...top }, money0(own.reduce((t, e) => t + e.amount, 0), { ...top, textColor: RED })]);
    } else rows.push(['Bu davrda rasxod yozilmagan']);
    return { data: rows as any, sheet: src === 'cash' ? 'Naqd rasxodlar' : 'Karta rasxodlar', stickyRowsCount: 1, orientation: 'landscape' as const, columns: [{ width: 10 }, { width: 7 }, { width: 15 }, { width: 24 }, { width: 40 }, { width: 16 }] };
  }

  return [
    accountSheet('cash'),
    expenseSheet('cash'),
    accountSheet('card'),
    expenseSheet('card'),
    { data: income as any, sheet: 'Naqd va karta', stickyRowsCount: 1, columns: [{ width: 10 }, { width: 18 }, { width: 18 }, { width: 20 }] },
  ];
}
