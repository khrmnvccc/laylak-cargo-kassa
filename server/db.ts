import pg from 'pg';

// One pool per server instance. On Vercel each warm function reuses it.
const globalForPool = globalThis as unknown as { __kassaPool?: pg.Pool; __kassaSchema?: Promise<void> };

// BIGINT (so'm amounts, counts) fits safely in a JS number for our ranges.
pg.types.setTypeParser(20, (value) => Number(value));
// DATE columns stay as plain 'YYYY-MM-DD' strings, never shifted by the server timezone.
pg.types.setTypeParser(1082, (value) => value);

export function getPool(): pg.Pool {
  if (!globalForPool.__kassaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new HttpError(503, 'Database sozlanmagan (DATABASE_URL yo‘q)');
    const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
    globalForPool.__kassaPool = new pg.Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX) || 3,
      idleTimeoutMillis: 10_000,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalForPool.__kassaPool;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Business day boundaries are always computed in Tashkent time (UTC+5, no DST).
export const TZ = 'Asia/Tashkent';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE CHECK (username = lower(username) AND length(username) BETWEEN 3 AND 40),
  full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 2 AND 80),
  role TEXT NOT NULL CHECK (role IN ('admin', 'worker')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  code TEXT PRIMARY KEY CHECK (length(code) BETWEEN 1 AND 40),
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code TEXT NOT NULL REFERENCES clients(code) ON UPDATE CASCADE,
  client_name TEXT,
  amount BIGINT NOT NULL CHECK (amount > 0 AND amount <= 10000000000),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card')),
  note TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  voided_by_name TEXT,
  void_reason TEXT,
  legacy_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON payments(paid_at DESC);
CREATE INDEX IF NOT EXISTS payments_client_idx ON payments(client_code, paid_at DESC);
CREATE INDEX IF NOT EXISTS payments_created_by_idx ON payments(created_by, paid_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details JSONB
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log(at DESC);

-- Untouched copy of every record found in the old per-account storage.
CREATE TABLE IF NOT EXISTS legacy_import (
  owner_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, record_type, record_id)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The browser never connects to the database directly: every request goes through
-- the server API, which checks the session and role. RLS is enabled with no
-- policies so that any non-owner role (for example a leaked read-only key) sees nothing.
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;

-- Payment amounts and authorship can never be rewritten, only voided by an admin.
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.amount <> OLD.amount OR NEW.method <> OLD.method OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.paid_at <> OLD.paid_at OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'payments are append-only; void instead of editing';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payments_guard_trg ON payments;
CREATE TRIGGER payments_guard_trg BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payments_guard();

CREATE OR REPLACE FUNCTION payments_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payments cannot be deleted; void instead';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payments_no_delete_trg ON payments;
CREATE TRIGGER payments_no_delete_trg BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payments_no_delete();
`;

// v2: Yandex and Pochta payment types, expenses (rasxod) and balance adjustments.
const SCHEMA_V2_SQL = `
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('cash', 'card', 'yandex', 'pochta'));

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount BIGINT NOT NULL CHECK (amount > 0 AND amount <= 10000000000),
  source TEXT NOT NULL CHECK (source IN ('cash', 'card')),
  category TEXT NOT NULL CHECK (category IN ('tovar', 'paket', 'yetkazish', 'yoqilgi', 'ijara', 'oylik', 'kommunal', 'inkassa', 'boshqa')),
  note TEXT,
  spent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  voided_by_name TEXT,
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS expenses_spent_at_idx ON expenses(spent_at DESC);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Signed corrections to a balance: the opening balance, a cash count difference, money moved out.
CREATE TABLE IF NOT EXISTS balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('cash', 'card', 'yandex', 'pochta')),
  amount BIGINT NOT NULL CHECK (amount <> 0 AND abs(amount) <= 100000000000),
  note TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS balance_adjustments_at_idx ON balance_adjustments(at DESC);
ALTER TABLE balance_adjustments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION expenses_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.amount <> OLD.amount OR NEW.source <> OLD.source OR NEW.spent_at <> OLD.spent_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'expenses are append-only; void instead of editing';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS expenses_guard_trg ON expenses;
CREATE TRIGGER expenses_guard_trg BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION expenses_guard();

