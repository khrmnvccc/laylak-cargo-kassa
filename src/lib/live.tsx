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

/** Fetches a resource and silently refetches it whenever shared data changes. */
/** keep: on a new query, go on showing the previous answer until the new one arrives instead of blanking the page. */
export function useApi<T>(path: string | null, query?: object, { keep = false }: { keep?: boolean } = {}) {
  const { tick } = useLive();
  const key = path ? `${path}?${JSON.stringify(query || {})}` : null;
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; key: string | null }>({
    data: null, error: null, loading: Boolean(path), key: null,
  });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!path || !key) return;
    let active = true;
    // Keep showing previous data on background refreshes; only show loading on a new query.
    setState((s) => (s.key === key ? s : keep && s.data ? { ...s, error: null, loading: true, key } : { data: null, error: null, loading: true, key }));
    api<T>(path, { query: query as Record<string, unknown> | undefined })
      .then((data) => active && setState({ data, error: null, loading: false, key }))
      .catch((error: Error) => active && setState((s) => ({ ...s, error: error.message, loading: false, key })));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, reloadTick]);

  return { ...state, reload: () => setReloadTick((t) => t + 1) };
}
