// What a worker may do. Admins can always do everything (so nobody can lock the system out);
// for workers each right is switched on or off by an admin on the Ishchilar page.
export const PERMISSIONS = [
  'payments.create', // enter payments on the Toʻlov kiritish page
  'payments.backdate', // enter a payment with an earlier date and time
  'payments.void', // cancel a payment
  'payments.import', // upload payment reports (CSV)
  'reports.view', // Dashboard, Operatsiyalar, daily / weekly / monthly reports and everyone's payments
  'clients.edit', // edit client names and phones, upload the client list
  'balance.view', // cash balance, expenses and corrections
  'staff.view', // staff list with their totals, and everyone's attendance
] as const;
export type Perm = (typeof PERMISSIONS)[number];

/** What a worker gets until an admin changes it: the rights every worker had before permissions existed. */
export const WORKER_DEFAULT: Perm[] = ['payments.create', 'reports.view'];

export const isPerm = (p: unknown): p is Perm => (PERMISSIONS as readonly unknown[]).includes(p);

export function permsOf(role: string, stored: string[] | null | undefined): Perm[] {
  if (role === 'admin') return [...PERMISSIONS];
  return stored ? stored.filter(isPerm) : [...WORKER_DEFAULT];
}
