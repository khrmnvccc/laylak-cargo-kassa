import { syncClock } from './format';

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Internet aloqasi yoʻq yoki server javob bermayapti');
  }
  syncClock(response.headers.get('Date'));
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON error page.
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(response.status, data?.error || `Server xatosi (${response.status})`, data?.fields);
  }
  return data as T;
}
