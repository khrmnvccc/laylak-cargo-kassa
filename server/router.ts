import type pg from 'pg';
import { HttpError, query, transaction, TZ } from './db.js';
import {
  AuthUser,
  Role,
  SESSION_COOKIE,
  assertNotLocked,
  clearLoginFailures,
  clearedCookie,
  createSession,
  destroySession,
  getSessionUser,
  hashToken,
  hashPassword,
  normalizeUsername,
  readCookie,
  recordLoginFailure,
  sessionCookie,
  validatePassword,
  verifyPassword,
} from './auth.js';
import { PERMISSIONS, WORKER_DEFAULT, isPerm, permsOf, type Perm } from './perms.js';
import { ChatMoved, escapeHtml, getTelegram, notify, photoFromDataUrl, reportPhotos, reportText, saveTelegram, sendDocument, sendMessage, tg } from './telegram.js';
import { receiptKey } from './receipts.js';
import { background } from './background.js';
import { gzipSync } from 'node:zlib';
import { createHash, randomInt } from 'node:crypto';
import { EXPENSE_LABELS, XLSX_OPTIONS, kassaSheets, monthSheets } from '../src/lib/excelSheets.js';
import type { BalanceMonth, Payment } from '../src/lib/types.js';

export interface ApiRequest {
  method: string;
  path: string; // without the /api prefix, e.g. "/payments"
  query: Record<string, string | undefined>;
  body: any;
  headers: Record<string, string | undefined>;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  cookies?: string[];
}

interface Ctx extends ApiRequest {
  params: Record<string, string>;
  token?: string;
  secure: boolean;
  user: AuthUser | null;
}

type Handler = (ctx: Ctx) => Promise<ApiResponse | unknown>;
type Access = 'public' | 'user' | 'owner' | 'admin' | Perm;

const routes: Array<{ method: string; pattern: RegExp; keys: string[]; access: Access; handler: Handler }> = [];

function route(method: string, path: string, access: Access, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; }) + '/?$',
  );
  routes.push({ method, pattern, keys, access, handler });
}

export async function handleApi(req: ApiRequest): Promise<ApiResponse> {
  try {
    const match = routes
      .map((r) => ({ r, m: r.method === req.method ? req.path.match(r.pattern) : null }))
      .find((x) => x.m);
    if (!match) {
      const pathExists = routes.some((r) => r.pattern.test(req.path));
      return { status: pathExists ? 405 : 404, body: { error: pathExists ? 'Ruxsat etilmagan so‘rov turi' : 'Topilmadi' } };
    }
    if (req.method !== 'GET' && !sameOrigin(req.headers)) {
      return { status: 403, body: { error: 'So‘rov manbasi tasdiqlanmadi' } };
    }
    const { r, m } = match;
    const params: Record<string, string> = {};
    r.keys.forEach((key, i) => { params[key] = decodeURIComponent(m![i + 1]); });
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const secure = (req.headers['x-forwarded-proto'] || '').includes('https');
    const user = r.access === 'public' && !token ? null : await getSessionUser(token);
    if (r.access !== 'public' && !user) return { status: 401, body: { error: 'Tizimga qayta kiring' } };
    if (r.access === 'owner' && user?.role !== 'owner') return { status: 403, body: { error: 'Bu amal faqat Ega uchun' } };
    if (r.access === 'admin' && user?.role !== 'owner' && user?.role !== 'admin') return { status: 403, body: { error: 'Bu amal faqat admin uchun' } };
    if (isPerm(r.access) && !user?.permissions.includes(r.access)) return { status: 403, body: { error: 'Sizda bu amal uchun ruxsat yoʻq' } };
    const result = await r.handler({ ...req, params, token, secure, user });
    if (result && typeof result === 'object' && 'status' in result && 'body' in result) return result as ApiResponse;
    return { status: 200, body: result };
  } catch (error: any) {
    if (error instanceof HttpError) return { status: error.status, body: { error: error.message } };
    console.error('API error', error);
    return { status: 500, body: { error: 'Serverda kutilmagan xatolik. Qayta urinib ko‘ring' } };
  }
}

// Cookie-authenticated mutations must come from our own origin (CSRF protection).
function sameOrigin(headers: Record<string, string | undefined>): boolean {
  const origin = headers.origin;
  if (!origin) return true; // same-origin fetches from older browsers / server-side tools
  const host = headers['x-forwarded-host'] || headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// ---------- helpers ----------

const METHODS = ['cash', 'card', 'yandex', 'pochta'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayTashkent(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);
}

function parseRange(q: Record<string, string | undefined>, defaultDays = 0): { from: string; to: string } {
  const today = todayTashkent();
  const to = q.to && DATE_RE.test(q.to) ? q.to : today;
  const from = q.from && DATE_RE.test(q.from) ? q.from : addDays(to, -defaultDays);
  if (from > to) throw new HttpError(400, 'Boshlanish sanasi tugash sanasidan keyin bo‘lmasin');
  if (daysBetween(from, to) > 3700) throw new HttpError(400, 'Davr juda katta');
  return { from, to };
}

const RANGE_SQL = (fromIdx: number, toIdx: number) =>
  `p.paid_at >= ($${fromIdx}::date)::timestamp AT TIME ZONE '${TZ}'
   AND p.paid_at < ($${toIdx}::date + 1)::timestamp AT TIME ZONE '${TZ}'`;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function audit(db: { query: pg.PoolClient['query'] } | null, user: AuthUser | null, action: string,
  entity: string, entityId: string | null, details: unknown = null) {
  const sql = `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)`;
  const params = [user?.id || null, user?.full_name || null, action, entity, entityId, details ? JSON.stringify(details) : null];
  if (db) await db.query(sql, params);
  else await query(sql, params);
}

const PAYMENT_COLUMNS = `p.id, p.client_code, COALESCE(p.client_name, c.full_name) AS client_name, p.amount, p.method, p.note,
  p.paid_at, p.created_by, p.created_by_name, p.created_at, p.voided_at, p.voided_by_name, p.void_reason,
  (p.legacy_id IS NOT NULL) AS is_legacy, c.phone AS client_phone`;

async function totalsFor(from: string, to: string) {
  const rows = await query(
    `SELECT COALESCE(SUM(p.amount), 0)::bigint AS total,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0)::bigint AS card,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'yandex'), 0)::bigint AS yandex,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'pochta'), 0)::bigint AS pochta,
            COUNT(*)::bigint AS count,
            COUNT(DISTINCT p.client_code)::bigint AS clients
       FROM payments p
      WHERE p.voided_at IS NULL AND ${RANGE_SQL(1, 2)}`,
    [from, to],
  );
  return rows[0];
}

// ---------- setup & auth ----------

route('GET', '/health', 'public', async () => {
  await query('SELECT 1');
  return { ok: true, time: new Date().toISOString() };
});

route('GET', '/setup/status', 'public', async () => {
  const rows = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM app_users`);
  return { needsSetup: rows[0].n === 0, setupKeyConfigured: Boolean(process.env.ADMIN_SETUP_KEY) };
});

route('POST', '/setup', 'public', async (ctx) => {
  const expected = process.env.ADMIN_SETUP_KEY;
  if (!expected) throw new HttpError(503, 'Serverda ADMIN_SETUP_KEY sozlanmagan');
  const existing = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM app_users`);
  if (existing[0].n > 0) throw new HttpError(409, 'Tizim allaqachon sozlangan');
  if (str(ctx.body?.setupKey, 200) !== expected) throw new HttpError(403, 'Sozlash kaliti noto‘g‘ri');
  const username = normalizeUsername(ctx.body?.username);
  const fullName = str(ctx.body?.fullName, 80);
  if (fullName.length < 2) throw new HttpError(400, 'Ism kiritilmadi');
  const passwordHash = await hashPassword(validatePassword(ctx.body?.password));
  const user = await transaction(async (db) => {
    await db.query('LOCK TABLE app_users IN EXCLUSIVE MODE');
    const count = await db.query(`SELECT COUNT(*)::int AS n FROM app_users`);
    if (count.rows[0].n > 0) throw new HttpError(409, 'Tizim allaqachon sozlangan');
    const inserted = await db.query(
      `INSERT INTO app_users (username, full_name, role, password_hash) VALUES ($1, $2, 'owner', $3)
       RETURNING id, username, full_name, role`,
      [username, fullName, passwordHash],
    );
    await audit(db, inserted.rows[0], 'setup', 'user', inserted.rows[0].id);
    return { ...inserted.rows[0], permissions: permsOf('owner', null) } as AuthUser;
  });
  const session = await createSession(user.id, ctx.headers['user-agent']);
  return { status: 200, body: { user }, cookies: [sessionCookie(session.token, session.maxAge, ctx.secure)] };
});

route('POST', '/auth/login', 'public', async (ctx) => {
  const username = str(ctx.body?.username, 40).toLowerCase();
  const password = typeof ctx.body?.password === 'string' ? ctx.body.password : '';
  if (!username || !password) throw new HttpError(400, 'Login va parolni kiriting');
  const lockKey = `user:${username}`;
  await assertNotLocked(lockKey);
  const rows = await query(
    `SELECT id, username, full_name, role, permissions, password_hash, is_active FROM app_users WHERE username = $1`,
    [username],
  );
  const row = rows[0];
  const ok = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !ok) {
    await recordLoginFailure(lockKey);
    throw new HttpError(401, 'Login yoki parol noto‘g‘ri');
  }
  if (!row.is_active) throw new HttpError(403, 'Akkaunt o‘chirilgan. Admin bilan bog‘laning');
  await clearLoginFailures(lockKey);
  await query(`UPDATE app_users SET last_login_at = NOW() WHERE id = $1`, [row.id]);
  const user: AuthUser = { id: row.id, username: row.username, full_name: row.full_name, role: row.role, permissions: permsOf(row.role, row.permissions) };
  await audit(null, user, 'login', 'user', user.id);
  const session = await createSession(user.id, ctx.headers['user-agent']);
  return { status: 200, body: { user }, cookies: [sessionCookie(session.token, session.maxAge, ctx.secure)] };
});

route('POST', '/auth/logout', 'public', async (ctx) => {
  await destroySession(ctx.token);
  return { status: 200, body: { ok: true }, cookies: [clearedCookie(ctx.secure)] };
});

route('GET', '/auth/me', 'user', async (ctx) => ({ user: ctx.user }));

route('PATCH', '/auth/profile', 'user', async (ctx) => {
  const fullName = str(ctx.body?.fullName, 80);
  if (fullName.length < 2) throw new HttpError(400, 'Ism kamida 2 harfdan iborat bo‘lsin');
  const rows = await query(
    `UPDATE app_users SET full_name = $2, updated_at = NOW() WHERE id = $1 RETURNING id, username, full_name, role`,
    [ctx.user!.id, fullName],
  );
  return { user: { ...rows[0], permissions: ctx.user!.permissions } };
});

