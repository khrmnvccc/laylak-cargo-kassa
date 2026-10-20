// A4 printouts of the app's reports, built from the same API data the pages show.
import { api } from './api';
import { cardTotal, formatDate, groupDigits, methodLabel, money, rangeLabel, timeOf, weekday } from './format';
import { paymentsTable, printA4, type A4Block } from './print';
import type { BalanceReport, Payment, PaymentList, PeriodRow, Summary, Totals } from './types';

const methodKpis = (t: Totals): Array<[string, string]> => [
  ['Jami tushum', money(t.total)],
  ['Naqd', money(t.cash)],
  ['Karta', money(cardTotal(t))],
];

/** One line under the Naqd / Karta totals saying what the Karta total is made of. */
const cardNote = (t: { card: number; yandex: number; pochta: number }): A4Block => ({
  kind: 'text', text: `Karta ichida: karta ${money(t.card)} · Yandex ${money(t.yandex)} · Pochta ${money(t.pochta)}`,
});

/** Loads every payment matching the filters (the list endpoint pages by 500). */
export async function fetchAllPayments(query: Record<string, unknown>): Promise<Payment[]> {
  const items: Payment[] = [];
  for (let offset = 0; offset < 20_000; offset += 500) {
    const chunk = await api<PaymentList>('/payments', { query: { ...query, limit: 500, offset } });
    items.push(...chunk.items);
    if (chunk.items.length < 500) break;
  }
  return items;
}

export async function printDailyReport(date: string, printedBy: string) {
  const [summary, items] = await Promise.all([
    api<Summary>('/summary', { query: { from: date, to: date } }),
    fetchAllPayments({ from: date, to: date, status: 'all' }),
  ]);
  const w = summary.byWorker;
  printA4({
    title: 'Kunlik hisobot',
    subtitle: `${weekday(date)}, ${formatDate(date)}`,
    printedBy,
    blocks: [
      { kind: 'kpis', items: [...methodKpis(summary.totals), ['Operatsiyalar', `${groupDigits(summary.totals.count)} ta`]], cols: 4 },
      cardNote(summary.totals),
      { kind: 'heading', text: 'Ishchilar kesimida' },
      {
        kind: 'table',
        table: {
          head: ['Ishchi', 'Operatsiya', 'Naqd', 'Karta', 'Jami'],
          rows: w.map((r) => [r.name, `${r.count} ta`, r.cash, cardTotal(r), r.total]),
          right: [1, 2, 3, 4],
          foot: ['Jami', `${summary.totals.count} ta`, summary.totals.cash, cardTotal(summary.totals), summary.totals.total],
        },
        empty: 'Bu kunda toʻlov kiritilmagan',
      },
      { kind: 'heading', text: 'Barcha operatsiyalar' },
      { kind: 'table', table: paymentsTable(items), empty: 'Operatsiya yoʻq' },
      { kind: 'sign', labels: ['Kassir imzosi', 'Admin imzosi'] },
    ],
  });
}

export function printPeriodReport(opts: { group: 'week' | 'month'; from: string; to: string; rows: PeriodRow[]; totals: Totals; label: (p: string) => string; printedBy: string }) {
  printA4({
    title: opts.group === 'week' ? 'Haftalik hisobot' : 'Oylik hisobot',
    subtitle: rangeLabel(opts.from, opts.to),
    printedBy: opts.printedBy,
    blocks: [
      { kind: 'kpis', items: [...methodKpis(opts.totals), ['Operatsiyalar', `${groupDigits(opts.totals.count)} ta`]], cols: 4 },
      cardNote(opts.totals),
      { kind: 'heading', text: opts.group === 'week' ? 'Haftalar boʻyicha' : 'Oylar boʻyicha' },
      {
        kind: 'table',
        table: {
          head: ['Davr', 'Operatsiya', 'Mijozlar', 'Naqd', 'Karta', 'Jami'],
          rows: opts.rows.map((r) => [opts.label(r.period), `${r.count} ta`, String(r.clients), r.cash, cardTotal(r), r.total]),
          right: [1, 2, 3, 4, 5],
          foot: ['Jami', `${opts.totals.count} ta`, '', opts.totals.cash, cardTotal(opts.totals), opts.totals.total],
        },
      },
    ],
  });
}

export async function printOperations(filters: Record<string, unknown> & { from: string; to: string }, filterNote: string, printedBy: string) {
  const items = await fetchAllPayments(filters);
  const active = items.filter((p) => !p.voided_at);
  const sum = (m?: string) => active.filter((p) => !m || p.method === m).reduce((s, p) => s + p.amount, 0);
  printA4({
    title: 'Operatsiyalar roʻyxati',
    subtitle: [rangeLabel(filters.from, filters.to), filterNote].filter(Boolean).join(' · '),
    printedBy,
    blocks: [
      { kind: 'kpis', items: [['Jami', money(sum())], ['Naqd', money(sum('cash'))], ['Karta', money(sum('card') + sum('yandex') + sum('pochta'))]], cols: 3 },
      cardNote({ card: sum('card'), yandex: sum('yandex'), pochta: sum('pochta') }),
      { kind: 'table', table: paymentsTable(items, { withDate: true }), empty: 'Filtrlarga mos operatsiya yoʻq' },
    ],
  });
}

