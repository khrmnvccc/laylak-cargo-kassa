// How the owner set up each page (oyna): paused for a while, who sees it, and its name in the menu.
// Shared by the server (to keep it) and the browser (to draw the menu), so both read it the same way.

export const PAGE_KEYS = ['dashboard', 'kassa', 'orders', 'operations', 'daily', 'periods', 'balance', 'workers', 'attendance', 'clients', 'messages', 'settings'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

/** all: whoever has the right for it; boss: the owner and admins; owner: only the owner. */
export type PageWho = 'all' | 'boss' | 'owner';
export interface PageSetting { paused?: boolean; who?: PageWho; label?: string }
export type PageSettings = Partial<Record<PageKey, PageSetting>>;

/** Until the owner changes anything: Buyurtmalar stays paused, as it was before this setting existed. */
export const DEFAULT_PAGE_SETTINGS: PageSettings = { orders: { paused: true } };

/** Pages that can never be paused or hidden, so nobody loses their way back. */
export const ALWAYS_OPEN: readonly PageKey[] = ['settings'];

export const MAX_PAGE_LABEL = 30;

/** Keeps only known pages and sensible values; drops settings that change nothing. */
export function cleanPageSettings(raw: unknown): PageSettings {
  const out: PageSettings = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of PAGE_KEYS) {
    const v = (raw as Record<string, any>)[key];
    if (!v || typeof v !== 'object') continue;
    const s: PageSetting = {};
    if (v.paused === true && !ALWAYS_OPEN.includes(key)) s.paused = true;
    if ((v.who === 'boss' || v.who === 'owner') && !ALWAYS_OPEN.includes(key)) s.who = v.who;
    const label = typeof v.label === 'string' ? v.label.replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_LABEL) : '';
    if (label) s.label = label;
    if (Object.keys(s).length) out[key] = s;
  }
  return out;
}
