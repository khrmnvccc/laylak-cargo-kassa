import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '20mb' }));

// Persistent database file storage location
const DB_FILE = path.join(__dirname, 'laylak_cargo_database.json');

interface DatabaseSchema {
  reports: any[];
  kassa: any[];
  expenses: any[];
  accounts: any[];
  logs: any[];
  updatedAt: string;
  version: number;
}

// Initial seed matching current state
function getInitialData(): DatabaseSchema {
  return {
    reports: [],
    kassa: [],
    expenses: [],
    accounts: [],
    logs: [],
    updatedAt: new Date().toISOString(),
    version: 3,
  };
}

function readDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = getInitialData();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      kassa: Array.isArray(parsed.kassa) ? parsed.kassa : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      version: parsed.version || 3,
    };
  } catch (err) {
    console.error('Error reading database file:', err);
    return getInitialData();
  }
}

function writeDb(data: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to database file:', err);
  }
}

// REST API Endpoints
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Laylak Cargo Kassa API',
    timestamp: new Date().toISOString(),
  });
});

// Full state fetch for cross-device synchronization
app.get('/api/data', (req: Request, res: Response) => {
  const db = readDb();
  res.json({
    success: true,
    ...db,
  });
});

// Sync endpoint to update server state
app.post('/api/sync', (req: Request, res: Response) => {
  try {
    const { reports, kassa, expenses, accounts, logs } = req.body;
    const db = readDb();

    if (Array.isArray(reports)) db.reports = reports;
    if (Array.isArray(kassa)) db.kassa = kassa;
    if (Array.isArray(expenses)) db.expenses = expenses;
    if (Array.isArray(accounts)) db.accounts = accounts;
    if (Array.isArray(logs)) db.logs = logs;

    db.updatedAt = new Date().toISOString();
    writeDb(db);

    res.json({
      success: true,
      updatedAt: db.updatedAt,
      message: 'Maʼlumotlar serverda saqlandi',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Quick push for a single item (reports, kassa, expense)
app.post('/api/records/kassa', (req: Request, res: Response) => {
  try {
    const newRecord = req.body;
    if (!newRecord || !newRecord.id) {
      return res.status(400).json({ success: false, error: 'Yaroqsiz maʼlumot' });
    }
    const db = readDb();
    const existingIndex = db.kassa.findIndex((k) => k.id === newRecord.id);
    if (existingIndex >= 0) {
      db.kassa[existingIndex] = newRecord;
    } else {
      db.kassa.unshift(newRecord);
    }
    db.updatedAt = new Date().toISOString();
    writeDb(db);
    res.json({ success: true, record: newRecord, updatedAt: db.updatedAt });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/records/report', (req: Request, res: Response) => {
  try {
    const newRecord = req.body;
    if (!newRecord || !newRecord.id) {
      return res.status(400).json({ success: false, error: 'Yaroqsiz maʼlumot' });
    }
    const db = readDb();
    const existingIndex = db.reports.findIndex((r) => r.id === newRecord.id);
    if (existingIndex >= 0) {
      db.reports[existingIndex] = newRecord;
    } else {
      db.reports.unshift(newRecord);
    }
    db.updatedAt = new Date().toISOString();
    writeDb(db);
    res.json({ success: true, record: newRecord, updatedAt: db.updatedAt });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mount Vite in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Laylak Cargo Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server start error:', err);
  process.exit(1);
});

export default app;
