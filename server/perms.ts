// What a person may do. The owner (Ega) can always do everything, so nobody can lock the system out;
// for admins and workers each right is switched on or off on the Ishchilar page.
export const PERMISSIONS = [
  'payments.create', // enter payments on the Toʻlov kiritish page
  'payments.backdate', // enter a payment with an earlier date and time
  'payments.void', // cancel a payment
  'payments.import', // upload payment reports (CSV)
  'reports.view', // Dashboard, Operatsiyalar, daily / weekly / monthly reports and everyone's payments
  'clients.edit', // edit client names and phones, upload the client list
  'balance.view', // cash balance, expenses and corrections
  'staff.view', // staff list with their totals, and everyone's attendance
  'staff.manage', // add and edit workers and cashiers, fix attendance, set the office location
] as const;
export type Perm = (typeof PERMISSIONS)[number];

/** What a worker gets until an admin changes it: the rights every worker had before permissions existed. */
export const WORKER_DEFAULT: Perm[] = ['payments.create', 'reports.view'];

export const isPerm = (p: unknown): p is Perm => (PERMISSIONS as readonly unknown[]).includes(p);

/** Owner: everything, always. Admin: everything until the owner takes rights away. Worker: WORKER_DEFAULT until changed. */
export function permsOf(role: string, stored: string[] | null | undefined): Perm[] {
  if (role === 'owner' || (role === 'admin' && !stored)) return [...PERMISSIONS];
  return stored ? stored.filter(isPerm) : [...WORKER_DEFAULT];
}
