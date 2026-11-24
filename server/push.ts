import webpush from 'web-push';
import { query } from './db.js';

// Web push: notifications from the site itself, shown on top of other apps even when the site is closed
// (like Yandex Pro). The keys are made once and kept in app_meta; the private one never leaves the server.

interface Vapid { publicKey: string; privateKey: string }
let vapidCache: Vapid | null = null;

export async function vapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  const rows = await query(`SELECT value FROM app_meta WHERE key = 'push_vapid'`);
  let keys = rows[0]?.value as Vapid | undefined;
  if (!keys?.publicKey) {
    const made = webpush.generateVAPIDKeys();
    await query(`INSERT INTO app_meta (key, value) VALUES ('push_vapid', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(made)]);
    keys = (await query(`SELECT value FROM app_meta WHERE key = 'push_vapid'`))[0].value as Vapid;
  }
  vapidCache = keys;
  return keys;
}

export async function saveSubscription(userId: string, sub: any) {
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const keys = sub?.keys;
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') return false;
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys, created_at = NOW()`,
    [userId, endpoint, JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth })],
  );
  return true;
}

export async function dropSubscription(userId: string, endpoint: string) {
  await query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, endpoint]);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap opens the site. */
  url: string;
  /** Same tag replaces the older notification instead of stacking. */
  tag?: string;
  /** A stop where money is to be taken: the notification gets Oldim / Olmadim buttons. */
  collect?: { stopId: number; fee: number };
}

/** Sends to every device of the owner(s); returns how many got it. Dead subscriptions are removed. */
export async function pushToOwner(message: PushMessage): Promise<number> {
  const subs = await query<{ id: number; endpoint: string; keys: { p256dh: string; auth: string } }>(
    `SELECT s.id::int, s.endpoint, s.keys FROM push_subscriptions s JOIN app_users u ON u.id = s.user_id
      WHERE u.role = 'owner' AND u.is_active`,
  );
  if (!subs.length) return 0;
  const keys = await vapid();
  const payload = JSON.stringify(message);
  let delivered = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, {
        vapidDetails: { subject: 'mailto:kassa@laylak.invalid', publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 600, urgency: 'high', timeout: 8000,
      });
      delivered++;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]).catch(() => undefined);
      else console.error('Push failed', error?.statusCode ?? error);
    }
  }));
  return delivered;
}
