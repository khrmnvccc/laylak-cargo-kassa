import { HttpError, query } from './db.js';
import { MAX_TEMPLATE_LENGTH, TEMPLATE_BY_KEY, renderTemplate, type TemplateKey, type TemplateSettings } from '../src/lib/tgTemplates.js';

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
  groupThreadId?: number; // a topic in a group with topics
  groupPaused?: boolean; // the owner stopped the group for a while (e.g. while fixing old records)
  // The owner stopped payment pictures and alerts in their own chat; the evening report and backup still come.
  personalPaused?: boolean;
  // What the group gets; a missing value means yes. The owner's own chat always gets both kinds.
  groupPayments?: boolean; // payment pictures
  groupCancels?: boolean; // cancelled payments and expenses, deleted orders
}

/** Which kind of message is being sent, so the group can be told to skip one. */
export type MessageKind = 'payments' | 'cancels';

/** The last message Telegram refused, kept apart from the settings so writing it never races a settings change. */
export interface TelegramError { chat: 'personal' | 'group'; message: string; at: string }

export async function getTelegramErrors(): Promise<TelegramError[]> {
  const rows = await query(`SELECT value FROM app_meta WHERE key IN ('telegram_error_personal', 'telegram_error_group')`);
  return rows.map((r: any) => r.value as TelegramError).sort((a, b) => a.chat.localeCompare(b.chat) * -1);
}

