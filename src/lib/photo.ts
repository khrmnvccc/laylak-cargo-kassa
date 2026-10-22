/** A screenshot or photo made small enough to send: JPEG, longest side at most 1600 px. */
export async function photoDataUrl(file: Blob, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Rasmni ochib boʻlmadi'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** What the cashier is told when the admin did not get the payment's pictures. */
export const TELEGRAM_MISS = {
  off: 'Telegram bot ulanmagan: Sozlamalar sahifasida ulang. Toʻlov saqlandi',
  failed: 'Telegram bilan aloqa boʻlmadi. Toʻlov saqlandi, rasmni adminga qoʻlda yuboring',
} as const;