route('POST', '/auth/password', 'user', async (ctx) => {
  const current = typeof ctx.body?.currentPassword === 'string' ? ctx.body.currentPassword : '';
  const next = validatePassword(ctx.body?.newPassword);
  const rows = await query(`SELECT password_hash FROM app_users WHERE id = $1`, [ctx.user!.id]);
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) {
    throw new HttpError(400, 'Joriy parol noto‘g‘ri');
  }
  await query(`UPDATE app_users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [ctx.user!.id, await hashPassword(next)]);
  // Sign out every other device.
  await query(`DELETE FROM app_sessions WHERE user_id = $1 AND token_hash <> $2`, [ctx.user!.id, hashToken(ctx.token || '')]);
  await audit(null, ctx.user, 'password_change', 'user', ctx.user!.id);
  return { ok: true };
});

// ---------- live sync ----------

// Cheap fingerprint of the shared data; clients poll it and refetch only when it changes.
route('GET', '/version', 'user', async () => {
  const rows = await query(
    `SELECT (SELECT COUNT(*) FROM payments)::text || ':' ||
            COALESCE((SELECT EXTRACT(EPOCH FROM MAX(updated_at)) FROM payments), 0)::text || ':' ||
            COALESCE((SELECT EXTRACT(EPOCH FROM MAX(updated_at)) FROM clients), 0)::text || ':' ||
            COALESCE((SELECT EXTRACT(EPOCH FROM MAX(updated_at)) FROM app_users), 0)::text || ':' ||
            (SELECT COUNT(*) FROM expenses)::text || ':' ||
            COALESCE((SELECT EXTRACT(EPOCH FROM MAX(updated_at)) FROM expenses), 0)::text || ':' ||
            (SELECT COUNT(*) FROM balance_adjustments)::text || ':' ||
            (SELECT COUNT(*) FROM attendance)::text || ':' ||
            COALESCE((SELECT EXTRACT(EPOCH FROM MAX(GREATEST(check_in_at, check_out_at, edited_at))) FROM attendance), 0)::text || ':' ||
            COALESCE((SELECT EXTRACT(EPOCH FROM MAX(updated_at)) FROM orders), 0)::text AS version`,
  );
  return { version: rows[0].version, today: todayTashkent() };
});

// ---------- payments ----------

route('POST', '/payments', 'payments.create', async (ctx) => {
  const b = ctx.body || {};
  const clientCode = str(b.clientCode, 40).toUpperCase();
  const clientName = str(b.clientName, 80);
  const note = str(b.note, 500);
  const amount = Number(b.amount);
  const method = b.method;
  const errors: Record<string, string> = {};
  if (!clientCode) errors.clientCode = 'Mijoz ID raqamini kiriting';
  else if (!/^[A-Z0-9-]{1,40}$/.test(clientCode)) errors.clientCode = 'ID faqat harf, raqam va "-" dan iborat bo‘lsin';
  if (!Number.isInteger(amount) || amount <= 0) errors.amount = 'Summa musbat butun son bo‘lishi kerak';
  else if (amount > 10_000_000_000) errors.amount = 'Summa juda katta';
  if (!METHODS.includes(method)) errors.method = 'To‘lov turini tanlang';
  // Every payment comes with a picture of the client's orders; it goes to the admin on Telegram.
  const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 4).map(photoFromDataUrl);
  if (!photos.length) errors.photos = 'Buyurtmalar rasmini yuklang';
  else if (photos.some((p: Buffer | null) => !p)) errors.photos = 'Rasm ochilmadi yoki juda katta. Boshqa rasm tanlang';

  let paidAt: string | null = null;
  if (b.paidAt) {
    if (!ctx.user!.permissions.includes('payments.backdate')) errors.paidAt = 'Sanani o‘zgartirishga ruxsatingiz yo‘q';
    const t = Date.parse(b.paidAt);
    if (!Number.isFinite(t)) errors.paidAt = 'Sana noto‘g‘ri';
    else if (t > Date.now() + 5 * 60_000) errors.paidAt = 'Kelajakdagi sana kiritib bo‘lmaydi';
    else paidAt = new Date(t).toISOString();
  }
  if (Object.keys(errors).length) {
    return { status: 400, body: { error: 'Ma’lumotlarni tekshiring', fields: errors } };
  }

  const payment = await transaction(async (db) => {
    await db.query(
      `INSERT INTO clients (code, full_name) VALUES ($1, NULLIF($2, ''))
       ON CONFLICT (code) DO UPDATE SET
         full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), clients.full_name),
         updated_at = CASE WHEN NULLIF(EXCLUDED.full_name, '') IS NOT NULL AND EXCLUDED.full_name IS DISTINCT FROM clients.full_name
                           THEN NOW() ELSE clients.updated_at END`,
      [clientCode, clientName],
    );
    const inserted = await db.query(
      `INSERT INTO payments (client_code, client_name, amount, method, note, paid_at, created_by, created_by_name)
       VALUES ($1, NULLIF($2, ''), $3, $4, NULLIF($5, ''), COALESCE($6::timestamptz, NOW()), $7, $8)
       RETURNING id`,
      [clientCode, clientName, amount, method, note, paidAt, ctx.user!.id, ctx.user!.full_name],
    );
    await audit(db, ctx.user, 'payment_create', 'payment', inserted.rows[0].id, { clientCode, amount, method });
    const full = await db.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p LEFT JOIN clients c ON c.code = p.client_code WHERE p.id = $1`,
      [inserted.rows[0].id],
    );
    return full.rows[0];
  });
  const telegram = await reportLater(ctx.user, payment.id, () => reportPhotos(photos as Buffer[], paymentCaption({
    method, amount, by: ctx.user!.full_name, at: payment.paid_at, note,
    lines: [`${clientCode}${clientName ? ` · ${clientName}` : ''}`],
  })));
  return { status: 201, body: { payment, telegram } };
});

/**
 * Sends a payment's Telegram message after the answer goes back, so saving never waits on Telegram.
 * 'off' at once when no bot is linked; a send that fails later is written to the audit log.
 */
async function reportLater(user: AuthUser | null, entityId: string | null, send: () => Promise<'sent' | 'off' | 'failed'>): Promise<'queued' | 'off'> {
  const config = await getTelegram();
  if (!config?.chatId) return 'off';
  background(send().then((result) => (result === 'failed' ? audit(null, user, 'telegram_failed', 'payment', entityId) : undefined)));
  return 'queued';
}

/** Telegram caption for a payment the kassa just saved: type and sum first, then who and what. */
function paymentCaption(p: { method: string; amount: number; by: string; at: string | Date; note?: string; lines: string[]; head?: string }) {
  const icon = p.method === 'cash' ? '💵' : '💳';
  const when = new Date(new Date(p.at).getTime() + 5 * 3600_000).toISOString();
  return [
    `${icon} <b>${METHOD_LABEL[p.method] || p.method} · ${som(p.amount)}</b>`,
    p.head ? escapeHtml(p.head) : '',
    ...p.lines.map((l) => escapeHtml(l)),
    `👤 ${escapeHtml(p.by)} · ${when.slice(8, 10)}.${when.slice(5, 7)}.${when.slice(0, 4)} ${when.slice(11, 16)}`,
    p.note ? `📝 ${escapeHtml(p.note)}` : '',
  ].filter(Boolean).join('\n');
}

// ---------- orders with a sticker: scan in the kassa, see what is owed, take the payment ----------

const ORDER_COLUMNS = `o.id, o.scan_code, o.public_token, o.client_code, COALESCE(o.client_name, c.full_name) AS client_name,
  COALESCE(o.phone, c.phone) AS phone, o.order_no, o.transport, o.places, o.weight::float8 AS weight, o.amount,
  to_char(o.received_at, 'YYYY-MM-DD') AS received_at, o.note, o.created_by_name, o.created_at, o.issued_at, o.issued_by_name,
  CASE WHEN p.voided_at IS NULL THEN p.id END AS payment_id,
  CASE WHEN p.voided_at IS NULL THEN p.method END AS paid_method,
  CASE WHEN p.voided_at IS NULL THEN p.paid_at END AS paid_at,
  CASE WHEN p.voided_at IS NULL THEN p.created_by_name END AS paid_by`;
const ORDER_FROM = `orders o LEFT JOIN clients c ON c.code = o.client_code LEFT JOIN payments p ON p.id = o.payment_id`;
// The printed code: "77" and eight digits, so it never looks like a client ID.
const SCAN_RE = /^77\d{8}$/;

