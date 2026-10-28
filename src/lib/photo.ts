/**
 * A screenshot or photo made small enough to send: JPEG, longest side at most 1280 px
 * (Telegram shows photos no bigger than that). Decoding and shrinking happen off the main thread
 * where the browser can, so picking a big camera photo does not freeze the page.
 */
export async function photoDataUrl(file: Blob, maxSide = 1280): Promise<string> {
  const { width, height } = await imageSize(file);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  let source: CanvasImageSource;
  try {
    source = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  } catch {
    source = await loadImage(file);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  if ('close' in source) source.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    const img = await loadImage(file);
    return { width: img.naturalWidth, height: img.naturalHeight };
  }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Rasmni ochib boʻlmadi'));
    el.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

/** What the cashier is told when the admin did not get the payment's pictures. */
export const TELEGRAM_MISS = {
  off: 'Telegram bot ulanmagan: Sozlamalar sahifasida ulang. Toʻlov saqlandi',
} as const;