CREATE OR REPLACE FUNCTION ledger_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows cannot be deleted';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS expenses_no_delete_trg ON expenses;
CREATE TRIGGER expenses_no_delete_trg BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION ledger_no_delete();
DROP TRIGGER IF EXISTS adjustments_no_change_trg ON balance_adjustments;
CREATE TRIGGER adjustments_no_change_trg BEFORE UPDATE OR DELETE ON balance_adjustments FOR EACH ROW EXECUTE FUNCTION ledger_no_delete();
`;

const SCHEMA_V3_SQL = `
-- Per-worker rights; NULL means the default worker rights (see server/perms.ts). Admins have all rights.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions TEXT[];

-- One row per arrival: when a person pressed "Keldim" and "Ketdim", and how far from the office they were.
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_at TIMESTAMPTZ,
  in_distance INTEGER,
  in_accuracy INTEGER,
  out_distance INTEGER,
  out_accuracy INTEGER,
  -- "Ketdim" was never pressed; the row was closed the next time the person arrived.
  forgot_out BOOLEAN NOT NULL DEFAULT FALSE,
  edited_by_name TEXT,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out_at IS NULL OR check_out_at >= check_in_at)
);
-- At most one open (not yet checked out) arrival per person.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_open_idx ON attendance(user_id) WHERE check_out_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_in_idx ON attendance(check_in_at DESC);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
`;

// Three levels: owner (Ega, can do everything), admin and worker. Everyone who was an admin so far
// keeps full control by becoming an owner; the owner can then make others plain admins.
const SCHEMA_V4_SQL = `
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
UPDATE app_users SET role = 'owner' WHERE role = 'admin';
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('owner', 'admin', 'worker'));
`;

// Bank receipts read from a photo ("Chek orqali"). Only what was read is kept, never the image;
// key is the bank's transaction number so the same receipt cannot be counted twice.
const SCHEMA_V5_SQL = `
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  bank TEXT,
  transaction_id TEXT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  receipt_paid_at TIMESTAMPTZ,
  sender TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_ids UUID[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
`;

// Parcels with a printed sticker: scanning its code in the kassa shows what the client owes and
// takes the payment. scan_code is digits only so the scanner types it the same in any keyboard layout.
const SCHEMA_V6_SQL = `
CREATE SEQUENCE IF NOT EXISTS orders_scan_seq START 100001;
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_code TEXT NOT NULL UNIQUE,
  client_code TEXT NOT NULL REFERENCES clients(code) ON UPDATE CASCADE,
  client_name TEXT,
  phone TEXT,
  order_no TEXT,
  transport TEXT,
  places INTEGER,
  weight NUMERIC(10, 2),
  amount BIGINT NOT NULL CHECK (amount > 0 AND amount <= 10000000000),
  received_at DATE NOT NULL,
  note TEXT,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_client_idx ON orders(client_code, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
`;

const SCHEMA_VERSION = 6;

export function ensureSchema(): Promise<void> {
  if (!globalForPool.__kassaSchema) {
    globalForPool.__kassaSchema = migrate().catch((error) => {
      globalForPool.__kassaSchema = undefined;
      throw error;
    });
  }
  return globalForPool.__kassaSchema;
}

async function migrate() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent cold starts.
    await client.query('SELECT pg_advisory_xact_lock(424242)');
    const hasMeta = await client.query(`SELECT to_regclass('public.app_meta') AS t`);
    let current = 0;
    if (hasMeta.rows[0].t) {
      const row = await client.query(`SELECT value FROM app_meta WHERE key = 'schema_version'`);
      current = Number(row.rows[0]?.value) || 0;
    }
    if (current < SCHEMA_VERSION) {
      if (current < 1) await client.query(SCHEMA_SQL);
      if (current < 2) await client.query(SCHEMA_V2_SQL);
      if (current < 3) await client.query(SCHEMA_V3_SQL);
      if (current < 4) await client.query(SCHEMA_V4_SQL);
      if (current < 5) await client.query(SCHEMA_V5_SQL);
      if (current < 6) await client.query(SCHEMA_V6_SQL);
      await client.query(
        `INSERT INTO app_meta (key, value) VALUES ('schema_version', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(SCHEMA_VERSION)],
      );
    }
    await importLegacyData(client, 'legacy_import_v1', ['cash', 'card']);
    // Yandex and Pochta amounts became payment types in v2; v1 kept them only in the note.
    await importLegacyData(client, 'legacy_import_v2', ['yandex', 'pochta']);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Old demo records that were seeded into every browser; never real money.
