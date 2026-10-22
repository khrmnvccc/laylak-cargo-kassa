// Turns the raw text that on-device OCR reads from a bank receipt and from the orders screen
// into fields. Pure functions, so they are tested in Node with real OCR output.

export interface Receipt {
  bank: string | null; transactionId: string | null; amount: number | null; commission: number | null; total: number | null;
  paidAt: string | null; sender: string | null; senderCard: string | null; recipient: string | null; recipientCard: string | null; status: string | null;
}
export interface Order { clientName: string | null; code: string | null; orderNo: string | null; transport: string | null; weight: string | null; amount: number | null }

const NUM = /(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d{1,2}))?/;

/** "44 600" -> 44600, "200,7" -> 200.7, "44 800,7" -> 44800.7 */
export function parseNumber(s: string): number | null {
  const m = s.match(NUM);
  if (!m) return null;
  const whole = Number(m[1].replace(/\D/g, ''));
  return m[2] ? Number(`${whole}.${m[2]}`) : whole;
}

// Payment apps first: the app is what the receipt looks like; a bank name may only be the sender's card.
const BANKS: Array<[RegExp, string]> = [
  [/paym/i, 'Payme'], [/click/i, 'Click'], [/uzum/i, 'Uzum'], [/paynet/i, 'Paynet'], [/zoomrad/i, 'Zoomrad'], [/\balif\b/i, 'Alif'],
  [/ipak\s*yu?o?.?li/i, 'Ipak Yoʻli'], [/apelsin/i, 'Apelsin'], [/\boson\b/i, 'Oson'], [/\banor\b/i, 'Anorbank'], [/\btbc\b/i, 'TBC'],
  [/hamkor/i, 'Hamkorbank'], [/kapital/i, 'Kapitalbank'], [/aloqa/i, 'Aloqabank'], [/xalq|халк/i, 'Xalq banki'], [/agrobank/i, 'Agrobank'],
  [/asaka/i, 'Asakabank'], [/infin/i, 'InFinBank'], [/davr\s*bank/i, 'Davr bank'], [/trastbank|трастбанк/i, 'Trastbank'],
  [/milliy|\bnbu\b|нбу/i, 'Milliy bank'],
];