route('GET', '/orders', 'payments.create', async (ctx) => {
  const q = str(ctx.query.q, 60).toUpperCase();
  const where = ['o.deleted_at IS NULL'];
  const args: unknown[] = [];
  if (q) {
    args.push(`%${q}%`);
    where.push(`(o.scan_code LIKE $1 OR upper(o.client_code) LIKE $1 OR upper(COALESCE(o.client_name, c.full_name, '')) LIKE $1 OR upper(COALESCE(o.order_no, '')) LIKE $1)`);
  }
  if (ctx.query.status === 'unpaid') where.push('(p.id IS NULL OR p.voided_at IS NOT NULL)');
  if (ctx.query.status === 'paid') where.push('(p.id IS NOT NULL AND p.voided_at IS NULL)');
  if (ctx.query.status === 'stock') where.push('o.issued_at IS NULL');
  if (ctx.query.status === 'issued') where.push('o.issued_at IS NOT NULL');
  const [items, count] = await Promise.all([
    query(`SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT 200`, args),
    query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(o.amount), 0)::bigint AS amount FROM ${ORDER_FROM} WHERE ${where.join(' AND ')}`, args),
  ]);
  return { items, total: count[0].n, totalAmount: count[0].amount };
});

type NewOrder = {
  clientCode: string; clientName: string; phone: string; orderNo: string; transport: string; note: string;
  places: number | null; weight: number | null; amount: number; receivedAt: string;
};

/** Reads one order from the form or an import row; errors are keyed by field. */
function readOrder(b: any, defaultDate: string): { order: NewOrder; errors: Record<string, string> } {
  const o: NewOrder = {
    clientCode: str(b.clientCode, 40).toUpperCase().replace(/\s+/g, ''), clientName: str(b.clientName, 80), phone: str(b.phone, 30),
    orderNo: str(b.orderNo, 30), transport: str(b.transport, 20), note: str(b.note, 300),
    places: b.places === '' || b.places == null ? null : Number(b.places),
    weight: b.weight === '' || b.weight == null ? null : Number(String(b.weight).replace(',', '.')),
    amount: Number(b.amount), receivedAt: str(b.receivedAt, 10) || defaultDate,
  };
  const errors: Record<string, string> = {};
  if (!o.clientCode) errors.clientCode = 'Mijoz ID raqamini kiriting';
  else if (!/^[A-Z0-9-]{1,40}$/.test(o.clientCode)) errors.clientCode = 'ID faqat harf, raqam va "-" dan iborat bo‘lsin';
  if (!Number.isInteger(o.amount) || o.amount <= 0) errors.amount = 'Toʻlanadigan summani kiriting';
  else if (o.amount > 10_000_000_000) errors.amount = 'Summa juda katta';
  if (o.places !== null && (!Number.isInteger(o.places) || o.places < 1 || o.places > 1000)) errors.places = 'Joylar sonini tekshiring';
  if (o.weight !== null && (!Number.isFinite(o.weight) || o.weight <= 0 || o.weight > 100000)) errors.weight = 'Ogʻirlikni tekshiring';
  if (!DATE_RE.test(o.receivedAt) || o.receivedAt > todayTashkent()) errors.receivedAt = 'Qabul qilingan sanani tekshiring';
  return { order: o, errors };
}

async function insertOrder(db: pg.PoolClient, user: AuthUser, o: NewOrder) {
  // Fill in the client's name and phone only where the kassa does not know them yet.
  await db.query(
    `INSERT INTO clients (code, full_name, phone) VALUES ($1, NULLIF($2, ''), NULLIF($3, ''))
     ON CONFLICT (code) DO UPDATE SET full_name = COALESCE(clients.full_name, EXCLUDED.full_name), phone = COALESCE(clients.phone, EXCLUDED.phone)`,
    [o.clientCode, o.clientName, o.phone],
  );
  const inserted = await db.query(
    `INSERT INTO orders (scan_code, client_code, client_name, phone, order_no, transport, places, weight, amount, received_at, note, created_by, created_by_name)
     VALUES ('77' || lpad(nextval('orders_scan_seq')::text, 8, '0'), $1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8, $9, NULLIF($10, ''), $11, $12)
     RETURNING id`,
    [o.clientCode, o.clientName, o.phone, o.orderNo, o.transport, o.places, o.weight, o.amount, o.receivedAt, o.note, user.id, user.full_name],
  );
  return inserted.rows[0].id as string;
}

/** Many orders in two statements (not two per order), so a long list loads without the kassa hanging. */
async function insertOrders(db: pg.PoolClient, user: AuthUser, list: NewOrder[]): Promise<string[]> {
  if (!list.length) return [];
  // One row per client: like one-by-one inserts, the first name and phone given win, and known ones stay.
  const clients = new Map<string, { name: string; phone: string }>();
  for (const o of list) {
    const c = clients.get(o.clientCode) || { name: '', phone: '' };
    clients.set(o.clientCode, { name: c.name || o.clientName, phone: c.phone || o.phone });
  }
  await db.query(
    `INSERT INTO clients (code, full_name, phone)
     SELECT code, NULLIF(name, ''), NULLIF(phone, '') FROM unnest($1::text[], $2::text[], $3::text[]) AS t(code, name, phone)
     ON CONFLICT (code) DO UPDATE SET full_name = COALESCE(clients.full_name, EXCLUDED.full_name), phone = COALESCE(clients.phone, EXCLUDED.phone)`,
    [[...clients.keys()], [...clients.values()].map((c) => c.name), [...clients.values()].map((c) => c.phone)],
  );
  const col = <K extends keyof NewOrder>(k: K) => list.map((o) => o[k]);
  // Sticker numbers follow the list's order.
  const inserted = await db.query(
    `INSERT INTO orders (scan_code, client_code, client_name, phone, order_no, transport, places, weight, amount, received_at, note, created_by, created_by_name)
     SELECT '77' || lpad(nextval('orders_scan_seq')::text, 8, '0'), code, NULLIF(name, ''), NULLIF(phone, ''), NULLIF(no, ''), NULLIF(tr, ''),
            places, weight, amount, received, NULLIF(note, ''), $11, $12
       FROM (SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::numeric[], $8::bigint[], $9::date[], $10::text[])
               WITH ORDINALITY AS t(code, name, phone, no, tr, places, weight, amount, received, note, i) ORDER BY i) AS rows
     RETURNING id`,
    [col('clientCode'), col('clientName'), col('phone'), col('orderNo'), col('transport'), col('places'), col('weight'), col('amount'),
      col('receivedAt'), col('note'), user.id, user.full_name],
  );
  return inserted.rows.map((r: any) => r.id as string);
}

route('POST', '/orders', 'payments.create', async (ctx) => {
  const { order: o, errors } = readOrder(ctx.body || {}, todayTashkent());
  if (Object.keys(errors).length) return { status: 400, body: { error: 'Ma’lumotlarni tekshiring', fields: errors } };
  const order = await transaction(async (db) => {
    const id = await insertOrder(db, ctx.user!, o);
    await audit(db, ctx.user, 'order_create', 'order', id, { clientCode: o.clientCode, amount: o.amount, orderNo: o.orderNo });
    return (await db.query(`SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.id = $1`, [id])).rows[0];
  });
  return { status: 201, body: { order } };
});

// A whole list at once (copied from the admin panel or Excel). An order already in the kassa
// (same client and order number) is skipped, so the same list can be loaded twice safely.
route('POST', '/orders/import', 'payments.create', async (ctx) => {
  const b = ctx.body || {};
  const list = Array.isArray(b.rows) ? b.rows : [];
  if (!list.length) throw new HttpError(400, 'Roʻyxat boʻsh');
  if (list.length > 1000) throw new HttpError(400, 'Bir martada 1000 tadan koʻp buyurtma yuklab boʻlmaydi');
  const date = str(b.receivedAt, 10) || todayTashkent();
  const parsed = list.map((r: any, i: number) => ({ row: i + 1, ...readOrder({ ...r, receivedAt: date }, date) }));
  const invalid = parsed.filter((p: any) => Object.keys(p.errors).length)
    .map((p: any) => ({ row: p.row, code: p.order.clientCode, error: Object.values(p.errors)[0] as string }));
  const good: NewOrder[] = parsed.filter((p: any) => !Object.keys(p.errors).length).map((p: any) => p.order);

  return transaction(async (db) => {
    const keys = good.filter((o) => o.orderNo).map((o) => `${o.clientCode}|${o.orderNo}`);
    const existing = new Set((await db.query(
      `SELECT client_code || '|' || order_no AS k FROM orders WHERE deleted_at IS NULL AND client_code || '|' || order_no = ANY($1)`, [keys],
    )).rows.map((r: any) => r.k));
    const seen = new Set<string>();
    const fresh = good.filter((o) => {
      if (!o.orderNo) return true;
      const k = `${o.clientCode}|${o.orderNo}`;
      if (existing.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const summary = { adding: fresh.length, total: fresh.reduce((s, o) => s + o.amount, 0), skipped: good.length - fresh.length, invalid };
    if (b.dryRun) return { dryRun: true, ...summary };
    const ids = await insertOrders(db, ctx.user!, fresh);
    await audit(db, ctx.user, 'order_import', 'order', null, { count: ids.length, total: summary.total, skipped: summary.skipped });
    const orders = ids.length ? (await db.query(`SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.id = ANY($1) ORDER BY o.scan_code`, [ids])).rows : [];
    return { dryRun: false, ...summary, orders };
  });
});

// The page a client opens by scanning the sticker with a phone. It needs the order's secret as well as
// its code, and shows no phone number and only a shortened name.
route('GET', '/public/orders/:ref', 'public', async (ctx) => {
  const ref = ctx.params.ref.match(/^(77\d{8})\.([0-9a-f]{20})$/);
  if (!ref) throw new HttpError(404, 'Buyurtma topilmadi');
  const rows = await query<Record<string, any>>(
    `SELECT o.scan_code, o.client_code, COALESCE(o.client_name, c.full_name) AS client_name, o.order_no, o.transport,
            o.places, o.weight::float8 AS weight, o.amount, to_char(o.received_at, 'YYYY-MM-DD') AS received_at,
            CASE WHEN p.voided_at IS NULL THEN p.paid_at END AS paid_at
       FROM ${ORDER_FROM} WHERE o.scan_code = $1 AND o.public_token = $2 AND o.deleted_at IS NULL`,
    [ref[1], ref[2]],
  );
  if (!rows.length) throw new HttpError(404, 'Buyurtma topilmadi');
  const { client_name, ...order } = rows[0];
  return { ...order, client_name: shortName(client_name), status: order.paid_at ? 'collected' : 'waiting' };
});

/** "Abdumalikova Muslima Odil qizi" → "Abdumalikova M." */
function shortName(name: string | null): string | null {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : parts[0];
}

route('GET', '/orders/scan/:code', 'payments.create', async (ctx) => {
  const code = ctx.params.code.replace(/\D/g, '');
  if (!SCAN_RE.test(code)) throw new HttpError(404, 'Bu kod kassa stikeri emas');
  const rows = await query(`SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.scan_code = $1 AND o.deleted_at IS NULL`, [code]);
  if (!rows.length) throw new HttpError(404, 'Bunday stiker topilmadi');
  const order = rows[0];
  const others = await query(
    `SELECT o.scan_code, o.order_no, o.amount FROM ${ORDER_FROM}
      WHERE o.client_code = $1 AND o.id <> $2 AND o.deleted_at IS NULL AND (p.id IS NULL OR p.voided_at IS NOT NULL)
      ORDER BY o.created_at LIMIT 20`,
    [order.client_code, order.id],
  );
  return { order, unpaid: others };
});

route('POST', '/orders/:id/pay', 'payments.create', async (ctx) => {
  const method = ctx.body?.method;
  if (!METHODS.includes(method)) throw new HttpError(400, 'To‘lov turini tanlang');
  if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id)) throw new HttpError(404, 'Buyurtma topilmadi');
  const result = await transaction(async (db) => {
    const found = await db.query(`SELECT * FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [ctx.params.id]);
    const order = found.rows[0];
    if (!order) throw new HttpError(404, 'Buyurtma topilmadi');
    if (order.payment_id) {
      const prev = await db.query(`SELECT paid_at, created_by_name, voided_at FROM payments WHERE id = $1`, [order.payment_id]);
      if (prev.rows[0] && !prev.rows[0].voided_at) {
        throw new HttpError(409, `Bu buyurtma allaqachon toʻlangan: ${prev.rows[0].created_by_name}`);
      }
    }
    const note = `Buyurtma ${order.order_no ? `№${order.order_no}` : order.scan_code} · stiker ${order.scan_code}`;
    const inserted = await db.query(
      `INSERT INTO payments (client_code, client_name, amount, method, note, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [order.client_code, order.client_name, order.amount, method, note, ctx.user!.id, ctx.user!.full_name],
    );
    const paymentId = inserted.rows[0].id;
    // Paid at the kassa by scanning its sticker means the parcel is being handed over.
    await db.query(
      `UPDATE orders SET payment_id = $2, issued_at = COALESCE(issued_at, NOW()), issued_by_name = COALESCE(issued_by_name, $3), updated_at = NOW() WHERE id = $1`,
      [order.id, paymentId, ctx.user!.full_name],
    );
    await audit(db, ctx.user, 'payment_create', 'payment', paymentId, { clientCode: order.client_code, amount: Number(order.amount), method, order: order.scan_code });
    const payment = (await db.query(`SELECT ${PAYMENT_COLUMNS} FROM payments p LEFT JOIN clients c ON c.code = p.client_code WHERE p.id = $1`, [paymentId])).rows[0];
    const full = (await db.query(`SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.id = $1`, [order.id])).rows[0];
    return { payment, order: full };
  });
  const o = result.order;
  const details = [
    o.order_no ? `Buyurtma №${o.order_no}` : '',
    [o.transport, o.places ? `${o.places} ta` : '', o.weight ? `${o.weight} kg` : ''].filter(Boolean).join(' · '),
    `Qabul qilingan: ${o.received_at.slice(8, 10)}.${o.received_at.slice(5, 7)}.${o.received_at.slice(0, 4)}`,
  ].filter(Boolean);
  const telegram = await reportLater(ctx.user, result.payment.id, () => reportText(paymentCaption({
    method, amount: Number(o.amount), by: ctx.user!.full_name, at: result.payment.paid_at,
    head: `📦 Stiker ${o.scan_code}`,
    lines: [`${o.client_code}${o.client_name ? ` · ${o.client_name}` : ''}`, ...details],
  })));
  return { ...result, telegram };
});

// Mark a parcel handed out (or, by mistake, back in the warehouse) without taking a payment.
route('POST', '/orders/:id/issue', 'payments.create', async (ctx) => {
  if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id)) throw new HttpError(404, 'Buyurtma topilmadi');
  const issued = ctx.body?.issued !== false;
  const order = await transaction(async (db) => {
    const updated = await db.query(
      `UPDATE orders SET issued_at = CASE WHEN $2 THEN COALESCE(issued_at, NOW()) END,
              issued_by_name = CASE WHEN $2 THEN COALESCE(issued_by_name, $3) END, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL RETURNING scan_code`,
      [ctx.params.id, issued, ctx.user!.full_name],
    );
    if (!updated.rows.length) throw new HttpError(404, 'Buyurtma topilmadi');
    await audit(db, ctx.user, issued ? 'order_issue' : 'order_unissue', 'order', ctx.params.id, { scanCode: updated.rows[0].scan_code });
    return (await db.query(`SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.id = $1`, [ctx.params.id])).rows[0];
  });
  return { order };
});

route('DELETE', '/orders/:id', 'payments.void', async (ctx) => {
  if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id)) throw new HttpError(404, 'Buyurtma topilmadi');
  await transaction(async (db) => {
    const rows = (await db.query(`SELECT ${ORDER_COLUMNS} FROM ${ORDER_FROM} WHERE o.id = $1 AND o.deleted_at IS NULL FOR UPDATE OF o`, [ctx.params.id])).rows;
    if (!rows.length) throw new HttpError(404, 'Buyurtma topilmadi');
    if (rows[0].payment_id) throw new HttpError(409, 'Toʻlangan buyurtmani oʻchirib boʻlmaydi. Avval toʻlovni bekor qiling');
    await db.query(`UPDATE orders SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [ctx.params.id]);
    await audit(db, ctx.user, 'order_delete', 'order', ctx.params.id, { scanCode: rows[0].scan_code, amount: Number(rows[0].amount) });
  });
  return { ok: true };
});

// ---------- receipts: a bank receipt photo + the client's orders screenshot ----------

const CARD_ONLY = ['card', 'yandex', 'pochta'];

/** A receipt counts as used while any payment saved from it is still active. */
async function usedReceipt(db: { query: pg.PoolClient['query'] } | null, key: string) {
  const sql = `SELECT r.id, r.created_at, r.created_by_name, r.amount,
                      EXISTS (SELECT 1 FROM payments p WHERE p.id = ANY(r.payment_ids) AND p.voided_at IS NULL) AS active
                 FROM receipts r WHERE r.key = $1`;
  const rows = db ? (await db.query(sql, [key])).rows : await query(sql, [key]);
  return rows[0] as { id: string; created_at: string; created_by_name: string; amount: string; active: boolean } | undefined;
}

// Before saving: is this receipt already in the kassa, and which of the client IDs read from the
// screenshot (with their OCR look-alikes) are real clients.
route('POST', '/receipts/check', 'payments.create', async (ctx) => {
  const r = ctx.body?.receipt || {};
  const key = receiptKey({ transactionId: str(r.transactionId, 60), amount: Number(r.amount) || null, paidAt: str(r.paidAt, 20), senderCard: str(r.senderCard, 40) });
  const used = key ? await usedReceipt(null, key) : undefined;
  const codes = (Array.isArray(ctx.body?.codes) ? ctx.body.codes : [])
    .map((c: unknown) => str(c, 40).toUpperCase()).filter((c: string) => /^[A-Z0-9-]{1,40}$/.test(c)).slice(0, 200);
  const rows = codes.length ? await query(
    `SELECT c.code, c.full_name, (SELECT COUNT(*) FROM payments p WHERE p.client_code = c.code AND p.voided_at IS NULL)::int AS count
       FROM clients c WHERE c.code = ANY($1)`, [codes]) : [];
  return {
    duplicate: used?.active ? { at: used.created_at, by: used.created_by_name } : null,
    clients: Object.fromEntries(rows.map((c: any) => [c.code, { name: c.full_name, count: c.count }])),
  };
});

