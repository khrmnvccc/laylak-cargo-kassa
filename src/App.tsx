import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiError, onUnauthorized } from './lib/api';
import { AuthContext } from './lib/auth';
import { clearApiCache, LiveProvider, loadApiCache } from './lib/live';
import { prefetchFirstScreens } from './lib/prefetch';
import { useRoute } from './lib/router';
import { useTheme } from './lib/theme';
import { canSee, homePage, isPaused } from './lib/perms';
import type { User } from './lib/types';
import { Layout } from './components/Layout';
import { InstallPrompt } from './components/InstallPrompt';
import { Card, EmptyState, ErrorState, ToastProvider } from './components/ui';
import { Wrench } from 'lucide-react';
import { href } from './lib/router';
import { LoginPage } from './pages/Login';

const loaders = {
  dashboard: () => import('./pages/Dashboard'),
  kassa: () => import('./pages/Kassa'),
  orders: () => import('./pages/Orders'),
  operations: () => import('./pages/Operations'),
  daily: () => import('./pages/DailyReport'),
  periods: () => import('./pages/PeriodReport'),
  workers: () => import('./pages/Workers'),
  balance: () => import('./pages/Balance'),
  clients: () => import('./pages/Clients'),
  attendance: () => import('./pages/Attendance'),
  settings: () => import('./pages/Settings'),
};
const pages = Object.fromEntries(Object.entries(loaders).map(([k, load]) => [k, lazy(load)])) as { [K in keyof typeof loaders]: ReturnType<typeof lazy> };

// Fetch the opened page's code while the session check is still on its way, then the rest when idle,
// so moving between pages never waits for a download.
const firstPage = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] as keyof typeof loaders;
loaders[firstPage]?.().catch(() => undefined);
function preloadPages(user: User) {
  const run = () => {
    Object.values(loaders).forEach((load) => load().catch(() => undefined));
    import('./components/RevenueChart').catch(() => undefined);
    prefetchFirstScreens(user);
  };
  if ('requestIdleCallback' in window) (window as any).requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

// The signed-in person from last time, so the app opens straight onto its pages while the session is
// checked in the background (the server still checks every request; this only decides what to draw first).
const ME_KEY = 'lk_me';
function savedUser(): User | null {
  try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch { return null; }
}
function saveUser(user: User | null) {
  try { if (user) localStorage.setItem(ME_KEY, JSON.stringify(user)); else localStorage.removeItem(ME_KEY); } catch { /* blocked */ }
}

type Boot = { state: 'loading' } | { state: 'error'; message: string } | { state: 'anon'; needsSetup: boolean; setupKeyConfigured: boolean } | { state: 'ready'; user: User };

/** Shown in place of a page that is switched off for now (PAUSED_PAGES). */
function PausedPage() {
  return (
    <Card className="mx-auto mt-6 max-w-lg">
      <EmptyState
        icon={<Wrench className="size-5" />}
        title="Vaqtincha ishlamayapti"
        description="Bu boʻlim hozircha yopiq, ustida ish olib borilmoqda. Tez orada qayta ochiladi."
        action={<a href={href('dashboard')} className="text-sm font-medium text-primary hover:underline">Bosh sahifaga qaytish</a>}
      />
    </Card>
  );
}

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center text-ink-3">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

export default function App() {
  useTheme();
  const [boot, setBoot] = useState<Boot>(() => {
    const user = savedUser();
    return user?.id ? { state: 'ready', user } : { state: 'loading' };
  });
  const route = useRoute();

  const load = useCallback(async () => {
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      saveUser(user);
      setBoot({ state: 'ready', user });
      preloadPages(user);
    } catch (error) {
      // Opened from last time and only the network failed: stay in the app; it catches up when back online.
      if (!(error instanceof ApiError && error.status === 401) && savedUser()) return;
      if (error instanceof ApiError && error.status === 401) {
        saveUser(null);
        clearApiCache();
        try {
          const status = await api<{ needsSetup: boolean; setupKeyConfigured: boolean }>('/setup/status');
          setBoot({ state: 'anon', ...status });
        } catch (e) {
          setBoot({ state: 'error', message: (e as Error).message });
        }
      } else {
        setBoot({ state: 'error', message: (error as Error).message });
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const off = onUnauthorized(() => { saveUser(null); clearApiCache(); setBoot({ state: 'anon', needsSetup: false, setupKeyConfigured: true }); });
    return () => { off(); };
  }, []);

  const logout = useCallback(async () => {
    saveUser(null);
    clearApiCache();
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setBoot({ state: 'anon', needsSetup: false, setupKeyConfigured: true });
  }, []);

  if (boot.state === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-ink-3"><Loader2 className="size-6 animate-spin" /></div>;
  }
  if (boot.state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-soft">
          <ErrorState message={boot.message} onRetry={() => { setBoot({ state: 'loading' }); void load(); }} />
        </div>
      </div>
    );
  }
  if (boot.state === 'anon') {
    return (
      <ToastProvider>
        <LoginPage needsSetup={boot.needsSetup} setupKeyConfigured={boot.setupKeyConfigured} onAuthenticated={(user) => { clearApiCache(); saveUser(user); setBoot({ state: 'ready', user }); preloadPages(user); }} />
        <InstallPrompt top />
      </ToastProvider>
    );
  }

  const user = boot.user;
  loadApiCache(user.id);
  const page = canSee(user, route.page) ? route.page : homePage(user);
  const PageComponent = pages[page];

  return (
    <AuthContext.Provider value={{ user, setUser: (u) => { saveUser(u); setBoot({ state: 'ready', user: u }); }, logout }}>
      <ToastProvider>
        <LiveProvider key={user.id}>
          <Layout page={page} user={user} onLogout={logout}>
            <Suspense fallback={<PageFallback />}>
              <div key={page} className="anim-rise">
                {isPaused(page) ? <PausedPage /> : <PageComponent params={route.params} />}
              </div>
            </Suspense>
          </Layout>
          <InstallPrompt />
        </LiveProvider>
      </ToastProvider>
    </AuthContext.Provider>
  );
}
