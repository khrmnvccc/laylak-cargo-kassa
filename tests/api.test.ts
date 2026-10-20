// Integration tests against a real PostgreSQL database.
// Run: DATABASE_URL=postgres://... ADMIN_SETUP_KEY=test-key npm test
// Needs an EMPTY database (it refuses to run otherwise); never point it at production.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApi } from '../server/router.js';
import { getPool } from '../server/db.js';

process.env.ADMIN_SETUP_KEY ||= 'test-key';

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown, query: Record<string, string> = {}) {
    const res = await handleApi({
      method, path, query, body: body ?? {},
      headers: { cookie: this.cookie, host: 'kassa.test', origin: 'https://kassa.test', 'user-agent': 'test' },
    });
    for (const c of res.cookies || []) this.cookie = c.split(';')[0];
    return res as { status: number; body: any };
  }
}

const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

const LEGACY_SEED = [
  ['neon-user-a', {
    reports: [
      { id: 'r-a1', date: '2026-10-05', idNumber: '101111', tripsCount: 3, cash: 150000, card: 250000, yandex: 10000, pochta: 0, note: 'test', createdByName: 'Asliddin', createdAt: '2026-10-05T10:00:00Z' },
      { id: 'rep-1', date: '2026-09-02', idNumber: '101111', cash: 95000, card: 0, yandex: 0, pochta: 0, createdAt: '2026-09-02T18:30:00Z' },
      { id: 'r-del', date: '2026-10-04', idNumber: '5', cash: 1, card: 0, yandex: 0, pochta: 0, createdAt: '2026-10-04T10:00:00Z' },
    ],
    kassa: [{ id: 'k1', date: '2026-10-05', income: 1, expense: 0 }], expenses: [], logs: [], deletedIds: ['r-del'],
  }],
  ['neon-user-b', {
    reports: [{ id: 'r-b1', date: '2026-10-06', idNumber: '202222', tripsCount: 1, cash: 0, card: 300000, yandex: 0, pochta: 0, createdAt: '2026-10-07T03:00:00Z' }],
    kassa: [], expenses: [], logs: [], deletedIds: [],
  }],
] as const;

