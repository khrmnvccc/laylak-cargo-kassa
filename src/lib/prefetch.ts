import { addDays, startOfMonth, startOfWeek, todayTashkent } from './format';
import { prefetchApi } from './live';
import { can, canSee, isPaused } from './perms';
import type { User } from './types';

// Page sizes and default periods live here so the pages and the prefetch below always ask the same
// question (the answer is only reused when the question matches exactly).
export const OPERATIONS_PAGE_SIZE = 50;
export const CLIENTS_PAGE_SIZE = 50;

export function periodDefaultRange(group: 'week' | 'month') {
  const t = todayTashkent();
  if (group === 'week') return { from: startOfWeek(addDays(t, -7 * 11)), to: t };
  const d = new Date(`${startOfMonth(t)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 11);
  return { from: d.toISOString().slice(0, 10), to: t };
}

/**
 * Right after the app opens, quietly fetches what each page shows first, so opening any page from the
 * menu shows its numbers at once instead of a loading skeleton. Only what this user may see is asked for.
 */
export function prefetchFirstScreens(user: User) {
  const t = todayTashkent();
  const day = { from: t, to: t };
  const month = { from: startOfMonth(t), to: t };
  const list: Array<[string, object?]> = [['/attendance/me']];
  if (can(user, 'reports.view')) {
    list.push(['/summary', day]);
    list.push(['/summary', { from: addDays(t, -13), to: t }]);
    const week = { from: addDays(t, -6), to: t };
    list.push(['/payments', { ...week, status: 'active', limit: OPERATIONS_PAGE_SIZE, offset: 0 }]);
    list.push(['/summary', week]);
    list.push(['/payments', { from: t, to: t, limit: 500 }]);
    list.push(['/periods', { group: 'week', ...periodDefaultRange('week') }]);
  }
  if (canSee(user, 'kassa')) list.push(['/payments', { from: t, to: t, worker: user.id, limit: 20 }]);
  if (can(user, 'balance.view')) list.push(['/balance', { date: t }]);
  if (can(user, 'staff.view')) {
    list.push(['/attendance', day]);
    list.push(['/attendance', month]);
    list.push(['/staff', month]);
  }
  if (canSee(user, 'clients') && !isPaused('clients')) list.push(['/clients', { q: '', sort: 'active', limit: CLIENTS_PAGE_SIZE, offset: 0 }]);
  // A few at a time, so the page being looked at right now is never held up behind them.
  let i = 0;
  const next = () => {
    const batch = list.slice(i, i + 3);
    i += 3;
    batch.forEach(([path, query]) => prefetchApi(path, query));
    if (i < list.length) window.setTimeout(next, 250);
  };
  next();
}
