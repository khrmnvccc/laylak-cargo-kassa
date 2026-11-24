import { HttpError, query, transaction } from './db.js';
import { escapeHtml, getTelegram, tg, type TelegramConfig } from './telegram.js';
import { pushToOwner } from './push.js';
import {
  MAX_FEE, MAX_LABEL, MAX_STOPS, distanceKm, googlePlaceUrl, googleRouteUrl, isShortMapLink, parsePlace, planRoute, roadKmLabel,
  yandexPlaceUrl, yandexRouteUrl, type Place, type Point,
} from '../src/lib/delivery.js';

// Yetkazish: evening delivery runs inside the city. The owner sends the bot a few locations (or map links),
// then /reys; the bot puts them in the shortest order from the start point and saves the run. The fee taken
// at each stop is kept here only: it never becomes a payment, so 1-kassa and 2-kassa never see it.

export interface DeliverySettings { start?: Place | null }
interface DraftStop extends Place { fee?: number }
interface Draft { stops: DraftStop[]; waitingStart?: boolean }

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

async function meta<T>(key: string): Promise<T | null> {
  const rows = await query(`SELECT value FROM app_meta WHERE key = $1`, [key]);
  return (rows[0]?.value as T) ?? null;
}
async function setMeta(key: string, value: unknown) {
  await query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

export async function getDeliverySettings(): Promise<DeliverySettings> {
  return (await meta<DeliverySettings>('delivery')) ?? {};
}
export async function saveDeliverySettings(settings: DeliverySettings) {
  await setMeta('delivery', settings);
}

export async function getDraft(): Promise<Draft> {
  const d = await meta<Draft>('delivery_draft');
  return { stops: Array.isArray(d?.stops) ? d!.stops : [], waitingStart: Boolean(d?.waitingStart) };
}
async function saveDraft(draft: Draft) {
  await setMeta('delivery_draft', draft);
}
export async function clearDraft() {
  await query(`DELETE FROM app_meta WHERE key = 'delivery_draft'`);
}

/** Where every run starts: the place set on the Yetkazish page, else the office from Davomat. */
export async function startPoint(): Promise<(Place & { from: 'set' | 'office' }) | null> {
  const s = await getDeliverySettings();
  if (s.start && Number.isFinite(s.start.lat)) return { ...s.start, from: 'set' };
  const office = await meta<{ lat: number; lng: number }>('office');
  if (office && Number.isFinite(office.lat) && Number.isFinite(office.lng)) return { lat: office.lat, lng: office.lng, label: 'Ishxona', from: 'office' };
  return null;
}

/** Opens a short map link (it only redirects) to read the coordinates from where it leads. */
async function followShortLink(url: string): Promise<Point | null> {
  let next = url;
  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetch(next, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0 (kassa)' } });
    } catch {
      return null;
    }
    const location = res.headers.get('location');
    if (!location) {
      const html = res.status === 200 ? (await res.text().catch(() => '')).slice(0, 200_000) : '';
      const m = html.match(/(?:center|ll|@)[=:"\s[]*(-?\d{1,3}\.\d{4,})[,%2C\s]+(-?\d{1,3}\.\d{4,})/);
      return m ? parsePlace(`${m[1]},${m[2]}`) : null;
    }
    next = new URL(location, next).toString();
    const found = parsePlace(next);
    if (found) return found;
  }
  return null;
}

/** A place from what was typed or pasted; null when it holds no place. */
export async function readPlace(text: string): Promise<Point | null> {
  const direct = parsePlace(text);
  if (direct) return direct;
  const link = text.match(/https?:\/\/\S+/)?.[0];
  return link && isShortMapLink(link) ? followShortLink(link) : null;
}

export interface Stop { id: number; position: number; lat: number; lng: number; label: string; fee: number; done: boolean; collected: boolean }
export interface Trip { id: number; day: string; km: number; source: 'site' | 'bot'; start: Point | null; created_by_name: string | null; created_at: string; stops: Stop[] }

/** Puts the places in order and saves them as one run. */
export async function createTrip(places: DraftStop[], source: 'site' | 'bot', by: string | null, day = today()): Promise<Trip> {
  if (!places.length) throw new HttpError(400, 'Kamida bitta manzil kerak');
  if (places.length > MAX_STOPS) throw new HttpError(400, `Bir reysda ${MAX_STOPS} tagacha manzil`);
  const start = await startPoint();
  const { order, km } = planRoute(start, places);
  const id = await transaction(async (db) => {
    const trip = await db.query(
      `INSERT INTO deliveries (day, start_lat, start_lng, km, source, created_by_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [day, start?.lat ?? null, start?.lng ?? null, Math.round(km * 100) / 100, source, by],
    );
    const tripId = Number(trip.rows[0].id);
    for (const [i, p] of order.entries()) {
      await db.query(
        `INSERT INTO delivery_stops (delivery_id, position, lat, lng, label, fee) VALUES ($1, $2, $3, $4, $5, $6)`,
        [tripId, i + 1, p.lat, p.lng, (p.label || '').slice(0, MAX_LABEL), Math.min(MAX_FEE, Math.max(0, Math.round(p.fee || 0)))],
      );
    }
    return tripId;
  });
  return (await loadTrips({ id }))[0];
}

export async function loadTrips(where: { id?: number; from?: string; to?: string }): Promise<Trip[]> {
  const params: unknown[] = [];
  let sql = `SELECT id::int, day::text, km::float, source, start_lat, start_lng, created_by_name, created_at FROM deliveries`;
  if (where.id) { params.push(where.id); sql += ` WHERE id = $1`; }
  else { params.push(where.from, where.to); sql += ` WHERE day BETWEEN $1::date AND $2::date`; }
  sql += ` ORDER BY day DESC, id DESC LIMIT 400`;
  const trips = await query(sql, params);
  if (!trips.length) return [];
  const stops = await query<Stop & { delivery_id: number }>(
    `SELECT id::int, delivery_id::int, position::int, lat, lng, label, fee::float, done, collected FROM delivery_stops
      WHERE delivery_id = ANY($1::bigint[]) ORDER BY position`,
    [trips.map((t: any) => t.id)],
  );
  return trips.map((t: any) => ({
    id: t.id, day: t.day, km: t.km, source: t.source, created_by_name: t.created_by_name, created_at: t.created_at,
    start: t.start_lat == null ? null : { lat: t.start_lat, lng: t.start_lng },
    stops: stops.filter((s) => s.delivery_id === t.id).map(({ delivery_id: _d, ...s }) => s),
  }));
}

// ---------- the Telegram side ----------

const money = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} soʻm`;

/** The run as the bot sends it: numbered stops, each with its map links, and buttons for the whole route. */
export function tripMessage(trip: Trip, siteUrl?: string) {
  const lines = [`🚚 <b>Reys · ${trip.stops.length} ta manzil</b> · ${roadKmLabel(trip.km)}`];
  if (trip.start) lines.push('Boshlanish: ishxonadan');
  lines.push('');
  for (const s of trip.stops) {
    const name = s.label ? escapeHtml(s.label) : `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
    const fee = s.fee > 0 ? ` · ${s.collected ? '✅ ' : '💵 '}${money(s.fee)}` : '';
    lines.push(`${s.done ? '✔️' : `${s.position}.`} ${name}${fee}\n   <a href="${yandexPlaceUrl(s)}">Yandex</a> · <a href="${googlePlaceUrl(s)}">Google</a>`);
  }
  lines.push('', siteUrl
    ? 'Reysni saytda boshlang. 📎 → Joylashuv → <b>Jonli joylashuv</b> yuborsangiz, manzilga yetganingizda sayt tepadan eslatadi.'
    : 'Manzilga yetganda pastdagi tugmani bosing. 📎 → Joylashuv → <b>Jonli joylashuv</b> yuborsangiz, yetib borganingizda oʻzim eslataman.');
  const points = [...(trip.start ? [trip.start] : []), ...trip.stops];
  const route = [{ text: '🗺 Yandex: butun yoʻl', url: yandexRouteUrl(points) }, { text: 'Google Maps', url: googleRouteUrl(points) }];
  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard: siteUrl
      // The work itself happens on the site (Reys rejimi); the bot only hands the run over.
      ? [[{ text: '🚚 Saytda reysni boshlash', url: `${siteUrl}/#/delivery?drive=${trip.id}` }], route]
      : [route, ...trip.stops.filter((s) => !s.done).map((s) => [{ text: `✅ ${s.position}. ${shortName(s)}: yetkazdim`, callback_data: `d:${s.id}` }])] },
  };
}

const shortName = (s: { label: string; lat: number; lng: number }) => (s.label || `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`).slice(0, 28);

/** "Take the money" with Oldim / Olmadim, or plain "delivered" when nothing is to be taken there. */
function collectMessage(s: Stop, arrived: boolean) {
  const head = arrived ? `📍 <b>Yetib keldingiz: ${s.position}. ${escapeHtml(shortName(s))}</b>` : `✅ <b>${s.position}. ${escapeHtml(shortName(s))}</b>: yetkazildi`;
  if (s.fee > 0 && !s.collected) {
    return {
      text: `${head}\n\n💵 <b>${money(s.fee)} oling</b>`,
      reply_markup: { inline_keyboard: [[{ text: `💵 Oldim · ${money(s.fee)}`, callback_data: `c:${s.id}` }, { text: 'Olmadim', callback_data: `n:${s.id}` }]] },
    };
  }
  if (arrived) return { text: `${head}\nBu manzildan pul olinmaydi.`, reply_markup: { inline_keyboard: [[{ text: '✅ Yetkazdim', callback_data: `d:${s.id}` }]] } };
  return { text: head };
}

async function stopById(id: number): Promise<(Stop & { delivery_id: number }) | null> {
  const rows = await query(`SELECT id::int, delivery_id::int, position::int, lat, lng, label, fee::float, done, collected FROM delivery_stops WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** The next stop still to visit in the same run, as a line with its map link. */
async function nextLine(deliveryId: number) {
  const rows = await query(`SELECT position::int, lat, lng, label FROM delivery_stops WHERE delivery_id = $1 AND NOT done ORDER BY position LIMIT 1`, [deliveryId]);
  const n = rows[0];
  return n ? `\n\n➡️ Keyingisi: ${n.position}. ${escapeHtml(shortName(n))} · <a href="${yandexPlaceUrl(n)}">Yandex</a>` : '\n\n🏁 Reys tugadi.';
}

/** A press on one of the bot's buttons: d = delivered, c = money taken (Oldim), n = not taken (Olmadim). */
export async function handleBotButton(config: TelegramConfig, cb: any): Promise<string> {
  const answer = (text?: string) => tg(config.token, 'answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text } : {}) }).catch(() => undefined);
  if (!config.chatId || cb?.from?.id !== config.chatId) { await answer(); return 'ignored'; }
  const m = String(cb.data || '').match(/^([dcn]):(\d+)$/);
  const stop = m ? await stopById(Number(m[2])) : null;
  if (!m || !stop) { await answer('Manzil topilmadi'); return 'missing'; }
  const kind = m[1];
  const edit = (text: string, markup?: unknown) => tg(config.token, 'editMessageText', {
    chat_id: config.chatId, message_id: cb.message?.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}),
  }).catch(() => undefined);
  if (kind === 'd') {
    await query(`UPDATE delivery_stops SET done = TRUE WHERE id = $1`, [stop.id]);
    const done = { ...stop, done: true };
    await answer();
    if (done.fee > 0 && !done.collected) {
      const msg = collectMessage(done, false);
      await reply(config, config.chatId, msg.text, { reply_markup: msg.reply_markup });
    } else {
      await reply(config, config.chatId, collectMessage(done, false).text + await nextLine(stop.delivery_id));
    }
    // The run message drops the button of the stop just delivered.
    const [trip] = await loadTrips({ id: stop.delivery_id });
    if (trip && cb.message?.text?.startsWith('🚚')) { const t = tripMessage(trip, config.siteUrl); await edit(t.text, t.reply_markup); }
    return 'delivered';
  }
  const took = kind === 'c';
  await query(`UPDATE delivery_stops SET done = TRUE, collected = $2 WHERE id = $1`, [stop.id, took]);
  await answer(took ? `${money(stop.fee)} qoʻshildi` : 'Pul olinmadi');
  const line = took ? `💵 <b>${money(stop.fee)} olindi</b> va hisobga qoʻshildi.` : '➖ Pul olinmadi, hisobga qoʻshilmadi.';
  await edit(`✅ <b>${stop.position}. ${escapeHtml(shortName(stop))}</b>\n${line}${await nextLine(stop.delivery_id)}`);
  return took ? 'collected' : 'not-collected';
}

/** How near counts as "arrived", in metres. */
export const ARRIVE_M = 150;

/**
 * The owner's live location moved: when it comes within reach of a stop of today's runs that is still to be
 * delivered, the bot says so once, with the money to take there. Works while Yandex is open on top.
 */
export async function handleLiveLocation(config: TelegramConfig, message: any): Promise<string> {
  if (!config.chatId || message?.chat?.id !== config.chatId) return 'ignored';
  const loc = message.location;
  if (!loc || !Number.isFinite(loc.latitude)) return 'ignored';
  const near = await checkArrival({ lat: loc.latitude, lng: loc.longitude });
  if (!near) return 'moving';
  await notifyArrival(config, near);
  return 'arrived';
}

/** The stop of today's runs (still to deliver, not yet announced) within reach of `here`; claims it so it is said once. */
export async function checkArrival(here: Point): Promise<(Stop & { delivery_id: number }) | null> {
  const rows = await query<Stop & { delivery_id: number }>(
    `SELECT s.id::int, s.delivery_id::int, s.position::int, s.lat, s.lng, s.label, s.fee::float, s.done, s.collected
       FROM delivery_stops s JOIN deliveries d ON d.id = s.delivery_id
      WHERE NOT s.done AND s.arrived_at IS NULL AND d.day >= $1::date - 1 ORDER BY d.id DESC, s.position`,
    [today()],
  );
  const near = rows.find((s) => distanceKm(here, s) * 1000 <= ARRIVE_M);
  if (!near) return null;
  const claimed = await query(`UPDATE delivery_stops SET arrived_at = NOW() WHERE id = $1 AND arrived_at IS NULL RETURNING id`, [near.id]);
  return claimed.length ? near : null;
}

/**
 * "You have arrived": a notification from the site on top of whatever is open (Yandex), with Oldim / Olmadim
 * when money is to be taken. Only when no device allowed site notifications does it come in Telegram instead.
 */
export async function notifyArrival(config: TelegramConfig | null, s: Stop & { delivery_id: number }) {
  const pushed = await pushToOwner({
    title: `📍 Yetib keldingiz: ${s.position}. ${shortName(s)}`,
    body: s.fee > 0 && !s.collected ? `💵 ${money(s.fee)} oling` : 'Bu manzildan pul olinmaydi',
    url: `/#/delivery?drive=${s.delivery_id}`,
    tag: `stop-${s.id}`,
    ...(s.fee > 0 && !s.collected ? { collect: { stopId: s.id, fee: s.fee } } : {}),
  }).catch((e) => { console.error('Push failed', e); return 0; });
  if (pushed || !config?.chatId) return;
  const msg = collectMessage(s, true);
  await reply(config, config.chatId, msg.text, { reply_markup: msg.reply_markup });
}

const HELP = [
  '🚚 <b>Yetkazish</b>',
  '',
  '1. Manzillarni yuboring: 📎 → Joylashuv (lokatsiya), yoki Yandex / Google xarita havolasi.',
  '2. Lokatsiyadan keyin yozilgan matn shu manzil nomi boʻladi, faqat raqam yozsangiz (masalan 30000) shu yerdan olinadigan pul.',
  '3. Hammasi yuborilgach /reys yozing: eng qisqa tartibda yoʻl tuzib beraman.',
  '4. “Saytda reysni boshlash” tugmasi Reys rejimini ochadi: manzilga yetganda “Oldim” bossangiz pul hisobga qoʻshiladi.',
  '   Jonli joylashuv (📎 → Joylashuv → Jonli) yuborsangiz, yetib borganingizda sayt tepadan eslatadi.',
  '',
  '/royxat — yuborilgan manzillar',
  '/bekor — roʻyxatni tozalash',
  '/ombor — boshlanish joyini oʻzgartirish (keyin lokatsiya yuboring)',
].join('\n');

async function reply(config: TelegramConfig, chatId: number, text: string, extra: Record<string, unknown> = {}) {
  await tg(config.token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }, 10_000);
}

function draftList(draft: Draft) {
  if (!draft.stops.length) return 'Roʻyxat boʻsh. Lokatsiya yoki xarita havolasini yuboring.';
  return [`📋 <b>${draft.stops.length} ta manzil</b>`, ...draft.stops.map((s, i) =>
    `${i + 1}. ${s.label ? escapeHtml(s.label) : `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}${s.fee ? ` · ${money(s.fee)}` : ''}`), '', 'Tayyor boʻlsa /reys'].join('\n');
}

/** One message to the bot (from the webhook). Only the owner's own chat is answered; returns what it did. */
export async function handleBotMessage(config: TelegramConfig, message: any): Promise<string> {
  if (!config.chatId || message?.chat?.id !== config.chatId || message.chat.type !== 'private') return 'ignored';
  const chatId = config.chatId;
  // A live location is for "you have arrived" reminders, never a new stop.
  if (message.location?.live_period) {
    const result = await handleLiveLocation(config, message);
    if (result !== 'arrived') await reply(config, chatId, '📡 Jonli joylashuv olindi: manzilga yetganingizda eslataman.');
    return 'live';
  }
  const draft = await getDraft();
  const location = message.venue?.location ?? message.location;
  const text: string = typeof message.text === 'string' ? message.text.trim() : '';
  const cmd = text.startsWith('/') ? text.slice(1).split(/[\s@]/)[0].toLowerCase() : /^reys$/i.test(text) ? 'reys' : '';

  let place: Point | null = location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    ? { lat: Math.round(location.latitude * 1e6) / 1e6, lng: Math.round(location.longitude * 1e6) / 1e6 } : null;
  if (!place && text && !cmd) place = await readPlace(text);

  if (place && draft.waitingStart) {
    await saveDeliverySettings({ ...(await getDeliverySettings()), start: { lat: place.lat, lng: place.lng, label: message.venue?.title || 'Boshlanish' } });
    await saveDraft({ ...draft, waitingStart: false });
    await reply(config, chatId, '✅ Boshlanish joyi saqlandi. Endi reyslar shu yerdan tuziladi.');
    return 'start';
  }
  if (place) {
    if (draft.stops.length >= MAX_STOPS) {
      await reply(config, chatId, `Bir reysda ${MAX_STOPS} tagacha manzil. /reys yozing yoki /bekor bilan tozalang.`);
      return 'full';
    }
    const label = (message.venue?.title || message.venue?.address || '').slice(0, MAX_LABEL);
    draft.stops.push({ lat: place.lat, lng: place.lng, ...(label ? { label } : {}) });
    await saveDraft(draft);
    await reply(config, chatId, `📍 ${draft.stops.length}-manzil qoʻshildi. Nomi yoki olingan pulni yozishingiz mumkin. Yana yuboring yoki /reys`);
    return 'added';
  }
  if (cmd === 'reys') {
    if (!draft.stops.length) { await reply(config, chatId, 'Hali manzil yoʻq. Avval lokatsiyalarni yuboring.'); return 'empty'; }
    const trip = await createTrip(draft.stops, 'bot', config.chatName ?? null);
    await clearDraft();
    const msg = tripMessage(trip, config.siteUrl);
    await reply(config, chatId, msg.text, { reply_markup: msg.reply_markup });
    return 'trip';
  }
  if (cmd === 'bekor' || cmd === 'yangi') {
    await clearDraft();
    await reply(config, chatId, '🧹 Roʻyxat tozalandi. Yangi manzillarni yuboring.');
    return 'cleared';
  }
  if (cmd === 'royxat') { await reply(config, chatId, draftList(draft)); return 'list'; }
  if (cmd === 'ombor') {
    await saveDraft({ ...draft, waitingStart: true });
    await reply(config, chatId, 'Boshlanish joyining lokatsiyasini yuboring (📎 → Joylashuv).');
    return 'waiting-start';
  }
  if (cmd) { await reply(config, chatId, HELP); return 'help'; }
  // Plain words after a location: a number is the money taken there, anything else is its name.
  if (text && draft.stops.length) {
    const last = draft.stops[draft.stops.length - 1];
    const digits = text.replace(/[\s.,']/g, '').replace(/(soʻm|so'm|som|sum)$/i, '');
    if (/^\d{3,9}$/.test(digits)) {
      last.fee = Math.min(MAX_FEE, Number(digits));
      await saveDraft(draft);
      await reply(config, chatId, `💵 ${draft.stops.length}-manzil: ${money(last.fee)} olinadi`);
      return 'fee';
    }
    last.label = text.slice(0, MAX_LABEL);
    await saveDraft(draft);
    await reply(config, chatId, `✏️ ${draft.stops.length}-manzil: ${escapeHtml(last.label)}`);
    return 'label';
  }
  if (text) await reply(config, chatId, HELP);
  return 'help';
}

/** Turns the webhook on (Telegram then posts every message here) or off (back to reading updates on demand). */
export async function setBotHook(on: boolean, host: string | undefined, save: (c: TelegramConfig) => Promise<void>): Promise<TelegramConfig> {
  const config = await getTelegram();
  if (!config?.chatId) throw new HttpError(400, 'Avval Telegram botni ulang (Xabarlar oynasi)');
  if (!on) {
    if (config.hookSecret) await tg(config.token, 'deleteWebhook', { drop_pending_updates: false }).catch(() => undefined);
    const { hookSecret: _s, ...rest } = config;
    await save(rest);
    return rest;
  }
  if (!host || /localhost|127\.0\.0\.1/.test(host)) throw new HttpError(400, 'Bot faqat internetdagi sayt manzilida ishlaydi');
  const secret = config.hookSecret || crypto.randomUUID().replace(/-/g, '');
  await tg(config.token, 'setWebhook', { url: `https://${host}/api/telegram/hook`, secret_token: secret, allowed_updates: ['message', 'edited_message', 'callback_query'] });
  await tg(config.token, 'setMyCommands', { commands: [
    { command: 'reys', description: 'Yuborilgan manzillardan reys tuzish' },
    { command: 'royxat', description: 'Yuborilgan manzillar' },
    { command: 'bekor', description: 'Roʻyxatni tozalash' },
    { command: 'ombor', description: 'Boshlanish joyini oʻzgartirish' },
  ] }).catch(() => undefined);
  const next = { ...config, hookSecret: secret, siteUrl: `https://${host}` };
  await save(next);
  return next;
}
