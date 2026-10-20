import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApi } from './server/router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

// Local development / self-hosting: the same handler Vercel runs in api/index.ts.
app.all('/api/*', async (req, res) => {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.query)) query[key] = typeof value === 'string' ? value : undefined;
  const result = await handleApi({
    method: req.method.toUpperCase(),
    path: req.path.replace(/^\/api/, '') || '/',
    query,
    body: req.body ?? {},
    headers,
  });
  res.setHeader('Cache-Control', 'no-store');
  if (result.cookies?.length) res.setHeader('Set-Cookie', result.cookies);
  res.status(result.status).json(result.body);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Laylak Cargo Kassa: http://localhost:${PORT}`));
}

startServer().catch((err) => {
  console.error('Server start error:', err);
  process.exit(1);
});
