import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from './db.js';

// Reads a bank payment receipt (any bank app: Alif, Click, Payme, Uzum, ...) and screenshots of
// the client's orders with Claude, so the kassa can match the transfer to the orders.
// The key lives only in the server environment (ANTHROPIC_API_KEY) and never reaches the browser.

export interface ReceiptImage { mediaType: string; data: string }

export interface ReadReceipt {
  bank: string | null;
  transactionId: string | null;
  amount: number | null;
  commission: number | null;
  total: number | null;
  paidAt: string | null; // "YYYY-MM-DDTHH:MM" as printed on the receipt (Tashkent time)
  sender: string | null;
  senderCard: string | null;
  recipient: string | null;
  recipientCard: string | null;
  status: string | null;
}

export interface ReadOrder {
  clientName: string | null;
  code: string | null;
  orderNo: string | null;
  transport: string | null;
  weight: string | null;
  amount: number | null;
}

export interface ReadResult {
  receipt: ReadReceipt;
  orders: ReadOrder[];
  ordersTotal: number | null;
  notes: string | null;
}

export const MODEL = 'claude-opus-5-5';
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 1_500_000; // per image after base64 decoding; the browser shrinks photos first

const nullable = (type: string) => ({ type: [type, 'null'] });

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['receipt', 'orders', 'ordersTotal', 'notes'],
  properties: {
    receipt: {
      type: 'object',
      additionalProperties: false,
      required: ['bank', 'transactionId', 'amount', 'commission', 'total', 'paidAt', 'sender', 'senderCard', 'recipient', 'recipientCard', 'status'],
      properties: {
        bank: nullable('string'),
        transactionId: nullable('string'),
        amount: nullable('integer'),
        commission: nullable('number'),
        total: nullable('number'),
        paidAt: nullable('string'),
        sender: nullable('string'),
        senderCard: nullable('string'),
        recipient: nullable('string'),
        recipientCard: nullable('string'),
        status: nullable('string'),
      },
    },
    orders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['clientName', 'code', 'orderNo', 'transport', 'weight', 'amount'],
        properties: {
          clientName: nullable('string'),
          code: nullable('string'),
          orderNo: nullable('string'),
          transport: nullable('string'),
          weight: nullable('string'),
          amount: nullable('integer'),
        },
      },
    },
    ordersTotal: nullable('integer'),
    notes: nullable('string'),
  },
};

const INSTRUCTIONS = `The images come from a cargo company's cash desk in Uzbekistan. The first image is a payment receipt (чек) from a client's banking app; every bank's receipt looks different. The other images are screenshots of that client's orders (buyurtmalar) with their prices.

Read them and fill in the JSON fields. Copy values exactly as printed; use null for anything that is not shown. Never guess.

Receipt:
- bank: the app or bank the receipt is from (for example Alif, Click, Payme, Uzum, Kapitalbank, Humo), from its logo or text.
- transactionId: the transaction / operation / cheque number (Номер транзакции, ID операции, Tranzaksiya raqami, Chek raqami), digits and letters only.
- amount: the amount transferred to the recipient in whole soʻm, WITHOUT the bank commission (Сумма / Summa / Перевод). If the receipt only shows one total, use it.
- commission: the commission (Комиссия) if shown; total: the grand total with commission (Итого) if shown.
- paidAt: date and time of the payment as "YYYY-MM-DDTHH:MM" (receipts write dates as DD.MM.YYYY).
- sender / senderCard and recipient / recipientCard: names and masked card numbers as printed (for example "UZCARD**4168").
- status: the payment status if printed (for example Успешно, Muvaffaqiyatli).

Orders: one entry per order row.
- clientName: the client's name on the row; code: the client code exactly as printed (for example "TTT-102315"); orderNo: the order number without "№"; transport: Avia, Avto, Temir yoʻl, ... as printed; weight: as printed with its unit; amount: the price of that order in whole soʻm.
- ordersTotal: the total the screenshot itself prints for the orders (for example "Kutilayotgan" or "Jami"), not your own sum.

notes: one short sentence in Uzbek only if something is unclear, cut off or does not look like a receipt; otherwise null.`;

export type ReceiptReader = (images: ReceiptImage[]) => Promise<ReadResult>;

async function readWithClaude(images: ReceiptImage[]): Promise<ReadResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, 'Chekni oʻqish hali yoqilmagan: serverga ANTHROPIC_API_KEY kaliti qoʻshilmagan');
  }
  const client = new Anthropic();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          ...images.map((img, i) => [
            { type: 'text' as const, text: i === 0 ? 'Image 1: payment receipt' : `Image ${i + 1}: orders` },
            { type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType as 'image/jpeg', data: img.data } },
          ]).flat(),
          { type: 'text', text: INSTRUCTIONS },
        ],
      }],
    }, { timeout: 90_000, maxRetries: 1 });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'ANTHROPIC_API_KEY kaliti notoʻgʻri yoki oʻchirilgan');
    if (error instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Juda koʻp soʻrov. Bir daqiqadan keyin qayta urinib koʻring');
    if (error instanceof Anthropic.BadRequestError) throw new HttpError(400, 'Rasmni oʻqib boʻlmadi. Boshqa rasm yuklab koʻring');
    console.error('Receipt reading failed', error);
    throw new HttpError(502, 'Chekni oʻqish xizmati javob bermadi. Birozdan keyin qayta urinib koʻring');
  }
  if (message.stop_reason === 'refusal') throw new HttpError(422, 'Bu rasmlarni oʻqib boʻlmadi');
  const text = message.content.find((b) => b.type === 'text');
  if (message.stop_reason === 'max_tokens' || !text || text.type !== 'text') throw new HttpError(502, 'Javob toʻliq kelmadi. Qayta urinib koʻring');
  try {
    return JSON.parse(text.text) as ReadResult;
  } catch {
    throw new HttpError(502, 'Javob notoʻgʻri formatda keldi. Qayta urinib koʻring');
  }
}

let reader: ReceiptReader = readWithClaude;
/** Tests swap the reader so they never call the real API. */
export function setReceiptReader(next: ReceiptReader | null) { reader = next ?? readWithClaude; }
export const readImages = (images: ReceiptImage[]) => reader(images);

/** "TTT-102315" -> "102315": the kassa keeps one ID per client; the letters only say which warehouse/route. */
export function clientCodeOf(code: string | null | undefined): string {
  const raw = String(code || '').toUpperCase().replace(/\s+/g, '');
  const digits = raw.match(/\d{3,}/g);
  if (digits) return digits[digits.length - 1];
  return raw.replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

/** Key that recognises the same receipt again: the bank's transaction number, else amount + time + card. */
export function receiptKey(r: { transactionId?: string | null; amount?: number | null; paidAt?: string | null; senderCard?: string | null }): string | null {
  const txn = String(r.transactionId || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (txn.length >= 4) return `txn:${txn}`;
  if (r.amount && r.paidAt) return `sum:${r.amount}|${r.paidAt}|${String(r.senderCard || '').replace(/\D/g, '').slice(-4)}`;
  return null;
}
