// Telegram message texts the owner can change on the Sozlamalar page. Shared by the server (to send)
// and the browser (to show how a message will look), so both render a text the same way.

export type TemplateKey = 'payment' | 'paymentVoid' | 'expenseVoid' | 'orderDelete' | 'dailyReport';

/** Where a message belongs in the list: A takes money in, B undoes something, C reports. */
export type TemplateGroup = 'kirim' | 'bekor' | 'hisobot';
export const TEMPLATE_GROUPS: { key: TemplateGroup; letter: string; title: string }[] = [
  { key: 'kirim', letter: 'A', title: 'KIRIM' },
  { key: 'bekor', letter: 'B', title: 'BEKOR QILISH VA OʻCHIRISH' },
  { key: 'hisobot', letter: 'C', title: 'HISOBOT' },
];

export interface TemplateVar { name: string; label: string; sample: string }
export interface TemplateDef {
  key: TemplateKey; group: TemplateGroup; title: string; hint: string; vars: TemplateVar[]; text: string;
  photo?: boolean; // goes out with the payment picture
  groupChat?: boolean; // can reach the group too
  files?: boolean; // followed by Excel files and the backup
}

const KIM: TemplateVar = { name: 'kim', label: 'Kim', sample: 'Dilnoza' };

export const TEMPLATES: TemplateDef[] = [
  {
    key: 'payment', group: 'kirim', photo: true, groupChat: true, title: 'Toʻlov qabul qilindi', hint: 'Har bir toʻlov rasmi bilan keladi',
    vars: [
      { name: 'belgi', label: 'Belgi 💵/💳', sample: '💵' },
      { name: 'turi', label: 'Turi', sample: 'Naqd' },
      { name: 'summa', label: 'Summa', sample: '125 000 soʻm' },
      { name: 'sarlavha', label: 'Stiker / chek', sample: '' },
      { name: 'mijoz', label: 'Mijoz', sample: 'LK-2041 · Aziz Karimov' },
      { name: 'tafsilot', label: 'Buyurtma tafsiloti', sample: '' },
      KIM,
      { name: 'vaqt', label: 'Vaqt', sample: '13.11.2026 17:40' },
      { name: 'izoh', label: 'Izoh', sample: '' },
    ],
    text: '{{belgi}} *{{turi}} · {{summa}}*\n{{sarlavha}}\n{{mijoz}}\n{{tafsilot}}\n👤 {{kim}} · {{vaqt}}\n📝 {{izoh}}',
  },
  {
    key: 'paymentVoid', group: 'bekor', groupChat: true, title: 'Toʻlov bekor qilindi', hint: 'Toʻlov bekor qilinganda darhol',
    vars: [
      { name: 'mijoz', label: 'Mijoz', sample: 'LK-2041' },
      { name: 'summa', label: 'Summa', sample: '125 000 soʻm' },
      { name: 'turi', label: 'Turi', sample: 'Naqd' },
      KIM,
      { name: 'sabab', label: 'Sabab', sample: 'xato kiritildi' },
    ],
    text: '⚠️ *Toʻlov bekor qilindi*\n{{mijoz}} · {{summa}} · {{turi}}\nKim: {{kim}}\nSabab: {{sabab}}',
  },
  {
    key: 'expenseVoid', group: 'bekor', groupChat: true, title: 'Rasxod bekor qilindi', hint: 'Rasxod bekor qilinganda darhol',
    vars: [
      { name: 'turkum', label: 'Turkum', sample: 'Paket' },
      { name: 'summa', label: 'Summa', sample: '30 000 soʻm' },
      { name: 'kassa', label: 'Kassa', sample: '1-kassa (naqd)' },
      KIM,
      { name: 'sabab', label: 'Sabab', sample: 'ikki marta yozilgan' },
    ],
    text: '⚠️ *Rasxod bekor qilindi*\n{{turkum}} · {{summa}} · {{kassa}}\nKim: {{kim}}\nSabab: {{sabab}}',
  },
  {
    key: 'orderDelete', group: 'bekor', groupChat: true, title: 'Buyurtma oʻchirildi', hint: 'Buyurtmalar roʻyxatdan oʻchirilganda',
    vars: [
      { name: 'soni', label: 'Nechta', sample: '2 ta buyurtma' },
      { name: 'summa', label: 'Jami', sample: '84 000 soʻm' },
      { name: 'royxat', label: 'Roʻyxat', sample: '• LK-2041 · 4F7K2 · 42 000 soʻm\n• LK-2041 · 4F7K3 · 42 000 soʻm' },
      KIM,
    ],
    text: '🗑 *{{soni}} oʻchirildi* · {{summa}}\n{{royxat}}\nKim: {{kim}}',
  },
  {
    key: 'dailyReport', group: 'hisobot', files: true, title: 'Kechki hisobot', hint: 'Har kuni 19:00 dan keyin, faqat sizga',
    vars: [
      { name: 'sana', label: 'Sana', sample: '13-noyabr, 2026' },
      { name: 'jami', label: 'Jami tushum', sample: '4 380 000 soʻm' },
      { name: 'soni', label: 'Toʻlovlar soni', sample: '37' },
      { name: 'mijozlar', label: 'Mijozlar soni', sample: '29' },
      { name: 'turlar', label: 'Turlar boʻyicha', sample: '   Naqd: 2 650 000 soʻm\n   Karta: 1 730 000 soʻm' },
      { name: 'rasxod', label: 'Rasxod', sample: '180 000 soʻm' },
      { name: 'bekor', label: 'Bekor qilingan', sample: '' },
      { name: 'qoldiq_naqd', label: 'Qoldiq (naqd)', sample: '2 698 200 soʻm' },
      { name: 'qoldiq_karta', label: 'Qoldiq (karta)', sample: '18 040 400 soʻm' },
    ],
    text: '📊 *Laylak Cargo · {{sana}}*\n\n💰 Jami: *{{jami}}* ({{soni}} ta toʻlov, {{mijozlar}} mijoz)\n{{turlar}}\n💸 Rasxod: {{rasxod}}\n⚠️ Bekor qilingan: {{bekor}}\n🏦 Kun oxiridagi qoldiq: naqd {{qoldiq_naqd}}, karta {{qoldiq_karta}}',
  },
];

/** What the owner changed: their own texts, and the messages they switched off. */
export interface TemplateSettings { texts: Partial<Record<TemplateKey, string>>; off: TemplateKey[] }

export const TEMPLATE_BY_KEY = Object.fromEntries(TEMPLATES.map((t) => [t.key, t])) as Record<TemplateKey, TemplateDef>;

export const MAX_TEMPLATE_LENGTH = 900;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Template + values -> Telegram HTML. The owner's text is plain: *between stars* is bold, {{name}} is a value.
 * A line whose values are all empty is left out (no "📝 " with nothing after it).
 */
export function renderTemplate(text: string, values: Record<string, string | undefined | null>): string {
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const names = [...line.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
    if (names.length && names.every((n) => !String(values[n] ?? '').trim())) continue;
    const html = escapeHtml(line)
      .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, n: string) => escapeHtml(String(values[n] ?? '')));
    lines.push(html);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Sample values for the preview. */
export const sampleValues = (key: TemplateKey) =>
  Object.fromEntries(TEMPLATE_BY_KEY[key].vars.map((v) => [v.name, v.sample]));
