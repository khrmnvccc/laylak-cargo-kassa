import { HttpError, query } from './db.js';
import { getTelegram, logSend, tg } from './telegram.js';
import { renderTemplate } from '../src/lib/tgTemplates.js';
import { BROADCAST_MAX_BUTTONS, BROADCAST_MAX_TEXT, type BroadcastButton } from '../src/lib/broadcast.js';

// Ommaviy xabarlar: the owner writes one message (with up to two link buttons) and sends it to every
// staff member who linked their own Telegram, or to the ones picked, now or at a set time.
// A set time is honoured the next time the site is used after it (the site polls every few seconds
// while anyone has it open) and by the evening cron; there is no separate clock.

export interface BroadcastRow {
  id: string; title: string; text: string; buttons: BroadcastButton[]; audience: { all?: boolean; users?: string[] };
  silent: boolean; send_at: string | null; status: string; delivered: number; failed: number;
  created_by_name: string | null; created_at: string; sent_at: string | null;
}

export const COLUMNS = `id::text, title, text, buttons, audience, silent, send_at, status, delivered, failed, created_by_name, created_at, sent_at`;

/** Checks and tidies what the editor sent; throws a 400 with the reason. */
export function parseBroadcast(body: any) {
  const title = String(body?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const text = String(body?.text ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length > BROADCAST_MAX_TEXT) throw new HttpError(400, `Matn juda uzun (${BROADCAST_MAX_TEXT} belgigacha)`);
  const buttons: BroadcastButton[] = [];
  for (const b of Array.isArray(body?.buttons) ? body.buttons.slice(0, BROADCAST_MAX_BUTTONS) : []) {
    const label = String(b?.text ?? '').trim().slice(0, 40);
    const url = String(b?.url ?? '').trim().slice(0, 300);
    if (!label && !url) continue;
    if (!label) throw new HttpError(400, 'Tugma nomini yozing');
    if (!/^https:\/\/[^\s]+$/i.test(url) && !/^tg:\/\/[^\s]+$/i.test(url)) throw new HttpError(400, `“${label}” tugmasi uchun https:// bilan boshlanadigan havola yozing`);
    buttons.push({ text: label, url });
  }
  const users = Array.isArray(body?.audience?.users)
    ? [...new Set<string>(body.audience.users.filter((id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 500)
    : [];
  const audience = body?.audience?.all === false ? { all: false, users } : { all: true };
  let sendAt: string | null = null;
  if (body?.sendAt) {
    const t = Date.parse(String(body.sendAt));
    if (!Number.isFinite(t)) throw new HttpError(400, 'Vaqt notoʻgʻri');
    if (t > Date.now() + 60 * 86400_000) throw new HttpError(400, 'Vaqt 60 kundan uzoq boʻlmasin');
    sendAt = new Date(t).toISOString();
  }
  return { title, text, buttons, audience, silent: body?.silent === true, sendAt };
}

/** Who a broadcast reaches: active people with a linked chat, all of them or the ones picked. */
export async function recipients(audience: BroadcastRow['audience']) {
  const all = audience?.all !== false;
  return query<{ user_id: string; chat_id: string; full_name: string }>(
    `SELECT p.user_id::text, p.chat_id, u.full_name FROM telegram_people p JOIN app_users u ON u.id = p.user_id
      WHERE u.is_active AND ($1 OR p.user_id = ANY($2::uuid[])) ORDER BY u.full_name`,
    [all, all ? [] : audience.users ?? []],
  );
}

const keyboard = (buttons: BroadcastButton[]) =>
  buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) } } : {};

/** One message to one chat, as the broadcast will look. */
export async function sendOne(b: Pick<BroadcastRow, 'text' | 'buttons' | 'silent'>, chatId: number, prefix = '') {
  const config = await getTelegram();
  if (!config?.chatId) throw new HttpError(400, 'Telegram bot ulanmagan');
  const html = prefix + renderTemplate(b.text, {});
  await tg(config.token, 'sendMessage', {
    chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: b.silent, ...keyboard(b.buttons),
  }, 10_000);
  return html;
}

/** Sends a claimed broadcast (status 'sending') to everyone it is meant for and records the result. */
export async function deliver(id: string) {
  const rows = await query<BroadcastRow>(`SELECT ${COLUMNS} FROM broadcasts WHERE id = $1 AND status = 'sending'`, [id]);
  const b = rows[0];
  if (!b) return;
  let delivered = 0;
  let failed = 0;
  try {
    const people = await recipients(b.audience);
    for (const p of people) {
      try {
        const html = await sendOne(b, Number(p.chat_id));
        delivered++;
        await logSend('broadcast', `staff:${p.full_name}`, html, null);
      } catch (error) {
        failed++;
        await logSend('broadcast', `staff:${p.full_name}`, b.text, error);
      }
      await new Promise((r) => setTimeout(r, 60)); // well under Telegram's 30 messages a second
    }
  } finally {
    await query(
      `UPDATE broadcasts SET status = $2, delivered = $3, failed = $4, sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id, delivered === 0 && failed > 0 ? 'failed' : 'sent', delivered, failed],
    );
  }
}

/** Takes one broadcast for sending; false when someone else already took it or it is not ready. */
export async function claim(id: string, from: string[]) {
  const rows = await query(`UPDATE broadcasts SET status = 'sending', updated_at = NOW() WHERE id = $1 AND status = ANY($2::text[]) RETURNING id`, [id, from]);
  return rows.length > 0;
}

let lastDueCheck = 0;
/** Sends the scheduled broadcasts whose time has come; checked at most once a minute per server. */
export async function deliverDue(force = false) {
  if (!force && Date.now() - lastDueCheck < 60_000) return;
  lastDueCheck = Date.now();
  const due = await query<{ id: string }>(`SELECT id::text FROM broadcasts WHERE status = 'scheduled' AND send_at <= NOW() ORDER BY send_at LIMIT 5`);
  for (const { id } of due) if (await claim(id, ['scheduled'])) await deliver(id);
}
