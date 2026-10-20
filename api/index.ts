import { handleApi } from '../server/router.js';

type VercelRequest = {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string | string[]): void;
  json(body: unknown): void;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Every /api/* request is rewritten here (see vercel.json) so one function serves the whole API.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || '/api', 'https://app.invalid');
  const rewritten = url.searchParams.get('__route');
  const path = '/' + (rewritten ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+/, '');
  url.searchParams.delete('__route');
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) headers[key.toLowerCase()] = first(value);
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const result = await handleApi({
    method: (req.method || 'GET').toUpperCase(),
    path,
    query: Object.fromEntries(url.searchParams.entries()),
    body: body ?? {},
    headers,
  });
  res.setHeader('Cache-Control', 'no-store');
  if (result.cookies?.length) res.setHeader('Set-Cookie', result.cookies);
  res.status(result.status).json(result.body);
}