route('POST', '/receipts/confirm', 'payments.create', async (ctx) => {
  const b = ctx.body || {};
  const r = b.receipt || {};
  const receipt = {
    bank: str(r.bank, 60), transactionId: str(r.transactionId, 60), amount: Number(r.amount),
    paidAt: str(r.paidAt, 20), sender: str(r.sender, 80), senderCard: str(r.senderCard, 40),
    recipient: str(r.recipient, 80), recipientCard: str(r.recipientCard, 40),
  };
  const method = CARD_ONLY.includes(b.method) ? b.method : 'card';
  if (!Number.isInteger(receipt.amount) || receipt.amount <= 0 || receipt.amount > 10_000_000_000) throw new HttpError(400, 'Chek summasini tekshiring');
  const rows = Array.isArray(b.orders) ? b.orders : [];
  if (!rows.length || rows.length > 30) throw new HttpError(400, 'Kamida bitta buyurtma tanlang');
  const orders = rows.map((o: any) => ({
    clientCode: str(o.clientCode, 40).toUpperCase(), clientName: str(o.clientName, 80), code: str(o.code, 40),
    orderNo: str(o.orderNo, 30), transport: str(o.transport, 20), amount: Number(o.amount),
  }));
  for (const o of orders) {
    if (!/^[A-Z0-9-]{1,40}$/.test(o.clientCode)) throw new HttpError(400, `Mijoz ID notoʻgʻri: ${o.clientCode || 'boʻsh'}`);
    if (!Number.isInteger(o.amount) || o.amount <= 0) throw new HttpError(400, `Buyurtma summasi notoʻgʻri (${o.code || o.clientCode})`);
  }
  const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 4).map(photoFromDataUrl).filter(Boolean) as Buffer[];
  const ordersSum = orders.reduce((s: number, o: { amount: number }) => s + o.amount, 0);
  if (ordersSum !== receipt.amount) {
    throw new HttpError(400, `Chek summasi (${som(receipt.amount)}) buyurtmalar jamiga (${som(ordersSum)}) teng emas`);
  }
  const key = receiptKey(receipt);
  if (!key) throw new HttpError(400, 'Chekda tranzaksiya raqami yoki sana-vaqt boʻlishi kerak');

  // The time printed on the receipt, if this person may enter past dates; otherwise now.
  let paidAt: string | null = null;
  const t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(receipt.paidAt) ? Date.parse(`${receipt.paidAt}:00+05:00`) : NaN;
  if (Number.isFinite(t) && t <= Date.now() + 5 * 60_000 && ctx.user!.permissions.includes('payments.backdate')) paidAt = new Date(t).toISOString();

  const byClient = new Map<string, typeof orders>();
  for (const o of orders) byClient.set(o.clientCode, [...(byClient.get(o.clientCode) || []), o]);
  const head = `Chek${receipt.bank ? ` ${receipt.bank}` : ''}${receipt.transactionId ? ` №${receipt.transactionId}` : ''}`;

  const saved = await transaction(async (db) => {
    const used = await usedReceipt(db, key);
    if (used?.active) throw new HttpError(409, `Bu chek allaqachon kiritilgan (${used.created_by_name})`);
    if (used) await db.query(`DELETE FROM receipts WHERE id = $1`, [used.id]);
    const ids: string[] = [];
    for (const [clientCode, list] of byClient) {
      const clientName = list.find((o: { clientName: string }) => o.clientName)?.clientName || '';
      const amount = list.reduce((s: number, o: { amount: number }) => s + o.amount, 0);
      const parts = list.map((o: { orderNo: string; transport: string; code: string }) =>
        [o.orderNo && `№${o.orderNo}`, o.transport, o.code && o.code !== clientCode ? o.code : ''].filter(Boolean).join(' '));
      const note = `${head} · Buyurtma: ${parts.join(', ')}`.slice(0, 500);
      await db.query(
        `INSERT INTO clients (code, full_name) VALUES ($1, NULLIF($2, ''))
         ON CONFLICT (code) DO UPDATE SET full_name = COALESCE(clients.full_name, EXCLUDED.full_name)`,
        [clientCode, clientName],
      );
      const inserted = await db.query(
        `INSERT INTO payments (client_code, client_name, amount, method, note, paid_at, created_by, created_by_name)
         VALUES ($1, NULLIF($2, ''), $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7, $8) RETURNING id`,
        [clientCode, clientName, amount, method, note, paidAt, ctx.user!.id, ctx.user!.full_name],
      );
      ids.push(inserted.rows[0].id);
    }
    const row = await db.query(
      `INSERT INTO receipts (key, bank, transaction_id, amount, receipt_paid_at, sender, details, payment_ids, created_by, created_by_name)
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5, NULLIF($6, ''), $7::jsonb, $8, $9, $10) RETURNING id`,
      [key, receipt.bank, receipt.transactionId, receipt.amount, Number.isFinite(t) ? new Date(t).toISOString() : null,
        receipt.sender, JSON.stringify({ receipt, orders, method }), ids, ctx.user!.id, ctx.user!.full_name],
    );
    await audit(db, ctx.user, 'receipt_confirm', 'receipt', row.rows[0].id, { key, amount: receipt.amount, payments: ids.length, method });
    const full = await db.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p LEFT JOIN clients c ON c.code = p.client_code WHERE p.id = ANY($1) ORDER BY p.client_code`,
      [ids],
    );
    return full.rows;
  });
  const telegram = await reportLater(ctx.user, saved[0]?.id ?? null, () => reportPhotos(photos, paymentCaption({
    method, amount: receipt.amount, by: ctx.user!.full_name, at: saved[0]?.paid_at || new Date(),
    head: [head, receipt.sender && `· ${receipt.sender}`].filter(Boolean).join(' '),
    lines: orders.map((o: { clientCode: string; clientName: string; orderNo: string; transport: string; amount: number }) =>
      `• ${o.clientCode}${o.clientName ? ` ${o.clientName}` : ''}${o.orderNo ? ` №${o.orderNo}` : ''}${o.transport ? ` ${o.transport}` : ''} — ${som(o.amount)}`),
  })));
  return { status: 201, body: { payments: saved, telegram } };
});

// Admin import of payments from an old Excel report (CSV: sana, id, turi, summa, izoh).
// A row is skipped when the same payment (client, day, type, amount) is already in the
// kassa — typed in by hand or loaded by an earlier import — so the file can be uploaded
// again safely. With dryRun the counts are returned and nothing is written.
const IMPORT_SOURCE = 'Excel hisobot';
route('POST', '/payments/import', 'payments.import', async (ctx) => {
  const rows = Array.isArray(ctx.body?.rows) ? ctx.body.rows : null;
  const dryRun = ctx.body?.dryRun === true;
  if (!rows || !rows.length) throw new HttpError(400, 'Fayldan toʻlov topilmadi');
  if (rows.length > 5000) throw new HttpError(400, 'Bir martada 5000 tadan koʻp toʻlov yuklab boʻlmaydi');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const errors: Array<{ row: number; error: string }> = [];
  const clean: Array<{ date: string; code: string; method: string; amount: number; note: string; key: string }> = [];
  rows.forEach((r: any, index: number) => {
    const row = index + 1;
    const date = str(r?.date, 10);
    const code = str(r?.code, 40).replace(/\s+/g, '').toUpperCase();
    const method = str(r?.method, 10);
    const amount = Number(r?.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return errors.push({ row, error: 'Sana notoʻgʻri' });
    if (date > today) return errors.push({ row, error: 'Kelajakdagi sana' });
    if (!/^[A-Z0-9-]{1,40}$/.test(code)) return errors.push({ row, error: code ? `ID notoʻgʻri: ${code}` : 'ID yoʻq' });
    if (!METHODS.includes(method)) return errors.push({ row, error: 'Toʻlov turi notoʻgʻri' });
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000_000) return errors.push({ row, error: 'Summa notoʻgʻri' });
    clean.push({ date, code, method, amount, note: str(r?.note, 500), key: `${date}|${code}|${method}|${amount}` });
  });
  if (!clean.length) return { status: 400, body: { error: 'Yaroqli toʻlov topilmadi', errors: errors.slice(0, 50) } };

  return transaction(async (db) => {
    const dates = clean.map((r) => r.date).sort();
    // Active payments already in the kassa for the same client/day/type/amount.
    const existing = await db.query(
      `SELECT to_char(p.paid_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') || '|' || p.client_code || '|' || p.method || '|' || p.amount AS key,
              COUNT(*)::int AS n
         FROM payments p
        WHERE p.voided_at IS NULL AND p.client_code = ANY($3::text[])
          AND p.paid_at >= ($1::date)::timestamp AT TIME ZONE '${TZ}' AND p.paid_at < ($2::date + 1)::timestamp AT TIME ZONE '${TZ}'
        GROUP BY 1`,
      [dates[0], dates[dates.length - 1], [...new Set(clean.map((r) => r.code))]],
    );
    const have = new Map<string, number>(existing.rows.map((r) => [r.key, r.n]));
    const seen = new Map<string, number>();
    const toAdd = clean.filter((r) => {
      const n = (seen.get(r.key) || 0) + 1;
      seen.set(r.key, n);
      return n > (have.get(r.key) || 0);
    });
    const total = (list: typeof clean) => {
      const t: Record<string, number> = { cash: 0, card: 0, yandex: 0, pochta: 0 };
      list.forEach((r) => { t[r.method] += r.amount; });
      return { ...t, total: list.reduce((s, r) => s + r.amount, 0), count: list.length };
    };
    const summary = {
      dryRun, from: dates[0], to: dates[dates.length - 1],
      adding: total(toAdd), alreadyInKassa: clean.length - toAdd.length, invalid: errors.length,
      newClients: 0, errors: errors.slice(0, 50),
    };
    const codes = [...new Set(toAdd.map((r) => r.code))];
    const known = await db.query(`SELECT code FROM clients WHERE code = ANY($1::text[])`, [codes]);
    summary.newClients = codes.length - known.rowCount!;
    if (dryRun || !toAdd.length) return summary;

    await db.query(`INSERT INTO clients (code) SELECT unnest($1::text[]) ON CONFLICT (code) DO NOTHING`, [codes]);
    const occurrence = new Map<string, number>();
    const payload = toAdd.map((r) => {
      const n = (occurrence.get(r.key) || 0) + 1;
      occurrence.set(r.key, n);
      return { ...r, legacy_id: `xls:${r.key}|${(have.get(r.key) || 0) + n}` };
    });
    await db.query(
      `INSERT INTO payments (client_code, amount, method, note, paid_at, created_by, created_by_name, legacy_id)
       SELECT x.code, x.amount, x.method, NULLIF(x.note, ''), (x.date::date + time '12:00') AT TIME ZONE '${TZ}', $2, $3, x.legacy_id
         FROM jsonb_to_recordset($1::jsonb) AS x(code text, amount bigint, method text, note text, date text, legacy_id text)
       ON CONFLICT (legacy_id) DO NOTHING`,
      [JSON.stringify(payload), null, IMPORT_SOURCE],
    );
    await audit(db, ctx.user, 'payment_import', 'payment', null, { from: summary.from, to: summary.to, ...summary.adding, alreadyInKassa: summary.alreadyInKassa });
    return summary;
  });
});

route('GET', '/payments', 'user', async (ctx) => {
  const q = ctx.query;
  const { from, to } = parseRange(q, 6);
  const where = ['1=1', RANGE_SQL(1, 2)];
  const params: unknown[] = [from, to];
  const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (METHODS.includes(q.method as string)) add('p.method = ?', q.method);
  else if (q.method === 'card_all') where.push("p.method IN ('card', 'yandex', 'pochta')");
  // Without the reports right a worker sees only the payments they entered.
  if (!ctx.user!.permissions.includes('reports.view')) add('p.created_by = ?', ctx.user!.id);
  else if (q.worker && /^[0-9a-f-]{36}$/i.test(q.worker)) add('p.created_by = ?', q.worker);
  if (q.client) add('p.client_code = ?', q.client.toUpperCase());
  if (q.q) {
    params.push(`%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, '\\$&')}%`);
    const i = params.length;
    where.push(`(p.client_code ILIKE $${i} OR COALESCE(p.client_name, c.full_name, '') ILIKE $${i} OR COALESCE(p.note, '') ILIKE $${i} OR p.created_by_name ILIKE $${i})`);
  }
  const status = q.status === 'voided' ? 'voided' : q.status === 'all' ? 'all' : 'active';
  if (status === 'active') where.push('p.voided_at IS NULL');
  if (status === 'voided') where.push('p.voided_at IS NOT NULL');
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500);
  const offset = Math.max(Number(q.offset) || 0, 0);
  const whereSql = where.join(' AND ');
  const [items, agg] = await Promise.all([
    query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p LEFT JOIN clients c ON c.code = p.client_code
        WHERE ${whereSql} ORDER BY p.paid_at DESC, p.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    query(
      `SELECT COUNT(*)::bigint AS count,
              COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL), 0)::bigint AS total,
              COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL AND p.method = 'cash'), 0)::bigint AS cash,
              COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL AND p.method = 'card'), 0)::bigint AS card,
              COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL AND p.method = 'yandex'), 0)::bigint AS yandex,
              COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL AND p.method = 'pochta'), 0)::bigint AS pochta
         FROM payments p LEFT JOIN clients c ON c.code = p.client_code WHERE ${whereSql}`,
      params,
    ),
  ]);
  return { from, to, items, ...agg[0], limit, offset };
});

route('POST', '/payments/:id/void', 'payments.void', async (ctx) => {
  const reason = str(ctx.body?.reason, 300);
  if (reason.length < 3) throw new HttpError(400, 'Bekor qilish sababini yozing');
  if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id)) throw new HttpError(404, 'Operatsiya topilmadi');
  const payment = await transaction(async (db) => {
    const updated = await db.query(
      `UPDATE payments SET voided_at = NOW(), voided_by = $2, voided_by_name = $3, void_reason = $4
        WHERE id = $1 AND voided_at IS NULL RETURNING id, amount, method, client_code`,
      [ctx.params.id, ctx.user!.id, ctx.user!.full_name, reason],
    );
    if (!updated.rowCount) throw new HttpError(404, 'Operatsiya topilmadi yoki allaqachon bekor qilingan');
    await audit(db, ctx.user, 'payment_void', 'payment', ctx.params.id, { ...updated.rows[0], reason });
    return updated.rows[0];
  });
  background(notify(`⚠️ <b>Toʻlov bekor qilindi</b>\n${escapeHtml(payment.client_code)} · ${som(payment.amount)} · ${METHOD_LABEL[payment.method] || payment.method}\n`
    + `Kim: ${escapeHtml(ctx.user!.full_name)}\nSabab: ${escapeHtml(reason)}`));
  return { payment };
});

// ---------- reports ----------

route('GET', '/summary', 'reports.view', async (ctx) => {
  const { from, to } = parseRange(ctx.query, 0);
  const span = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const [totals, previous, byWorker, byDayRows, recent] = await Promise.all([
    totalsFor(from, to),
    totalsFor(prevFrom, prevTo),
    query(
      `SELECT COALESCE(p.created_by::text, 'legacy:' || p.created_by_name) AS id,
              COALESCE(u.full_name, p.created_by_name) AS name,
              COALESCE(SUM(p.amount), 0)::bigint AS total,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0)::bigint AS card,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'yandex'), 0)::bigint AS yandex,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'pochta'), 0)::bigint AS pochta,
              COUNT(*)::bigint AS count
         FROM payments p LEFT JOIN app_users u ON u.id = p.created_by
        WHERE p.voided_at IS NULL AND ${RANGE_SQL(1, 2)}
        GROUP BY 1, 2 ORDER BY total DESC`,
      [from, to],
    ),
    query(
      `SELECT (p.paid_at AT TIME ZONE '${TZ}')::date AS day,
              COALESCE(SUM(p.amount), 0)::bigint AS total,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0)::bigint AS card,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'yandex'), 0)::bigint AS yandex,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'pochta'), 0)::bigint AS pochta,
              COUNT(*)::bigint AS count
         FROM payments p
        WHERE p.voided_at IS NULL AND ${RANGE_SQL(1, 2)}
        GROUP BY 1 ORDER BY 1`,
      [from, to],
    ),
    query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p LEFT JOIN clients c ON c.code = p.client_code
        WHERE p.voided_at IS NULL AND ${RANGE_SQL(1, 2)} ORDER BY p.paid_at DESC, p.created_at DESC LIMIT 8`,
      [from, to],
    ),
  ]);
  const byDayMap = new Map(byDayRows.map((r: any) => [r.day, r]));
  const byDay = [];
  if (span <= 400) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      byDay.push(byDayMap.get(d) || { day: d, total: 0, cash: 0, card: 0, yandex: 0, pochta: 0, count: 0 });
    }
  } else {
    byDay.push(...byDayRows);
  }
  return { from, to, previousRange: { from: prevFrom, to: prevTo }, totals, previous, byWorker, byDay, recent };
});

