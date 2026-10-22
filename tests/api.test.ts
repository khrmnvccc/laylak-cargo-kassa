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

// Every payment now carries a picture of the orders (a tiny but real PNG).
const PHOTOS = ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='];
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
  const bad = await ali.call('POST', '/payments', { photos: PHOTOS, clientCode: '', amount: -5, method: 'crypto' });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['amount', 'clientCode', 'method']);
  // No picture of the orders, no payment.
  const noPhoto = await ali.call('POST', '/payments', { clientCode: 'A1', amount: 1000, method: 'cash' });
  assert.equal(noPhoto.status, 400);
  assert.deepEqual(Object.keys(noPhoto.body.fields), ['photos']);
  assert.equal((await ali.call('POST', '/payments', { photos: ['data:text/html;base64,PGI+'], clientCode: 'A1', amount: 1000, method: 'cash' })).body.fields.photos, 'Rasm ochilmadi yoki juda katta. Boshqa rasm tanlang');
  // Workers cannot backdate.
  assert.equal((await ali.call('POST', '/payments', { photos: PHOTOS, clientCode: 'A1', amount: 1000, method: 'cash', paidAt: '2026-01-01T10:00:00Z' })).status, 400);

  const v0 = (await vali.call('GET', '/version')).body.version;
  const p1 = await ali.call('POST', '/payments', { photos: PHOTOS, clientCode: 'lc-777', clientName: 'Karim', amount: 120000, method: 'cash', note: 'Posilka' });
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  assert.equal(p1.body.payment.client_code, 'LC-777');
  await ali.call('POST', '/payments', { photos: PHOTOS, clientCode: 'LC-777', amount: 80000, method: 'card' });
  await vali.call('POST', '/payments', { photos: PHOTOS, clientCode: 'LC-900', amount: 50000, method: 'card' });
  const toVoid = await vali.call('POST', '/payments', { photos: PHOTOS, clientCode: 'LC-900', amount: 999000, method: 'cash' });

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
    method: 'POST', path: '/payments', query: {}, body: { photos: PHOTOS, clientCode: 'X', amount: 1, method: 'cash' },
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

  assert.equal((await ali.call('POST', '/payments', { photos: PHOTOS, clientCode: 'LC-1', amount: 40000, method: 'yandex' })).status, 201);
  assert.equal((await ali.call('POST', '/payments', { photos: PHOTOS, clientCode: 'LC-1', amount: 25000, method: 'pochta' })).status, 201);
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
  assert.equal((await w.call('POST', '/payments', { photos: PHOTOS, clientCode: 'P-1', amount: 1000, method: 'cash' })).status, 403);
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

test('telegram: owner connects a bot, gets void alerts, the evening report and a backup', async () => {
  const sent: Array<{ method: string; body: any }> = [];
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  globalThis.fetch = (async (url: string, init: any) => {
    const method = String(url).split('/').pop()!;
    const body = init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(init.body);
    sent.push({ method, body });
    const result = method === 'getMe' ? { username: 'laylak_test_bot' }
      : method === 'getUpdates' ? [{ message: { text: `/start ${codeSeen}`, chat: { id: 777, type: 'private', first_name: 'Ega' } } }]
      : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  }) as typeof fetch;
  let codeSeen = '';
  try {
    const owner = new Client();
    assert.equal((await owner.call('POST', '/auth/login', { username: 'admin', password: 'password123' })).status, 200);
    const w = new Client();
    assert.equal((await w.call('POST', '/auth/login', { username: 'sardor', password: 'worker123' })).status, 200);
    assert.equal((await w.call('GET', '/telegram')).status, 403);
    assert.equal((await w.call('GET', '/backup')).status, 403);

    assert.equal((await owner.call('PUT', '/telegram', { token: 'bad' })).status, 400);
    const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1';
    const put = await owner.call('PUT', '/telegram', { token });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.telegram.connected, false);
    codeSeen = put.body.telegram.code;
    const check = await owner.call('POST', '/telegram/check');
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.deepEqual([check.body.telegram.connected, check.body.telegram.chatName], [true, 'Ega']);
    assert.ok(!JSON.stringify(check.body).includes(token), 'token never goes back to the browser');
    assert.ok(!JSON.stringify((await owner.call('GET', '/system')).body).includes(token));

    // Cancelling a payment alerts the owner.
    const pay = await owner.call('POST', '/payments', { photos: PHOTOS, clientCode: 'TG-1', amount: 55000, method: 'cash' });
    // The orders picture goes to the admin with the type and sum.
    assert.equal(pay.body.telegram, 'sent');
    const photo = sent.find((x) => x.method === 'sendPhoto');
    assert.ok(photo && photo.body.photo instanceof Blob);
    assert.match(photo.body.caption, /💵 <b>Naqd · 55 000 soʻm<\/b>\nTG-1/);
    sent.length = 0;
    assert.equal((await owner.call('POST', `/payments/${pay.body.payment.id}/void`, { reason: 'xato kiritildi' })).status, 200);
    assert.equal(sent[0]?.method, 'sendMessage');
    assert.match(sent[0].body.text, /bekor qilindi[\s\S]*55 000 soʻm[\s\S]*xato kiritildi/);

    // Backup: every table, without passwords or the token.
    const backup = await owner.call('GET', '/backup');
    assert.equal(backup.status, 200);
    const { gunzipSync } = await import('node:zlib');
    const dump = JSON.parse(gunzipSync(Buffer.from(backup.body.data, 'base64')).toString());
    assert.ok(dump.tables.payments.length > 0 && dump.tables.attendance && dump.tables.clients);
    assert.ok(!('app_sessions' in dump.tables));
    assert.ok(!JSON.stringify(dump).includes('scrypt$') && !JSON.stringify(dump).includes(token));

    // The cron: secret checked, nothing before 20:00 Tashkent, then exactly one report a day.
    process.env.CRON_SECRET = 'cron-test';
    const cron = (auth?: string) => handleApi({ method: 'GET', path: '/cron/daily', query: {}, body: {}, headers: { authorization: auth } }) as Promise<{ status: number; body: any }>;
    assert.equal((await cron()).status, 401);
    const day = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    Date.now = () => Date.parse(`${day}T10:00:00Z`); // 15:00 in Tashkent
    assert.equal((await cron('Bearer cron-test')).body.reason, 'early');
    Date.now = () => Date.parse(`${day}T16:05:00Z`); // 21:05 in Tashkent
    sent.length = 0;
    const first = await cron('Bearer cron-test');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.sent, true);
    assert.deepEqual(sent.map((s) => s.method), ['sendMessage', 'sendDocument']);
    assert.match(sent[0].body.text, /Jami:[\s\S]*Davomat/);
    assert.equal((await cron('Bearer cron-test')).body.reason, 'already-sent');
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
    delete process.env.CRON_SECRET;
  }
});