// OCR reads Uzbek "q" as "g" and "ʻ" as anything, so labels are matched loosely.
const KEY = {
  // The sum that reaches the recipient, without the bank's fee.
  received: /(qabul [qg]ilinadigan|tushum|yuborilgan|получателю|зачисл|к зачислению|o.?tkazma summasi|перевод[а]? сумма|сумма перевода)/i,
  amount: /(сумма|summa|miqdor|amount)/i,
  commission: /(комисс|komissiya|commission|xizmat haqi|стоимость услуги|xizmat narxi)/i,
  total: /(итого|jami|всего|total|umumiy|списано|yechil|списан)/i,
  txn: /(транзакц|tranzaksiya|transaction|номер операции|operatsiya raqami|номер чека|chek raqami|kvitansiya|квитанция|\bid\b|\brrn\b|o.?tkazma ra[qg]ami)/i,
  date: /(sana|дата|date|vaqt|время|time)/i,
  sender: /(отправител|авител|yuboruvchi|jo.?natuvchi|sender|kartadan|плательщик|to.?lovchi|\bmijoz\b|^карта:?$|^karta:?$)/i,
  recipient: /(получател|[qg]abul [qg]iluvchi|oluvchi|recipient|kartaga|beneficiary)/i,
  status: /(исполнено|успешно|выполнена?|оплачено|проведен|muvaffa[qg]iyatli|bajarildi|amalga oshirildi|to.?landi|o.?tkazildi|tayyor|success)/i,
};
const MONTHS: Array<[RegExp, number]> = [
  [/^(yan|янв|jan)/i, 1], [/^(fev|фев|feb)/i, 2], [/^(mar|мар)/i, 3], [/^(apr|апр)/i, 4], [/^(may|мая|май)/i, 5], [/^(iyun|июн|jun)/i, 6],
  [/^(iyul|июл|jul)/i, 7], [/^(avg|авг|aug)/i, 8], [/^(sen|сен|sep)/i, 9], [/^(okt|окт|oct)/i, 10], [/^(noy|ноя|nov)/i, 11], [/^(dek|дек|dec)/i, 12],
];
// A masked card: "561468******4096", "5614 68** **** 4096", "**** 6733", "•••• 9072" (OCR may turn the dots into dashes).
const CARD = /(uzcard|humo|visa|master\s*card|mc)?[\s:]*(?:\d{4}\s?\d{0,2})?[*•·xх"'+\-]{2,}[\s*•·xх"'+\-]*(\d{4})\b/i;
// A sum: "460 200", "44 800,7", "557 600.00" (not a fragment of a card number like "561 468****").
const MONEY = /(?<![\d*])(\d{1,3}(?:[   ]\d{3})+|\d{4,9})(?:[.,](\d{1,2}))?(?![\d*•])/g;
const CURRENCY = /(сум|so.?m|uzs|сўм|\bсм\b|soʻm)/i;

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
function moneyIn(s: string): number | null {
  for (const m of s.matchAll(MONEY)) {
    const whole = Number(m[1].replace(/\D/g, ''));
    return m[2] ? Number(`${whole}.${m[2]}`) : whole;
  }
  return null;
}
/** A small amount such as a fee: "770.00", "5 062,20", "225" (from "225 0275", where OCR glued "UZS" on). */
function feeIn(s: string): number | null {
  const m = s.match(/(?<![\d*])(\d{1,3}(?:[ \u00a0\u202f]\d{3}(?!\d))+|\d{1,7}(?!\d))(?:[.,](\d{1,2}))?/);
  if (!m) return null;
  const whole = Number(m[1].replace(/\D/g, ''));
  return m[2] ? Number(`${whole}.${m[2]}`) : whole;
}
const pad = (n: number | string) => String(n).padStart(2, '0');

/** Date and time in any of the forms the apps print. Time only from the same place, never the phone's clock. */
function findDate(lines: string[]): string | null {
  const year = new Date().getFullYear();
  const timeNear = (s: string) => s.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  for (const [i, line] of lines.entries()) {
    const next = lines[i + 1] || '';
    let y: number | null = null, mo: number | null = null, d: number | null = null, rest = '';
    let m = line.match(/\b(\d{2})[./](\d{2})[./](\d{4})(.*)/);
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; rest = m[4]; }
    if (!m && (m = line.match(/\b(20\d{2})-(\d{2})-?(\d{2})(.*)/))) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
    if (!m && (m = line.match(/\b(\d{1,2})\s+([A-Za-zА-Яа-яЁё]{3,})\.?,?\s*(20\d{2})?(.*)/))) {
      const month = MONTHS.find(([re]) => re.test(m![2]))?.[1];
      if (month) { d = +m[1]; mo = month; y = m[3] ? +m[3] : year; rest = m[4]; } else m = null;
    }
    // A phone photo can glue it all together: "201020261213" after a date label.
    if (!m && (m = line.match(/\b(\d{2})(\d{2})(20\d{2})(\d{2})(\d{2})\b/))) {
      d = +m[1]; mo = +m[2]; y = +m[3]; rest = `${m[4]}:${m[5]}`;
    }
    if (!m || !y || !mo || !d || mo > 12 || d > 31) continue;
    let t = timeNear(rest);
    if (!t) {
      // "To'lov vaqti 17:07:50" or a time on the next line.
      const timeLine = lines.find((l) => /(vaqt|время|time)/i.test(l) && timeNear(l));
      t = timeLine ? timeNear(timeLine) : /^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(next) ? timeNear(next) : null;
    }
    return `${y}-${pad(mo)}-${pad(d)}${t ? `T${pad(t[1])}:${t[2]}` : ''}`;
  }
  return null;
}

