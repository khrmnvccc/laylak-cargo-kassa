import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dataHandler from './api/data';
import authHandler from './api/auth/[...auth]';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '20mb' }));

// Use the same authenticated Neon handlers in local development and on Vercel.
app.all('/api/data', (req, res) => dataHandler(req, res));
app.all('/api/auth/*', (req, res) => authHandler(req, res));
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Laylak Cargo Kassa API', timestamp: new Date().toISOString() });
});

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
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
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
