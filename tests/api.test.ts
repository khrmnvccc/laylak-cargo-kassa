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
  assert.equal(setup.body.user.role, 'owner');
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
  // "Karta" in the filters means card, Yandex and Pochta together.
  const cardAll = (await ali.call('GET', '/payments', undefined, { from: today, to: today, method: 'card_all' })).body;
  assert.ok(cardAll.items.every((p: any) => ['card', 'yandex', 'pochta'].includes(p.method)));
  assert.equal(cardAll.total, summary.totals.card + summary.totals.yandex + summary.totals.pochta);

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
  // Yandex and Pochta money counts into the card balance.
  assert.equal(cur('card', after).current, cur('card').current - 15000 + 40000 + 25000);
  assert.deepEqual(after.sources.map((s: any) => s.source), ['cash', 'card']);
  assert.equal(cur('card', after).income_yandex, 40000);
  assert.equal(cur('card', after).income_pochta, 25000);
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

test('client list sorting and admin import', async () => {
  const admin = new Client();
  assert.equal((await admin.call('POST', '/auth/login', { username: 'admin', password: 'password123' })).status, 200);
  const worker = new Client();
  assert.equal((await worker.call('POST', '/auth/login', { username: 'sardor', password: 'worker123' })).status, 200);

  assert.equal((await worker.call('POST', '/clients/import', { rows: [{ code: 'X1' }] })).status, 403);
  const imp = await admin.call('POST', '/clients/import', { rows: [
    { code: 'lc 500', name: 'Jasur', phone: '+998901112233' },
    { code: 'LC-777', name: '', phone: '+998907770000' },
    { code: 'bad id!', name: 'X' },
  ] });
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  assert.equal(imp.body.created, 1);
  assert.equal(imp.body.updated, 1);
  assert.equal(imp.body.skipped, 1);
  const karim = (await admin.call('GET', '/clients/LC-777')).body.client;
  assert.equal(karim.full_name, 'Karim', 'empty name must not erase the existing one');
  assert.equal(karim.phone, '+998907770000');

  const most = (await worker.call('GET', '/clients', undefined, { sort: 'most' })).body;
  const totals = most.items.map((c: any) => c.total);
  assert.deepEqual(totals, [...totals].sort((a: number, b: number) => b - a));
  for (const c of most.items) assert.equal(c.cash + c.card, c.total);
  assert.equal(most.cash + most.card, most.total);
  const least = (await worker.call('GET', '/clients', undefined, { sort: 'least' })).body;
  assert.equal(least.items[0].code, 'LC500');
  assert.equal(least.items[0].total, 0);
  const active = (await worker.call('GET', '/clients', undefined, { sort: 'active' })).body;
  const counts = active.items.map((c: any) => c.count);
  assert.deepEqual(counts, [...counts].sort((a: number, b: number) => b - a));
  assert.equal((await worker.call('GET', '/clients', undefined, { q: 'jasur' })).body.items[0].code, 'LC500');
});

