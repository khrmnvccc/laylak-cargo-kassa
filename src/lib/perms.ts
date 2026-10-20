import type { Page } from './router';
import type { User } from './types';

// Mirrors server/perms.ts. Admins always have every right; for workers an admin switches each one on or off.
export type Perm =
  | 'payments.create' | 'payments.backdate' | 'payments.void' | 'payments.import'
  | 'reports.view' | 'clients.edit' | 'balance.view' | 'staff.view';

export const PERM_INFO: Array<{ perm: Perm; label: string; hint: string }> = [
  { perm: 'payments.create', label: 'Toʻlov kiritish', hint: 'Mijoz toʻlovini kassaga yozadi' },
  { perm: 'payments.backdate', label: 'Oʻtgan sana bilan kiritish', hint: 'Toʻlov vaqtini qoʻlda oʻzgartiradi' },
  { perm: 'payments.void', label: 'Toʻlovni bekor qilish', hint: 'Xato kiritilgan toʻlovni sabab bilan bekor qiladi' },
  { perm: 'payments.import', label: 'Hisobot yuklash', hint: 'Excel/CSV hisobotdan toʻlovlarni yuklaydi' },
  { perm: 'reports.view', label: 'Hisobotlarni koʻrish', hint: 'Dashboard, operatsiyalar, kunlik, haftalik va oylik hisobotlar' },
  { perm: 'clients.edit', label: 'Mijozlarni tahrirlash', hint: 'Mijoz ismi va telefonini oʻzgartiradi, roʻyxat yuklaydi' },
  { perm: 'balance.view', label: 'Kassa balansi va rasxodlar', hint: 'Balansni koʻradi, rasxod va tuzatish kiritadi' },
  { perm: 'staff.view', label: 'Ishchilar va davomatni koʻrish', hint: 'Barcha xodimlar natijasi, kim qachon kelib-ketgani' },
];

export const can = (user: User, perm: Perm) => user.role === 'admin' || user.permissions?.includes(perm);

/** Which right each page needs; pages not listed are open to everyone. */
const PAGE_PERM: Partial<Record<Page, Perm>> = {
  dashboard: 'reports.view', operations: 'reports.view', daily: 'reports.view', periods: 'reports.view',
  kassa: 'payments.create', balance: 'balance.view', workers: 'staff.view',
};

export const canSee = (user: User, page: Page) => {
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

/** Admin; a worker who enters payments is a Kassir, anyone else an Ishchi. */
export const roleLabel = (u: { role: string; permissions?: Perm[] }) =>
  u.role === 'admin' ? 'Admin' : u.permissions?.includes('payments.create') ? 'Kassir' : 'Ishchi';
