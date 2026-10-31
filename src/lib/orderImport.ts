// Turns a list of orders copied from the admin panel (or an Excel sheet) into rows for /orders/import.
// Two shapes are understood:
//  - a table with a header row (Mijoz, Kod, Buyurtma №, Usul, Pos., Vazn, Summa, Telefon …);
//  - text copied straight from the admin panel page, where every order is its cells in a row:
//    name, client code (TTT-103280), "Buyurtma № 134667", Avia, 6, "2.1 kg", "247 800 so'm".

export interface ImportOrderRow {
  clientCode: string;
  clientName: string;
  phone: string;
  orderNo: string;
  transport: string;
  places: number | null;
  weight: number | null;
  amount: number;
  /** Paid already in the admin panel: added to the kassa as paid, with no payment. */
  paid?: boolean;
}

const CODE_RE = /^[A-Z]{1,6}-?\d{3,}$/i;
const TRANSPORT_RE = /^(avia|avto|standart)$/i;
const WEIGHT_RE = /^(\d+(?:[.,]\d+)?)\s*kg$/i;
const SUM_RE = /^([\d\s  ]+)\s*so.?m$/i;
const ORDER_RE = /^(?:buyurtma\s*)?№\s*([\w-]+)$/i;

const digits = (v: string) => v.replace(/\D/g, '');
const titleCase = (v: string) => (/^(avia|avto|standart)$/i.test(v) ? v[0].toUpperCase() + v.slice(1).toLowerCase() : v);

function blank(): ImportOrderRow {
  return { clientCode: '', clientName: '', phone: '', orderNo: '', transport: '', places: null, weight: null, amount: 0 };
}

const COLUMNS: Array<[keyof ImportOrderRow, RegExp]> = [
  ['clientCode', /^(kod|id|mijoz id|code)/],
  ['clientName', /^(mijoz|ism|f\.?i\.?o|name|klient)/],
  ['orderNo', /(buyurtma|order|zakaz)/],
  ['transport', /^(usul|transport|turi)/],
  ['places', /^(pos|joy|soni|places)/],
  ['weight', /(vazn|og.?irlik|weight|kg)/],
  ['amount', /^(summa|amount|narx|to.?lov)/],
  ['phone', /^(tel|phone)/],
];

function fromTable(rows: string[][]): ImportOrderRow[] | null {
  const headAt = rows.findIndex((r) => {
    const h = r.map((c) => c.toLowerCase().trim());
    return h.some((c) => COLUMNS[0][1].test(c)) && h.some((c) => COLUMNS[6][1].test(c));
  });
  if (headAt < 0) return null;
  const head = rows[headAt].map((c) => c.toLowerCase().trim());
  const idx = new Map<keyof ImportOrderRow, number>();
  for (const [key, re] of COLUMNS) {
    const i = head.findIndex((h, j) => re.test(h) && ![...idx.values()].includes(j));
    if (i >= 0) idx.set(key, i);
  }
  const cell = (r: string[], key: keyof ImportOrderRow) => (idx.has(key) ? String(r[idx.get(key)!] ?? '').trim() : '');
  const parsed = rows.slice(headAt + 1).map((r) => {
    const weight = cell(r, 'weight').replace(/kg/i, '').replace(',', '.').trim();
    const places = digits(cell(r, 'places'));
    return {
      clientCode: cell(r, 'clientCode').replace(/\s+/g, '').toUpperCase(),
      clientName: cell(r, 'clientName'),
      phone: cell(r, 'phone'),
      orderNo: cell(r, 'orderNo').match(/([A-Z0-9-]+)\s*$/i)?.[1] || '',
      transport: titleCase(cell(r, 'transport')),
      places: places ? Number(places) : null,
      weight: weight && Number.isFinite(Number(weight)) ? Number(weight) : null,
      amount: Number(digits(cell(r, 'amount').replace(/[.,]\d{1,2}$/, ''))) || 0,
    };
  }).filter((o) => o.clientCode || o.amount);
  // A header that does not line up with the data (cells copied out of order): read cell by cell instead.
  const usable = parsed.filter((o) => /^[A-Z0-9-]{1,40}$/.test(o.clientCode) && o.amount > 0).length;
  return usable * 2 >= parsed.length && usable > 0 ? parsed : null;
}

