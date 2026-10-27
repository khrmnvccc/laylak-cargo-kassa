// Printing: 76×130 mm package labels (label printer) and A4 documents.
// Each document is rendered into a hidden iframe with its own @page size, so the
// app's styles and layout never leak into the printout.
import { LANG } from './i18n';
import { dateTime, formatDate, methodLabel, money, nowMs, timeOf, todayTashkent } from './format';
import type { Order, Payment } from './types';

export type PaperSize = 'label' | 'a4';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, 'Helvetica Neue', sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.num { font-variant-numeric: tabular-nums; }
`;

const LABEL_CSS = `
@page { size: 76mm 130mm; margin: 0; }
html, body { width: 76mm; height: 130mm; }
.label { width: 76mm; height: 130mm; padding: 4mm 4mm 3mm; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; }
.brand { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.6mm solid #000; padding-bottom: 1.5mm; }
.brand b { font-size: 12pt; letter-spacing: 0.5pt; }
.brand span { font-size: 7.5pt; }
.cap { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #333; margin-top: 2.5mm; }
.code { font-family: 'Courier New', monospace; font-weight: 700; font-size: 38pt; line-height: 1; letter-spacing: 1pt; text-align: center; white-space: nowrap; overflow: hidden; border: 0.6mm solid #000; border-radius: 2mm; padding: 2mm 0; margin-top: 1mm; }
.name { font-size: 13pt; font-weight: 700; margin-top: 1mm; line-height: 1.15; word-break: break-word; }
.phone { font-size: 12pt; margin-top: 0.8mm; }
.sep { border-top: 0.4mm dashed #000; margin: 3mm 0 1mm; }
.amount { font-size: 22pt; font-weight: 700; margin-top: 0.5mm; }
.rows { margin-top: 1.5mm; font-size: 9pt; }
.rows div { display: flex; justify-content: space-between; gap: 2mm; padding: 0.6mm 0; }
.rows span { color: #333; }
.rows b { text-align: right; }
.note { font-size: 8.5pt; margin-top: 1.5mm; word-break: break-word; }
.foot { margin-top: auto; font-size: 7pt; text-align: center; color: #333; border-top: 0.3mm solid #000; padding-top: 1.2mm; }
.sticker > * { flex-shrink: 0; }
.sticker .code { font-size: 26pt; }
.split { display: flex; gap: 3mm; align-items: flex-start; margin-top: 1.5mm; }
.split .rows { flex: 1; min-width: 0; margin-top: 0; font-size: 9.5pt; }
.split .rows div { padding: 0.9mm 0; }
.qr { display: flex; flex-direction: column; align-items: center; }
.qr svg { width: 30mm; height: 30mm; display: block; }
.qr b { font-family: 'Courier New', monospace; font-size: 10pt; letter-spacing: 0.5pt; margin-top: 1mm; }
.sticker .amount { font-size: 26pt; }
.void { font-size: 14pt; font-weight: 700; text-align: center; border: 0.6mm solid #000; margin-top: 2mm; padding: 1mm; }
`;

const A4_CSS = `
@page { size: A4; margin: 14mm 12mm 14mm; }
body { font-size: 10pt; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 0.6mm solid #000; padding-bottom: 3mm; margin-bottom: 5mm; }
header .brand { font-size: 15pt; font-weight: 700; letter-spacing: 0.4pt; }
header .brand small { display: block; font-size: 8pt; font-weight: 400; letter-spacing: 0; color: #444; }
header .meta { text-align: right; font-size: 8.5pt; color: #333; line-height: 1.4; }
h1 { font-size: 16pt; margin-bottom: 1mm; }
.sub { color: #333; margin-bottom: 5mm; }
h2 { font-size: 11.5pt; margin: 6mm 0 2mm; }
.kpis { display: grid; grid-template-columns: repeat(var(--cols, 4), 1fr); gap: 2.5mm; margin-bottom: 2mm; }
.kpi { border: 0.3mm solid #999; border-radius: 1.5mm; padding: 2.5mm 3mm; }
.kpi span { display: block; font-size: 8pt; color: #444; }
.kpi b { display: block; font-size: 13pt; margin-top: 0.8mm; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { text-align: left; font-weight: 700; background: #eee; border-bottom: 0.4mm solid #000; padding: 1.6mm 2mm; white-space: nowrap; }
td { border-bottom: 0.2mm solid #ccc; padding: 1.4mm 2mm; vertical-align: top; }
td.r, th.r { text-align: right; white-space: nowrap; }
tfoot td { font-weight: 700; border-top: 0.4mm solid #000; border-bottom: 0; background: #f5f5f5; }
.muted { color: #555; }
.strike { text-decoration: line-through; color: #777; }
.sign { display: flex; gap: 12mm; margin-top: 14mm; font-size: 9pt; }
.sign div { flex: 1; border-top: 0.3mm solid #000; padding-top: 1.5mm; }
.empty { padding: 6mm; text-align: center; color: #555; border: 0.3mm dashed #999; }
`;

/** Prints a full HTML body on the chosen paper via a hidden iframe. */
export function printHtml(body: string, size: PaperSize, title = 'Laylak Cargo'): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${BASE_CSS}${size === 'label' ? LABEL_CSS : A4_CSS}</style></head><body>${body}</body></html>`);
  doc.close();
  const win = frame.contentWindow!;
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', cleanup);
  const translated = LANG === 'uz' ? Promise.resolve() : import('./i18n-dom').then((m) => m.translateTree(doc.body)).catch(() => undefined);
  translated.then(() => setTimeout(() => {
    win.focus();
    win.print();
    // Some browsers don't fire afterprint; remove the frame eventually anyway.
    setTimeout(cleanup, 60_000);
  }, 150));
}

// ---------- 76×130 labels ----------

interface LabelClient { code: string; name?: string | null; phone?: string | null }

function labelHtml(client: LabelClient, payment?: Payment): string {
  const parts = [
    `<div class="brand"><b>LAYLAK CARGO</b><span>${esc(formatDate(todayTashkent()))}</span></div>`,
    // Shrink long IDs so they always fit the 68 mm wide box on one line.
    `<div class="cap">Mijoz ID</div><div class="code num" style="font-size:${Math.max(14, Math.min(38, Math.floor(266 / Math.max(client.code.length, 1))))}pt">${esc(client.code)}</div>`,
  ];
  if (client.name) parts.push(`<div class="name">${esc(client.name)}</div>`);
  if (client.phone) parts.push(`<div class="phone num">${esc(client.phone)}</div>`);
  if (payment) {
    parts.push(
      `<div class="sep"></div><div class="cap">Toʻlov</div><div class="amount num">${esc(money(payment.amount))}</div>`,
      `<div class="rows">
        <div><span>Turi</span><b>${esc(methodLabel(payment.method))}</b></div>
        <div><span>Sana</span><b class="num">${esc(dateTime(payment.paid_at))}</b></div>
        <div><span>Kassir</span><b>${esc(payment.created_by_name)}</b></div>
      </div>`,
    );
    if (payment.note) parts.push(`<div class="note">Izoh: ${esc(payment.note)}</div>`);
    if (payment.voided_at) parts.push(`<div class="void">BEKOR QILINGAN</div>`);
  }
  parts.push(`<div class="foot">Laylak Cargo · kassa tizimi</div>`);
  return `<div class="label">${parts.join('')}</div>`;
}

export function printPaymentLabel(payment: Payment) {
  printHtml(labelHtml({ code: payment.client_code, name: payment.client_name, phone: payment.client_phone }, payment), 'label', `Yorliq ${payment.client_code}`);
}

export function printClientLabel(client: LabelClient, copies = 1) {
  printHtml(Array.from({ length: Math.max(1, copies) }, () => labelHtml(client)).join(''), 'label', `Yorliq ${client.code}`);
}

/** The kassa sticker for a parcel: what is owed, and a QR the cashier scans to take the payment. */
export async function printOrderSticker(order: Order) {
  return printOrderStickers([order]);
}

export async function printOrderStickers(orders: Order[]) {
  const { toString } = await import('qrcode');
  const labels = await Promise.all(orders.map(async (order) => stickerHtml(order, await toString(orderPageUrl(order), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }))));
  printHtml(labels.join(''), 'label', orders.length === 1 ? `Stiker ${orders[0].scan_code}` : `Stikerlar (${orders.length})`);
}

/** What the sticker QR holds: the client's status page. The kassa scanner reads the code out of it. */
export const orderPageUrl = (order: Pick<Order, 'scan_code' | 'public_token'>) =>
  `${window.location.origin}/t.html#${order.scan_code}.${order.public_token}`;

function stickerHtml(order: Order, qr: string) {
  const fit = Math.max(14, Math.min(26, Math.floor(230 / Math.max(order.client_code.length, 1))));
  const rows = [
    ['Usul', order.transport],
    ['Joylar', order.places ? `${order.places} ta` : ''],
    ['Ogʻirlik', order.weight ? `${order.weight} kg` : ''],
    ['Buyurtma', order.order_no ? `№${order.order_no}` : ''],
    ['Qabul', order.received_at.split('-').reverse().join('.')],
  ].filter(([, v]) => v);
  return `<div class="label sticker">
    <div class="brand"><b>LAYLAK CARGO</b><span>${esc(formatDate(order.received_at))}</span></div>
    <div class="cap">Mijoz ID</div><div class="code num" style="font-size:${fit}pt">${esc(order.client_code)}</div>
    ${order.client_name ? `<div class="name">${esc(order.client_name)}</div>` : ''}
    ${order.phone ? `<div class="phone num">${esc(order.phone)}</div>` : ''}
    <div class="split">
      <div class="rows">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b class="num">${esc(v)}</b></div>`).join('')}</div>
      <div class="qr">${qr}<b class="num">${esc(order.scan_code)}</b></div>
    </div>
    <div class="sep"></div><div class="cap">Toʻlov</div><div class="amount num">${esc(money(order.amount))}</div>
    <div class="foot">Telefonda skaner qiling: buyurtma holati</div>
  </div>`;
}

// ---------- A4 documents ----------

export interface A4Table {
  head: string[];
  rows: Array<Array<string | number>>;
  /** Column indexes aligned right (amounts, counts). */
  right?: number[];
  foot?: Array<string | number>;
  /** Row indexes rendered struck through (voided entries). */
  struck?: number[];
}

export type A4Block =
  | { kind: 'kpis'; items: Array<[string, string]>; cols?: number }
  | { kind: 'heading'; text: string }
  | { kind: 'table'; table: A4Table; empty?: string }
  | { kind: 'text'; text: string }
  | { kind: 'sign'; labels: string[] };

function tableHtml(t: A4Table, empty = 'Maʼlumot yoʻq'): string {
  if (!t.rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const cls = (i: number) => (t.right?.includes(i) ? ' class="r"' : '');
  const cell = (v: string | number) => esc(typeof v === 'number' ? money(v) : v);
  return `<table><thead><tr>${t.head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r, ri) => `<tr${t.struck?.includes(ri) ? ' class="strike"' : ''}>${r.map((v, i) => `<td${cls(i)}>${cell(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    ${t.foot ? `<tfoot><tr>${t.foot.map((v, i) => `<td${cls(i)}>${cell(v)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
}

export function printA4(doc: { title: string; subtitle?: string; printedBy?: string; blocks: A4Block[] }) {
  const now = new Date(nowMs());
  const body = [
    `<header><div class="brand">LAYLAK CARGO<small>Kassa tizimi</small></div>
      <div class="meta">Chop etildi: ${esc(dateTime(now.toISOString()))}${doc.printedBy ? `<br>${esc(doc.printedBy)}` : ''}</div></header>`,
    `<h1>${esc(doc.title)}</h1>`,
    doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : '',
    ...doc.blocks.map((b) => {
      switch (b.kind) {
        case 'kpis':
          return `<div class="kpis" style="--cols:${b.cols || Math.min(b.items.length, 4)}">${b.items.map(([k, v]) => `<div class="kpi"><span>${esc(k)}</span><b class="num">${esc(v)}</b></div>`).join('')}</div>`;
        case 'heading':
          return `<h2>${esc(b.text)}</h2>`;
        case 'table':
          return tableHtml(b.table, b.empty);
        case 'text':
          return `<p class="muted">${esc(b.text)}</p>`;
        case 'sign':
          return `<div class="sign">${b.labels.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
      }
    }),
  ].join('');
  printHtml(body, 'a4', doc.title);
}

/** Table rows for a list of payments, shared by every A4 report. */
export function paymentsTable(items: Payment[], opts: { withDate?: boolean } = {}): A4Table {
  const active = items.filter((p) => !p.voided_at);
  return {
    head: [opts.withDate ? 'Sana va vaqt' : 'Vaqt', 'Mijoz ID', 'Mijoz', 'Turi', 'Summa', 'Kassir', 'Izoh'],
    rows: items.map((p) => [
      opts.withDate ? dateTime(p.paid_at) : timeOf(p.paid_at),
      p.client_code, p.client_name || '', methodLabel(p.method), p.amount, p.created_by_name,
      [p.note, p.voided_at ? `Bekor qilingan: ${p.void_reason || ''}` : ''].filter(Boolean).join(' · '),
    ]),
    right: [4],
    struck: items.map((p, i) => (p.voided_at ? i : -1)).filter((i) => i >= 0),
    foot: ['Jami', '', `${active.length} ta`, '', active.reduce((s, p) => s + p.amount, 0), '', ''],
  };
}
