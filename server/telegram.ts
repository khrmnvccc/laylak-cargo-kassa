import { HttpError, query } from './db.js';

// The owner's Telegram bot. The token is typed in once on the Sozlamalar page and kept only in the
// database (app_meta 'telegram'); it is never sent back to the browser or put in a backup.
export interface TelegramConfig {
  token: string;
  botName: string;
  code: string; // one-time code the owner sends to the bot so we learn their chat
  chatId?: number;
  chatName?: string;
  // A group the owner added the bot to: payment pictures and alerts go there too (not the backup).
  groupId?: number;
  groupName?: string;
}

/** Telegram moved a group to a new id (it became a supergroup); `chatId` is the new one. */
export class ChatMoved extends Error {
  constructor(public chatId: number) { super('Telegram guruhi yangilandi'); }
}

const API = 'https://api.telegram.org';

export async function getTelegram(): Promise<TelegramConfig | null> {
  const rows = await query(`SELECT value FROM app_meta WHERE key = 'telegram'`);
  return (rows[0]?.value as TelegramConfig) || null;
}

export async function saveTelegram(config: TelegramConfig | null) {
  if (!config) {
    await query(`DELETE FROM app_meta WHERE key = 'telegram'`);
    return;
  }
  await query(
    `INSERT INTO app_meta (key, value) VALUES ('telegram', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(config)],
  );
}

export async function tg(token: string, method: string, body: Record<string, unknown> | FormData, timeoutMs = 15_000): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      ...(body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(502, 'Telegram bilan aloqa boʻlmadi. Birozdan keyin qayta urinib koʻring');
  }
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string; parameters?: { migrate_to_chat_id?: number } } | null;
  if (!data?.ok) {
    if (data?.parameters?.migrate_to_chat_id) throw new ChatMoved(data.parameters.migrate_to_chat_id);
    if (res.status === 401 || res.status === 404) throw new HttpError(400, 'Bot tokeni notoʻgʻri. @BotFather bergan tokenni toʻliq nusxalang');
    throw new HttpError(502, `Telegram rad etdi: ${data?.description || res.status}`);
  }
  return data.result;
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Send to the owner's chat; returns false when Telegram is not connected. */
export async function sendMessage(text: string, timeoutMs?: number): Promise<boolean> {
  const config = await getTelegram();
  if (!config?.chatId) return false;
  await tg(config.token, 'sendMessage', { chat_id: config.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }, timeoutMs);
  return true;
}

export async function sendDocument(data: Buffer, filename: string, caption: string): Promise<boolean> {
  const config = await getTelegram();
  if (!config?.chatId) return false;
  const form = new FormData();
  form.append('chat_id', String(config.chatId));
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('document', new Blob([new Uint8Array(data)]), filename);
  await tg(config.token, 'sendDocument', form, 60_000);
  return true;
}

/** Best-effort alert (for example a cancelled payment) to the owner and the group: never fails or slows the request much. */
export async function notify(text: string) {
  const config = await getTelegram();
  if (!config?.chatId) return;
  await everyChat(config, (chatId) => tg(config.token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }, 4000))
    .catch((error) => console.error('Telegram notify failed', error));
}

/** Runs `send` for the owner's chat and the group; resolves when at least one got it. */
async function everyChat(config: TelegramConfig, send: (chatId: number) => Promise<unknown>) {
  const chats = [config.chatId, config.groupId].filter((id): id is number => Boolean(id));
  const results = await Promise.allSettled(chats.map(async (chatId) => {
    try {
      await send(chatId);
    } catch (error) {
      if (!(error instanceof ChatMoved) || chatId !== config.groupId) throw error;
      await saveTelegram({ ...config, groupId: error.chatId });
      await send(error.chatId);
    }
  }));
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length === results.length) throw failed[0].reason;
  for (const f of failed) console.error('Telegram send failed', f.reason);
}

/** "data:image/jpeg;base64,…" from the browser -> bytes; null when it is not a small picture. */
export function photoFromDataUrl(value: unknown): Buffer | null {
  const m = typeof value === 'string' ? value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) return null;
  const data = Buffer.from(m[2], 'base64');
  return data.length > 32 && data.length <= 3_000_000 ? data : null;
}

/** Pictures with one caption (on the first) to the owner and the group; false when Telegram is not connected. */
export async function sendPhotos(photos: Buffer[], caption: string): Promise<boolean> {
  const config = await getTelegram();
  if (!config?.chatId || !photos.length) return false;
  await everyChat(config, (chatId) => {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (photos.length === 1) {
      form.append('caption', caption.slice(0, 1024));
      form.append('parse_mode', 'HTML');
      form.append('photo', new Blob([new Uint8Array(photos[0])], { type: 'image/jpeg' }), 'tolov.jpg');
      return tg(config.token, 'sendPhoto', form, 15_000);
    }
    const media = photos.slice(0, 10).map((_, i) => ({
      type: 'photo', media: `attach://p${i}`, ...(i === 0 ? { caption: caption.slice(0, 1024), parse_mode: 'HTML' } : {}),
    }));
    form.append('media', JSON.stringify(media));
    photos.slice(0, 10).forEach((p, i) => form.append(`p${i}`, new Blob([new Uint8Array(p)], { type: 'image/jpeg' }), `tolov-${i + 1}.jpg`));
    return tg(config.token, 'sendMediaGroup', form, 20_000);
  });
  return true;
}

/** Like sendPhotos, but never throws: says whether the admin got it. */
export async function reportPhotos(photos: Buffer[], caption: string): Promise<'sent' | 'off' | 'failed'> {
  try {
    return (await sendPhotos(photos, caption)) ? 'sent' : 'off';
  } catch (error) {
    console.error('Telegram photo failed', error);
    return 'failed';
  }
}
