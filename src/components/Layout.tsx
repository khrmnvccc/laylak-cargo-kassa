import { useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3, Bell, Building2, Clock, Landmark, CalendarDays, LayoutDashboard, ListOrdered, LogOut, Menu, Moon, Package, Plus, Settings, Sun, UserSearch, Users, Wallet, X,
} from 'lucide-react';
import { href, type Page } from '../lib/router';
import { useLive } from '../lib/live';
import { useTheme } from '../lib/theme';
import { formatDate, todayTashkent, weekday } from '../lib/format';
import type { User } from '../lib/types';
import { LANG, LANGS, setLang } from '../lib/i18n';
import { can, canSee, isPaused, pageLabel, roleLabel } from '../lib/perms';
import { needsPick, useBranches } from '../lib/branch';
import { AttendanceButton } from './AttendanceButton';
import { BrandMark, groupLabel, useBrand } from '../lib/brand';
import { StickerPay } from './StickerPay';
import { Avatar, Button, IconButton, cx } from './ui';

interface NavItem { page: Page; label: string; icon: typeof Wallet }
export const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Asosiy',
    items: [
      { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { page: 'kassa', label: 'Toʻlov kiritish', icon: Wallet },
      { page: 'orders', label: 'Buyurtmalar', icon: Package },
      { page: 'operations', label: 'Operatsiyalar', icon: ListOrdered },
    ],
  },
  {
    group: 'Hisobotlar',
    items: [
      { page: 'daily', label: 'Kunlik hisobot', icon: CalendarDays },
      { page: 'periods', label: 'Haftalik va oylik', icon: BarChart3 },
      { page: 'balance', label: 'Kassa balansi', icon: Landmark },
    ],
  },
  {
    group: 'Boshqaruv',
    items: [
      { page: 'workers', label: 'Ishchilar', icon: Users },
      { page: 'attendance', label: 'Davomat', icon: Clock },
      { page: 'clients', label: 'Mijozlar', icon: UserSearch },
      { page: 'messages', label: 'Xabarlar', icon: Bell },
      { page: 'settings', label: 'Sozlamalar', icon: Settings },
    ],
  },
];

export const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard', kassa: 'Toʻlov kiritish', orders: 'Buyurtmalar', operations: 'Operatsiyalar', daily: 'Kunlik hisobot',
  periods: 'Haftalik va oylik hisobot', workers: 'Ishchilar', attendance: 'Davomat', clients: 'Mijozlar', balance: 'Kassa balansi', messages: 'Xabarlar', settings: 'Sozlamalar',
};

