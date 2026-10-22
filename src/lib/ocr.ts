import type { Worker } from 'tesseract.js';
import { mergeReceipts, parseOrders, parseReceipt, voteOrders, type Order, type Receipt } from './receiptParse';

// Free receipt reading on the cashier's own device (tesseract.js). Engine and language files are
// served from /ocr on our own site (see vite.config.ts); the first use downloads about 10 MB,
// later uses come from the browser cache.

// Receipts come in Russian or Uzbek; the orders screen is Latin only, where Russian letters
// would only add look-alike mistakes ("Iroda" read as "года").
const workers = new Map<string, Promise<Worker>>();

async function getWorker(langs: string[], onProgress?: (p: number) => void): Promise<Worker> {
  const key = langs.join('+');
  let workerPromise = workers.get(key);
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(langs, 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/',
        langPath: '/ocr/lang',
        logger: (m: { status: string; progress: number }) => {
          if (m.status.startsWith('loading')) onProgress?.(m.progress);
        },
      });
    })().catch((e) => {
      workers.delete(key);
      throw e;
    });
    workers.set(key, workerPromise);
  }
  return workerPromise;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Rasmni ochib boʻlmadi'));
    img.src = URL.createObjectURL(file);
  });
}

/** Grey, enlarged copy; `contrast` pushes light greys to white and dark to black. */
function prepare(img: HTMLImageElement, width: number, contrast = 1, flip = false): HTMLCanvasElement {
  const scale = Math.min(4, Math.max(1, width / img.naturalWidth));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  // Dark-mode screenshots (light text on dark) read better inverted.
  let sum = 0;
  for (let i = 0; i < px.length; i += 40) sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
  // `flip` reads it the other way round: for screens that mix light and dark panels.
  const invert = (sum / (px.length / 40) < 110) !== flip;
  for (let i = 0; i < px.length; i += 4) {
    let g = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    if (invert) g = 255 - g;
    g = Math.max(0, Math.min(255, (g - 128) * contrast + 128));
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export interface OcrResult { receipt: Receipt; orders: Order[]; ordersTotal: number | null; codeReadings: string[][] }

export async function readScreenshots(receiptFile: Blob, orderFiles: Blob[], onStep: (text: string) => void): Promise<OcrResult> {
  onStep('Oʻqish dasturi yuklanmoqda…');
  const loading = (p: number) => onStep(`Oʻqish dasturi yuklanmoqda… ${Math.round(p * 100)}%`);
  const worker = await getWorker(['rus', 'eng'], loading);

  onStep('Chek oʻqilmoqda…');
  const rImg = await loadImage(receiptFile);
  let receipt = parseReceipt((await worker.recognize(prepare(rImg, 1100))).data.text);
  // Photos of a phone and small PDFs read better larger and with more contrast: a second look
  // fills in what the first one missed.
  if (receipt.amount == null || receipt.paidAt == null || !receipt.paidAt.includes('T')) {
    onStep('Chek yana bir bor oʻqilmoqda…');
    const again = parseReceipt((await worker.recognize(prepare(rImg, Math.min(2400, rImg.naturalWidth * 2)))).data.text);
    receipt = mergeReceipts(receipt, again);
  }
  // Still no sum (a photo with light text on a coloured panel): look for scattered text instead
  // of a page, the other way round too.
  for (const flip of [false, true]) {
    if (receipt.amount != null) break;
    await worker.setParameters({ tessedit_pageseg_mode: '11' as any });
    const sparse = parseReceipt((await worker.recognize(prepare(rImg, rImg.naturalWidth * 1.5, 1, flip))).data.text);
    await worker.setParameters({ tessedit_pageseg_mode: '6' as any });
    receipt = mergeReceipts(receipt, sparse);
  }

  // Order tables are wide with small print: each one is read at a few sizes and contrasts,
  // and every field keeps what most readings agree on.
  const latin = await getWorker(['eng'], loading);
  await latin.setParameters({ tessedit_pageseg_mode: '6' as any, preserve_interword_spaces: '1' });
  const orders: Order[] = [];
  const codeReadings: string[][] = [];
  let ordersTotal: number | null = null;
  for (const [n, file] of orderFiles.entries()) {
    const img = await loadImage(file);
    const passes: Array<[number, number]> = [[2, 1], [3, 1], [3, 1.6], [4, 1]];
    const readings = [];
    for (const [k, [scale, contrast]] of passes.entries()) {
      onStep(`Buyurtmalar oʻqilmoqda… ${n + 1}/${orderFiles.length} · ${k + 1}/${passes.length}`);
      const text = (await latin.recognize(prepare(img, img.naturalWidth * scale, contrast))).data.text;
      readings.push(parseOrders(text));
    }
    const voted = voteOrders(readings);
    orders.push(...voted.orders);
    codeReadings.push(...voted.codeReadings);
    if (voted.total != null) ordersTotal = (ordersTotal || 0) + voted.total;
  }
  return { receipt, orders, ordersTotal, codeReadings };
}
