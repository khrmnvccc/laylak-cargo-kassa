type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string | string[]): void;
  send(body: string): void;
  end(): void;
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL || process.env.VITE_NEON_AUTH_URL;
  if (!authBaseUrl) return res.status(503).send('Neon Auth is not configured');

  const incomingUrl = new URL(req.url || '/api/auth', 'https://app.invalid');
  const authPath = incomingUrl.pathname.replace(/^\/api\/auth/, '').replace(/^\//, '');
  const upstreamUrl = new URL(`${authBaseUrl.replace(/\/$/, '')}/${authPath}${incomingUrl.search}`);
  const headers = new Headers();
  for (const name of ['content-type', 'cookie', 'origin', 'user-agent']) {
    const value = headerValue(req.headers[name]);
    if (value) headers.set(name, value);
  }

  let body: BodyInit | undefined;
  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    if (typeof req.body === 'string') body = req.body;
    else if (req.body !== undefined) body = JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method || 'GET',
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    });
    const contentType = upstream.headers.get('content-type');
    const setCookies = upstream.headers.getSetCookie?.() || [];
    if (contentType) res.setHeader('Content-Type', contentType);
    if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status).send(await upstream.text());
  } catch (error) {
    console.error('Neon Auth proxy failed', error);
    res.status(502).send('Authentication service is unavailable');
  }
}
