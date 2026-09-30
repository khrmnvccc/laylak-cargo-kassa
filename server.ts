import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Persistent database file storage location
const DB_FILE = path.join(__dirname, 'cargogo_database.json');

// Initialize database file if not exists
if (!fs.existsSync(DB_FILE)) {
  const initialData = {
    users: [
      { id: '1', username: 'admin', name: 'Asliddin Nurdinov', role: 'admin' }
    ],
    reports: [],
    cash_transactions: [],
    expenses: [],
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
}

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { users: [], reports: [], cash_transactions: [], expenses: [] };
  }
}

function writeDb(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// REST API Endpoints
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'CargoGo Kassa API', timestamp: new Date().toISOString() });
});

app.get('/api/data', (req: Request, res: Response) => {
  const db = readDb();
  res.json(db);
});

app.post('/api/sync', (req: Request, res: Response) => {
  const { reports, kassa, expenses } = req.body;
  const db = readDb();
  if (reports) db.reports = reports;
  if (kassa) db.cash_transactions = kassa;
  if (expenses) db.expenses = expenses;
  db.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ success: true, message: 'Maʻlumotlar saqlandi' });
});

// Production static file serving
if (process.env.NODE_ENV === 'production' || fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

export default app;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`CargoGo Server running on port ${PORT}`);
  });
}