test('payment import from a report skips what the kassa already has', async () => {
  const admin = new Client();
  assert.equal((await admin.call('POST', '/auth/login', { username: 'admin', password: 'password123' })).status, 200);
  const worker = new Client();
  assert.equal((await worker.call('POST', '/auth/login', { username: 'sardor', password: 'worker123' })).status, 200);
  assert.equal((await worker.call('POST', '/payments/import', { rows: [{ date: '2026-10-01', code: 'A1', method: 'cash', amount: 1 }] })).status, 403);

  // 2026-10-05 101111: the legacy seed already holds cash 150000 and card 250000 for that day.
  const rows = [
    { date: '2026-10-05', code: '101111', method: 'cash', amount: 150000, note: 'Reyslar: 3' },
    { date: '2026-10-05', code: '101111', method: 'card', amount: 250000 },
    { date: '2026-10-08', code: '303030', method: 'yandex', amount: 70000, note: 'Reyslar: 1' },
    { date: '2026-10-08', code: '303030', method: 'yandex', amount: 70000 },
    { date: '2026-10-09', code: '303031', method: 'pochta', amount: 25000 },
    { date: '2999-01-01', code: '1', method: 'cash', amount: 5 },
    { date: '2026-10-09', code: '1', method: 'crypto', amount: 5 },
  ];
  const before = (await admin.call('GET', '/summary', undefined, { from: '2026-10-01', to: '2026-10-31' })).body.totals.total;
  const dry = await admin.call('POST', '/payments/import', { rows, dryRun: true });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.adding.count, 3);
  assert.equal(dry.body.adding.total, 165000);
  assert.equal(dry.body.alreadyInKassa, 2);
  assert.equal(dry.body.invalid, 2);
  assert.equal(dry.body.newClients, 2);
  assert.equal((await admin.call('GET', '/summary', undefined, { from: '2026-10-01', to: '2026-10-31' })).body.totals.total, before, 'dry run writes nothing');

  const real = await admin.call('POST', '/payments/import', { rows });
  assert.equal(real.body.adding.count, 3);
  const after = (await admin.call('GET', '/summary', undefined, { from: '2026-10-01', to: '2026-10-31' })).body.totals;
  assert.equal(after.total, before + 165000);
  const day = (await admin.call('GET', '/payments', undefined, { from: '2026-10-08', to: '2026-10-08' })).body.items;
  assert.equal(day.length, 2);
  assert.equal(day[0].created_by_name, 'Excel hisobot');

  const again = await admin.call('POST', '/payments/import', { rows });
  assert.equal(again.body.adding.count, 0, 'uploading the same file twice adds nothing');
  assert.equal(again.body.alreadyInKassa, 5);
});

test('cash book import: opening balance and expenses, safe to repeat', async () => {
  const admin = new Client();
  assert.equal((await admin.call('POST', '/auth/login', { username: 'admin', password: 'password123' })).status, 200);
  const rows = [
    { date: '2026-10-01', kind: 'opening', source: 'cash', amount: 370000 },
    { date: '2026-10-01', source: 'cash', category: 'tovar', amount: 200000, note: 'tovarga' },
    { date: '2026-10-03', source: 'cash', category: 'boshqa', amount: 5000, note: "tog'amga" },
    { date: '2026-10-03', source: 'cash', category: 'boshqa', amount: 5000, note: '' },
    { date: '2026-10-03', source: 'cash', category: 'nimadir', amount: 5000 },
  ];
  const dry = await admin.call('POST', '/expenses/import', { rows, dryRun: true });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.adding.count, 2);
  assert.equal(dry.body.invalid, 2);
  assert.equal(dry.body.opening[0].target, 370000);

  await admin.call('POST', '/expenses/import', { rows });
  const oct1 = (await admin.call('GET', '/balance', undefined, { date: '2026-10-01' })).body;
  const cash = oct1.sources.find((s: any) => s.source === 'cash');
  assert.equal(cash.opening, 370000, 'day opens with the cash book amount');
  assert.equal(cash.expense, 200000);

  const again = await admin.call('POST', '/expenses/import', { rows });
  assert.equal(again.body.adding.count, 0);
  assert.equal(again.body.opening[0].adjustment, 0, 'second upload needs no correction');
  assert.equal((await admin.call('GET', '/balance', undefined, { date: '2026-10-01' })).body.sources.find((s: any) => s.source === 'cash').opening, 370000);
});

