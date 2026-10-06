import { neon } from '@neondatabase/serverless';

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
};

type AppData = {
  reports: Array<Record<string, any>>;
  kassa: Array<Record<string, any>>;
  expenses: Array<Record<string, any>>;
  logs: Array<Record<string, any>>;
  deletedIds: string[];
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function timestamp(record: Record<string, any>): number {
  const value = Date.parse(record.updatedAt || record.createdAt || record.timestamp || '');
  return Number.isFinite(value) ? value : 0;
}

function mergeRecords(remote: unknown, local: unknown, deleted: Set<string>) {
  const merged = new Map<string, Record<string, any>>();
  for (const record of Array.isArray(remote) ? remote : []) {
    if (record?.id && !deleted.has(record.id)) merged.set(record.id, record);
  }
  for (const record of Array.isArray(local) ? local : []) {
    if (!record?.id || deleted.has(record.id)) continue;
    const existing = merged.get(record.id);
    if (!existing || timestamp(record) >= timestamp(existing)) merged.set(record.id, record);
  }
  return [...merged.values()];
}

async function getAuthenticatedUser(req: VercelRequest, authBaseUrl: string) {
  const cookie = headerValue(req.headers.cookie);
  if (!cookie) return null;
  const origin = headerValue(req.headers.origin);
  const response = await fetch(`${authBaseUrl.replace(/\/$/, '')}/get-session`, {
    headers: {
      cookie,
      ...(origin ? { origin } : {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const session = await response.json();
  return session?.user?.id ? session.user : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PUT'].includes(req.method || '')) {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const databaseUrl = process.env.DATABASE_URL;
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL || process.env.VITE_NEON_AUTH_URL;
  if (!databaseUrl || !authBaseUrl) {
    return res.status(503).json({ success: false, error: 'Storage is not configured' });
  }

  try {
    const user = await getAuthenticatedUser(req, authBaseUrl);
    if (!user) return res.status(401).json({ success: false, error: 'Sign in required' });

    const sql = neon(databaseUrl);
    await sql`CREATE TABLE IF NOT EXISTS kassa_app_data (
      owner_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT payload, updated_at FROM kassa_app_data WHERE owner_id = ${user.id} LIMIT 1`;
      const payload = rows[0]?.payload || { reports: [], kassa: [], expenses: [], logs: [], deletedIds: [] };
      const updatedAt = rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : '';
      return res.status(200).json({ success: true, ...payload, updatedAt, accounts: [] });
    }

    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Partial<AppData>;
    const rows = await sql`SELECT payload FROM kassa_app_data WHERE owner_id = ${user.id} LIMIT 1`;
    const remote = rows[0]?.payload || {};
    const deletedIds = new Set<string>([
      ...(Array.isArray(remote.deletedIds) ? remote.deletedIds.filter((id: unknown): id is string => typeof id === 'string') : []),
      ...(Array.isArray(body.deletedIds) ? body.deletedIds.filter((id): id is string => typeof id === 'string') : []),
    ]);
    const payload = {
      reports: mergeRecords(remote.reports, body.reports, deletedIds),
      kassa: mergeRecords(remote.kassa, body.kassa, deletedIds),
      expenses: mergeRecords(remote.expenses, body.expenses, deletedIds).filter(
        (record) => !record.sourceKassaId || !deletedIds.has(record.sourceKassaId),
      ),
      logs: mergeRecords(remote.logs, body.logs, deletedIds),
      deletedIds: [...deletedIds],
    };
    const saved = await sql`
      INSERT INTO kassa_app_data (owner_id, payload, updated_at)
      VALUES (${user.id}, ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (owner_id) DO UPDATE
      SET payload = EXCLUDED.payload, updated_at = NOW()
      RETURNING updated_at
    `;
    return res.status(200).json({ success: true, ...payload, updatedAt: new Date(saved[0].updated_at).toISOString() });
  } catch (error) {
    console.error('Neon storage request failed', error);
    return res.status(500).json({ success: false, error: 'Could not sync data' });
  }
}
