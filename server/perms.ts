// What a person may do. The owner (Ega) can always do everything, so nobody can lock the system out;
// for admins and workers each right is switched on or off on the Ishchilar page.
export const PERMISSIONS = [
  'payments.create', // enter payments on the Toʻlov kiritish page
  'payments.backdate', // enter a payment with an earlier date and time
  'payments.void', // cancel a payment
  'payments.import', // upload payment reports (CSV)
  'orders.manage', // Buyurtmalar: stickers, scanning, handing goods out, order lists
  'orders.delete', // delete stickers / orders
  'reports.view', // Dashboard, Operatsiyalar, daily / weekly / monthly reports and everyone's payments
  'kassa.cash', // 1-kassa (naqd): its balance and Excel
  'kassa.card', // 2-kassa (karta, with Yandex and Pochta): the same for the card account
  'expenses.create', // write an expense (rasxod) in the kassas they see
  'expenses.void', // cancel an expense
  'kassa.adjust', // correct a kassa balance by hand (Qoldiqni tuzatish)
  'kassa.import', // upload a kassa book (Daftarni yuklash)
  'clients.view', // the Mijozlar page
  'clients.edit', // edit client names and phones, upload the client list
  'staff.view', // staff list with their totals, and everyone's attendance
  'staff.manage', // add and edit workers and cashiers, fix attendance, set the office location
  'messages.manage', // the Xabarlar page: what goes to Telegram, to whom, in which words
] as const;
export type Perm = (typeof PERMISSIONS)[number];

/** What a worker gets until an admin changes it: the rights every worker had before permissions existed. */
export const WORKER_DEFAULT: Perm[] = ['payments.create', 'reports.view', 'orders.manage', 'clients.view'];

/** Rights an admin does not get by default: only the owner hands them out. */
export const OWNER_GRANTED: Perm[] = ['messages.manage'];
export const ADMIN_DEFAULT: Perm[] = PERMISSIONS.filter((p) => !OWNER_GRANTED.includes(p));

export const isPerm = (p: unknown): p is Perm => (PERMISSIONS as readonly unknown[]).includes(p);

/** The kassa had one right ("balance.view") before it was split in two: whoever had it keeps both kassas. */
const LEGACY: Record<string, Perm[]> = { 'balance.view': ['kassa.cash', 'kassa.card'] };
export const upgrade = (stored: string[]) => [...new Set(stored.flatMap((p) => LEGACY[p] ?? [p]))];

/** Which kassa accounts someone may see: 'cash' (1-kassa) and/or 'card' (2-kassa). */
export const kassaSources = (perms: readonly string[]): Array<'cash' | 'card'> =>
  [perms.includes('kassa.cash') && 'cash' as const, perms.includes('kassa.card') && 'card' as const].filter((s): s is 'cash' | 'card' => !!s);

/** Owner: everything, always. Admin: ADMIN_DEFAULT until the owner changes it. Worker: WORKER_DEFAULT until changed. */
export function permsOf(role: string, stored: string[] | null | undefined): Perm[] {
  if (role === 'owner') return [...PERMISSIONS];
  if (role === 'admin' && !stored) return [...ADMIN_DEFAULT];
  return stored ? upgrade(stored).filter(isPerm) : [...WORKER_DEFAULT];
}
