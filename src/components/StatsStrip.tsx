import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/live';
import { can, canSee, isPaused } from '../lib/perms';
import { groupDigits, money, percentChange, todayTashkent } from '../lib/format';
import { href, type Page } from '../lib/router';
import type { AttendanceRow, BalanceReport, Summary } from '../lib/types';
import { cx } from './ui';

interface OrderStats { stock: number; unpaid: number; unpaidAmount: number; today: number }

interface Item {
  key: string;
  page: Page;
  title: string;
  value: string;
  /** Shown beside the value, e.g. the change against the previous day. */
  extra?: ReactNode;
  /** The details, in the tooltip. */
  hint: string[];
  dot: string;
}

/** Change against the previous period as a small coloured arrow, e.g. "↑ 12%". */
function change(current: number, previous: number): ReactNode {
  const pct = percentChange(current, previous);
  if (pct === null) return null;
  const r = Math.round(pct);
  const Arrow = r < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={cx('inline-flex items-center text-xs font-semibold num', r < 0 ? 'text-down' : 'text-up')}>
      <Arrow className="size-3.5" />{Math.abs(r)}%
    </span>
  );
}

/**
 * The dashboard's live strip: today's money, operations, kassa balance, expenses, orders and who is at work,
 * side by side in one thin row (two columns on a phone or tablet). Nothing rotates. Each item is built only from data
 * the user may see, so a right that is switched off removes its item (and its request) entirely.
 * range/summary: the dashboard's chosen period, so the money items follow its date picker; without them, today.
 */
export function StatsStrip({ range, summary: given }: { range?: { from: string; to: string }; summary?: Summary | null } = {}) {
  const { user } = useAuth();
  const today = todayTashkent();
  const period = range || { from: today, to: today };
  const single = period.from === period.to;
  const isToday = single && period.from === today;
  const seesReports = can(user, 'reports.view');
  const seesBalance = can(user, 'balance.view');
  const seesOrders = canSee(user, 'orders') && !isPaused('orders');
  const seesStaff = can(user, 'staff.view');

  const fetched = useApi<Summary>(seesReports && given === undefined ? '/summary' : null, { from: today, to: today });
  const summary = given === undefined ? fetched : { data: given, loading: given === null };
  const balance = useApi<BalanceReport>(seesBalance ? '/balance' : null, { date: today });
  const orders = useApi<OrderStats>(seesOrders ? '/orders/stats' : null);
  const team = useApi<{ items: AttendanceRow[]; staff: Array<{ id: string; is_active: boolean }> }>(seesStaff ? '/attendance' : null, { from: today, to: today });

  const items: Item[] = [];
  const t = summary.data?.totals;
  const p = summary.data?.previous;
  if (seesReports && t) {
    items.push({
      key: 'income', page: 'operations', title: isToday ? 'Bugungi tushum' : single ? 'Kun tushumi' : 'Davr tushumi', value: money(t.total),
      extra: p ? change(t.total, p.total) : null,
      hint: [`Naqd: ${money(t.cash)}`, `Karta: ${money(t.card + t.yandex + t.pochta)}`], dot: '#f08a24',
    });
    items.push({
      key: 'ops', page: 'operations', title: isToday ? 'Bugungi operatsiyalar' : 'Operatsiyalar soni', value: `${groupDigits(t.count)} ta`,
      hint: [`${groupDigits(t.clients || 0)} ta mijoz`, ...(p ? [`${single ? 'Oldingi kun' : 'Oldingi davr'}: ${groupDigits(p.count)} ta`] : [])], dot: '#2f80ed',
    });
  }
  const sources = balance.data?.sources;
  if (seesBalance && sources) {
    const of = (s: 'cash' | 'card') => sources.find((r) => r.source === s);
    const cash = Number(of('cash')?.current || 0);
    const card = Number(of('card')?.current || 0);
    items.push({ key: 'balance', page: 'balance', title: 'Kassa balansi', value: money(cash + card), hint: [`Naqd: ${money(cash)}`, `Kartada: ${money(card)}`], dot: '#1f9d55' });
    const spent = (balance.data?.expenses || []).filter((e) => !e.voided_at);
    items.push({ key: 'expense', page: 'balance', title: 'Bugungi rasxod', value: money(spent.reduce((s, e) => s + e.amount, 0)), hint: [`${spent.length} ta rasxod`], dot: '#e0465a' });
  }
  if (seesOrders && orders.data) {
    const o = orders.data;
    items.push({
      key: 'orders', page: 'orders', title: 'Buyurtmalar', value: `${groupDigits(o.stock)} ta omborda`,
      hint: [`Toʻlanmagan: ${groupDigits(o.unpaid)} ta · ${money(o.unpaidAmount)}`, `Bugun keldi: ${groupDigits(o.today)} ta`], dot: '#14866d',
    });
  }
  if (seesStaff && team.data) {
    const came = new Set(team.data.items.map((a) => a.user_id));
    const atWork = new Set(team.data.items.filter((a) => !a.check_out_at).map((a) => a.user_id));
    const active = team.data.staff.filter((s) => s.is_active).length;
    items.push({ key: 'team', page: 'attendance', title: 'Hozir ishda', value: `${atWork.size} / ${active}`, hint: [`Bugun kelganlar: ${came.size} ta`], dot: '#7c4ddb' });
  }

  const anyLoading = [summary, balance, orders, team].some((q) => q.loading && !q.data);
  if (!items.length) return anyLoading ? <div className="skeleton mb-4 h-[64px] rounded-xl" /> : null;

  // On a phone two items share a row; with an odd count the first (the day's money) takes a whole row.
  const odd = items.length % 2 === 1;

  return (
    <div className="mb-4 flex items-stretch rounded-xl border border-line bg-surface shadow-soft" role="region" aria-label="Bugungi koʻrsatkichlar">
      {isToday && (
        <div className="hidden shrink-0 items-center gap-2 pl-4 pr-1 text-xs font-semibold text-success xl:flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          Bugun
        </div>
      )}
      <div className="grid min-w-0 flex-1 grid-cols-2 xl:flex">
        {items.map((it, i) => (
          <a
            key={it.key}
            href={href(it.page)}
            title={it.hint.join(' · ')}
            className={cx('group flex min-w-0 items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-2 xl:flex-auto xl:py-3',
              odd && i === 0 && 'col-span-2',
              // Phone: lines between rows and between the two columns; computer: a line before each item.
              i > 0 && 'border-line max-xl:border-t xl:border-l',
              (odd ? i % 2 === 0 && i > 0 : i % 2 === 1) && 'max-xl:border-l',
              !odd && i === 1 && 'max-xl:border-t-0')}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: it.dot }} aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-xs text-ink-3">{it.title}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="truncate text-[15px] font-semibold tracking-tight text-ink num sm:text-base">{it.value}</span>
                {it.extra}
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