interface ClientDetailLike {
  client: { code: string; full_name: string | null; phone: string | null };
  stats: { total: number; cash: number; card: number; yandex: number; pochta: number; count: number; first_paid_at: string | null; last_paid_at: string | null };
  payments: Payment[];
}

export function printClientStatement(d: ClientDetailLike, printedBy: string) {
  const s = d.stats;
  printA4({
    title: `Mijoz: ${d.client.code}`,
    subtitle: [d.client.full_name, d.client.phone].filter(Boolean).join(' · ') || 'Ismi kiritilmagan',
    printedBy,
    blocks: [
      { kind: 'kpis', items: [['Jami toʻlangan', money(s.total)], ['Naqd', money(s.cash)], ['Karta', money(cardTotal(s))], ['Toʻlovlar', `${s.count} ta`]] },
      cardNote(s),
      { kind: 'heading', text: 'Toʻlovlar tarixi' },
      { kind: 'table', table: paymentsTable(d.payments, { withDate: true }), empty: 'Toʻlov yoʻq' },
    ],
  });
}

const CATEGORY: Record<string, string> = {
  tovar: 'Tovar xaridi', paket: 'Paket va qadoq', yetkazish: 'Yetkazib berish', yoqilgi: 'Yoqilgʻi va transport', ijara: 'Ijara',
  oylik: 'Oylik va avans', kommunal: 'Kommunal va aloqa', inkassa: 'Inkassa', boshqa: 'Boshqa',
};

export function printBalance(r: BalanceReport, printedBy: string) {
  const label = (s: string) => (s === 'cash' ? 'Naqd (kassa)' : 'Karta (Yandex, Pochta bilan)');
  const sum = (k: 'opening' | 'income' | 'expense' | 'adjustment' | 'closing') => r.sources.reduce((a, s) => a + Number(s[k]), 0);
  const expenses = r.expenses;
  const blocks: A4Block[] = [
    { kind: 'kpis', items: [...r.sources.map((s): [string, string] => [`${label(s.source)}: kun oxirida`, money(s.closing)]), ['Jami kun oxirida', money(sum('closing'))]], cols: 3 },
    { kind: 'heading', text: 'Kunlik harakat' },
    {
      kind: 'table',
      table: {
        head: ['Hisob', 'Kun boshida', 'Tushum (+)', 'Rasxod (−)', 'Tuzatish', 'Kun oxirida'],
        rows: r.sources.map((s) => [label(s.source), s.opening, s.income, s.expense, s.adjustment, s.closing]),
        right: [1, 2, 3, 4, 5],
        foot: ['Jami', sum('opening'), sum('income'), sum('expense'), sum('adjustment'), sum('closing')],
      },
    },
    { kind: 'heading', text: 'Rasxodlar' },
    {
      kind: 'table',
      table: {
        head: ['Vaqt', 'Toifa', 'Hisob', 'Summa', 'Kiritgan', 'Izoh'],
        rows: expenses.map((e) => [timeOf(e.spent_at), CATEGORY[e.category] || e.category, methodLabel(e.source), e.amount, e.created_by_name,
          [e.note, e.voided_at ? `Bekor qilingan: ${e.void_reason || ''}` : ''].filter(Boolean).join(' · ')]),
        right: [3],
        struck: expenses.map((e, i) => (e.voided_at ? i : -1)).filter((i) => i >= 0),
        foot: ['Jami', '', '', expenses.filter((e) => !e.voided_at).reduce((a, e) => a + e.amount, 0), '', ''],
      },
      empty: 'Bu kunda rasxod yoʻq',
    },
  ];
  if (r.adjustments.length) {
    blocks.push({ kind: 'heading', text: 'Qoldiq tuzatishlari' }, {
      kind: 'table',
      table: { head: ['Vaqt', 'Hisob', 'Summa', 'Sabab', 'Kiritgan'], rows: r.adjustments.map((a) => [timeOf(a.at), label(a.source), a.amount, a.note, a.created_by_name]), right: [2] },
    });
  }
  blocks.push({ kind: 'sign', labels: ['Kassir imzosi', 'Admin imzosi'] });
  printA4({ title: 'Kassa balansi', subtitle: `${weekday(r.date)}, ${formatDate(r.date)}`, printedBy, blocks });
}