// What on-device OCR returned for a real Alif receipt and the orders screen (names changed).
const OCR_RECEIPT = `13:22 0 @® пс
< Электронный чек
(A alif
Отп авитель Karimova |.
ю UZCARD**4168
Получатель Ainiwaer A.
у UZCARD**4096
Номер транзакции 477924487
Дата и время 22.10.2026 13:22
Сумма 44 600 сум
Комиссия 200,7 сум
Итого 44 800,7 сум
ЭЛЕКТРОННЫЙ ПЛАТЕЖ
ИСПОЛНЕНО`;
const OCR_ORDERS = [
  `MUOZ KOD BUYURTMA N= USUL POS VAZN SUMMA KUTISH AMAL
Karimova lroda TTT-182315 Buyurtma Ne 369383 A Avia 1 8.1 kg 11 868 so’‘m © soxun
Karimova Iroda $SS-102315 Buyurtma N2 873487 Avto 1 0.4 kg 32 808 so'm © s9xun [© Noga |
2 tabuyurtma Kutilayotgan 44 600 so’‘m`,
  `Karimova lroda TTT-182315 Buyurtma № 369383 A Avia 1 0.1 kg 11 860 so'm
Karimova Iroda SSS-1082315 Buyurtma № 873487 Avto 1 0.4 kg 32 800 so'm
2 ta buyurtma Kutilayotgan 44 600 so'm`,
  `Karimova Iroda TTT-102315 Buyurtma № 369383 A Avia 1 0.1 kg 11 868 so'm
Karimova Iroda SSSS-102315 Buyurtma № 873487 Avto 1 0.4 kg 32 808 so'm
Kutilayotgan 44 600 so'm`,
];