route('GET', '/periods', 'reports.view', async (ctx) => {
  const group = ctx.query.group === 'month' ? 'month' : 'week';
  const defaultDays = group === 'month' ? 365 : 7 * 12;
  const { from, to } = parseRange(ctx.query, defaultDays - 1);
  const rows = await query(
    `SELECT date_trunc('${group}', p.paid_at AT TIME ZONE '${TZ}')::date AS period,
            COALESCE(SUM(p.amount), 0)::bigint AS total,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0)::bigint AS card,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'yandex'), 0)::bigint AS yandex,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'pochta'), 0)::bigint AS pochta,
            COUNT(*)::bigint AS count,
            COUNT(DISTINCT p.client_code)::bigint AS clients,
            COUNT(DISTINCT (p.paid_at AT TIME ZONE '${TZ}')::date)::bigint AS active_days
       FROM payments p
      WHERE p.voided_at IS NULL AND ${RANGE_SQL(1, 2)}
      GROUP BY 1 ORDER BY 1 DESC`,
    [from, to],
  );
  return { group, from, to, rows, totals: await totalsFor(from, to) };
});

// ---------- clients ----------

const CLIENT_SORTS: Record<string, string> = {
  active: 'count DESC, last_paid_at DESC NULLS LAST, c.code',
  most: 'total DESC, count DESC, c.code',
  least: 'total ASC, count ASC, c.code',
  recent: 'last_paid_at DESC NULLS LAST, c.code',
};

route('GET', '/clients', 'user', async (ctx) => {
  const term = str(ctx.query.q, 60);
  const sort = CLIENT_SORTS[ctx.query.sort || ''] ? ctx.query.sort! : 'active';
  const limit = Math.min(Math.max(Number(ctx.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(ctx.query.offset) || 0, 0);
  const params: unknown[] = [];
  let where = '';
  if (term) {
    params.push(`%${term.replace(/[%_\\]/g, '\\$&')}%`);
    where = `WHERE c.code ILIKE $1 OR COALESCE(c.full_name, '') ILIKE $1 OR COALESCE(c.phone, '') ILIKE $1`;
  }
  const base = `
    SELECT c.code, c.full_name, c.phone,
           COALESCE(SUM(p.amount), 0)::bigint AS total,
           COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
           COALESCE(SUM(p.amount) FILTER (WHERE p.method <> 'cash'), 0)::bigint AS card,
           COALESCE(SUM(p.amount) FILTER (WHERE p.method IN ('yandex', 'pochta')), 0)::bigint AS online,
           COUNT(p.id)::bigint AS count,
           MAX(p.paid_at) AS last_paid_at
      FROM clients c LEFT JOIN payments p ON p.client_code = c.code AND p.voided_at IS NULL
      ${where}
     GROUP BY c.code`;
  const exactFirst = term ? `(upper(c.code) = upper($${params.length + 1})) DESC, ` : '';
  const [items, summary] = await Promise.all([
    query(
      `${base} ORDER BY ${exactFirst}${CLIENT_SORTS[sort]} LIMIT ${limit} OFFSET ${offset}`,
      term ? [...params, term] : params,
    ),
    query(
      `SELECT COUNT(*)::bigint AS clients,
              COUNT(*) FILTER (WHERE last_paid_at >= NOW() - INTERVAL '30 days')::bigint AS active30,
              COALESCE(SUM(total), 0)::bigint AS total,
              COALESCE(SUM(cash), 0)::bigint AS cash,
              COALESCE(SUM(card), 0)::bigint AS card
         FROM (${base}) t`,
      params,
    ),
  ]);
  return { items, sort, limit, offset, ...summary[0] };
});

// Admin bulk import of an existing customer list: adds new IDs, fills in names/phones.
route('POST', '/clients/import', 'clients.edit', async (ctx) => {
  const rows = Array.isArray(ctx.body?.rows) ? ctx.body.rows : null;
  if (!rows || !rows.length) throw new HttpError(400, 'Fayldan mijozlar topilmadi');
  if (rows.length > 5000) throw new HttpError(400, 'Bir martada 5000 tadan ko‘p mijoz yuklab bo‘lmaydi');
  const errors: Array<{ row: number; error: string }> = [];
  const clean = new Map<string, { code: string; name: string; phone: string }>();
  rows.forEach((r: any, index: number) => {
    const code = str(r?.code, 40).replace(/\s+/g, '').toUpperCase();
    if (!code) return errors.push({ row: index + 1, error: 'ID yo‘q' });
    if (!/^[A-Z0-9-]{1,40}$/.test(code)) return errors.push({ row: index + 1, error: `ID noto‘g‘ri: ${code}` });
    clean.set(code, { code, name: str(r?.name, 80), phone: str(r?.phone, 30) });
  });
  if (!clean.size) return { status: 400, body: { error: 'Yaroqli mijoz topilmadi', errors: errors.slice(0, 50) } };
  const list = [...clean.values()];
  const result = await transaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO clients (code, full_name, phone)
       SELECT code, NULLIF(name, ''), NULLIF(phone, '') FROM jsonb_to_recordset($1::jsonb) AS x(code text, name text, phone text)
       ON CONFLICT (code) DO UPDATE SET
         full_name = COALESCE(EXCLUDED.full_name, clients.full_name),
         phone = COALESCE(EXCLUDED.phone, clients.phone),
         updated_at = CASE WHEN EXCLUDED.full_name IS DISTINCT FROM clients.full_name OR EXCLUDED.phone IS DISTINCT FROM clients.phone
                           THEN NOW() ELSE clients.updated_at END
       RETURNING (xmax = 0) AS created`,
      [JSON.stringify(list)],
    );
    const created = inserted.rows.filter((r) => r.created).length;
    const summary = { created, updated: inserted.rows.length - created, skipped: errors.length };
    await audit(db, ctx.user, 'client_import', 'client', null, summary);
    return summary;
  });
  return { ...result, errors: errors.slice(0, 50) };
});

route('GET', '/clients/:code', 'user', async (ctx) => {
  const code = ctx.params.code.toUpperCase();
  const clients = await query(`SELECT code, full_name, phone, created_at FROM clients WHERE code = $1`, [code]);
  if (!clients.length) throw new HttpError(404, 'Bunday ID bilan mijoz topilmadi');
  const [stats, payments] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS total,
              COALESCE(SUM(amount) FILTER (WHERE method = 'cash'), 0)::bigint AS cash,
              COALESCE(SUM(amount) FILTER (WHERE method = 'card'), 0)::bigint AS card,
              COALESCE(SUM(amount) FILTER (WHERE method = 'yandex'), 0)::bigint AS yandex,
              COALESCE(SUM(amount) FILTER (WHERE method = 'pochta'), 0)::bigint AS pochta,
              COUNT(*)::bigint AS count, MIN(paid_at) AS first_paid_at, MAX(paid_at) AS last_paid_at
         FROM payments WHERE client_code = $1 AND voided_at IS NULL`,
      [code],
    ),
    query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p LEFT JOIN clients c ON c.code = p.client_code
        WHERE p.client_code = $1 ORDER BY p.paid_at DESC LIMIT 300`,
      [code],
    ),
  ]);
  return { client: clients[0], stats: stats[0], payments };
});

route('PATCH', '/clients/:code', 'clients.edit', async (ctx) => {
  const code = ctx.params.code.toUpperCase();
  const rows = await query(
    `UPDATE clients SET full_name = NULLIF($2, ''), phone = NULLIF($3, ''), updated_at = NOW()
      WHERE code = $1 RETURNING code, full_name, phone`,
    [code, str(ctx.body?.fullName, 80), str(ctx.body?.phone, 30)],
  );
  if (!rows.length) throw new HttpError(404, 'Mijoz topilmadi');
  await audit(null, ctx.user, 'client_update', 'client', code, rows[0]);
  return { client: rows[0] };
});

// ---------- staff (admin) ----------

route('GET', '/staff', 'staff.view', async (ctx) => {
  const { from, to } = parseRange(ctx.query, 0);
  const rows = await query(
    `SELECT u.id, u.username, u.full_name, u.role, u.permissions, u.is_active, u.created_at, u.last_login_at,
            COALESCE(SUM(p.amount), 0)::bigint AS total,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0)::bigint AS card,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'yandex'), 0)::bigint AS yandex,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'pochta'), 0)::bigint AS pochta,
            COUNT(p.id)::bigint AS count
       FROM app_users u
       LEFT JOIN payments p ON p.created_by = u.id AND p.voided_at IS NULL AND ${RANGE_SQL(1, 2)}
      GROUP BY u.id
      ORDER BY u.is_active DESC, total DESC, u.full_name`,
    [from, to],
  );
  return { from, to, items: rows.map((u: any) => ({ ...u, permissions: permsOf(u.role, u.permissions) })) };
});

function parsePermissions(value: unknown): Perm[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'Ruxsatlar roʻyxati notoʻgʻri');
  return PERMISSIONS.filter((p) => value.includes(p));
}

const parseRole = (value: unknown): Role => (value === 'owner' || value === 'admin' ? value : 'worker');

// Only the owner manages admins and owners. Anyone else with staff.manage looks after workers
// and can hand out only the rights they have themselves.
function checkStaffChange(actor: AuthUser, roles: string[], permissions: Perm[] | null) {
  if (actor.role === 'owner') return;
  if (roles.some((r) => r !== 'worker')) throw new HttpError(403, 'Admin va Egani faqat Ega boshqaradi');
  const extra = (permissions ?? WORKER_DEFAULT).filter((p) => !actor.permissions.includes(p));
  if (extra.length) throw new HttpError(403, 'Oʻzingizda yoʻq ruxsatni boshqaga bera olmaysiz');
}

route('POST', '/staff', 'staff.manage', async (ctx) => {
  const username = normalizeUsername(ctx.body?.username);
  const fullName = str(ctx.body?.fullName, 80);
  if (fullName.length < 2) throw new HttpError(400, 'Xodim ismini kiriting');
  const role = parseRole(ctx.body?.role);
  const permissions = role !== 'owner' && ctx.body?.permissions !== undefined ? parsePermissions(ctx.body.permissions) : null;
  checkStaffChange(ctx.user!, [role], role === 'worker' ? permissions : null);
  const passwordHash = await hashPassword(validatePassword(ctx.body?.password));
  const exists = await query(`SELECT 1 FROM app_users WHERE username = $1`, [username]);
  if (exists.length) throw new HttpError(409, 'Bu login band. Boshqa login tanlang');
  const rows = await query(
    `INSERT INTO app_users (username, full_name, role, password_hash, permissions) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, full_name, role, is_active, created_at`,
    [username, fullName, role, passwordHash, permissions],
  );
  await audit(null, ctx.user, 'staff_create', 'user', rows[0].id, { username, role, permissions });
  return { status: 201, body: { staff: rows[0] } };
});

route('PATCH', '/staff/:id', 'staff.manage', async (ctx) => {
  const id = ctx.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Xodim topilmadi');
  const b = ctx.body || {};
  return transaction(async (db) => {
    const current = await db.query(`SELECT id, role, is_active FROM app_users WHERE id = $1 FOR UPDATE`, [id]);
    if (!current.rowCount) throw new HttpError(404, 'Xodim topilmadi');
    const role = b.role !== undefined ? parseRole(b.role) : current.rows[0].role;
    const permissions = b.permissions !== undefined ? parsePermissions(b.permissions) : null;
    checkStaffChange(ctx.user!, [current.rows[0].role, role], b.permissions !== undefined ? permissions : []);
    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`); };
    if (b.fullName !== undefined) {
      const fullName = str(b.fullName, 80);
      if (fullName.length < 2) throw new HttpError(400, 'Ism kamida 2 harf bo‘lsin');
      set('full_name', fullName);
    }
    const demoting = role !== current.rows[0].role;
    const deactivating = b.isActive === false && current.rows[0].is_active;
    if ((demoting || deactivating) && id === ctx.user!.id) {
      throw new HttpError(400, 'O‘z akkauntingizning rolini yoki faolligini o‘zgartira olmaysiz');
    }
    if ((demoting || deactivating) && current.rows[0].role === 'owner') {
      const owners = await db.query(`SELECT COUNT(*)::int AS n FROM app_users WHERE role = 'owner' AND is_active`);
      if (owners.rows[0].n <= 1) throw new HttpError(400, 'Tizimda kamida bitta faol Ega qolishi kerak');
    }
    if (b.role !== undefined) set('role', role);
    if (b.isActive !== undefined) set('is_active', Boolean(b.isActive));
    // A new role starts from that role's defaults unless rights were sent with it; the owner's are never stored.
    if (role === 'owner') {
      if (demoting) set('permissions', null);
    } else if (b.permissions !== undefined) set('permissions', permissions);
    else if (demoting) set('permissions', null);
    if (b.password !== undefined) set('password_hash', await hashPassword(validatePassword(b.password)));
    if (!sets.length) throw new HttpError(400, 'O‘zgartirish yo‘q');
    sets.push('updated_at = NOW()');
    const rows = await db.query(
      `UPDATE app_users SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, username, full_name, role, permissions, is_active, created_at, last_login_at`,
      params,
    );
    // Deactivation or password reset signs the person out everywhere.
    if (b.isActive === false || b.password !== undefined) await db.query(`DELETE FROM app_sessions WHERE user_id = $1`, [id]);
    await audit(db, ctx.user, 'staff_update', 'user', id, {
      fullName: b.fullName, role: b.role, isActive: b.isActive, passwordReset: b.password !== undefined,
      permissions: b.permissions,
    });
    const staff = rows.rows[0];
    return { staff: { ...staff, permissions: permsOf(staff.role, staff.permissions) } };
  });
});