test('worker permissions are set by the admin and enforced by the server', async () => {
  const admin = new Client();
  assert.equal((await admin.call('POST', '/auth/login', { username: 'admin', password: 'password123' })).status, 200);
  const created = await admin.call('POST', '/staff', { username: 'nodir', fullName: 'Nodir Karimov', password: 'worker123', role: 'worker' });
  assert.equal(created.status, 201);
  const id = created.body.staff.id;
  const w = new Client();
  const login = await w.call('POST', '/auth/login', { username: 'nodir', password: 'worker123' });
  assert.deepEqual(login.body.user.permissions, ['payments.create', 'reports.view'], 'default worker rights');
  assert.equal((await w.call('GET', '/balance')).status, 403);
  assert.equal((await w.call('GET', '/summary')).status, 200);

  // Take away reports and payment entry, give the balance.
  const upd = await admin.call('PATCH', `/staff/${id}`, { permissions: ['balance.view', 'not-a-right'] });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.deepEqual(upd.body.staff.permissions, ['balance.view']);
  assert.deepEqual((await w.call('GET', '/auth/me')).body.user.permissions, ['balance.view'], 'applies without signing in again');
  assert.equal((await w.call('GET', '/summary')).status, 403);
  assert.equal((await w.call('GET', '/balance')).status, 200);
  assert.equal((await w.call('POST', '/payments', { clientCode: 'P-1', amount: 1000, method: 'cash' })).status, 403);
  const own = await w.call('GET', '/payments');
  assert.equal(own.status, 200);
  assert.equal(own.body.items.length, 0, 'without reports a worker sees only their own payments');

  // Only an admin edits rights; an admin always has every right.
  assert.equal((await w.call('PATCH', `/staff/${id}`, { permissions: ['reports.view'] })).status, 403);
  const me = (await admin.call('GET', '/auth/me')).body.user;
  assert.ok(me.permissions.includes('staff.view') && me.permissions.includes('payments.void'));
});

test('attendance: check in and out near the office only, totals for the admin', async () => {
  const admin = new Client();
  assert.equal((await admin.call('POST', '/auth/login', { username: 'admin', password: 'password123' })).status, 200);
  const w = new Client();
  assert.equal((await w.call('POST', '/auth/login', { username: 'sardor', password: 'worker123' })).status, 200);

  // No office set yet: allowed anywhere.
  assert.equal((await w.call('POST', '/attendance/check-in', {})).status, 201);
  assert.equal((await w.call('POST', '/attendance/check-in', {})).status, 409, 'cannot arrive twice');
  assert.equal((await w.call('POST', '/attendance/check-out', {})).status, 200);
  assert.equal((await w.call('POST', '/attendance/check-out', {})).status, 409, 'nothing open to close');

  assert.equal((await w.call('PUT', '/office', { lat: 41.311, lng: 69.279, radius: 100 })).status, 403);
  assert.equal((await admin.call('PUT', '/office', { lat: 41.311, lng: 69.279, radius: 100 })).status, 200);
  assert.equal((await w.call('POST', '/attendance/check-in', {})).status, 400, 'location required once the office is set');
  const far = await w.call('POST', '/attendance/check-in', { lat: 41.33, lng: 69.279, accuracy: 20 });
  assert.equal(far.status, 403, 'about 2 km away');
  assert.match(far.body.error, /km uzoqdasiz/);
  assert.equal((await w.call('POST', '/attendance/check-in', { lat: 41.3115, lng: 69.2792, accuracy: 15 })).status, 201);
  const me = (await w.call('GET', '/attendance/me')).body;
  assert.ok(me.open && me.officeSet);
  assert.equal(me.items.length, 2);

  assert.equal((await w.call('GET', '/attendance')).status, 403, 'workers do not see everyone by default');
  const all = await admin.call('GET', '/attendance', undefined, { from: today, to: today });
  assert.equal(all.status, 200);
  assert.equal(all.body.items.filter((r: any) => r.user_name === 'Sardor Rahimov' || r.user_id === me.open.user_id).length, 2);

  // The admin fixes a forgotten "Ketdim".
  const inAt = new Date(Date.now() - 3 * 3600_000).toISOString();
  const outAt = new Date(Date.now() - 3600_000).toISOString();
  const fix = await admin.call('PATCH', `/attendance/${me.open.id}`, { checkInAt: inAt, checkOutAt: outAt });
  assert.equal(fix.status, 200, JSON.stringify(fix.body));
  assert.equal((await admin.call('PATCH', `/attendance/${me.open.id}`, { checkInAt: outAt, checkOutAt: inAt })).status, 400);
  assert.equal((await w.call('GET', '/attendance/me')).body.open, null);

  // A forgotten "Ketdim" from an earlier day does not block today's "Keldim".
  const uid = me.open.user_id;
  await getPool().query(`INSERT INTO attendance (user_id, check_in_at) VALUES ($1, NOW() - interval '2 days')`, [uid]);
  assert.equal((await w.call('POST', '/attendance/check-in', { lat: 41.311, lng: 69.279, accuracy: 10 })).status, 201);
  const old = await getPool().query(`SELECT forgot_out, check_out_at = check_in_at AS zero FROM attendance WHERE user_id = $1 AND check_in_at < NOW() - interval '1 day'`, [uid]);
  assert.deepEqual(old.rows, [{ forgot_out: true, zero: true }]);
});