test('receipt reading: OCR text becomes fields, misread digits are fixed by the receipt sum', async () => {
  const { parseReceipt, parseOrders, voteOrders, reconcile, codeVariants, clientCodeOf } = await import('../src/lib/receiptParse.js');
  const r = parseReceipt(OCR_RECEIPT);
  assert.deepEqual(
    [r.bank, r.transactionId, r.amount, r.commission, r.total, r.paidAt, r.sender, r.senderCard, r.recipientCard],
    ['Alif', '477924487', 44600, 200.7, 44800.7, '2026-10-22T13:22', 'Karimova I.', 'UZCARD**4168', 'UZCARD**4096'],
  );
  // Other bank layouts: Uzbek labels, one total only.
  const click = parseReceipt(`CLICK\nToʻlov muvaffaqiyatli\nTranzaksiya ID: 9087766501\n05.10.2026 09:41\n120 000 soʻm\nKarta: HUMO *** 1122`);
  assert.deepEqual([click.bank, click.transactionId, click.amount, click.paidAt], ['Click', '9087766501', 120000, '2026-10-05T09:41']);

  const voted = voteOrders(OCR_ORDERS.map(parseOrders));
  assert.equal(voted.orders.length, 2, 'the heading row is not an order');
  assert.equal(voted.total, 44600);
  assert.deepEqual(voted.orders.map((o) => [o.orderNo, o.transport]), [['369383', 'Avia'], ['873487', 'Avto']]);
  assert.deepEqual(reconcile(voted.orders.map((o) => o.amount!), r.amount!), [11800, 32800]);
  assert.equal(reconcile([11800, 32800], 44600)!.join(), '11800,32800', 'correct sums stay as they are');
  assert.equal(clientCodeOf('SSS-102315'), '102315');
  assert.ok(codeVariants('182315').includes('102315'));
  assert.ok(voted.codeReadings[0].map(clientCodeOf).includes('102315'));
});

// OCR output of receipts from different apps (names and sender cards changed).
const BANK_RECEIPTS: Array<[string, string, Partial<Record<'amount' | 'transactionId' | 'paidAt' | 'senderCard' | 'commission', unknown>>]> = [
  ['Click', `17:15 wll = ©\nO'tkazma amalga oshirildi\n21 okt 17:15\nI\n460 200 so'm\nKomissiya: 5 062,20 so'm\nIS AINIWAER A. X.\nOclick 561468****4096`,
    { amount: 460200, commission: 5062.2, paidAt: '2026-10-21T17:15', transactionId: null }],
  ['Uzum', `13:57 Uzum Bank all = [47]\nSana\n21.10.2026 13:57\nYuborilgan\n106 200 so'm\nKomissiya\n955,8 so'm\nPul yechildi\n107 155,8 so'm\nYuboruvchi\nSevara Aliyeva ---- 1111\nQabul giluvehi\nAiniwaer Aierpati Xxx ---- 4096\nE Kvitansiya\nEl Fiskal chek`,
    { amount: 106200, paidAt: '2026-10-21T13:57', senderCard: '**1111' }],
  ['Ipak', `18:19 wl @ 0)\nIpak Yuli Mobile ©)\nSana 20.10.2026\nKartadan VISA **** 2222\nKartaga Ш ****4096\nQabul giluvchi AINIWAER A.X.\nYechiladigan summa 30 225 075\nQabul gilinadigan summa 30 000 UzZs\nKomissiya summasi 225 0275\nJami 30 225 UZS`,
    { amount: 30000, commission: 225, paidAt: '2026-10-20', senderCard: 'VISA**2222' }],
  ['Payme', `19:23 ® и all = ED\nNBU\n385 191 сум\nv/ Оплачено\n18.10.2026 19:23\nКарта получателя: 561468******4096\nПолучатель: Aierpati A. X.\nСтоимость услуги: 4 191.00 сум\nк U **** 3333\nарта: :\nKapital bank`,
    { amount: 381000, commission: 4191, paidAt: '2026-10-18T19:23', senderCard: '**3333' }],
  ['NBU', `KVITANSIYA PP2629256DZF Mm\n2026-1020\n17:07:50\nVALIYEV ANVAR | 4.5. gion ye —\n$ а 561468*+++***12 . 561 468******+*96\nraed 20.10.2026 17:07 MUVAFFAQIYATLITOLANDI : 3 tegobuse 7 НО\nКЕКС 557 600.00 см meas iE`,
    { amount: 557600, transactionId: 'PP2629256DZF', paidAt: '2026-10-20T17:07' }],
  ['Kapital', `14:28 4 all = ©2\n20 октября, 2026\n(s На сумовые карты\n232 200 сум\nПолучатель: AINIWAER А1ЕВРАТ| XXX`, { amount: 232200, paidAt: '2026-10-20' }],
  ['Hamkor', `O'tkazma\nMuvaffagiyatli\nYuboruvchining ismi\nGULNORA S.\nYuboruvchi\n5614 68** **** 4444\nQabul giluvchining ismi\nAINIWAER AIERPATI X.\nQabul giluvchi\n5614 68** **** 4096\nTushum summasi\n280 000 UZS\nKomissiya\n2 800 UZS\nTranzaksiya sanasi\n20.10.2026 11:48\nTranzaksiya ragami О\n1e47a8d5-1400-4b1d-b672-123ce40a7404 Е`,
    { amount: 280000, commission: 2800, paidAt: '2026-10-20T11:48', senderCard: '**4444', transactionId: '1e47a8d5-1400-4b1d-b672-123ce40a7404' }],
  ['Paynet', `294 000 сум\n20 октября 2026 г. 10:58\n@ Операция выполнена\nИмя получателя Ainiwaer Aierpati Xxx\nНомер транзакции 100933041850\nКомиссия О сум\nСумма 294 000 сум\nПолучателю зачислится 294 000 сум`,
    { amount: 294000, paidAt: '2026-10-20T10:58', transactionId: '100933041850' }],
  ['Zoomrad', `Qabul giluvchi AINIWAER A X\nKartaga 5614 68** **** 4096\nKartadan 5614 68** **** 5555\nVaqt 2026-10-19 17:19\nID tranzaksiya 032137420854\nMerchant 903100000038004\nTerminal 97015508\nKomissiya 2500\nSumma 500 000 so'm`,
    { amount: 500000, commission: 2500, paidAt: '2026-10-19T17:19', senderCard: '**5555', transactionId: '032137420854' }],
  ['Anor', `Muvaffaqiyatli to'lov\nServis\nUzcard kartalari o‘rtasida o‘tkazma\nQabul giluvchi F.I.SH\nAIERPATI A.\nQabul giluvchi\n56146819****4096\nSumma\n49 200,00 UZS`, { amount: 49200, paidAt: null }],
  ['Uzum short', `15:21 # Uzum Bank Wo! LTE (97 |\nTayyor\nO'tkazildi\n94 400 so'm\nAiniwaer Aierpati Xxx\nо 4096\nxaridlarga 7% kesh че ’ 30k`, { amount: 94400, paidAt: null }],
  ['Photo', `| 201020261213 ;\n3 Имя получателя :\nAINIWAER АТЕВРАТТ XXX а\n- Ч Имя отправителя |\n- 1 Отправитель :\n491699"*****6666`, { paidAt: '2026-10-20T12:13', senderCard: '**6666' }],
];