// One order written on a single line, as a row of a div-based page reads: "Ali Valiyev TTT-200001
// Buyurtma № 900001 Avia 1 0.5 kg 50 000 so'm 0 kun Naqd".
function fromLine(line: string, prev: string): ImportOrderRow | null {
  // Codes are written in capitals (TTT-103280), which also finds them when cells run together.
  const code = line.match(/([A-Z]{2,6}-\d{3,})/) || line.match(/(?:^|\s)([A-Z]{1,6}-?\d{3,})(?=\s|$)/i);
  if (!code) return null;
  const before = line.slice(0, code.index! + code[0].length - code[1].length).trim();
  const after = line.slice(code.index! + code[0].length);
  const transport = after.match(/\b(avia|avto|standart)\b(?:\s+(\d{1,4})\b(?!\s*(?:kg|[.,]\d)))?/i);
  const weight = after.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  const sum = after.match(/(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)\s*so.?m/i);
  return {
    ...blank(),
    clientCode: code[1].toUpperCase(),
    clientName: before || (prev && !CODE_RE.test(prev) && !SUM_RE.test(prev) ? prev : ''),
    orderNo: after.match(/№\s*([\w-]+)/)?.[1] || '',
    transport: transport ? titleCase(transport[1]) : '',
    places: transport?.[2] ? Number(transport[2]) : null,
    weight: weight ? Number(weight[1].replace(',', '.')) : null,
    amount: sum ? Number(digits(sum[1])) : 0,
  };
}

function fromCells(cells: string[]): ImportOrderRow[] {
  const out: ImportOrderRow[] = [];
  let cur: ImportOrderRow | null = null;
  let prev = '';
  for (const raw of cells) {
    const c = raw.replace(/\s+/g, ' ').trim();
    if (!c) continue;
    // A whole order on one line; one still being checked may have no sum yet, and is kept so the check shows it.
    const single = !CODE_RE.test(c) && (/so.?m/i.test(c) || /[A-Z]{2,6}-\d{3,}\s+\S/.test(c)) ? fromLine(c, prev) : null;
    if (single) {
      if (cur) out.push(cur);
      cur = null;
      out.push(single);
    } else if (CODE_RE.test(c)) {
      if (cur) out.push(cur);
      cur = { ...blank(), clientCode: c.toUpperCase(), clientName: prev && !CODE_RE.test(prev) && !SUM_RE.test(prev) ? prev : '' };
    } else if (cur) {
      const order = c.match(ORDER_RE);
      const weight = c.match(WEIGHT_RE);
      const sum = c.match(SUM_RE);
      if (order && !cur.orderNo) cur.orderNo = order[1];
      else if (TRANSPORT_RE.test(c) && !cur.transport) cur.transport = titleCase(c);
      else if (weight && cur.weight === null) cur.weight = Number(weight[1].replace(',', '.'));
      else if (sum && !cur.amount) cur.amount = Number(digits(sum[1]));
      else if (/^\d{1,4}$/.test(c) && cur.places === null && !cur.amount) cur.places = Number(c);
    }
    prev = c;
  }
  if (cur) out.push(cur);
  return out;
}

/** One order's identity: its client and order number, ignoring case, spaces, "#" and "№" (the same in the kassa and the server). */
export function orderKey(clientCode: string, orderNo: string | null | undefined): string {
  const no = (orderNo || '').toUpperCase().replace(/[\s#№]/g, '');
  return no ? `${clientCode.toUpperCase().replace(/\s+/g, '')}|${no}` : '';
}

export function parseOrderText(text: string): ImportOrderRow[] {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).map((line) => {
    const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : null;
    return delimiter ? line.split(delimiter) : [line];
  });
  return fromTable(rows) ?? fromCells(rows.flat());
}

export function parseOrderSheet(rows: unknown[][]): ImportOrderRow[] {
  const text = rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
  return fromTable(text) ?? fromCells(text.flat());
}
