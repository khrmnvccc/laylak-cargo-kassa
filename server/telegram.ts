import { HttpError, query } from './db.js';

// The owner's Telegram bot. The token is typed in once on the Sozlamalar page and kept only in the
// database (app_meta 'telegram'); it is never sent back to the browser or put in a backup.
export interface TelegramConfig {
  token: string;
  botName: string;
  code: string; // one-time code the owner sends to the bot so we learn their chat
  chatId?: number;
  chatName?: string;
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
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
  if (!data?.ok) {
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

/** Best-effort alert (for example a cancelled payment): never fails or slows the request much. */
export async function notify(text: string) {
  try {
    await sendMessage(text, 4000);
  } catch (error) {
    console.error('Telegram notify failed', error);
  }
}