test.after(async () => {
  await getPool().end();
});

test('roles: the owner manages admins, an admin is limited by the owner and manages only workers', async () => {
  const owner = new Client();
  assert.equal((await owner.call('POST', '/auth/login', { username: 'admin', password: 'password123' })).status, 200);
  const made = await owner.call('POST', '/staff', { username: 'bobur', fullName: 'Bobur Aliyev', password: 'worker123', role: 'admin' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const adminId = made.body.staff.id;
  const adm = new Client();
  const login = await adm.call('POST', '/auth/login', { username: 'bobur', password: 'worker123' });
  assert.equal(login.body.user.role, 'admin');
  assert.ok(login.body.user.permissions.includes('staff.manage'), 'a new admin starts with every right');

  // The owner takes the balance away from the admin.
  const all = login.body.user.permissions.filter((p: string) => p !== 'balance.view');
  assert.equal((await owner.call('PATCH', `/staff/${adminId}`, { permissions: all })).status, 200);
  assert.equal((await adm.call('GET', '/balance')).status, 403);

  // The admin manages workers, but cannot give rights they lack, touch admins or the owner, or make admins.
  const worker = await adm.call('POST', '/staff', { username: 'kamol', fullName: 'Kamol', password: 'worker123', role: 'worker' });
  assert.equal(worker.status, 201);
  assert.equal((await adm.call('PATCH', `/staff/${worker.body.staff.id}`, { permissions: ['payments.void'] })).status, 200);
  assert.equal((await adm.call('PATCH', `/staff/${worker.body.staff.id}`, { permissions: ['balance.view'] })).status, 403);
  assert.equal((await adm.call('POST', '/staff', { username: 'boss2', fullName: 'Boss', password: 'worker123', role: 'admin' })).status, 403);
  assert.equal((await adm.call('PATCH', `/staff/${worker.body.staff.id}`, { role: 'owner' })).status, 403);
  const ownerId = (await owner.call('GET', '/auth/me')).body.user.id;
  assert.equal((await adm.call('PATCH', `/staff/${ownerId}`, { isActive: false })).status, 403);
  assert.equal((await adm.call('PUT', '/office', { office: null })).status, 200, 'staff.manage sets the office');

  // The last owner stays an owner.
  assert.equal((await owner.call('PATCH', `/staff/${ownerId}`, { role: 'admin' })).status, 400);
  // Promoting to owner gives everything back; demoting again starts from full admin rights.
  assert.equal((await owner.call('PATCH', `/staff/${adminId}`, { role: 'owner' })).status, 200);
  assert.equal((await adm.call('GET', '/balance')).status, 200);
  const back = await owner.call('PATCH', `/staff/${adminId}`, { role: 'admin' });
  assert.equal(back.status, 200);
  assert.ok(back.body.staff.permissions.includes('balance.view'));
});
