import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Banknote, ChevronRight, Package, ReceiptText, TrendingUp, UserCheck, Wallet, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/live';
import { can } from '../lib/perms';
import { groupDigits, money, percentChange, todayTashkent } from '../lib/format';
import { href, type Page } from '../lib/router';
import type { AttendanceRow, BalanceReport, Summary } from '../lib/types';
import { CardArt, type ArtKind } from './CardArt';
import { cx } from './ui';

interface OrderStats { stock: number; unpaid: number; unpaidAmount: number; today: number }

interface Slide {
  key: ArtKind;
  page: Page;
  title: string;
  value: ReactNode;
  lines: ReactNode[];
  icon: LucideIcon;
  /** Two colours of the card's gradient. */
  from: string;
  to: string;
}

const ROTATE_MS = 4500;

/**
 * The dashboard's rotating cards: today's money, operations, kassa balance, orders and who is at work.
 * Each card is built only from data the user may see, so a right that is switched off removes its card
 * (and its request) entirely.
 */
/** Change against the previous period as a chip, e.g. "↓ 12% oldingi kunga". */
function change(current: number, previous: number, single: boolean): ReactNode {
  const pct = percentChange(current, previous);
  if (pct === null) return 'Yangi';
  const r = Math.round(pct);
  const Arrow = r < 0 ? ArrowDownRight : ArrowUpRight;
  return <span className="inline-flex items-center gap-0.5"><Arrow className="size-3.5" />{`${Math.abs(r)}% ${single ? 'oldingi kunga' : 'oldingi davrga'}`}</span>;
}