route('GET', '/audit', 'admin', async () => {
  const rows = await query(`SELECT id, at, user_name, action, entity, entity_id, details FROM audit_log ORDER BY at DESC LIMIT 200`);
  return { items: rows };
});

route('GET', '/system', 'admin', async () => {
  const [meta, counts] = await Promise.all([
    query(`SELECT key, value, updated_at FROM app_meta`),
    query(`SELECT (SELECT COUNT(*) FROM payments)::bigint AS payments,
                  (SELECT COUNT(*) FROM payments WHERE voided_at IS NOT NULL)::bigint AS voided,
                  (SELECT COUNT(*) FROM clients)::bigint AS clients,
                  (SELECT COUNT(*) FROM app_users)::bigint AS users,
                  (SELECT COUNT(*) FROM legacy_import)::bigint AS legacy_records`),
  ]);
  // The Telegram bot token stays on the server.
  return { meta: Object.fromEntries(meta.filter((m: any) => m.key !== 'telegram').map((m: any) => [m.key, m.value])), counts: counts[0] };
});

// ---------- kassa balance, expenses (admin) ----------

const EXPENSE_CATEGORIES = ['tovar', 'paket', 'yetkazish', 'yoqilgi', 'ijara', 'oylik', 'kommunal', 'inkassa', 'boshqa'];
// Yandex and Pochta money lands on the card, so the balance has two accounts.
const SOURCES = ['cash', 'card'];

function parseAt(value: unknown, errors: Record<string, string>): string | null {
  if (!value) return null;
  const t = Date.parse(String(value));
  if (!Number.isFinite(t)) { errors.at = 'Sana noto‘g‘ri'; return null; }
  if (t > Date.now() + 5 * 60_000) { errors.at = 'Kelajakdagi sana kiritib bo‘lmaydi'; return null; }
  return new Date(t).toISOString();
}

// Every money movement per source: income (payments), expenses, signed adjustments.
const LEDGER_SQL = `
  SELECT CASE WHEN method = 'cash' THEN 'cash' ELSE 'card' END AS source, method,
         amount AS income, 0::bigint AS expense, 0::bigint AS adjustment, paid_at AS at FROM payments WHERE voided_at IS NULL
  UNION ALL SELECT source, NULL, 0, amount, 0, spent_at FROM expenses WHERE voided_at IS NULL
  UNION ALL SELECT CASE WHEN source = 'cash' THEN 'cash' ELSE 'card' END, NULL, 0, 0, amount, at FROM balance_adjustments`;

route('GET', '/balance', 'balance.view', async (ctx) => {
  const date = ctx.query.date && DATE_RE.test(ctx.query.date) ? ctx.query.date : todayTashkent();
  const start = `($1::date)::timestamp AT TIME ZONE '${TZ}'`;
  const end = `($1::date + 1)::timestamp AT TIME ZONE '${TZ}'`;
  const [rows, expenses, adjustments, recent] = await Promise.all([
    query(
      `SELECT source,
              COALESCE(SUM(income - expense + adjustment) FILTER (WHERE at < ${start}), 0)::bigint AS opening,
              COALESCE(SUM(income) FILTER (WHERE at >= ${start} AND at < ${end}), 0)::bigint AS income,
              COALESCE(SUM(income) FILTER (WHERE method = 'yandex' AND at >= ${start} AND at < ${end}), 0)::bigint AS income_yandex,
              COALESCE(SUM(income) FILTER (WHERE method = 'pochta' AND at >= ${start} AND at < ${end}), 0)::bigint AS income_pochta,
              COALESCE(SUM(expense) FILTER (WHERE at >= ${start} AND at < ${end}), 0)::bigint AS expense,
              COALESCE(SUM(adjustment) FILTER (WHERE at >= ${start} AND at < ${end}), 0)::bigint AS adjustment,
              COALESCE(SUM(income - expense + adjustment) FILTER (WHERE at < ${end}), 0)::bigint AS closing,
              COALESCE(SUM(income - expense + adjustment), 0)::bigint AS current
         FROM (${LEDGER_SQL}) l GROUP BY source`,
      [date],
    ),
    query(
      `SELECT id, amount, source, category, note, spent_at, created_by_name, voided_at, voided_by_name, void_reason
         FROM expenses WHERE spent_at >= ${start} AND spent_at < ${end} ORDER BY spent_at DESC`,
      [date],
    ),
    query(
      `SELECT id, amount, source, note, at, created_by_name FROM balance_adjustments
        WHERE at >= ${start} AND at < ${end} ORDER BY at DESC`,
      [date],
    ),
    query(
      `SELECT (at AT TIME ZONE '${TZ}')::date AS day,
              COALESCE(SUM(income), 0)::bigint AS income,
              COALESCE(SUM(income) FILTER (WHERE source = 'cash'), 0)::bigint AS cash_income,
              COALESCE(SUM(income) FILTER (WHERE source = 'card' AND method = 'card'), 0)::bigint AS card_income,
              COALESCE(SUM(income) FILTER (WHERE method = 'yandex'), 0)::bigint AS yandex_income,
              COALESCE(SUM(income) FILTER (WHERE method = 'pochta'), 0)::bigint AS pochta_income,
              COALESCE(SUM(expense), 0)::bigint AS expense,
              COALESCE(SUM(expense) FILTER (WHERE source = 'cash'), 0)::bigint AS cash_expense,
              COALESCE(SUM(expense) FILTER (WHERE source = 'card'), 0)::bigint AS card_expense
         FROM (${LEDGER_SQL}) l
        WHERE at >= ($1::date - 13)::timestamp AT TIME ZONE '${TZ}' AND at < ${end}
        GROUP BY 1 ORDER BY 1 DESC`,
      [date],
    ),
  ]);
  const zero = { opening: 0, income: 0, income_yandex: 0, income_pochta: 0, expense: 0, adjustment: 0, closing: 0, current: 0 };
  const bySource = Object.fromEntries(SOURCES.map((src) => [src, { ...zero, ...(rows.find((r: any) => r.source === src) || {}), source: src }]));
  const recentMap = new Map(recent.map((r: any) => [r.day, r]));
  const days = [];
  for (let i = 0; i < 14; i++) {
    const day = addDays(date, -i);
    days.push(recentMap.get(day) || { day, income: 0, cash_income: 0, card_income: 0, yandex_income: 0, pochta_income: 0, expense: 0, cash_expense: 0, card_expense: 0 });
  }
  return { date, sources: SOURCES.map((src) => bySource[src]), expenses, adjustments, recent: days };
});

// One month of the kassa, day by day per account, for the monthly Excel book: what was there at the
// start of each day, what came in, what went out (with every expense and its reason) and what was left.
route('GET', '/balance/month', 'balance.view', async (ctx) => {
  const today = todayTashkent();
  let first: string, last: string;
  if (DATE_RE.test(ctx.query.from || '') && DATE_RE.test(ctx.query.to || '')) {
    // Any span of days (e.g. from one cash hand-over to the next), at most a year, never past today.
    last = ctx.query.to! < today ? ctx.query.to! : today;
    first = ctx.query.from! <= last ? ctx.query.from! : last;
    if (first < addDays(last, -365)) first = addDays(last, -365);
  } else {
    const month = /^\d{4}-\d{2}$/.test(ctx.query.month || '') ? ctx.query.month! : today.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    first = `${month}-01`;
    last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (last > today) last = today < first ? first : today;
  }
  return balanceMonth(first, last);
});

async function balanceMonth(first: string, last: string) {
  const next = addDays(last, 1);
  const start = `($1::date)::timestamp AT TIME ZONE '${TZ}'`;
  const end = `($2::date)::timestamp AT TIME ZONE '${TZ}'`;
  const [opening, days, expenses, adjustments] = await Promise.all([
    query(`SELECT source, COALESCE(SUM(income - expense + adjustment), 0)::bigint AS amount FROM (${LEDGER_SQL}) l WHERE at < ${start} GROUP BY source`, [first]),
    query(
      `SELECT (at AT TIME ZONE '${TZ}')::date::text AS day, source,
              COALESCE(SUM(income), 0)::bigint AS income, COALESCE(SUM(expense), 0)::bigint AS expense,
              COALESCE(SUM(adjustment), 0)::bigint AS adjustment
         FROM (${LEDGER_SQL}) l WHERE at >= ${start} AND at < ${end} GROUP BY 1, 2`,
      [first, next],
    ),
    query(
      `SELECT id, amount, source, category, note, spent_at, created_by_name FROM expenses
        WHERE voided_at IS NULL AND spent_at >= ${start} AND spent_at < ${end} ORDER BY spent_at`,
      [first, next],
    ),
    query(
      `SELECT id, amount, source, note, at, created_by_name FROM balance_adjustments
        WHERE at >= ${start} AND at < ${end} ORDER BY at`,
      [first, next],
    ),
  ]);
  const open = Object.fromEntries(SOURCES.map((src) => [src, Number(opening.find((r: any) => r.source === src)?.amount || 0)]));
  return { first, last, opening: open, days, expenses, adjustments };
}

