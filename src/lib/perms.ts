import type { Page } from './router';
import type { User } from './types';
import { DEFAULT_PAGE_SETTINGS, type PageSettings } from './pageConfig';

// Mirrors server/perms.ts. The owner (Ega) always has every right; for admins and workers each one is switched on or off.
export type Perm =
  | 'payments.create' | 'payments.backdate' | 'payments.void' | 'payments.import'
  | 'orders.manage' | 'orders.delete' | 'reports.view'
  | 'kassa.cash' | 'kassa.card' | 'expenses.create' | 'expenses.void' | 'kassa.adjust' | 'kassa.import'
  | 'clients.view' | 'clients.edit' | 'staff.view' | 'staff.manage' | 'messages.manage';

/** The rights, in the sections the staff form shows them in. */
export const PERM_GROUPS: Array<{ title: string; perms: Array<{ perm: Perm; label: string; hint: string }> }> = [
  {
    title: 'Toʻlovlar',
    perms: [
      { perm: 'payments.create', label: 'Toʻlov kiritish', hint: 'Mijoz toʻlovini kassaga yozadi, chekdan toʻlov kiritadi' },
      { perm: 'payments.backdate', label: 'Oʻtgan sana bilan kiritish', hint: 'Toʻlov vaqtini qoʻlda oʻzgartiradi' },
      { perm: 'payments.void', label: 'Toʻlovni bekor qilish', hint: 'Xato kiritilgan toʻlovni sabab bilan bekor qiladi' },
      { perm: 'payments.import', label: 'Hisobot yuklash', hint: 'Excel/CSV hisobotdan toʻlovlarni yuklaydi' },
    ],
  },
  {
    title: 'Buyurtmalar',
    perms: [
      { perm: 'orders.manage', label: 'Buyurtmalar bilan ishlash', hint: 'Stiker yaratadi, skanerlaydi, tovarni beradi, roʻyxat yuklaydi' },
      { perm: 'orders.delete', label: 'Buyurtmani oʻchirish', hint: 'Stiker va buyurtmalarni oʻchiradi (Telegramga xabar boradi)' },
    ],
  },
  {
    title: 'Hisobotlar',
    perms: [
      { perm: 'reports.view', label: 'Hisobotlarni koʻrish', hint: 'Dashboard, operatsiyalar, kunlik, haftalik va oylik hisobotlar' },
    ],
  },
  {
    title: 'Kassa',
    perms: [
      { perm: 'kassa.cash', label: '1-kassa · Naqd', hint: 'Naqd kassani koʻradi: qoldiq, harakat va uning Exceli' },
      { perm: 'kassa.card', label: '2-kassa · Karta', hint: 'Karta kassasini koʻradi (Yandex va Pochta bilan): qoldiq, harakat va Exceli' },
      { perm: 'expenses.create', label: 'Rasxod qoʻshish', hint: 'Ochilgan kassadan rasxod yozadi' },
      { perm: 'expenses.void', label: 'Rasxodni bekor qilish', hint: 'Xato rasxodni sabab bilan bekor qiladi' },
      { perm: 'kassa.adjust', label: 'Qoldiqni tuzatish', hint: 'Kassadagi qoldiqni qoʻlda toʻgʻrilaydi' },
      { perm: 'kassa.import', label: 'Daftarni yuklash', hint: 'Kassa daftarini Exceldan yuklaydi' },
    ],
  },
  {
    title: 'Mijozlar',
    perms: [
      { perm: 'clients.view', label: 'Mijozlar oynasi', hint: 'Mijozlar roʻyxati va har birining tarixi' },
      { perm: 'clients.edit', label: 'Mijozlarni tahrirlash', hint: 'Mijoz ismi va telefonini oʻzgartiradi, roʻyxat yuklaydi' },
    ],
  },
  {
    title: 'Xodimlar',
    perms: [
      { perm: 'staff.view', label: 'Ishchilar va davomatni koʻrish', hint: 'Barcha xodimlar natijasi, kim qachon kelib-ketgani' },
      { perm: 'staff.manage', label: 'Xodimlarni boshqarish', hint: 'Ishchi va kassir qoʻshadi, ruxsat beradi, davomatni tuzatadi, ishxona joyini belgilaydi' },
    ],
  },
  {
    title: 'Xabarlar',
    perms: [
      { perm: 'messages.manage', label: 'Telegram xabarlarini boshqarish', hint: 'Xabarlar oynasi: qaysi xabar kimga borishi, matnlari, yuborilganlar' },
    ],
  },
];
export const PERM_INFO = PERM_GROUPS.flatMap((g) => g.perms);

/** Rights that need a kassa opened first, or they do nothing. */
export const NEEDS_KASSA: Perm[] = ['expenses.create', 'expenses.void', 'kassa.adjust', 'kassa.import'];

/** An admin starts with every right except these; only the owner hands them out. */
export const OWNER_GRANTED: Perm[] = ['messages.manage'];
export const ADMIN_DEFAULT: Perm[] = PERM_INFO.map((p) => p.perm).filter((p) => !OWNER_GRANTED.includes(p));

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
  kassa: 'payments.create', orders: 'orders.manage', workers: 'staff.view', clients: 'clients.view', messages: 'messages.manage',
};

// The owner's page settings (Sozlamalar → Oynalar), loaded once after sign-in and kept here so the menu
// and every page check read the same thing. The owner always sees every page, so they can never lock
// themselves out; a paused page still opens for them, with a note.
let pageSettings: PageSettings = DEFAULT_PAGE_SETTINGS;
export const setPageSettings = (value: PageSettings | null | undefined) => { pageSettings = value ?? DEFAULT_PAGE_SETTINGS; };
export const getPageSettings = () => pageSettings;

/** The page's name in the menu: the owner's own, or the usual one. */
export const pageLabel = (page: Page, fallback: string) => pageSettings[page]?.label || fallback;

/** Paused for now: it stays in the menu, but opening it shows a "temporarily not working" notice. */
export const isPaused = (page: Page) => !!pageSettings[page]?.paused;

export const canSee = (user: User, page: Page) => {
  const who = pageSettings[page]?.who;
  if (who === 'owner' && user.role !== 'owner') return false;
  if (who === 'boss' && !isBoss(user)) return false;
  if (page === 'balance') return seesKassa(user);
  const perm = PAGE_PERM[page];
  return !perm || can(user, perm);
};

/** Where to send someone who opens a page they may not see. */
export const homePage = (user: User): Page =>
  canSee(user, 'dashboard') ? 'dashboard' : canSee(user, 'kassa') ? 'kassa' : 'attendance';

/** Ready-made sets for the staff form; the admin can still tick each right by hand. */
export const PRESETS: Record<'ishchi' | 'kassir', Perm[]> = {
  ishchi: ['clients.view'],
  kassir: ['payments.create', 'reports.view', 'orders.manage', 'clients.view'],
};

/** Ega, Admin; a worker who enters payments is a Kassir, anyone else an Ishchi. */
export const roleLabel = (u: { role: string; permissions?: Perm[] }) =>
  u.role === 'owner' ? 'Ega' : u.role === 'admin' ? 'Admin' : u.permissions?.includes('payments.create') ? 'Kassir' : 'Ishchi';