export function parseReceipt(text: string): Receipt {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const r: Receipt = { bank: null, transactionId: null, amount: null, commission: null, total: null, paidAt: null, sender: null, senderCard: null, recipient: null, recipientCard: null, status: null };
  r.bank = BANKS.find(([re]) => re.test(text))?.[1] ?? null;
  const st = text.match(KEY.status);
  if (st) r.status = st[0][0].toUpperCase() + st[0].slice(1).toLowerCase();
  r.paidAt = findDate(lines);

  let received: number | null = null;
  // A label's value is on the same line ("Summa 500 000 so'm") or right under it ("Summa" / "49 200,00 UZS").
  const valueOf = (i: number, re: RegExp, read = moneyIn) => read(after(lines[i], re)) ?? (KEY.amount.test(lines[i + 1] || '') ? null : read(lines[i + 1] || ''));
  lines.forEach((line, i) => {
    const next = lines[i + 1] || '';
    if (KEY.commission.test(line)) r.commission ??= valueOf(i, KEY.commission, feeIn);
    else if (KEY.total.test(line)) r.total ??= valueOf(i, KEY.total);
    else if (KEY.received.test(line)) received ??= valueOf(i, KEY.received);
    else if (KEY.amount.test(line)) r.amount ??= valueOf(i, KEY.amount);
    if (KEY.txn.test(line) && !KEY.date.test(line) && !r.transactionId) {
      const tokens = `${after(line, KEY.txn)} ${KEY.txn.test(next) || KEY.date.test(next) ? '' : next}`
        .match(/[0-9A-Za-z][0-9A-Za-z-]{5,}/g)?.filter((t) => (t.match(/\d/g) || []).length >= 4 && !/^\d{1,2}[-]?\d{1,2}$/.test(t));
      if (tokens?.length) r.transactionId = tokens[0];
    }
    if (KEY.sender.test(line) && !KEY.recipient.test(line)) {
      // The name: on the label's line ("Отправитель Akbarova I."), or under a name label ("Yuboruvchining ismi" / "GULNORA S.").
      const own = cleanName(after(line, KEY.sender).replace(/^(ning )?ismi/i, ''));
      if (own && !/^(ning|ismi)$/i.test(own)) r.sender ??= own;
      else if (/(ism|имя)/i.test(line) && !cardOf(next)) r.sender ??= cleanName(next);
      r.senderCard ??= cardOf(line) ?? cardOf(next);
    }
    if (KEY.recipient.test(line)) {
      r.recipient ??= cleanName(after(line, KEY.recipient).replace(/^(ning )?ismi|^f\.?i\.?sh/i, ''));
      r.recipientCard ??= cardOf(line) ?? cardOf(next);
    }
  });
  if (received != null) r.amount = received;
  // The sender's card when its label landed apart from it (Payme): the card that is not the recipient's.
  if (!r.senderCard && r.recipientCard) {
    const cards = lines.map(cardOf).filter((c): c is string => Boolean(c));
    r.senderCard = cards.find((c) => c.slice(-4) !== r.recipientCard?.slice(-4)) ?? null;
  }

  // No labelled sum: the largest sum on the receipt, leaving out the fee and the total charged.
  let guessed = false;
  if (r.amount == null) {
    const sums: number[] = [];
    lines.forEach((line) => {
      if (KEY.commission.test(line) || KEY.total.test(line) || CARD.test(line) || /(\+998|tel|тел)/i.test(line)) return;
      for (const m of line.matchAll(MONEY)) {
        const grouped = /\s/.test(m[1]);
        if (!grouped && !CURRENCY.test(line)) continue;
        sums.push(Number(m[1].replace(/\D/g, '')));
      }
    });
    const big = sums.filter((n) => n >= 1000);
    if (big.length) { r.amount = Math.max(...big); guessed = true; }
  }
  if (r.amount != null) r.amount = Math.round(r.amount);
  // Some apps (Payme) print the sum with the fee included: 385 191 = 381 000 + 4 191.
  if (r.amount && r.commission && guessed && r.amount % 100 !== 0 && Math.round(r.amount - r.commission) % 100 === 0) {
    r.total ??= r.amount;
    r.amount = Math.round(r.amount - r.commission);
  }
  return r;
}

/** Fill what one reading missed from another reading of the same receipt. */
export function mergeReceipts(a: Receipt, b: Receipt): Receipt {
  const out = { ...a };
  for (const k of Object.keys(out) as Array<keyof Receipt>) if (out[k] == null) (out as any)[k] = b[k];
  if (a.paidAt && b.paidAt && !a.paidAt.includes('T') && b.paidAt.startsWith(a.paidAt)) out.paidAt = b.paidAt;
  return out;
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
