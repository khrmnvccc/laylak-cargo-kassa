import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

interface LiveState {
  /** Increments whenever shared data changes on the server (from any device). */
  tick: number;
  online: boolean;
  lastSync: number | null;
  bump: () => void;
}

const LiveContext = createContext<LiveState>({ tick: 0, online: true, lastSync: null, bump: () => undefined });
const POLL_MS = 6000;

export function LiveProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const version = useRef<string | null>(null);

  const check = useCallback(async () => {
    try {
      const { version: v } = await api<{ version: string }>('/version');
      setOnline(true);
      setLastSync(Date.now());
      if (version.current !== null && version.current !== v) setTick((t) => t + 1);
      version.current = v;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setOnline(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, POLL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [check]);

  const bump = useCallback(() => {
    setTick((t) => t + 1);
    void check();
  }, [check]);

  return <LiveContext.Provider value={{ tick, online, lastSync, bump }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

// Last answer per query, so a page opened again shows at once and refreshes in the background.
// The answers are also kept on the device (per user), so the app opens with the last numbers on screen
// instead of a spinner, then quietly brings them up to date.
const cache = new Map<string, unknown>();
const CACHE_MAX = 60;
// Requests already on their way, so two parts of the screen asking the same thing share one request.
const inflight = new Map<string, Promise<unknown>>();
// Answers fetched since the app opened (or since the data last changed); the rest are leftovers from last time.
const fresh = new Set<string>();
const STORE_PREFIX = 'lk_cache:';
const ENTRY_MAX = 400_000; // characters; a very long list is not worth keeping on the device
const STORE_MAX = 3_000_000;
let storeKey: string | null = null;
// Bumped when shared data changes, so an answer asked for before the change never overwrites a newer one.
let generation = 0;
let seenTick = 0;
let saveTimer: number | undefined;

const keyOf = (path: string, query?: object) => `${path}?${JSON.stringify(query || {})}`;

/** Loads this user's saved answers from the device. Safe to call on every render. */
export function loadApiCache(userId: string) {
  const key = STORE_PREFIX + userId;
  if (storeKey === key) return;
  cache.clear();
  fresh.clear();
  inflight.clear();
  generation++;
  storeKey = key;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]') as Array<[string, unknown]>;
    for (const [k, v] of saved) cache.set(k, v);
  } catch {
    // Nothing saved, or storage blocked: start empty.
  }
}

function saveSoon() {
  if (!storeKey) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!storeKey) return;
    const out: Array<[string, unknown]> = [];
    let size = 0;
    // Newest answers first, so the ones dropped for space are the oldest.
    for (const [k, v] of [...cache.entries()].reverse()) {
      const text = JSON.stringify(v);
      if (!text || text.length > ENTRY_MAX || size + text.length > STORE_MAX) continue;
      size += text.length;
      out.push([k, v]);
    }
    try { localStorage.setItem(storeKey, JSON.stringify(out.reverse())); } catch { /* storage full or blocked */ }
  }, 800);
}

export function clearApiCache() {
  cache.clear();
  fresh.clear();
  inflight.clear();
  generation++;
  window.clearTimeout(saveTimer);
  storeKey = null;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(STORE_PREFIX)) localStorage.removeItem(k);
  } catch {
    // Storage blocked.
  }
}

function fetchInto<T>(path: string, query: object | undefined, key: string): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const owner = storeKey;
  const gen = generation;
  const p = api<T>(path, { query: query as Record<string, unknown> | undefined })
    .then((data) => {
      if (storeKey === owner && gen === generation) {
        cache.delete(key);
        cache.set(key, data);
        fresh.add(key);
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
        saveSoon();
      }
      return data;
    })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/** Fetches an answer ahead of time (e.g. for a page not opened yet), unless it is already fresh. */
export function prefetchApi(path: string, query?: object) {
  const key = keyOf(path, query);
  if (fresh.has(key)) return;
  fetchInto(path, query, key).catch(() => undefined);
}

/** Fetches a resource and silently refetches it whenever shared data changes. */
/** keep: on a new query, go on showing the previous answer until the new one arrives instead of blanking the page. */
export function useApi<T>(path: string | null, query?: object, { keep = false }: { keep?: boolean } = {}) {
  const { tick } = useLive();
  const key = path ? keyOf(path, query) : null;
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; key: string | null }>(() => (
    key && cache.has(key) ? { data: cache.get(key) as T, error: null, loading: false, key } : { data: null, error: null, loading: Boolean(path), key: null }
  ));
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!path || !key) return;
    let active = true;
    // Shared data changed: every saved answer may be out of date, not only the ones on screen.
    if (seenTick !== tick) { seenTick = tick; generation++; fresh.clear(); inflight.clear(); }
    // Keep showing previous data on background refreshes; only show loading on a new query.
    setState((s) => (s.key === key ? s
      : cache.has(key) ? { data: cache.get(key) as T, error: null, loading: false, key }
      : keep && s.data ? { ...s, error: null, loading: true, key } : { data: null, error: null, loading: true, key }));
    fetchInto<T>(path, query, key)
      .then((data) => { if (active) setState({ data, error: null, loading: false, key }); })
      .catch((error: Error) => active && setState((s) => ({ ...s, error: error.message, loading: false, key })));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, reloadTick]);

  return { ...state, reload: () => setReloadTick((t) => t + 1) };
}