test('receipt reading: every bank app layout gives the sum, number, date and card', async () => {
  const { parseReceipt } = await import('../src/lib/receiptParse.js');
  for (const [bank, text, want] of BANK_RECEIPTS) {
    const r = parseReceipt(text) as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(want)) assert.deepEqual(r[k], v, `${bank}: ${k}`);
  }
});

test('receipts: checked receipt becomes card payments, once', async () => {
  const receipt = { bank: 'Alif', transactionId: '477924487', amount: 44600, paidAt: '2026-10-22T13:22', sender: 'Karimova I.', senderCard: 'UZCARD**4168' };
  const orders = [
    { clientCode: '102315', clientName: 'Karimova Iroda', code: 'TTT-102315', orderNo: '369383', transport: 'Avia', amount: 11800 },
    { clientCode: '102315', clientName: 'Karimova Iroda', code: 'SSS-102315', orderNo: '873407', transport: 'Avto', amount: 32800 },
  ];
  const w = new Client();
  assert.equal((await w.call('POST', '/auth/login', { username: 'sardor', password: 'worker123' })).status, 200);

  const before = await w.call('POST', '/receipts/check', { receipt, codes: ['102315', '182315'] });
  assert.equal(before.status, 200, JSON.stringify(before.body));
  assert.deepEqual([before.body.duplicate, before.body.clients], [null, {}]);

  const short = await w.call('POST', '/receipts/confirm', { receipt, method: 'card', orders: orders.slice(0, 1) });
  assert.equal(short.status, 400);
  assert.match(short.body.error, /teng emas/);

  const ok = await w.call('POST', '/receipts/confirm', { receipt, method: 'card', orders, photos: [...PHOTOS, ...PHOTOS] });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.payments.length, 1, 'one payment per client');
  const p = ok.body.payments[0];
  assert.deepEqual([p.client_code, Number(p.amount), p.method, p.client_name], ['102315', 44600, 'card', 'Karimova Iroda']);
  assert.match(p.note, /Alif №477924487.*№369383 Avia TTT-102315, №873407 Avto SSS-102315/);

  // Now the client is known, and the same receipt is refused.
  const after = await w.call('POST', '/receipts/check', { receipt, codes: ['102315', '182315'] });
  assert.ok(after.body.duplicate);
  assert.deepEqual(Object.keys(after.body.clients), ['102315']);
  assert.equal(after.body.clients['102315'].count, 1);
  assert.equal((await w.call('POST', '/receipts/confirm', { receipt, method: 'card', orders })).status, 409);

  // After the payment is cancelled the receipt can be entered again.
  const owner = new Client();
  await owner.call('POST', '/auth/login', { username: 'admin', password: 'password123' });
  assert.equal((await owner.call('POST', `/payments/${p.id}/void`, { reason: 'qayta kiritiladi' })).status, 200);
  assert.equal((await owner.call('POST', '/receipts/confirm', { receipt, method: 'card', orders })).status, 201);
  assert.equal((await owner.call('POST', '/receipts/confirm', { receipt, method: 'card', orders })).status, 409);
});
