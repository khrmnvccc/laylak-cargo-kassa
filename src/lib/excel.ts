import type { Payment } from './types';
import { dateOf, methodLabel, timeOf } from './format';

// Laid out like the kassa's own hand-kept workbook: one block per day, one row per client,
// the sum under its payment type, then the day's totals in red and the day's kassa in purple.
const MONEY = '#,##0 "soʻm"';
const RED = '#e03131';
const PURPLE = '#7048e8';
const HEAD = '#c92a2a';
const COLS = ['cash', 'card', 'yandex', 'pochta'] as const;

type Col = typeof COLS[number];
type ClientRow = { code: string; name: string; count: number } & Record<Col, number>;

const short = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(2, 4)}`;
const sumCell = (n: number, color?: string) => (n ? { value: n, type: Number, format: MONEY, textColor: color, fontWeight: color ? 'bold' as const : undefined } : null);

export async function downloadKassaXlsx(fileName: string, payments: Payment[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
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

  await writeXlsxFile([
    { data: daily as any, sheet: 'Kunlik kassa', orientation: 'landscape', stickyRowsCount: 1, columns: [{ width: 10 }, { width: 13 }, { width: 24 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }] },
    { data: list as any, sheet: 'Operatsiyalar', orientation: 'landscape', stickyRowsCount: 1, columns: [{ width: 10 }, { width: 7 }, { width: 11 }, { width: 24 }, { width: 16 }, { width: 15 }, { width: 14 }, { width: 28 }, { width: 14 }] },
  ], { fontFamily: 'Calibri', fontSize: 11 }).toFile(fileName);
}
