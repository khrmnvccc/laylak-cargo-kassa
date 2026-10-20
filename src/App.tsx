import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiError, onUnauthorized } from './lib/api';
import { AuthContext } from './lib/auth';
import { LiveProvider } from './lib/live';
import { useRoute } from './lib/router';
import { useTheme } from './lib/theme';
import type { User } from './lib/types';
import { Layout } from './components/Layout';
import { ErrorState, ToastProvider } from './components/ui';
import { LoginPage } from './pages/Login';

const pages = {
  dashboard: lazy(() => import('./pages/Dashboard')),
  kassa: lazy(() => import('./pages/Kassa')),
  operations: lazy(() => import('./pages/Operations')),
  daily: lazy(() => import('./pages/DailyReport')),
  periods: lazy(() => import('./pages/PeriodReport')),
  workers: lazy(() => import('./pages/Workers')),
  clients: lazy(() => import('./pages/Clients')),
  settings: lazy(() => import('./pages/Settings')),
};

type Boot = { state: 'loading' } | { state: 'error'; message: string } | { state: 'anon'; needsSetup: boolean; setupKeyConfigured: boolean } | { state: 'ready'; user: User };

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center text-ink-3">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

export default function App() {
  useTheme();
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const route = useRoute();

  const load = useCallback(async () => {
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      setBoot({ state: 'ready', user });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
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
    const off = onUnauthorized(() => setBoot({ state: 'anon', needsSetup: false, setupKeyConfigured: true }));
    return () => { off(); };
  }, []);

  const logout = useCallback(async () => {
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
        <LoginPage needsSetup={boot.needsSetup} setupKeyConfigured={boot.setupKeyConfigured} onAuthenticated={(user) => setBoot({ state: 'ready', user })} />
      </ToastProvider>
    );
  }

  const user = boot.user;
  const page = route.page === 'workers' && user.role !== 'admin' ? 'dashboard' : route.page;
  const PageComponent = pages[page];

  return (
    <AuthContext.Provider value={{ user, setUser: (u) => setBoot({ state: 'ready', user: u }), logout }}>
      <ToastProvider>
        <LiveProvider key={user.id}>
          <Layout page={page} user={user} onLogout={logout}>
            <Suspense fallback={<PageFallback />}>
              <div key={page} className="anim-rise">
                <PageComponent params={route.params} />
              </div>
            </Suspense>
          </Layout>
        </LiveProvider>
      </ToastProvider>
    </AuthContext.Provider>
  );
}