// Admin import of a cash book (kassa daftari): expenses, plus an optional opening balance per
// account. An expense matching one already recorded (same day, account, category and amount) is
// skipped; the opening balance becomes the one adjustment that makes the balance at the start of
// that day equal the given amount, so re-uploading the same file changes nothing.
route('POST', '/expenses/import', 'balance.view', async (ctx) => {
  const rows = Array.isArray(ctx.body?.rows) ? ctx.body.rows : null;
  const dryRun = ctx.body?.dryRun === true;
  if (!rows || !rows.length) throw new HttpError(400, 'Fayldan maʼlumot topilmadi');
  if (rows.length > 2000) throw new HttpError(400, 'Bir martada 2000 tadan koʻp qator yuklab boʻlmaydi');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const errors: Array<{ row: number; error: string }> = [];
  const expenses: Array<{ date: string; source: string; category: string; amount: number; note: string; key: string }> = [];
  const openings = new Map<string, { date: string; source: string; amount: number }>();
  rows.forEach((r: any, index: number) => {
    const row = index + 1;
    const date = str(r?.date, 10);
    const source = str(r?.source, 10);
    const amount = Number(r?.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return errors.push({ row, error: 'Sana notoʻgʻri' });
    if (date > today) return errors.push({ row, error: 'Kelajakdagi sana' });
    if (!SOURCES.includes(source)) return errors.push({ row, error: 'Hisob notoʻgʻri' });
    if (!Number.isInteger(amount) || Math.abs(amount) > 100_000_000_000) return errors.push({ row, error: 'Summa notoʻgʻri' });
    if (r?.kind === 'opening') {
      if (openings.has(source)) return errors.push({ row, error: 'Bu hisob uchun boshlangʻich qoldiq ikki marta yozilgan' });
      return void openings.set(source, { date, source, amount });
    }
    const category = str(r?.category, 20);
    const note = str(r?.note, 300);
    if (amount <= 0) return errors.push({ row, error: 'Summa notoʻgʻri' });
    if (!EXPENSE_CATEGORIES.includes(category)) return errors.push({ row, error: 'Toifa notoʻgʻri' });
    if (category === 'boshqa' && note.length < 3) return errors.push({ row, error: '“Boshqa” uchun izoh kerak' });
    expenses.push({ date, source, category, amount, note, key: `${date}|${source}|${category}|${amount}` });
  });
  if (!expenses.length && !openings.size) return { status: 400, body: { error: 'Yaroqli qator topilmadi', errors: errors.slice(0, 50) } };

  return transaction(async (db) => {
    let toAdd: typeof expenses = [];
    if (expenses.length) {
      const dates = expenses.map((r) => r.date).sort();
      const existing = await db.query(
        `SELECT to_char(spent_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') || '|' || source || '|' || category || '|' || amount AS key, COUNT(*)::int AS n
           FROM expenses
          WHERE voided_at IS NULL
            AND spent_at >= ($1::date)::timestamp AT TIME ZONE '${TZ}' AND spent_at < ($2::date + 1)::timestamp AT TIME ZONE '${TZ}'
          GROUP BY 1`,
        [dates[0], dates[dates.length - 1]],
      );
      const have = new Map<string, number>(existing.rows.map((r) => [r.key, r.n]));
      const seen = new Map<string, number>();
      toAdd = expenses.filter((r) => {
        const n = (seen.get(r.key) || 0) + 1;
        seen.set(r.key, n);
        return n > (have.get(r.key) || 0);
      });
    }
    // Opening balances: the adjustment is placed one second before the day starts.
    const opening: Array<{ source: string; date: string; target: number; before: number; adjustment: number }> = [];
    for (const o of openings.values()) {
      const bal = await db.query(
        `SELECT COALESCE(SUM(income - expense + adjustment), 0)::bigint AS balance
           FROM (${LEDGER_SQL}) l WHERE source = $1 AND at < ($2::date)::timestamp AT TIME ZONE '${TZ}'`,
        [o.source, o.date],
      );
      const before = Number(bal.rows[0].balance);
      opening.push({ source: o.source, date: o.date, target: o.amount, before, adjustment: o.amount - before });
    }
    const summary = {
      dryRun,
      adding: { count: toAdd.length, total: toAdd.reduce((s, r) => s + r.amount, 0), items: toAdd.map(({ key: _k, ...r }) => r) },
      alreadyRecorded: expenses.length - toAdd.length, invalid: errors.length, opening, errors: errors.slice(0, 50),
    };
    if (dryRun) return summary;

    for (const r of toAdd) {
      await db.query(
        `INSERT INTO expenses (amount, source, category, note, spent_at, created_by, created_by_name)
         VALUES ($1, $2, $3, NULLIF($4, ''), ($5::date + time '12:00') AT TIME ZONE '${TZ}', $6, $7)`,
        [r.amount, r.source, r.category, r.note, r.date, ctx.user!.id, ctx.user!.full_name],
      );
    }
    for (const o of opening) {
      if (!o.adjustment) continue;
      await db.query(
        `INSERT INTO balance_adjustments (source, amount, note, at, created_by, created_by_name)
         VALUES ($1, $2, $3, ($4::date)::timestamp AT TIME ZONE '${TZ}' - interval '1 second', $5, $6)`,
        [o.source, o.adjustment, `Boshlangʻich qoldiq: ${o.target} soʻm (kassa daftaridan)`, o.date, ctx.user!.id, ctx.user!.full_name],
      );
    }
    await audit(db, ctx.user, 'expense_import', 'expense', null, { added: toAdd.length, total: summary.adding.total, opening });
    return summary;
  });
});

route('POST', '/expenses', 'balance.view', async (ctx) => {
  const b = ctx.body || {};
  const errors: Record<string, string> = {};
  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount <= 0) errors.amount = 'Summa musbat butun son bo‘lishi kerak';
  else if (amount > 10_000_000_000) errors.amount = 'Summa juda katta';
  if (b.source !== 'cash' && b.source !== 'card') errors.source = 'Qaysi hisobdan to‘langanini tanlang';
  if (!EXPENSE_CATEGORIES.includes(b.category)) errors.category = 'Toifani tanlang';
  const note = str(b.note, 300);
  if (b.category === 'boshqa' && note.length < 3) errors.note = '“Boshqa” uchun izoh yozing';
  const at = parseAt(b.spentAt, errors);
  if (Object.keys(errors).length) return { status: 400, body: { error: 'Ma’lumotlarni tekshiring', fields: errors } };
  const expense = await transaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO expenses (amount, source, category, note, spent_at, created_by, created_by_name)
       VALUES ($1, $2, $3, NULLIF($4, ''), COALESCE($5::timestamptz, NOW()), $6, $7)
       RETURNING id, amount, source, category, note, spent_at, created_by_name, voided_at`,
      [amount, b.source, b.category, note, at, ctx.user!.id, ctx.user!.full_name],
    );
    await audit(db, ctx.user, 'expense_create', 'expense', inserted.rows[0].id, { amount, source: b.source, category: b.category });
    return inserted.rows[0];
  });
  return { status: 201, body: { expense } };
});

route('POST', '/expenses/:id/void', 'balance.view', async (ctx) => {
  const reason = str(ctx.body?.reason, 300);
  if (reason.length < 3) throw new HttpError(400, 'Bekor qilish sababini yozing');
  if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id)) throw new HttpError(404, 'Rasxod topilmadi');
  return transaction(async (db) => {
    const updated = await db.query(
      `UPDATE expenses SET voided_at = NOW(), voided_by_name = $2, void_reason = $3
        WHERE id = $1 AND voided_at IS NULL RETURNING id, amount, source, category`,
      [ctx.params.id, ctx.user!.full_name, reason],
    );
    if (!updated.rowCount) throw new HttpError(404, 'Rasxod topilmadi yoki allaqachon bekor qilingan');
    await audit(db, ctx.user, 'expense_void', 'expense', ctx.params.id, { ...updated.rows[0], reason });
    return { expense: updated.rows[0] };
  });
});

route('POST', '/adjustments', 'balance.view', async (ctx) => {
  const b = ctx.body || {};
  const errors: Record<string, string> = {};
  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount === 0) errors.amount = 'Summa noldan farqli butun son bo‘lsin';
  else if (Math.abs(amount) > 100_000_000_000) errors.amount = 'Summa juda katta';
  if (!SOURCES.includes(b.source)) errors.source = 'Hisobni tanlang';
  const note = str(b.note, 300);
  if (note.length < 3) errors.note = 'Sababini yozing';
  const at = parseAt(b.at, errors);
  if (Object.keys(errors).length) return { status: 400, body: { error: 'Ma’lumotlarni tekshiring', fields: errors } };
  const adjustment = await transaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO balance_adjustments (source, amount, note, at, created_by, created_by_name)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), $5, $6)
       RETURNING id, source, amount, note, at, created_by_name`,
      [b.source, amount, note, at, ctx.user!.id, ctx.user!.full_name],
    );
    await audit(db, ctx.user, 'balance_adjust', 'adjustment', inserted.rows[0].id, { source: b.source, amount, note });
    return inserted.rows[0];
  });
  return { status: 201, body: { adjustment } };
});

// ---------- attendance ----------

interface Office { lat: number; lng: number; radius: number }

async function getOffice(): Promise<Office | null> {
  const rows = await query(`SELECT value FROM app_meta WHERE key = 'office'`);
  const v = rows[0]?.value;
  return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.radius) ? v : null;
}

/** Metres between two points (haversine). */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * When an office location is set, "Keldim" and "Ketdim" only work near it. The phone's own
 * accuracy estimate (capped at 100 m) is allowed on top of the radius, because indoor GPS drifts.
 */
async function checkLocation(body: any): Promise<{ distance: number | null; accuracy: number | null }> {
  const office = await getOffice();
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const hasPoint = body?.lat != null && body?.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const accuracy = Number.isFinite(Number(body?.accuracy)) ? Math.max(0, Math.round(Number(body.accuracy))) : null;
  if (!office) return { distance: null, accuracy };
  if (!hasPoint) throw new HttpError(400, 'Joylashuvingiz aniqlanmadi. Telefonda joylashuvga ruxsat bering va qayta urinib koʻring');
  const distance = Math.round(distanceM({ lat, lng }, office));
  if (distance - Math.min(accuracy ?? 0, 100) > office.radius) {
    throw new HttpError(403, `Siz ishxonadan ${distance >= 1000 ? `${(distance / 1000).toFixed(1).replace('.', ',')} km` : `${distance} m`} uzoqdasiz. Belgilash faqat ishxona yonida ishlaydi`);
  }
  return { distance, accuracy };
}

const ATT_COLUMNS = `a.id, a.user_id, u.full_name AS user_name, a.check_in_at, a.check_out_at, a.in_distance, a.out_distance,
  a.forgot_out, a.edited_by_name, a.edited_at, to_char(a.check_in_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day`;

/**
 * An arrival from an earlier day that was never closed: "Ketdim" was forgotten. It is closed with
 * zero length and flagged, so the day still counts as present and an admin can enter the real time.
 */
async function closeForgotten(userId: string | null) {
  await query(
    `UPDATE attendance SET check_out_at = check_in_at, forgot_out = TRUE
      WHERE check_out_at IS NULL AND check_in_at < (($1::date)::timestamp AT TIME ZONE '${TZ}')
        AND ($2::uuid IS NULL OR user_id = $2::uuid)`,
    [todayTashkent(), userId],
  );
}

route('GET', '/attendance/me', 'user', async (ctx) => {
  await closeForgotten(ctx.user!.id);
  const [open, recent, office] = await Promise.all([
    query(`SELECT ${ATT_COLUMNS} FROM attendance a JOIN app_users u ON u.id = a.user_id WHERE a.user_id = $1 AND a.check_out_at IS NULL`, [ctx.user!.id]),
    query(`SELECT ${ATT_COLUMNS} FROM attendance a JOIN app_users u ON u.id = a.user_id
            WHERE a.user_id = $1 AND a.check_in_at >= NOW() - interval '40 days' ORDER BY a.check_in_at DESC`, [ctx.user!.id]),
    getOffice(),
  ]);
  return { open: open[0] || null, items: recent, officeSet: Boolean(office), radius: office?.radius ?? null };
});

route('POST', '/attendance/check-in', 'user', async (ctx) => {
  const { distance, accuracy } = await checkLocation(ctx.body);
  await closeForgotten(ctx.user!.id);
  return transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`att:${ctx.user!.id}`]);
    const open = await db.query(`SELECT 1 FROM attendance WHERE user_id = $1 AND check_out_at IS NULL`, [ctx.user!.id]);
    if (open.rowCount) throw new HttpError(409, 'Siz allaqachon “Keldim” ni bosgansiz');
    const rows = await db.query(
      `INSERT INTO attendance (user_id, in_distance, in_accuracy) VALUES ($1, $2, $3) RETURNING id, check_in_at`,
      [ctx.user!.id, distance, accuracy],
    );
    return { status: 201, body: { attendance: rows.rows[0] } };
  });
});

route('POST', '/attendance/check-out', 'user', async (ctx) => {
  const { distance, accuracy } = await checkLocation(ctx.body);
  await closeForgotten(ctx.user!.id);
  const rows = await query(
    `UPDATE attendance SET check_out_at = GREATEST(NOW(), check_in_at), out_distance = $2, out_accuracy = $3
      WHERE user_id = $1 AND check_out_at IS NULL RETURNING id, check_in_at, check_out_at`,
    [ctx.user!.id, distance, accuracy],
  );
  if (!rows[0]) throw new HttpError(409, 'Avval “Keldim” ni bosing');
  return { attendance: rows[0] };
});

route('GET', '/attendance', 'staff.view', async (ctx) => {
  const { from, to } = parseRange(ctx.query, 6);
  await closeForgotten(null);
  const items = await query(
    `SELECT ${ATT_COLUMNS} FROM attendance a JOIN app_users u ON u.id = a.user_id
      WHERE a.check_in_at >= ($1::date)::timestamp AT TIME ZONE '${TZ}' AND a.check_in_at < ($2::date + 1)::timestamp AT TIME ZONE '${TZ}'
      ORDER BY a.check_in_at DESC LIMIT 5000`,
    [from, to],
  );
  const staff = await query(`SELECT id, full_name, role, is_active FROM app_users ORDER BY is_active DESC, full_name`);
  return { from, to, items, staff };
});

// An admin fixes a forgotten "Ketdim" or a wrong time.
route('PATCH', '/attendance/:id', 'staff.manage', async (ctx) => {
  if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id)) throw new HttpError(404, 'Yozuv topilmadi');
  const inAt = Date.parse(ctx.body?.checkInAt);
  const outAt = ctx.body?.checkOutAt ? Date.parse(ctx.body.checkOutAt) : null;
  if (!Number.isFinite(inAt) || (outAt !== null && !Number.isFinite(outAt))) throw new HttpError(400, 'Vaqt notoʻgʻri');
  if (outAt !== null && outAt < inAt) throw new HttpError(400, 'Ketish vaqti kelish vaqtidan oldin boʻlmasin');
  if (inAt > Date.now() + 60_000 || (outAt !== null && outAt > Date.now() + 60_000)) throw new HttpError(400, 'Kelajakdagi vaqtni kiritib boʻlmaydi');
  return transaction(async (db) => {
    const before = await db.query(`SELECT check_in_at, check_out_at FROM attendance WHERE id = $1 FOR UPDATE`, [ctx.params.id]);
    if (!before.rowCount) throw new HttpError(404, 'Yozuv topilmadi');
    const rows = await db.query(
      `UPDATE attendance SET check_in_at = $2, check_out_at = $3, forgot_out = FALSE, edited_by_name = $4, edited_at = NOW()
        WHERE id = $1 RETURNING id, check_in_at, check_out_at`,
      [ctx.params.id, new Date(inAt).toISOString(), outAt === null ? null : new Date(outAt).toISOString(), ctx.user!.full_name],
    );
    await audit(db, ctx.user, 'attendance_edit', 'attendance', ctx.params.id, { before: before.rows[0], after: rows.rows[0] });
    return { attendance: rows.rows[0] };
  });
});

route('GET', '/office', 'staff.manage', async () => ({ office: await getOffice() }));

