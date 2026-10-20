import type pg from 'pg';
import { HttpError, query, transaction, TZ } from './db.js';
import {
  AuthUser,
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
type Access = 'public' | 'user' | 'admin';

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
    if (r.access === 'admin' && user?.role !== 'admin') return { status: 403, body: { error: 'Bu amal faqat admin uchun' } };
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
  (p.legacy_id IS NOT NULL) AS is_legacy`;

async function totalsFor(from: string, to: string) {
  const rows = await query(
    `SELECT COALESCE(SUM(p.amount), 0)::bigint AS total,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0)::bigint AS card,
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
      `INSERT INTO app_users (username, full_name, role, password_hash) VALUES ($1, $2, 'admin', $3)
       RETURNING id, username, full_name, role`,
      [username, fullName, passwordHash],
    );
    await audit(db, inserted.rows[0], 'setup', 'user', inserted.rows[0].id);
    return inserted.rows[0] as AuthUser;
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
    `SELECT id, username, full_name, role, password_hash, is_active FROM app_users WHERE username = $1`,
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
  const user: AuthUser = { id: row.id, username: row.username, full_name: row.full_name, role: row.role };
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
  return { user: rows[0] };
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
            COALESCE((SELECT EXTRACT(EPOCH FROM MAX(updated_at)) FROM app_users), 0)::text AS version`,
  );
  return { version: rows[0].version, today: todayTashkent() };
});

// ---------- payments ----------

route('POST', '/payments', 'user', async (ctx) => {
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
  if (method !== 'cash' && method !== 'card') errors.method = 'To‘lov turini tanlang';

  let paidAt: string | null = null;
  if (b.paidAt) {
    if (ctx.user!.role !== 'admin') errors.paidAt = 'Sanani faqat admin o‘zgartira oladi';
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
  return { status: 201, body: { payment } };
});

route('GET', '/payments', 'user', async (ctx) => {
  const q = ctx.query;
  const { from, to } = parseRange(q, 6);
  const where = ['1=1', RANGE_SQL(1, 2)];
  const params: unknown[] = [from, to];
  const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.method === 'cash' || q.method === 'card') add('p.method = ?', q.method);
  if (q.worker && /^[0-9a-f-]{36}$/i.test(q.worker)) add('p.created_by = ?', q.worker);
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
              COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL AND p.method = 'card'), 0)::bigint AS card
         FROM payments p LEFT JOIN clients c ON c.code = p.client_code WHERE ${whereSql}`,
      params,
    ),
  ]);
  return { from, to, items, ...agg[0], limit, offset };
});

route('POST', '/payments/:id/void', 'admin', async (ctx) => {
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
  return { payment };
});

// ---------- reports ----------

route('GET', '/summary', 'user', async (ctx) => {
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
      byDay.push(byDayMap.get(d) || { day: d, total: 0, cash: 0, card: 0, count: 0 });
    }
  } else {
    byDay.push(...byDayRows);
  }
  return { from, to, previousRange: { from: prevFrom, to: prevTo }, totals, previous, byWorker, byDay, recent };
});