/** range/summary: the dashboard's chosen period, so the money cards follow its date picker; without them, today. */
export function StatsCarousel({ range, summary: given }: { range?: { from: string; to: string }; summary?: Summary | null } = {}) {
  const { user } = useAuth();
  const today = todayTashkent();
  const period = range || { from: today, to: today };
  const single = period.from === period.to;
  const isToday = single && period.from === today;
  const seesReports = can(user, 'reports.view');
  const seesBalance = can(user, 'balance.view');
  const seesOrders = can(user, 'payments.create');
  const seesStaff = can(user, 'staff.view');

  const fetched = useApi<Summary>(seesReports && given === undefined ? '/summary' : null, { from: today, to: today });
  const summary = given === undefined ? fetched : { data: given, loading: given === null };
  const balance = useApi<BalanceReport>(seesBalance ? '/balance' : null, { date: today });
  const orders = useApi<OrderStats>(seesOrders ? '/orders/stats' : null);
  const team = useApi<{ items: AttendanceRow[]; staff: Array<{ id: string; is_active: boolean }> }>(seesStaff ? '/attendance' : null, { from: today, to: today });

  const slides: Slide[] = [];
  const t = summary.data?.totals;
  const p = summary.data?.previous;
  if (seesReports && t) {
    slides.push({
      key: 'income', page: 'operations', title: isToday ? 'Bugungi tushum' : single ? 'Kun tushumi' : 'Davr tushumi', value: money(t.total), icon: TrendingUp,
      lines: [`Naqd: ${money(t.cash)}`, `Karta: ${money(t.card + t.yandex + t.pochta)}`, ...(p ? [change(t.total, p.total, single)] : [])],
      from: '#f08a24', to: '#c2410c',
    });
    slides.push({
      key: 'ops', page: 'operations', title: isToday ? 'Bugungi operatsiyalar' : 'Operatsiyalar soni', value: `${groupDigits(t.count)} ta`, icon: ReceiptText,
      lines: [`${groupDigits(t.clients || 0)} ta mijoz`, ...(p ? [`${single ? 'Oldingi kun' : 'Oldingi davr'}: ${groupDigits(p.count)} ta`] : [])],
      from: '#2f80ed', to: '#1e40af',
    });
  }
  const sources = balance.data?.sources;
  if (seesBalance && sources) {
    const of = (s: 'cash' | 'card') => sources.find((r) => r.source === s);
    const cash = Number(of('cash')?.current || 0);
    const card = Number(of('card')?.current || 0);
    slides.push({
      key: 'balance', page: 'balance', title: 'Kassa balansi', value: money(cash + card), icon: Wallet,
      lines: [`Naqd: ${money(cash)}`, `Kartada: ${money(card)}`], from: '#1f9d55', to: '#11643a',
    });
    const spent = (balance.data?.expenses || []).filter((e) => !e.voided_at);
    slides.push({
      key: 'expense', page: 'balance', title: 'Bugungi rasxod', value: money(spent.reduce((s, e) => s + e.amount, 0)), icon: Banknote,
      lines: [`${spent.length} ta rasxod`], from: '#e0465a', to: '#9f1239',
    });
  }
  if (seesOrders && orders.data) {
    const o = orders.data;
    slides.push({
      key: 'orders', page: 'orders', title: 'Buyurtmalar', value: `${groupDigits(o.stock)} ta omborda`, icon: Package,
      lines: [`Toʻlanmagan: ${groupDigits(o.unpaid)} ta · ${money(o.unpaidAmount)}`, `Bugun keldi: ${groupDigits(o.today)} ta`],
      from: '#14866d', to: '#0b4f4a',
    });
  }
  if (seesStaff && team.data) {
    const came = new Set(team.data.items.map((a) => a.user_id));
    const atWork = new Set(team.data.items.filter((a) => !a.check_out_at).map((a) => a.user_id));
    const active = team.data.staff.filter((s) => s.is_active).length;
    slides.push({
      key: 'team', page: 'attendance', title: 'Hozir ishda', value: `${atWork.size} / ${active}`, icon: UserCheck,
      lines: [`Bugun kelganlar: ${came.size} ta`], from: '#7c4ddb', to: '#4c1d95',
    });
  }

  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = count ? index % count : 0;
  const touch = useRef<number | null>(null);

  useEffect(() => {
    if (paused || count < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, count, index]);

  const anyLoading = [summary, balance, orders, team].some((q) => q.loading && !q.data);
  if (!count) return anyLoading ? <div className="skeleton mb-4 h-[164px] rounded-2xl" /> : null;

  const go = (step: number) => setIndex((active + step + count) % count);

  return (
    <div
      className="mb-4 select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        setPaused(false);
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="relative h-[164px]" role="region" aria-roledescription="carousel" aria-label="Bugungi koʻrsatkichlar">
        {slides.map((s, i) => {
          // 0 is the front card, 1 and 2 peek out beneath it, the last one is the card that just left.
          const pos = (i - active + count) % count;
          const leaving = count > 2 && pos === count - 1;
          const style = leaving
            ? { transform: 'translateY(-14px) rotate(-2.5deg) scale(1.02)', opacity: 0, zIndex: 40 }
            : pos === 0 ? { transform: 'none', opacity: 1, zIndex: 30 }
            : pos === 1 ? { transform: 'translateY(9px) scale(0.94)', opacity: 0.9, zIndex: 20 }
            : pos === 2 ? { transform: 'translateY(17px) scale(0.88)', opacity: 0.55, zIndex: 10 }
            : { transform: 'translateY(17px) scale(0.88)', opacity: 0, zIndex: 0 };
          const Icon = s.icon;
          return (
            <a
              key={s.key}
              href={href(s.page)}
              aria-hidden={pos !== 0}
              tabIndex={pos === 0 ? 0 : -1}
              className={cx('absolute inset-x-0 top-0 h-[144px] origin-bottom overflow-hidden rounded-2xl p-4 text-white shadow-lg sm:px-5',
                'transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
                pos !== 0 && 'pointer-events-none')}
              style={{ ...style, background: `linear-gradient(135deg, ${s.from}, ${s.to})` }}
            >
              <div className="pointer-events-none absolute -right-6 -top-8 size-40 rounded-full bg-white/10" aria-hidden />
              <CardArt kind={s.key} play={pos === 0} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
                  <Icon className="size-4 opacity-90" /> {s.title}
                  <ChevronRight className="ml-auto size-4 opacity-70" />
                </div>
                <div className="mt-1 truncate text-[28px] font-bold leading-tight tracking-tight num sm:text-[32px]">{s.value}</div>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                  {s.lines.map((l, j) => (
                    <span key={j} className="rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-medium num backdrop-blur-sm">{l}</span>
                  ))}
                </div>
              </div>
            </a>
          );
        })}
      </div>
      {count > 1 && (
        <div className="-mt-1 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={s.title}
              aria-current={i === active}
              onClick={() => setIndex(i)}
              className={cx('h-1.5 rounded-full transition-all duration-300', i === active ? 'w-5 bg-ink-2' : 'w-1.5 bg-surface-3 hover:bg-line-strong')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