route('PUT', '/office', 'staff.manage', async (ctx) => {
  const b = ctx.body || {};
  if (b.office === null) {
    await query(`DELETE FROM app_meta WHERE key = 'office'`);
    await audit(null, ctx.user, 'office_clear', 'office', null);
    return { office: null };
  }
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const radius = Math.round(Number(b.radius));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, 'Joylashuv notoʻgʻri');
  if (!Number.isFinite(radius) || radius < 20 || radius > 5000) throw new HttpError(400, 'Radius 20 dan 5000 metrgacha boʻlsin');
  const office = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, radius };
  await query(
    `INSERT INTO app_meta (key, value) VALUES ('office', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(office)],
  );
  await audit(null, ctx.user, 'office_set', 'office', null, office);
  return { office };
});

// ---------- Telegram: daily report and nightly backup (owner) ----------

const METHOD_LABEL: Record<string, string> = { cash: 'Naqd', card: 'Karta', yandex: 'Yandex', pochta: 'Pochta' };
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const som = (n: number | string) => `${String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} soʻm`;
const dayLabel = (date: string) => `${Number(date.slice(8))}-${MONTHS[Number(date.slice(5, 7)) - 1]}, ${date.slice(0, 4)}`;
const tashkentHour = () => new Date(Date.now() + 5 * 3600_000).getUTCHours();

async function dailyReportText(date: string): Promise<string> {
  const start = `($1::date)::timestamp AT TIME ZONE '${TZ}'`;
  const end = `($1::date + 1)::timestamp AT TIME ZONE '${TZ}'`;
  const [totals, voided, expenses, balance] = await Promise.all([
    totalsFor(date, date),
    query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::bigint AS total FROM payments
            WHERE voided_at >= ${start} AND voided_at < ${end}`, [date]),
    query(`SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM expenses
            WHERE voided_at IS NULL AND spent_at >= ${start} AND spent_at < ${end}`, [date]),
    query(`SELECT source, COALESCE(SUM(income - expense + adjustment), 0)::bigint AS closing
             FROM (${LEDGER_SQL}) l WHERE at < ${end} GROUP BY source`, [date]),
  ]);
  const lines = [`📊 <b>Laylak Cargo · ${dayLabel(date)}</b>`, ''];
  lines.push(`💰 Jami: <b>${som(totals.total)}</b> (${totals.count} ta toʻlov, ${totals.clients} mijoz)`);
  for (const m of ['cash', 'card', 'yandex', 'pochta']) if (Number(totals[m])) lines.push(`   ${METHOD_LABEL[m]}: ${som(totals[m])}`);
  if (Number(expenses[0].total)) lines.push(`💸 Rasxod: ${som(expenses[0].total)}`);
  if (voided[0].n) lines.push(`⚠️ Bekor qilingan: ${voided[0].n} ta, ${som(voided[0].total)}`);
  const bal = Object.fromEntries(balance.map((b: any) => [b.source, b.closing]));
  if (balance.length) lines.push(`🏦 Kun oxiridagi qoldiq: naqd ${som(bal.cash || 0)}, karta ${som(bal.card || 0)}`);
  return lines.join('\n');
}

/** Every table except sign-in sessions; passwords and the bot token are left out. */
async function backupData() {
  const tables = await query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT IN ('app_sessions', 'login_attempts')
      ORDER BY table_name`,
  );
  const data: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    let rows = await query(`SELECT * FROM "${name.replace(/"/g, '')}"`);
    if (name === 'app_users') rows = rows.map(({ password_hash, ...u }: any) => u);
    if (name === 'app_meta') rows = rows.filter((r: any) => r.key !== 'telegram');
    data[name] = rows;
  }
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const json = JSON.stringify({ app: 'laylak-cargo-kassa', created_at: new Date().toISOString(), counts, tables: data });
  return { gz: gzipSync(json), counts };
}

// The kassa was handed over (inkassa) on 8 October 2026, so the evening files never reach back before the 9th;
// after the next inkassa expense they start again from the day after it.
const KASSA_FROM = '2026-10-09';

async function kassaPeriodStart(date: string) {
  const rows = await query(
    `SELECT MAX((spent_at AT TIME ZONE '${TZ}')::date)::text AS day FROM expenses
      WHERE voided_at IS NULL AND category = 'inkassa' AND spent_at < ($1::date)::timestamp AT TIME ZONE '${TZ}'`,
    [date],
  );
  const after = rows[0]?.day ? addDays(rows[0].day, 1) : KASSA_FROM;
  const start = after > KASSA_FROM ? after : KASSA_FROM;
  return start > date ? date : start < addDays(date, -365) ? addDays(date, -365) : start;
}

/** The two Excel books from the Balans and Operatsiyalar pages, for `from`..`to`, as the day's report attachments. */
async function reportWorkbooks(from: string, to: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/node');
  // Rows go through JSON so dates are ISO strings, exactly as the browser gets them.
  const plain = <T,>(value: unknown) => JSON.parse(JSON.stringify(value)) as T;
  const [month, payments] = await Promise.all([
    balanceMonth(from, to),
    query(`SELECT ${PAYMENT_COLUMNS} FROM payments p LEFT JOIN clients c ON c.code = p.client_code
            WHERE ${RANGE_SQL(1, 2)} ORDER BY p.paid_at`, [from, to]),
  ]);
  const label = (c: string) => EXPENSE_LABELS[c] ?? c;
  return {
    kassa: await writeXlsxFile(monthSheets(plain<BalanceMonth>(month), label), XLSX_OPTIONS).toBuffer(),
    operations: await writeXlsxFile(kassaSheets(plain<Payment[]>(payments)), XLSX_OPTIONS).toBuffer(),
    payments: payments.length,
  };
}

async function sendDailyReport(date: string) {
  const text = await dailyReportText(date);
  if (!(await sendMessage(text))) throw new HttpError(400, 'Telegram ulanmagan');
  const from = await kassaPeriodStart(date);
  const span = from === date ? dayLabel(date) : `${dayLabel(from)} – ${dayLabel(date)}`;
  try {
    const books = await reportWorkbooks(from, date);
    await sendDocument(books.kassa, `kassa_${from}_${date}.xlsx`, `📗 Kassa va rasxodlar · ${span}`);
    await sendDocument(books.operations, `operatsiyalar_${from}_${date}.xlsx`, `📘 Operatsiyalar · ${span}\n${books.payments} ta toʻlov`);
  } catch (error) {
    // The report itself already went out; a failed file must not stop the backup or resend the report.
    console.error('Daily Excel failed', error);
    await sendMessage('⚠️ Bugungi Excel fayllarni yuborib boʻlmadi. Ularni saytdagi Balans va Operatsiyalar sahifasidan yuklab olsa boʻladi.').catch(() => {});
  }
  const { gz, counts } = await backupData();
  await sendDocument(gz, `laylak-zaxira-${date}.json.gz`,
    `🗄 Zaxira nusxa · ${dayLabel(date)}\n${counts.payments ?? 0} toʻlov, ${counts.clients ?? 0} mijoz, ${counts.attendance ?? 0} davomat yozuvi`);
}

/** Code the owner types in a group to link it; made from the bot token, so only the kassa knows it. */
const groupCode = (token: string) => String(100000 + (createHash('sha256').update(`group:${token}`).digest().readUInt32BE(0) % 900000));

function telegramView(config: Awaited<ReturnType<typeof getTelegram>>) {
  if (!config) return { telegram: null };
  return { telegram: {
    botName: config.botName, connected: Boolean(config.chatId), chatName: config.chatName || null, code: config.chatId ? null : config.code,
    groupName: config.groupId ? config.groupName || 'Guruh' : null, groupPaused: Boolean(config.groupId && config.groupPaused), groupCode: config.chatId && !config.groupId ? groupCode(config.token) : null,
  } };
}

route('GET', '/telegram', 'owner', async () => telegramView(await getTelegram()));

route('PUT', '/telegram', 'owner', async (ctx) => {
  const token = str(ctx.body?.token, 100);
  if (!/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(token)) throw new HttpError(400, 'Bot tokeni notoʻgʻri. @BotFather bergan tokenni toʻliq nusxalang');
  const me = await tg(token, 'getMe', {});
  const config = { token, botName: me.username, code: String(randomInt(100000, 999999)) };
  await saveTelegram(config);
  await audit(null, ctx.user, 'telegram_set', 'telegram', null, { bot: me.username });
  return telegramView(config);
});

// The owner opens the bot and presses Start with the code; we read the bot's messages to find their chat.
route('POST', '/telegram/check', 'owner', async (ctx) => {
  const config = await getTelegram();
  if (!config) throw new HttpError(400, 'Avval bot tokenini kiriting');
  if (config.chatId) return telegramView(config);
  // The newest 100 updates: older ones (a busy group) would otherwise hide the one we need.
  const updates: any[] = await tg(config.token, 'getUpdates', { offset: -100, allowed_updates: ['message'], timeout: 0 });
  const match = updates.reverse().find((u) => typeof u.message?.text === 'string' && u.message.text.includes(config.code) && u.message.chat?.type === 'private');
  if (!match) throw new HttpError(404, `Botga hali kod kelmadi. @${config.botName} ni ochib, “Start” bosing yoki ${config.code} deb yozing`);
  const chat = match.message.chat;
  const next = { ...config, chatId: chat.id, chatName: [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || 'Telegram' };
  await saveTelegram(next);
  await tg(config.token, 'sendMessage', { chat_id: chat.id, text: '✅ Laylak Cargo kassa ulandi. Har kuni kechqurun shu yerga hisobot va zaxira nusxa keladi.' });
  await audit(null, ctx.user, 'telegram_connect', 'telegram', null, { chat: next.chatName });
  return telegramView(next);
});

// Linking a group: someone writes "/start@bot <code>" in it (the code is only on this page), or the
// owner's own account adds the bot. A stranger adding the bot to their group gets nothing. In a group
// with topics, messages go to the topic where the code was written.
route('POST', '/telegram/group', 'owner', async (ctx) => {
  const config = await getTelegram();
  if (!config?.chatId) throw new HttpError(400, 'Avval botni oʻzingizga ulang');
  // The newest 100 updates: older ones (a busy group) would otherwise hide the one we need.
  const updates: any[] = await tg(config.token, 'getUpdates', { offset: -100, allowed_updates: ['message'], timeout: 0 });
  const code = groupCode(config.token);
  const inGroup = updates.map((u) => u.message).filter((m) => m && ['group', 'supergroup'].includes(m.chat?.type));
  const added = [...inGroup].reverse().find((m) => (typeof m.text === 'string' && m.text.includes(code))
    || (m.from?.id === config.chatId && (m.new_chat_members || []).some((u: any) => u.username === config.botName)));
  if (!added) throw new HttpError(404, `Guruh topilmadi. Guruhda /start@${config.botName} ${code} deb yozing, keyin qayta bosing`);
  const threadId: number | undefined = added.is_topic_message && added.message_thread_id ? added.message_thread_id : undefined;
  let groupId: number = added.chat.id;
  const moved = inGroup.find((m) => m.chat.id === groupId && m.migrate_to_chat_id);
  if (moved) groupId = moved.migrate_to_chat_id;
  const next = { ...config, groupId, groupThreadId: threadId, groupName: added.chat.title || 'Guruh' };
  const hello = (chatId: number) => tg(config.token, 'sendMessage', {
    chat_id: chatId, ...(threadId ? { message_thread_id: threadId } : {}),
    text: '✅ Laylak Cargo kassa: bu yerga toʻlov rasmlari va bekor qilingan toʻlovlar haqida xabar keladi.',
  });
  try {
    await hello(groupId);
  } catch (error) {
    if (!(error instanceof ChatMoved)) throw error;
    next.groupId = error.chatId;
    await hello(next.groupId);
  }
  await saveTelegram(next);
  await audit(null, ctx.user, 'telegram_group', 'telegram', null, { group: next.groupName });
  return telegramView(next);
});

// Stop or resume messages to the group without unlinking it; the owner's own chat is not affected.
route('PUT', '/telegram/group/pause', 'owner', async (ctx) => {
  const config = await getTelegram();
  if (!config?.groupId) throw new HttpError(400, 'Guruh ulanmagan');
  const paused = ctx.body?.paused === true;
  const next = { ...config, groupPaused: paused };
  await saveTelegram(next);
  await audit(null, ctx.user, paused ? 'telegram_group_pause' : 'telegram_group_resume', 'telegram', null, { group: config.groupName });
  return telegramView(next);
});

route('DELETE', '/telegram/group', 'owner', async (ctx) => {
  const config = await getTelegram();
  if (!config) throw new HttpError(400, 'Telegram ulanmagan');
  const { groupId: _id, groupName: _name, groupThreadId: _thread, groupPaused: _paused, ...rest } = config;
  await saveTelegram(rest);
  await audit(null, ctx.user, 'telegram_group_remove', 'telegram', null);
  return telegramView(rest);
});

route('DELETE', '/telegram', 'owner', async (ctx) => {
  await saveTelegram(null);
  await audit(null, ctx.user, 'telegram_remove', 'telegram', null);
  return { telegram: null };
});

route('POST', '/telegram/send', 'owner', async () => {
  await sendDailyReport(todayTashkent());
  return { ok: true };
});

// Download a backup from the Sozlamalar page. Sent compressed so it stays small.
route('GET', '/backup', 'owner', async (ctx) => {
  const { gz, counts } = await backupData();
  await audit(null, ctx.user, 'backup_download', 'backup', null, counts);
  return { filename: `laylak-zaxira-${todayTashkent()}.json.gz`, data: gz.toString('base64'), counts };
});

// Vercel Cron calls this every evening (vercel.json). It sends at most one report per day, and only
// in the evening, so calling it by hand cannot spam the owner.
route('GET', '/cron/daily', 'public', async (ctx) => {
  const secret = process.env.CRON_SECRET;
  if (secret && ctx.headers.authorization !== `Bearer ${secret}`) return { status: 401, body: { error: 'Ruxsat yoʻq' } };
  if (tashkentHour() < 19) return { sent: false, reason: 'early' };
  const date = todayTashkent();
  const claimed = await query(
    `INSERT INTO app_meta (key, value) VALUES ('daily_report', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      WHERE app_meta.value->>'date' IS DISTINCT FROM $2
     RETURNING key`,
    [JSON.stringify({ date }), date],
  );
  if (!claimed.length) return { sent: false, reason: 'already-sent' };
  try {
    await sendDailyReport(date);
  } catch (error) {
    await query(`DELETE FROM app_meta WHERE key = 'daily_report'`);
    if (error instanceof HttpError && error.status === 400) return { sent: false, reason: 'not-connected' };
    throw error;
  }
  return { sent: true };
});