route('GET', '/periods', 'user', async (ctx) => {
  const group = ctx.query.group === 'month' ? 'month' : 'week';
  const defaultDays = group === 'month' ? 365 : 7 * 12;
  const { from, to } = parseRange(ctx.query, defaultDays - 1);
  const rows = await query(
    `SELECT date_trunc('${group}', p.paid_at AT TIME ZONE '${TZ}')::date AS period,
            COALESCE(SUM(p.amount), 0)::bigint AS total,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0)::bigint AS card,
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

route('GET', '/clients', 'user', async (ctx) => {
  const term = str(ctx.query.q, 60);
  const params: unknown[] = [];
  let where = '';
  if (term) {
    params.push(`%${term.replace(/[%_\\]/g, '\\$&')}%`);
    where = `WHERE c.code ILIKE $1 OR COALESCE(c.full_name, '') ILIKE $1 OR COALESCE(c.phone, '') ILIKE $1`;
  }
  const rows = await query(
    `SELECT c.code, c.full_name, c.phone,
            COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL), 0)::bigint AS total,
            COUNT(p.id) FILTER (WHERE p.voided_at IS NULL)::bigint AS count,
            MAX(p.paid_at) FILTER (WHERE p.voided_at IS NULL) AS last_paid_at
       FROM clients c LEFT JOIN payments p ON p.client_code = c.code
       ${where}
      GROUP BY c.code
      ORDER BY (upper(c.code) = upper(${term ? '$2' : "''"})) DESC, last_paid_at DESC NULLS LAST
      LIMIT 100`,
    term ? [...params, term] : params,
  );
  return { items: rows };
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

route('PATCH', '/clients/:code', 'admin', async (ctx) => {
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

route('GET', '/staff', 'admin', async (ctx) => {
  const { from, to } = parseRange(ctx.query, 0);
  const rows = await query(
    `SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at, u.last_login_at,
            COALESCE(SUM(p.amount), 0)::bigint AS total,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0)::bigint AS card,
            COUNT(p.id)::bigint AS count
       FROM app_users u
       LEFT JOIN payments p ON p.created_by = u.id AND p.voided_at IS NULL AND ${RANGE_SQL(1, 2)}
      GROUP BY u.id
      ORDER BY u.is_active DESC, total DESC, u.full_name`,
    [from, to],
  );
  return { from, to, items: rows };
});

route('POST', '/staff', 'admin', async (ctx) => {
  const username = normalizeUsername(ctx.body?.username);
  const fullName = str(ctx.body?.fullName, 80);
  if (fullName.length < 2) throw new HttpError(400, 'Xodim ismini kiriting');
  const role = ctx.body?.role === 'admin' ? 'admin' : 'worker';
  const passwordHash = await hashPassword(validatePassword(ctx.body?.password));
  const exists = await query(`SELECT 1 FROM app_users WHERE username = $1`, [username]);
  if (exists.length) throw new HttpError(409, 'Bu login band. Boshqa login tanlang');
  const rows = await query(
    `INSERT INTO app_users (username, full_name, role, password_hash) VALUES ($1, $2, $3, $4)
     RETURNING id, username, full_name, role, is_active, created_at`,
    [username, fullName, role, passwordHash],
  );
  await audit(null, ctx.user, 'staff_create', 'user', rows[0].id, { username, role });
  return { status: 201, body: { staff: rows[0] } };
});

route('PATCH', '/staff/:id', 'admin', async (ctx) => {
  const id = ctx.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Xodim topilmadi');
  const b = ctx.body || {};
  return transaction(async (db) => {
    const current = await db.query(`SELECT id, role, is_active FROM app_users WHERE id = $1 FOR UPDATE`, [id]);
    if (!current.rowCount) throw new HttpError(404, 'Xodim topilmadi');
    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`); };
    if (b.fullName !== undefined) {
      const fullName = str(b.fullName, 80);
      if (fullName.length < 2) throw new HttpError(400, 'Ism kamida 2 harf bo‘lsin');
      set('full_name', fullName);
    }
    const demoting = b.role !== undefined && b.role !== current.rows[0].role;
    const deactivating = b.isActive === false && current.rows[0].is_active;
    if ((demoting || deactivating) && id === ctx.user!.id) {
      throw new HttpError(400, 'O‘z akkauntingizning admin huquqini yoki faolligini o‘zgartira olmaysiz');
    }
    if ((demoting || deactivating) && current.rows[0].role === 'admin') {
      const admins = await db.query(`SELECT COUNT(*)::int AS n FROM app_users WHERE role = 'admin' AND is_active`);
      if (admins.rows[0].n <= 1) throw new HttpError(400, 'Tizimda kamida bitta faol admin qolishi kerak');
    }
    if (b.role !== undefined) set('role', b.role === 'admin' ? 'admin' : 'worker');
    if (b.isActive !== undefined) set('is_active', Boolean(b.isActive));
    if (b.password !== undefined) set('password_hash', await hashPassword(validatePassword(b.password)));
    if (!sets.length) throw new HttpError(400, 'O‘zgartirish yo‘q');
    sets.push('updated_at = NOW()');
    const rows = await db.query(
      `UPDATE app_users SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, username, full_name, role, is_active, created_at, last_login_at`,
      params,
    );
    // Deactivation or password reset signs the person out everywhere.
    if (b.isActive === false || b.password !== undefined) await db.query(`DELETE FROM app_sessions WHERE user_id = $1`, [id]);
    await audit(db, ctx.user, 'staff_update', 'user', id, {
      fullName: b.fullName, role: b.role, isActive: b.isActive, passwordReset: b.password !== undefined,
    });
    return { staff: rows.rows[0] };
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
  return { meta: Object.fromEntries(meta.map((m: any) => [m.key, m.value])), counts: counts[0] };
});