/** Remembers (or, with null, forgets) why a chat did not get its message; never throws. */
export async function setTelegramError(chat: 'personal' | 'group', error: unknown | null) {
  const key = `telegram_error_${chat}`;
  try {
    if (error === null) {
      await query(`DELETE FROM app_meta WHERE key = $1`, [key]);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await query(
      `INSERT INTO app_meta (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify({ chat, message, at: new Date().toISOString() })],
    );
  } catch (e) {
    console.error('Telegram error note failed', e);
  }
}

/** Telegram moved a group to a new id (it became a supergroup); `chatId` is the new one. */
export class ChatMoved extends Error {
  constructor(public chatId: number) { super('Telegram guruhi yangilandi'); }
}

const API = 'https://api.telegram.org';

// Read on every saved payment; remembered briefly per server instance so saving does not wait on it.
let telegramCache: { value: TelegramConfig | null; until: number } | null = null;

export async function getTelegram(): Promise<TelegramConfig | null> {
  if (telegramCache && telegramCache.until > Date.now()) return telegramCache.value;
  const rows = await query(`SELECT value FROM app_meta WHERE key = 'telegram'`);
  const value = (rows[0]?.value as TelegramConfig) || null;
  telegramCache = { value, until: Date.now() + 30_000 };
  return value;
}

export async function saveTelegram(config: TelegramConfig | null) {
  telegramCache = null;
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

/** Send to the owner's chat; returns false when Telegram is not connected. `logAs` names it in the sent list. */
export async function sendMessage(text: string, timeoutMs?: number, logAs = 'other'): Promise<boolean> {
  const config = await getTelegram();
  if (!config?.chatId) return false;
  try {
    await tg(config.token, 'sendMessage', { chat_id: config.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }, timeoutMs);
  } catch (error) {
    await logSend(logAs, 'personal', text, error);
    throw error;
  }
  await logSend(logAs, 'personal', text, null);
  return true;
}

// ---------- the sent list: the last few hundred messages, so the owner can see what went where ----------

/** Writes one line of the sent list; never throws and never slows a send much (it runs in the background). */
export async function logSend(template: string, chat: 'personal' | 'group', text: string, error: unknown) {
  try {
    await query(
      `INSERT INTO telegram_log (template, chat, ok, text, error) VALUES ($1, $2, $3, $4, $5)`,
      [template, chat, !error, text.slice(0, 4000), error ? (error instanceof Error ? error.message : String(error)).slice(0, 500) : null],
    );
    // Keep the table small: a few hundred rows is plenty for "what was sent lately".
    if (Math.random() < 0.1) await query(`DELETE FROM telegram_log WHERE id < (SELECT MAX(id) - 500 FROM telegram_log)`);
  } catch (e) {
    console.error('Telegram log failed', e);
  }
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
export async function notify(text: string | null, template: TemplateKey) {
  if (!text) return; // the owner switched this message off
  const config = await getTelegram();
  if (!config?.chatId) return;
  await everyChat(config, 'cancels', { template, text }, (chatId, topic) => tg(config.token, 'sendMessage', { chat_id: chatId, ...topic, text, parse_mode: 'HTML', disable_web_page_preview: true }, 10_000))
    .catch((error) => console.error('Telegram notify failed', error));
}

/**
 * Runs `send` for the owner's chat and the group, each unless it is paused; resolves when at least one got it.
 * Returns false when both are paused, so nothing was sent.
 */
async function everyChat(config: TelegramConfig, kind: MessageKind, log: { template: string; text: string }, send: (chatId: number, topic: Record<string, number>) => Promise<unknown>): Promise<boolean> {
  const groupWants = kind === 'payments' ? config.groupPayments !== false : config.groupCancels !== false;
  const chats = [
    config.personalPaused ? undefined : config.chatId,
    config.groupPaused || !groupWants ? undefined : config.groupId,
  ].filter((id): id is number => Boolean(id));
  if (!chats.length) return false;
  const results = await Promise.allSettled(chats.map(async (chatId) => {
    const which = chatId === config.groupId ? 'group' : 'personal';
    const topic: Record<string, number> = which === 'group' && config.groupThreadId ? { message_thread_id: config.groupThreadId } : {};
    try {
      try {
        await send(chatId, topic);
      } catch (error) {
        if (!(error instanceof ChatMoved) || which !== 'group') throw error;
        await saveTelegram({ ...config, groupId: error.chatId });
        await send(error.chatId, topic);
      }
    } catch (error) {
      await Promise.all([setTelegramError(which, error), logSend(log.template, which, log.text, error)]);
      throw error;
    }
    await Promise.all([setTelegramError(which, null), logSend(log.template, which, log.text, null)]);
  }));
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length === results.length) throw failed[0].reason;
  for (const f of failed) console.error('Telegram send failed', f.reason);
  return true;
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
  return everyChat(config, 'payments', { template: 'payment', text: caption }, (chatId, topic) => {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (topic.message_thread_id) form.append('message_thread_id', String(topic.message_thread_id));
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

/** A text message to the owner and the group that never throws: says whether it was delivered. */
export async function reportText(text: string): Promise<'sent' | 'off' | 'failed'> {
  try {
    const config = await getTelegram();
    if (!config?.chatId) return 'off';
    const sent = await everyChat(config, 'payments', { template: 'payment', text }, (chatId, topic) => tg(config.token, 'sendMessage', { chat_id: chatId, ...topic, text, parse_mode: 'HTML', disable_web_page_preview: true }, 8000));
    return sent ? 'sent' : 'off';
  } catch (error) {
    console.error('Telegram message failed', error);
    return 'failed';
  }
}

// ---------- message texts the owner changed, and the ones switched off (app_meta 'telegram_templates') ----------

let templateCache: { value: TemplateSettings; until: number } | null = null;

export async function getTemplateSettings(): Promise<TemplateSettings> {
  if (templateCache && templateCache.until > Date.now()) return templateCache.value;
  const rows = await query(`SELECT value FROM app_meta WHERE key = 'telegram_templates'`);
  const raw = (rows[0]?.value || {}) as Partial<TemplateSettings>;
  const value: TemplateSettings = { texts: raw.texts || {}, off: (raw.off || []).filter((k) => TEMPLATE_BY_KEY[k]) };
  templateCache = { value, until: Date.now() + 30_000 };
  return value;
}

/** Changes one message: its text (null or the default puts the default back) and/or whether it is sent at all. */
export async function saveTemplate(key: TemplateKey, change: { text?: string | null; on?: boolean }) {
  const current = await getTemplateSettings();
  const texts = { ...current.texts };
  let off = [...current.off];
  if (change.text !== undefined) {
    const clean = change.text?.replace(/\r\n/g, '\n').trim() || null;
    if (clean && clean.length > MAX_TEMPLATE_LENGTH) throw new HttpError(400, `Matn juda uzun (${MAX_TEMPLATE_LENGTH} belgigacha)`);
    if (!clean || clean === TEMPLATE_BY_KEY[key].text) delete texts[key];
    else texts[key] = clean;
  }
  if (change.on !== undefined) off = change.on ? off.filter((k) => k !== key) : [...new Set([...off, key])];
  const next: TemplateSettings = { texts, off };
  templateCache = null;
  await query(
    `INSERT INTO app_meta (key, value) VALUES ('telegram_templates', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(next)],
  );
  return next;
}

/** The message for `key` in the owner's words (or the default), with the values filled in; null when switched off. */
export async function messageText(key: TemplateKey, values: Record<string, string | undefined | null>): Promise<string | null> {
  const settings = await getTemplateSettings().catch((): TemplateSettings => ({ texts: {}, off: [] }));
  if (settings.off.includes(key)) return null;
  return renderTemplate(settings.texts[key] || TEMPLATE_BY_KEY[key].text, values);
}