function Logo({ compact }: { compact?: boolean }) {
  const brand = useBrand();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark brand={brand} className={cx('w-auto max-w-[72px] shrink-0', compact ? 'h-6' : 'h-7')} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[15px] font-semibold tracking-tight text-ink">{brand.name}</div>
        {brand.tagline && <div className={cx('truncate text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3', compact && 'hidden sm:block')}>{brand.tagline}</div>}
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

/** Which branch the pages show. Only there when this person sees more than one branch. */
function BranchSwitch({ className }: { className?: string }) {
  const state = useBranches();
  if (state.all.length < 2 || !state.mine.length) return null;
  if (state.mine.length === 1) {
    return (
      <span className={cx('h-9 min-w-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm font-medium text-ink-2', className)} title="Sizning filialingiz">
        <Building2 className="size-4 shrink-0 text-ink-3" /><span className="truncate">{state.mine[0].name}</span>
      </span>
    );
  }
  const value = state.mine.some((b) => b.id === state.current) ? state.current : 0;
  return (
    <label className={cx('relative h-9 min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface pl-2.5 pr-2 text-sm font-medium text-ink hover:bg-surface-2', className)}>
      <Building2 className="size-4 shrink-0 text-ink-3" />
      <span className="flex-1 truncate">{value ? state.mine.find((b) => b.id === value)!.name : 'Barcha filiallar'}</span>
      <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-ink-3" fill="currentColor" aria-hidden><path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <select aria-label="Filial" value={value} onChange={(e) => state.pick(Number(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0">
        <option value={0}>Barcha filiallar</option>
        {state.mine.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
}

// Pages where something new is written: with "all branches" picked the server would not know where it goes.
const WRITE_PAGES: Page[] = ['kassa', 'orders', 'balance'];

function NavLinks({ page, user, onNavigate }: { page: Page; user: User; onNavigate?: () => void }) {
  const brand = useBrand();
  return (
    <nav className="space-y-5">
      {NAV.map((group) => {
        const items = group.items.filter((i) => canSee(user, i.page));
        if (!items.length) return null;
        return (
          <div key={group.group}>
            <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{groupLabel(brand, group.group)}</div>
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
                    <span className="truncate">{pageLabel(item.page, item.label)}</span>
                    {isPaused(item.page) && <span className="ml-auto rounded-full bg-warn-soft px-1.5 py-px text-[10px] font-semibold text-warn">Vaqtincha</span>}
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
        <div className="text-xs text-ink-3">{roleLabel(user)}</div>
      </div>
      <IconButton label="Chiqish" onClick={onLogout}><LogOut className="size-4" /></IconButton>
    </div>
  );
}

export function LangSwitch() {
  return (
    <div className="mb-2 flex rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Til">
      {LANGS.map((l) => (
        <button key={l.value} type="button" role="radio" aria-checked={LANG === l.value} title={l.label} onClick={() => setLang(l.value)}
          className={cx('h-7 flex-1 rounded-md text-xs font-medium transition-colors', LANG === l.value ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink')}>
          {l.short}
        </button>
      ))}
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
  const branches = useBranches();
  const brand = useBrand();

  useEffect(() => setDrawer(false), [page]);
  useEffect(() => {
    document.title = `${pageLabel(page, PAGE_TITLES[page])} · ${brand.name}`;
  }, [page, brand.name]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [page]);

  const mobileTabs = ([
    { page: 'dashboard', label: 'Asosiy', icon: LayoutDashboard },
    { page: 'operations', label: 'Tarix', icon: ListOrdered },
    { page: 'kassa', label: 'Toʻlov', icon: Plus },
    { page: 'attendance', label: 'Davomat', icon: Clock },
  ] as Array<{ page: Page; label: string; icon: typeof Wallet }>).filter((t) => canSee(user, t.page));

  return (
    <div className="min-h-screen">
      {can(user, 'payments.create') && can(user, 'orders.manage') && <StickerPay />}
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface glass px-3 py-5 lg:flex">
        <div className="px-2"><Logo /></div>
        <div className="mt-7 flex-1 overflow-y-auto scrollbar-thin"><NavLinks page={page} user={user} /></div>
        <LangSwitch />
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
            <LangSwitch />
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
              <div className="lg:hidden"><Logo compact /></div>
              <div className="hidden text-sm text-ink-3 lg:block">
                <span className="text-ink-2">{weekday(today)}</span>, {formatDate(today)}
              </div>
            </div>
            <BranchSwitch className="hidden sm:inline-flex" />
            <AttendanceButton />
            <SyncIndicator />
            <IconButton label={theme.isDark ? 'Yorugʻ rejim' : 'Qorongʻi rejim'} onClick={theme.toggle}>
              {theme.isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </IconButton>
            {page !== 'kassa' && canSee(user, 'kassa') && (
              <a href={href('kassa')} className="hidden sm:block">
                <Button variant="primary" icon={<Plus className="size-4" />}>Yangi toʻlov</Button>
              </a>
            )}
          </div>
          {/* On a phone the header is full, so the branch gets its own row under it. */}
          <div className="px-4 pb-2 empty:hidden sm:hidden"><BranchSwitch className="flex w-full" /></div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-12">
          {WRITE_PAGES.includes(page) && needsPick(branches) && (
            <div className="no-print mb-4 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
              <Building2 className="size-4 shrink-0" />
              Hozir barcha filiallar birga koʻrsatilmoqda. Yangi yozuv kiritish uchun tepada filialni tanlang.
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface glass pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid h-16 max-w-md" style={{ gridTemplateColumns: `repeat(${mobileTabs.length + 1}, minmax(0, 1fr))` }}>
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
