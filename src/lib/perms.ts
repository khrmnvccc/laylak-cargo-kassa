import type { Page } from './router';
import type { User } from './types';

// Mirrors server/perms.ts. The owner (Ega) always has every right; for admins and workers each one is switched on or off.
export type Perm =
  | 'payments.create' | 'payments.backdate' | 'payments.void' | 'payments.import'
  | 'reports.view' | 'clients.edit' | 'kassa.cash' | 'kassa.card' | 'staff.view' | 'staff.manage';

export const PERM_INFO: Array<{ perm: Perm; label: string; hint: string }> = [
  { perm: 'payments.create', label: 'Toʻlov kiritish', hint: 'Mijoz toʻlovini kassaga yozadi' },
  { perm: 'payments.backdate', label: 'Oʻtgan sana bilan kiritish', hint: 'Toʻlov vaqtini qoʻlda oʻzgartiradi' },
  { perm: 'payments.void', label: 'Toʻlovni bekor qilish', hint: 'Xato kiritilgan toʻlovni sabab bilan bekor qiladi' },
  { perm: 'payments.import', label: 'Hisobot yuklash', hint: 'Excel/CSV hisobotdan toʻlovlarni yuklaydi' },
  { perm: 'reports.view', label: 'Hisobotlarni koʻrish', hint: 'Dashboard, operatsiyalar, kunlik, haftalik va oylik hisobotlar' },
  { perm: 'clients.edit', label: 'Mijozlarni tahrirlash', hint: 'Mijoz ismi va telefonini oʻzgartiradi, roʻyxat yuklaydi' },
  { perm: 'kassa.cash', label: '1-kassa · Naqd', hint: 'Naqd kassani koʻradi: qoldiq, rasxod, tuzatish va uning Exceli' },
  { perm: 'kassa.card', label: '2-kassa · Karta', hint: 'Karta kassasini koʻradi (Yandex va Pochta bilan): qoldiq, rasxod, tuzatish va Exceli' },
  { perm: 'staff.view', label: 'Ishchilar va davomatni koʻrish', hint: 'Barcha xodimlar natijasi, kim qachon kelib-ketgani' },
  { perm: 'staff.manage', label: 'Xodimlarni boshqarish', hint: 'Ishchi va kassir qoʻshadi, ruxsat beradi, davomatni tuzatadi, ishxona joyini belgilaydi' },
];

export const can = (user: User, perm: Perm) => user.role === 'owner' || !!user.permissions?.includes(perm);

/** The kassas someone may see: 'cash' = 1-kassa (naqd), 'card' = 2-kassa (karta). */
export const kassaSources = (user: User): Array<'cash' | 'card'> =>
  (['cash', 'card'] as const).filter((s) => can(user, s === 'cash' ? 'kassa.cash' : 'kassa.card'));
export const seesKassa = (user: User) => kassaSources(user).length > 0;

/** Owner and admins: audit log and system info in Settings. */
export const isBoss = (user: { role: string }) => user.role === 'owner' || user.role === 'admin';

/** Which right each page needs; pages not listed are open to everyone. */
const PAGE_PERM: Partial<Record<Page, Perm>> = {
  dashboard: 'reports.view', operations: 'reports.view', daily: 'reports.view', periods: 'reports.view',
  kassa: 'payments.create', orders: 'payments.create', workers: 'staff.view',
};

/**
 * Pages switched off for everyone for now: they stay in the menu, but opening one shows a
 * "temporarily not working" notice instead of the page. Its code and data stay as they are;
 * delete the name here to bring it back.
 */
export const PAUSED_PAGES: readonly Page[] = ['orders'];
export const isPaused = (page: Page) => PAUSED_PAGES.includes(page);

export const canSee = (user: User, page: Page) => {
  if (page === 'balance') return seesKassa(user);
  const perm = PAGE_PERM[page];
  return !perm || can(user, perm);
};

/** Where to send someone who opens a page they may not see. */
export const homePage = (user: User): Page =>
  canSee(user, 'dashboard') ? 'dashboard' : canSee(user, 'kassa') ? 'kassa' : 'attendance';

/** Ready-made sets for the staff form; the admin can still tick each right by hand. */
export const PRESETS: Record<'ishchi' | 'kassir', Perm[]> = {
  ishchi: [],
  kassir: ['payments.create', 'reports.view'],
};

/** Ega, Admin; a worker who enters payments is a Kassir, anyone else an Ishchi. */
export const roleLabel = (u: { role: string; permissions?: Perm[] }) =>
  u.role === 'owner' ? 'Ega' : u.role === 'admin' ? 'Admin' : u.permissions?.includes('payments.create') ? 'Kassir' : 'Ishchi';