const LEGACY_SAMPLE_IDS = new Set([
  ...Array.from({ length: 8 }, (_, i) => `rep-${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `kas-${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `exp-kas-${i + 1}`),
  'log-init-1', 'log-init-2', 'log-init-3',
]);

/**
 * One-time copy of the old per-account JSON storage (kassa_app_data) into the shared tables.
 * The old table is only read, never modified or dropped.
 */
async function importLegacyData(client: pg.PoolClient, metaKey: string, methods: readonly string[]) {
  const done = await client.query(`SELECT 1 FROM app_meta WHERE key = $1`, [metaKey]);
  if (done.rowCount) return;
  const exists = await client.query(`SELECT to_regclass('public.kassa_app_data') AS t`);
  const summary = { owners: 0, records: 0, paymentsCreated: 0, skippedDeleted: 0, skippedSamples: 0 };

  if (exists.rows[0].t) {
    const rows = await client.query(`SELECT owner_id, payload FROM kassa_app_data`);
    for (const row of rows.rows) {
      summary.owners++;
      const payload = row.payload || {};
      const deleted = new Set<string>(Array.isArray(payload.deletedIds) ? payload.deletedIds : []);
      for (const type of ['reports', 'kassa', 'expenses', 'logs']) {
        for (const record of Array.isArray(payload[type]) ? payload[type] : []) {
          if (!record?.id) continue;
          summary.records++;
          await client.query(
            `INSERT INTO legacy_import (owner_id, record_type, record_id, payload) VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [row.owner_id, type, String(record.id), record],
          );
        }
      }
      for (const report of Array.isArray(payload.reports) ? payload.reports : []) {
        if (!report?.id) continue;
        if (LEGACY_SAMPLE_IDS.has(report.id)) { summary.skippedSamples++; continue; }
        if (deleted.has(report.id)) { summary.skippedDeleted++; continue; }
        const code = String(report.idNumber || '').trim().slice(0, 40) || 'NOMA’LUM';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(report.date) ? report.date : null;
        if (!date) continue;
        const createdAt = Date.parse(report.createdAt || '');
        const extras: string[] = [];
        if (Number(report.tripsCount) > 0) extras.push(`Reyslar: ${Number(report.tripsCount)}`);
        if (report.note) extras.push(String(report.note));
        const note = `Eski tizimdan ko‘chirildi. ${extras.join('. ')}`.trim().slice(0, 500);
        await client.query(
          `INSERT INTO clients (code) VALUES ($1) ON CONFLICT (code) DO NOTHING`,
          [code],
        );
        for (const method of methods) {
          const amount = Math.round(Number(report[method]) || 0);
          if (amount <= 0) continue;
          const inserted = await client.query(
            `INSERT INTO payments (client_code, amount, method, note, paid_at, created_by_name, created_at, legacy_id)
             VALUES ($1, $2, $3, $4,
               CASE WHEN $5::timestamptz IS NOT NULL AND ($5::timestamptz AT TIME ZONE '${TZ}')::date = $6::date
                    THEN $5::timestamptz ELSE ($6::date + time '12:00') AT TIME ZONE '${TZ}' END,
               $7, COALESCE($5::timestamptz, NOW()), $8)
             ON CONFLICT (legacy_id) DO NOTHING`,
            [code, amount, method, note, Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : null, date,
              String(report.createdByName || 'Eski tizim').slice(0, 80), `${report.id}:${method}`],
          );
          summary.paymentsCreated += inserted.rowCount || 0;
        }
      }
    }
  }
  await client.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING`,
    [metaKey, JSON.stringify({ ...summary, at: new Date().toISOString(), sourceTableFound: Boolean(exists.rows[0].t) })],
  );
}