test('legacy data is copied into shared tables without touching the old table', async () => {
  const pool = getPool();
  // Safety: only run against an empty database.
  const tables = await pool.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
  assert.equal(tables.rows[0].n, 0, 'Tests need an EMPTY database; refusing to run');
  await pool.query(`CREATE TABLE kassa_app_data (owner_id TEXT PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  for (const [owner, payload] of LEGACY_SEED) {
    await pool.query(`INSERT INTO kassa_app_data (owner_id, payload) VALUES ($1, $2)`, [owner, JSON.stringify(payload)]);
  }
  const anon = new Client();
  const status = await anon.call('GET', '/setup/status');
  assert.equal(status.status, 200);
  const legacy = await pool.query(`SELECT COUNT(*)::int AS n FROM legacy_import`);
  assert.equal(legacy.rows[0].n, 5);
  const old = await pool.query(`SELECT COUNT(*)::int AS n FROM kassa_app_data`);
  assert.equal(old.rows[0].n, 2, 'old table must stay intact');
  const pays = await pool.query(
    `SELECT legacy_id, amount, method, (paid_at AT TIME ZONE 'Asia/Tashkent')::date::text AS day FROM payments
      WHERE legacy_id IS NOT NULL ORDER BY legacy_id`,
  );
  assert.deepEqual(pays.rows, [
    { legacy_id: 'r-a1:card', amount: 250000, method: 'card', day: '2026-10-05' },
    { legacy_id: 'r-a1:cash', amount: 150000, method: 'cash', day: '2026-10-05' },
    { legacy_id: 'r-a1:yandex', amount: 10000, method: 'yandex', day: '2026-10-05' },
    { legacy_id: 'r-b1:card', amount: 300000, method: 'card', day: '2026-10-06' },
  ]);
});

test('setup, roles, shared data, and report math', async () => {
  const admin = new Client();
  const anon = new Client();

  assert.equal((await anon.call('GET', '/payments')).status, 401);
  assert.equal((await admin.call('POST', '/setup', { setupKey: 'wrong', username: 'admin', fullName: 'Admin', password: 'password123' })).status, 403);
  const setup = await admin.call('POST', '/setup', { setupKey: 'test-key', username: 'Admin', fullName: 'Bosh Admin', password: 'password123' });
  assert.equal(setup.status, 200, JSON.stringify(setup.body));
  assert.equal(setup.body.user.role, 'admin');
  assert.equal((await anon.call('POST', '/setup', { setupKey: 'test-key', username: 'xx2', fullName: 'X', password: 'password123' })).status, 409);

  for (const [username, fullName] of [['ali', 'Ali Valiyev'], ['vali', 'Vali Aliyev']]) {
    const r = await admin.call('POST', '/staff', { username, fullName, password: 'worker123', role: 'worker' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  assert.equal((await admin.call('POST', '/staff', { username: 'ali', fullName: 'Dup', password: 'worker123' })).status, 409);

  const ali = new Client();
  const vali = new Client();
  assert.equal((await ali.call('POST', '/auth/login', { username: 'ali', password: 'nope' })).status, 401);
  assert.equal((await ali.call('POST', '/auth/login', { username: 'ALI', password: 'worker123' })).status, 200);
  assert.equal((await vali.call('POST', '/auth/login', { username: 'vali', password: 'worker123' })).status, 200);

  // Validation errors are reported per field.
  const bad = await ali.call('POST', '/payments', { clientCode: '', amount: -5, method: 'crypto' });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['amount', 'clientCode', 'method']);
  // Workers cannot backdate.
  assert.equal((await ali.call('POST', '/payments', { clientCode: 'A1', amount: 1000, method: 'cash', paidAt: '2026-01-01T10:00:00Z' })).status, 400);

  const v0 = (await vali.call('GET', '/version')).body.version;
  const p1 = await ali.call('POST', '/payments', { clientCode: 'lc-777', clientName: 'Karim', amount: 120000, method: 'cash', note: 'Posilka' });
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  assert.equal(p1.body.payment.client_code, 'LC-777');
  await ali.call('POST', '/payments', { clientCode: 'LC-777', amount: 80000, method: 'card' });
  await vali.call('POST', '/payments', { clientCode: 'LC-900', amount: 50000, method: 'card' });
  const toVoid = await vali.call('POST', '/payments', { clientCode: 'LC-900', amount: 999000, method: 'cash' });

  // Vali sees Ali's payments and the version changed (drives live refresh).
  const v1 = (await vali.call('GET', '/version')).body.version;
  assert.notEqual(v0, v1);
  const seenByVali = await vali.call('GET', '/payments', undefined, { from: today, to: today });
  assert.equal(seenByVali.body.items.filter((p: any) => p.created_by_name === 'Ali Valiyev').length, 2);

  // Only admins can void; voided payments drop out of totals.
  assert.equal((await vali.call('POST', `/payments/${toVoid.body.payment.id}/void`, { reason: 'Xato summa' })).status, 403);
  assert.equal((await admin.call('POST', `/payments/${toVoid.body.payment.id}/void`, { reason: 'Xato summa' })).status, 200);
  assert.equal((await admin.call('POST', `/payments/${toVoid.body.payment.id}/void`, { reason: 'Xato summa' })).status, 404);

  const summary = (await ali.call('GET', '/summary', undefined, { from: today, to: today })).body;
  assert.equal(summary.totals.total, 250000);
  assert.equal(summary.totals.cash, 120000);
  assert.equal(summary.totals.card, 130000);
  assert.equal(summary.totals.cash + summary.totals.card, summary.totals.total);
  assert.equal(summary.totals.count, 3);
  assert.equal(summary.byWorker.find((w: any) => w.name === 'Ali Valiyev').total, 200000);
  assert.equal(summary.byWorker.find((w: any) => w.name === 'Vali Aliyev').total, 50000);
  assert.equal(summary.byDay.length, 1);

  // Range totals include migrated legacy payments and match the per-day series.
  const month = (await admin.call('GET', '/summary', undefined, { from: '2026-10-01', to: today })).body;
  assert.equal(month.totals.total, 250000 + 710000);
  assert.equal(month.totals.yandex, 10000);
  assert.equal(month.byDay.reduce((s: number, d: any) => s + d.total, 0), month.totals.total);
  assert.equal(month.byDay.reduce((s: number, d: any) => s + d.cash + d.card + d.yandex + d.pochta, 0), month.totals.total);

  const weeks = (await admin.call('GET', '/periods', undefined, { group: 'week', from: '2026-10-01', to: today })).body;
  assert.equal(weeks.rows.reduce((s: number, r: any) => s + r.total, 0), weeks.totals.total);
  const months = (await admin.call('GET', '/periods', undefined, { group: 'month', from: '2026-10-01', to: today })).body;
  assert.equal(months.rows.reduce((s: number, r: any) => s + r.total, 0), months.totals.total);

  // Client lookup by ID.
  const client = (await vali.call('GET', '/clients/lc-777')).body;
  assert.equal(client.client.full_name, 'Karim');
  assert.equal(client.stats.total, 200000);
  assert.equal(client.payments.length, 2);
  assert.equal((await vali.call('GET', '/clients/NOPE')).status, 404);

  // Workers cannot manage staff or read audit.
  assert.equal((await ali.call('GET', '/staff')).status, 403);
  assert.equal((await ali.call('POST', '/staff', { username: 'hack', fullName: 'Hack', password: 'password123', role: 'admin' })).status, 403);
  assert.equal((await ali.call('GET', '/audit')).status, 403);
  const staff = (await admin.call('GET', '/staff', undefined, { from: today, to: today })).body.items;
  assert.equal(staff.find((s: any) => s.username === 'ali').total, 200000);

  // Last admin cannot lock themselves out; deactivation ends sessions.
  const adminId = setup.body.user.id;
  assert.equal((await admin.call('PATCH', `/staff/${adminId}`, { role: 'worker' })).status, 400);
  const valiId = staff.find((s: any) => s.username === 'vali').id;
  assert.equal((await admin.call('PATCH', `/staff/${valiId}`, { isActive: false })).status, 200);
  assert.equal((await vali.call('GET', '/payments')).status, 401);
  assert.equal((await vali.call('POST', '/auth/login', { username: 'vali', password: 'worker123' })).status, 403);

  // Cross-origin writes are refused.
  const evil = await handleApi({
    method: 'POST', path: '/payments', query: {}, body: { clientCode: 'X', amount: 1, method: 'cash' },
    headers: { cookie: ali.cookie, host: 'kassa.test', origin: 'https://evil.example' },
  });
  assert.equal(evil.status, 403);

  // The database itself refuses to rewrite or delete payments.
  await assert.rejects(getPool().query(`UPDATE payments SET amount = 1 WHERE id = $1`, [p1.body.payment.id]));
  await assert.rejects(getPool().query(`DELETE FROM payments WHERE id = $1`, [p1.body.payment.id]));

  // Lockout after repeated failures.
  const brute = new Client();
  for (let i = 0; i < 5; i++) await brute.call('POST', '/auth/login', { username: 'ali', password: 'bad' });
  assert.equal((await brute.call('POST', '/auth/login', { username: 'ali', password: 'worker123' })).status, 429);
});

test('yandex/pochta payments, expenses and kassa balance', async () => {
  const admin = new Client();
  assert.equal((await admin.call('POST', '/auth/login', { username: 'admin', password: 'password123' })).status, 200);
  // 'ali' is locked out by the previous test, so use a fresh worker.
  assert.equal((await admin.call('POST', '/staff', { username: 'sardor', fullName: 'Sardor', password: 'worker123', role: 'worker' })).status, 201);
  const ali = new Client();
  assert.equal((await ali.call('POST', '/auth/login', { username: 'sardor', password: 'worker123' })).status, 200);

  const before = (await admin.call('GET', '/balance', undefined, { date: today })).body;
  const cur = (src: string, b = before) => b.sources.find((s: any) => s.source === src);

  assert.equal((await ali.call('POST', '/payments', { clientCode: 'LC-1', amount: 40000, method: 'yandex' })).status, 201);
  assert.equal((await ali.call('POST', '/payments', { clientCode: 'LC-1', amount: 25000, method: 'pochta' })).status, 201);
  const summary = (await ali.call('GET', '/summary', undefined, { from: today, to: today })).body;
  assert.equal(summary.totals.yandex, 40000);
  assert.equal(summary.totals.pochta, 25000);
  assert.equal(summary.totals.cash + summary.totals.card + summary.totals.yandex + summary.totals.pochta, summary.totals.total);
  const filtered = (await ali.call('GET', '/payments', undefined, { from: today, to: today, method: 'pochta' })).body;
  assert.equal(filtered.count, 1);

  // Workers cannot see or change the balance.
  assert.equal((await ali.call('GET', '/balance')).status, 403);
  assert.equal((await ali.call('POST', '/expenses', { amount: 1000, source: 'cash', category: 'paket' })).status, 403);
  assert.equal((await ali.call('POST', '/adjustments', { amount: 1000, source: 'cash', note: 'test' })).status, 403);

  const bad = await admin.call('POST', '/expenses', { amount: 0, source: 'yandex', category: 'boshqa', note: '' });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['amount', 'note', 'source']);

  const opening = await admin.call('POST', '/adjustments', { amount: 500000, source: 'cash', note: 'Boshlangʻich qoldiq' });
  assert.equal(opening.status, 201, JSON.stringify(opening.body));
  const e1 = await admin.call('POST', '/expenses', { amount: 30000, source: 'cash', category: 'paket', note: '200 ta paket' });
  assert.equal(e1.status, 201, JSON.stringify(e1.body));
  const e2 = await admin.call('POST', '/expenses', { amount: 15000, source: 'card', category: 'kommunal' });
  assert.equal(e2.status, 201);
  const e3 = await admin.call('POST', '/expenses', { amount: 99000, source: 'cash', category: 'boshqa', note: 'xato' });
  assert.equal((await admin.call('POST', `/expenses/${e3.body.expense.id}/void`, { reason: 'Ikki marta yozilgan' })).status, 200);
  assert.equal((await admin.call('POST', `/expenses/${e3.body.expense.id}/void`, { reason: 'Ikki marta yozilgan' })).status, 404);

  const after = (await admin.call('GET', '/balance', undefined, { date: today })).body;
  assert.equal(cur('cash', after).current, cur('cash').current + 500000 - 30000);
  assert.equal(cur('card', after).current, cur('card').current - 15000);
  assert.equal(cur('yandex', after).current, cur('yandex').current + 40000);
  assert.equal(cur('pochta', after).current, cur('pochta').current + 25000);
  for (const s of after.sources) assert.equal(s.closing, s.opening + s.income - s.expense + s.adjustment);
  assert.equal(cur('cash', after).expense, 30000);
  assert.equal(after.expenses.length, 3);
  assert.equal(after.adjustments.length, 1);
  assert.equal(after.recent.length, 14);
  assert.equal(after.recent[0].day, today);
  assert.equal(after.recent[0].expense, 45000);

  // Yesterday's closing equals today's opening.
  const yesterday = new Date(Date.parse(today) - 86400_000).toISOString().slice(0, 10);
  const prev = (await admin.call('GET', '/balance', undefined, { date: yesterday })).body;
  for (const s of after.sources) assert.equal(prev.sources.find((p: any) => p.source === s.source).closing, s.opening);

  // Ledger rows cannot be deleted or rewritten.
  await assert.rejects(getPool().query(`DELETE FROM expenses WHERE id = $1`, [e1.body.expense.id]));
  await assert.rejects(getPool().query(`UPDATE expenses SET amount = 1 WHERE id = $1`, [e1.body.expense.id]));
  await assert.rejects(getPool().query(`UPDATE balance_adjustments SET amount = 1 WHERE id = $1`, [opening.body.adjustment.id]));
});

test.after(async () => {
  await getPool().end();
});
