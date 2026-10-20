import { useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3, Landmark, CalendarDays, LayoutDashboard, ListOrdered, LogOut, Menu, Moon, Plus, Settings, Sun, UserSearch, Users, Wallet, X,
} from 'lucide-react';
import { href, type Page } from '../lib/router';
import { useLive } from '../lib/live';
import { useTheme } from '../lib/theme';
import { formatDate, todayTashkent, weekday } from '../lib/format';
import type { User } from '../lib/types';
import { Avatar, Button, IconButton, cx } from './ui';

interface NavItem { page: Page; label: string; icon: typeof Wallet; adminOnly?: boolean }
const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Asosiy',
    items: [
      { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { page: 'kassa', label: 'Toʻlov kiritish', icon: Wallet },
      { page: 'operations', label: 'Operatsiyalar', icon: ListOrdered },
    ],
  },
  {
    group: 'Hisobotlar',
    items: [
      { page: 'daily', label: 'Kunlik hisobot', icon: CalendarDays },
      { page: 'periods', label: 'Haftalik va oylik', icon: BarChart3 },
      { page: 'balance', label: 'Kassa balansi', icon: Landmark, adminOnly: true },
    ],
  },
  {
    group: 'Boshqaruv',
    items: [
      { page: 'workers', label: 'Ishchilar', icon: Users, adminOnly: true },
      { page: 'clients', label: 'Mijozlar', icon: UserSearch },
      { page: 'settings', label: 'Sozlamalar', icon: Settings },
    ],
  },
];

export const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard', kassa: 'Toʻlov kiritish', operations: 'Operatsiyalar', daily: 'Kunlik hisobot',
  periods: 'Haftalik va oylik hisobot', workers: 'Ishchilar', clients: 'Mijozlar', balance: 'Kassa balansi', settings: 'Sozlamalar',
};

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-soft">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 5v14h11" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-ink">Laylak Cargo</div>
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Kassa tizimi</div>
      </div>
    </div>
  );
}

function SyncIndicator() {
  const { online } = useLive();
  return (
    <span className={cx('hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex', online ? 'border-line text-ink-2' : 'border-danger/30 bg-danger-soft text-danger')}
      title={online ? 'Maʼlumotlar har bir necha soniyada avtomatik yangilanadi' : 'Server bilan aloqa yoʻq'}>
      <span className="relative flex size-2">
        {online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />}
        <span className={cx('relative inline-flex size-2 rounded-full', online ? 'bg-success' : 'bg-danger')} />
      </span>
      {online ? 'Jonli' : 'Aloqa yoʻq'}
    </span>
  );
}

function NavLinks({ page, user, onNavigate }: { page: Page; user: User; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.adminOnly || user.role === 'admin');
        if (!items.length) return null;
        return (
          <div key={group.group}>
            <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{group.group}</div>
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = item.page === page;
                return (
                  <a
                    key={item.page}
                    href={href(item.page)}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                      active ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <item.icon className={cx('size-[18px] transition-colors', active ? 'text-ink' : 'text-ink-3 group-hover:text-ink-2')} strokeWidth={1.9} />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function UserCard({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
      <Avatar name={user.full_name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{user.full_name}</div>
        <div className="text-xs text-ink-3">{user.role === 'admin' ? 'Administrator' : 'Kassir'}</div>
      </div>
      <IconButton label="Chiqish" onClick={onLogout}><LogOut className="size-4" /></IconButton>
    </div>
  );
}

function Credit() {
  return (
    <a href="https://t.me/khrmnvccc" target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-[11px] text-ink-3 hover:text-ink">
      by <span className="font-medium">@khrmnvccc</span>
    </a>
  );
}

export function Layout({ page, user, onLogout, children }: { page: Page; user: User; onLogout: () => void; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const theme = useTheme();
  const today = todayTashkent();

  useEffect(() => setDrawer(false), [page]);
  useEffect(() => {
    document.title = `${PAGE_TITLES[page]} · Laylak Cargo Kassa`;
    window.scrollTo({ top: 0 });
  }, [page]);

  const mobileTabs: Array<{ page: Page; label: string; icon: typeof Wallet }> = [
    { page: 'dashboard', label: 'Asosiy', icon: LayoutDashboard },
    { page: 'operations', label: 'Tarix', icon: ListOrdered },
    { page: 'kassa', label: 'Toʻlov', icon: Plus },
    { page: 'daily', label: 'Hisobot', icon: CalendarDays },
  ];

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface glass px-3 py-5 lg:flex">
        <div className="px-2"><Logo /></div>
        <div className="mt-7 flex-1 overflow-y-auto scrollbar-thin"><NavLinks page={page} user={user} /></div>
        <UserCard user={user} onLogout={onLogout} />
        <Credit />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 anim-fade" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-surface glass px-3 py-5 shadow-pop anim-rise">
            <div className="flex items-center justify-between px-2">
              <Logo />
              <IconButton label="Yopish" onClick={() => setDrawer(false)}><X className="size-5" /></IconButton>
            </div>
            <div className="mt-7 flex-1 overflow-y-auto"><NavLinks page={page} user={user} onNavigate={() => setDrawer(false)} /></div>
            <UserCard user={user} onLogout={onLogout} />
            <Credit />
          </div>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-surface glass">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
            <IconButton label="Menyu" className="-ml-2 lg:hidden" onClick={() => setDrawer(true)}><Menu className="size-5" /></IconButton>
            <div className="min-w-0 flex-1">
              <div className="lg:hidden"><Logo /></div>
              <div className="hidden text-sm text-ink-3 lg:block">
                <span className="text-ink-2">{weekday(today)}</span>, {formatDate(today)}
              </div>
            </div>
            <SyncIndicator />
            <IconButton label={theme.isDark ? 'Yorugʻ rejim' : 'Qorongʻi rejim'} onClick={theme.toggle}>
              {theme.isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </IconButton>
            {page !== 'kassa' && (
              <a href={href('kassa')} className="hidden sm:block">
                <Button variant="primary" icon={<Plus className="size-4" />}>Yangi toʻlov</Button>
              </a>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-12">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface glass pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5">
          {mobileTabs.map((tab) => {
            const active = tab.page === page;
            if (tab.page === 'kassa') {
              return (
                <a key={tab.page} href={href('kassa')} className="flex items-center justify-center" aria-label="Yangi toʻlov">
                  <span className={cx('flex size-12 items-center justify-center rounded-2xl shadow-pop transition-transform active:scale-95', active ? 'bg-primary text-primary-fg ring-4 ring-surface-3' : 'bg-primary text-primary-fg')}>
                    <Plus className="size-6" />
                  </span>
                </a>
              );
            }
            return (
              <a key={tab.page} href={href(tab.page)} className={cx('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-ink' : 'text-ink-3')}>
                <tab.icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                {tab.label}
              </a>
            );
          })}
          <button onClick={() => setDrawer(true)} className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-3">
            <Menu className="size-5" strokeWidth={1.8} />
            Menyu
          </button>
        </div>
      </nav>
    </div>
  );
}
