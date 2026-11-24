import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Banknote, Building, CircleDot, CreditCard, Fuel, HandCoins, Landmark, Package, Plane, Receipt, Scale, Search,
  ShoppingBag, Truck, Users, X, Zap,
} from 'lucide-react';
import { useApi } from '../lib/live';
import { useAuth } from '../lib/auth';
import { kassaSources } from '../lib/perms';
import { useShownMethod } from '../lib/methods';
import { EXPENSE_CATEGORIES } from '../lib/expenses';
import { addDays, dateTime, endOfMonth, formatDate, methodLabel, money, monthLabel, rangeLabel, startOfMonth, timeOf, todayTashkent, weekday, dateOf } from '../lib/format';
import { href } from '../lib/router';
import { MONITORING_PAGE_SIZE } from '../lib/prefetch';
import { DateRangePicker, type Range } from '../components/DateRange';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, Segmented, Select, SkeletonRows, cx } from '../components/ui';

type Kind = 'income' | 'expense' | 'adjust';
interface Op {
  id: string; kind: Kind; source: 'cash' | 'card'; method: string | null; category: string | null; amount: number; at: string;
  client_code: string | null; client_name: string | null; note: string | null; by_name: string; trips: number | null; branch_id: number;
}
interface Totals { income: number; expense: number; adjust: number; income_count: number; expense_count: number }
interface Group { key: string; amount: number; count: number }
interface MonitoringData {
  from: string; to: string; previousRange: Range; sources: Array<'cash' | 'card'>;
  totals: Totals; previous: Totals; income: Group[]; expense: Group[];
  days: Array<{ day: string; income: number; expense: number; adjust: number; count: number }>;
  items: Op[]; count: number;
}

const STEP = MONITORING_PAGE_SIZE;
const SLICES = 5;
// Categorical slots, light and dark steps in index.css (--viz-1 … --viz-5); the rest fold into "Boshqalar".
const SLOT_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)'];
const REST_COLOR = 'var(--viz-rest)';

const CATEGORY_ICON: Record<string, typeof Package> = {
  tovar: ShoppingBag, paket: Package, yetkazish: Truck, yoqilgi: Fuel, ijara: Building, oylik: Users, kommunal: Zap,
  inkassa: Landmark, tovar_olib_kelish: Plane, togamga: HandCoins, arofat: HandCoins, boshqa: CircleDot,
};
const categoryLabel = (c: string | null) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c ?? '';
const kassaLabel = (s: string) => (s === 'cash' ? '1-kassa · Naqd' : '2-kassa · Karta');
const KIND_LABEL: Record<Kind, string> = { income: 'Kirim', expense: 'Rasxod', adjust: 'Tuzatish' };

/** A month as a range, never past today. */
function monthRange(month: string): Range {
  const today = todayTashkent();
  const from = `${month}-01`;
  const end = endOfMonth(from);
  return { from, to: end > today ? today : end };
}
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${startOfMonth(todayTashkent())}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.unshift(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}
const shortMonth = (month: string) => monthLabel(`${month}-01`).replace(/\s\d{4}$/, '');

function dayTitle(day: string) {
  const today = todayTashkent();
  if (day === today) return 'Bugun';
  if (day === addDays(today, -1)) return 'Kecha';
  return formatDate(day, day.slice(0, 4) !== today.slice(0, 4));
}

const signedMoney = (kind: Kind, amount: number) =>
  kind === 'income' ? `+${money(amount)}` : kind === 'expense' ? `−${money(amount)}` : amount > 0 ? `+${money(amount)}` : `−${money(-amount)}`;

export default function Monitoring() {
  const { user } = useAuth();
  const allowed = kassaSources(user);
  const shownMethod = useShownMethod();
  const months = useMemo(() => lastMonths(12), []);
  const [range, setRange] = useState<Range>(() => monthRange(months[months.length - 1]));
  const [source, setSource] = useState<'all' | 'cash' | 'card'>('all');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [chartKind, setChartKind] = useState<'expense' | 'income'>('expense');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [limit, setLimit] = useState(STEP);
  const [open, setOpen] = useState<Op | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const id = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(id); }, [search]);
  useEffect(() => setLimit(STEP), [range.from, range.to, source, kind, cat, debounced]);

  const query = {
    ...range,
    source: source === 'all' ? undefined : source,
    kind: kind === 'all' ? undefined : kind,
    cat: cat || undefined,
    q: debounced || undefined,
    limit,
  };
  const { data, error, loading, reload } = useApi<MonitoringData>('/monitoring', query, { keep: true });
  const activeMonth = months.find((m) => { const r = monthRange(m); return r.from === range.from && r.to === range.to; });

  // Yandex / Pochta the owner hid here count as plain card.
  const incomeGroups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const g of data?.income || []) {
      const key = shownMethod(g.key);
      const cur = map.get(key) || { key, amount: 0, count: 0 };
      map.set(key, { key, amount: cur.amount + g.amount, count: cur.count + g.count });
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [data?.income, shownMethod]);
  const groups = chartKind === 'expense' ? data?.expense || [] : incomeGroups;
  const groupLabel = (key: string) => (chartKind === 'expense' ? categoryLabel(key) : methodLabel(key));

  const pickCategory = (key: string | null) => {
    setCat(key);
    if (key) setKind('all');
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const pickKind = (k: 'all' | Kind) => { setKind(k); setCat(null); };

  // Items grouped by their day, in the order they come (newest first).
  const byDay = useMemo(() => {
    const out: Array<{ day: string; items: Op[] }> = [];
    for (const it of data?.items || []) {
      const day = dateOf(it.at);
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [data?.items]);
  const dayTotals = new Map((data?.days || []).map((d) => [d.day, d]));

  const t = data?.totals;
  const p = data?.previous;
  const first = loading && !data;

  return (
    <>
      <PageHeader title="Monitoring" subtitle="Barcha kirim va rasxodlar bir joyda: qayerdan kelgan, qayerga ketgan" />

      {/* Months, like a calendar strip; any other span through "Davr". */}
      <MonthTabs months={months} active={activeMonth} onPick={(m) => setRange(monthRange(m))} />

      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-2.5 p-3 sm:p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidiruv: mijoz ID, ism, izoh yoki kim kiritgan" className="h-9 pl-9 pr-9" />
            {search && <IconButton label="Tozalash" className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2" onClick={() => setSearch('')}><X className="size-4" /></IconButton>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:ml-auto">
            {allowed.length > 1 && (
              <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)} aria-label="Kassa" className="w-full sm:w-auto">
                <option value="all">Ikkala kassa</option>
                <option value="cash">1-kassa · Naqd</option>
                <option value="card">2-kassa · Karta</option>
              </Select>
            )}
            <Select value={kind} onChange={(e) => pickKind(e.target.value as typeof kind)} aria-label="Operatsiya turi" className={cx('w-full sm:w-auto', allowed.length < 2 && 'col-span-2')}>
              <option value="all">Kirim va rasxod</option>
              <option value="income">Faqat kirim</option>
              <option value="expense">Faqat rasxod</option>
              <option value="adjust">Qoldiq tuzatishlari</option>
            </Select>
            <div className="col-span-2 [&>div>button]:w-full sm:[&>div>button]:w-auto"><DateRangePicker value={range} onChange={setRange} /></div>
          </div>
        </div>
        {cat && (
          <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[13px] text-ink-2 sm:px-4">
            Tanlangan:
            <button type="button" onClick={() => setCat(null)} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-0.5 font-medium text-ink hover:bg-surface-3">
              {EXPENSE_CATEGORIES.some((c) => c.value === cat) ? categoryLabel(cat) : methodLabel(cat)}<X className="size-3.5 text-ink-3" />
            </button>
          </div>
        )}
      </Card>

      {error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <SummaryCard label="Jami kirim" icon={<ArrowDownLeft className="size-4" />} tone="in" value={t?.income} count={t?.income_count}
              previous={p?.income} loading={first} active={kind === 'income'} onClick={() => pickKind(kind === 'income' ? 'all' : 'income')} />
            <SummaryCard label="Jami rasxod" icon={<ArrowUpRight className="size-4" />} tone="out" value={t?.expense} count={t?.expense_count}
              previous={p?.expense} loading={first} active={kind === 'expense'} onClick={() => pickKind(kind === 'expense' ? 'all' : 'expense')} />
            <Card className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:block">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><Scale className="size-4 text-ink-3" />Farq (kirim − rasxod)</div>
              {first ? <div className="skeleton h-7 w-1/2 sm:mt-3" /> : (
                <div className={cx('text-lg font-semibold tracking-tight num sm:mt-2 sm:text-2xl', t && t.income - t.expense < 0 ? 'text-danger' : 'text-ink')}>
                  {t ? (t.income - t.expense < 0 ? '−' : '') + money(Math.abs(t.income - t.expense)) : '—'}
                </div>
              )}
              <div className="mt-1.5 hidden text-xs text-ink-3 sm:block">{t?.adjust ? `Tuzatishlar alohida: ${signedMoney('adjust', t.adjust)}` : 'Qoldiq tuzatishlari kirmaydi'}</div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="xl:sticky xl:top-20 xl:order-last xl:self-start">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold tracking-tight text-ink">Tahlil</h3>
                  <p className="mt-0.5 text-[13px] text-ink-3"><span>{chartKind === 'expense' ? 'Pul nimaga ketgan' : 'Pul qaysi yoʻl bilan kelgan'}</span> · <span>{rangeLabel(range.from, range.to)}</span></p>
                </div>
                <Segmented value={chartKind} onChange={setChartKind} options={[{ value: 'expense', label: 'Rasxod' }, { value: 'income', label: 'Kirim' }]} />
              </div>
              {first ? <div className="skeleton mx-auto size-44 rounded-full" /> : (
                <Breakdown groups={groups} label={groupLabel} total={chartKind === 'expense' ? t?.expense || 0 : t?.income || 0}
                  title={chartKind === 'expense' ? 'Jami rasxod' : 'Jami kirim'} selected={cat} onPick={pickCategory} />
              )}
            </Card>

            <div ref={listRef} className="scroll-mt-20">
              <Card padded={false} className={cx('transition-opacity', loading && data && 'opacity-60')}>
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                  <h3 className="text-[15px] font-semibold tracking-tight text-ink">Operatsiyalar</h3>
                  <span className="text-[13px] text-ink-3 num">{data ? `${data.count} ta` : ''}</span>
                </div>
                {first ? <SkeletonRows rows={8} cols={3} /> : !data?.items.length ? (
                  <EmptyState title="Operatsiya topilmadi" description={`${rangeLabel(range.from, range.to)} oraligʻida tanlangan filtrlarga mos kirim yoki rasxod yoʻq.`} />
                ) : (
                  <>
                    {byDay.map(({ day, items }) => {
                      const d = dayTotals.get(day);
                      return (
                        <section key={day}>
                          <div className="sticky top-14 z-10 flex items-end justify-between gap-3 border-b border-line solid-strip px-4 pb-2 pt-3.5 sm:px-5 lg:top-16">
                            <div>
                              <div className="text-sm font-semibold text-ink">{dayTitle(day)}</div>
                              <div className="text-xs text-ink-3">{weekday(day)}</div>
                            </div>
                            <div className="flex flex-col items-end text-xs num sm:flex-row sm:gap-3">
                              {!!d?.income && <span className="font-medium text-up">+{money(d.income)}</span>}
                              {!!d?.expense && <span className="text-ink-2">−{money(d.expense)}</span>}
                            </div>
                          </div>
                          <ul className="divide-y divide-line">
                            {items.map((it) => <OpRow key={`${it.kind}-${it.id}`} op={it} method={it.method ? shownMethod(it.method) : null} onOpen={() => setOpen(it)} />)}
                          </ul>
                        </section>
                      );
                    })}
                    {data.items.length < data.count && (
                      <div className="border-t border-line p-3 text-center">
                        <Button loading={loading} onClick={() => setLimit((l) => Math.min(l + STEP, 500))} disabled={limit >= 500}>
                          {limit >= 500 ? 'Qolganini koʻrish uchun davrni qisqartiring' : `Yana koʻrsatish (${data.count - data.items.length} ta qoldi)`}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {open && <OpDetails op={open} method={open.method ? shownMethod(open.method) : null} onClose={() => setOpen(null)} />}
    </>
  );
}

function MonthTabs({ months, active, onPick }: { months: string[]; active?: string; onPick: (m: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && ref.current) ref.current.scrollLeft = el.offsetLeft - ref.current.clientWidth / 2 + el.clientWidth / 2;
  }, [active]);
  const thisYear = todayTashkent().slice(0, 4);
  return (
    <div ref={ref} role="tablist" aria-label="Oy" className="no-print -mx-4 mb-3 flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
      {months.map((m) => (
        <button key={m} type="button" role="tab" aria-selected={m === active} onClick={() => onPick(m)}
          className={cx('h-9 shrink-0 rounded-lg px-3.5 text-sm font-medium transition-colors',
            m === active ? 'bg-primary text-primary-fg shadow-soft' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
          {shortMonth(m)}{m.slice(0, 4) !== thisYear && <span className="ml-1 opacity-60">{m.slice(0, 4)}</span>}
        </button>
      ))}
    </div>
  );
}

function SummaryCard({ label, icon, tone, value, count, previous, loading, active, onClick }: {
  label: string; icon: ReactNode; tone: 'in' | 'out'; value?: number; count?: number; previous?: number; loading: boolean; active: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx('anim-rise min-w-0 rounded-xl border bg-surface p-4 text-left shadow-soft transition-colors hover:bg-surface-2 sm:p-5', active ? 'border-[var(--card)]' : 'border-line')}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
        <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-md', tone === 'in' ? 'bg-success-soft text-up' : 'bg-surface-3 text-ink-2')}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      {loading ? <div className="skeleton mt-3 h-7 w-3/4" /> : (
        <div className="mt-2 text-base font-semibold tracking-tight text-ink num min-[400px]:text-lg sm:text-2xl">{money(value || 0)}</div>
      )}
      <div className="mt-1 truncate text-xs text-ink-3 num">
        {loading ? '\u00a0' : <><span>{`${count ?? 0} ta`}</span><span className="hidden sm:inline">{` · oldingi davr ${money(previous ?? 0)}`}</span></>}
      </div>
    </button>
  );
}

/** Donut of the biggest five plus "Boshqalar", and every category as a row underneath. */
function Breakdown({ groups, label, total, title, selected, onPick }: {
  groups: Group[]; label: (key: string) => string; total: number; title: string; selected: string | null; onPick: (key: string | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  if (!total || !groups.length) return <EmptyState title="Bu davrda yozuv yoʻq" description="Tanlangan davr va kassada hisoblash uchun maʼlumot topilmadi." />;
  const top = groups.slice(0, SLICES);
  const rest = groups.slice(SLICES).reduce((s, g) => s + g.amount, 0);
  const slices = [...top.map((g, i) => ({ key: g.key, name: label(g.key), amount: g.amount, color: SLOT_COLORS[i] })),
    ...(rest > 0 ? [{ key: '', name: 'Boshqalar', amount: rest, color: REST_COLOR }] : [])];
  const pct = (n: number) => (n / total) * 100;
  const pctText = (n: number) => { const v = pct(n); return `${v < 1 && v > 0 ? '<1' : Math.round(v)}%`; };

  // Donut geometry: 2px surface gaps between slices.
  const R = 80, W = 22, C = 2 * Math.PI * R;
  let offset = 0;
  const shown = hover !== null ? slices[hover] : null;

  return (
    <div>
      <div className="relative mx-auto size-48">
        <svg viewBox="0 0 200 200" className="size-full -rotate-90" role="img" aria-label={`${title}: ${money(total)}`}>
          <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={W} />
          {slices.map((s, i) => {
            const len = (s.amount / total) * C;
            const gap = slices.length > 1 ? Math.min(2, len / 2) : 0;
            const el = (
              <circle key={s.key || 'rest'} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth={hover === i ? W + 6 : W}
                strokeDasharray={`${Math.max(len - gap, 0.5)} ${C}`} strokeDashoffset={-offset}
                className="cursor-pointer transition-[stroke-width] duration-150"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => s.key && onPick(s.key === selected ? null : s.key)}>
                <title>{`${s.name}: ${money(s.amount)} (${pctText(s.amount)})`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <div className="truncate text-xs text-ink-3">{shown ? shown.name : title}</div>
          <div className="mt-0.5 text-[15px] font-semibold leading-tight text-ink num">{money(shown ? shown.amount : total)}</div>
          {shown && <div className="mt-0.5 text-xs font-medium text-ink-2 num">{pctText(shown.amount)}</div>}
        </div>
      </div>

      <ul className="mt-5 space-y-1">
        {groups.slice(0, all || groups.slice(SLICES).some((g) => g.key === selected) ? groups.length : SLICES).map((g, i) => {
          const color = i < SLICES ? SLOT_COLORS[i] : REST_COLOR;
          const active = selected === g.key;
          return (
            <li key={g.key}>
              <button type="button" onClick={() => onPick(active ? null : g.key)} aria-pressed={active}
                onMouseEnter={() => setHover(i < SLICES ? i : slices.length - 1)} onMouseLeave={() => setHover(null)}
                className={cx('w-full rounded-lg px-2.5 py-2 text-left transition-colors', active ? 'bg-surface-3' : 'hover:bg-surface-2')}>
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{label(g.key)}</span>
                  <span className="text-sm font-semibold text-ink num">{money(g.amount)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(pct(g.amount), 1)}%`, background: color }} />
                  </div>
                  <span className="w-20 text-right text-xs text-ink-3 num">{pctText(g.amount)} · {g.count} ta</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {groups.length > SLICES && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
          {all ? 'Qisqartirish' : `Yana ${groups.length - SLICES} ta turini koʻrsatish`}
        </button>
      )}
    </div>
  );
}

function OpIcon({ op, method, large }: { op: Op; method: string | null; large?: boolean }) {
  const Icon = op.kind === 'income' ? (method === 'cash' ? Banknote : CreditCard) : op.kind === 'adjust' ? Scale : CATEGORY_ICON[op.category || ''] || Receipt;
  return (
    <span className={cx('flex shrink-0 items-center justify-center rounded-xl border border-line',
      large ? 'size-12' : 'size-10',
      op.kind === 'income' ? 'bg-success-soft text-up' : 'bg-surface-2 text-ink-2')}>
      <Icon className={large ? 'size-5' : 'size-[18px]'} strokeWidth={1.9} />
    </span>
  );
}

function opTitle(op: Op) {
  if (op.kind === 'income') return op.client_name || op.client_code || '';
  if (op.kind === 'expense') return categoryLabel(op.category);
  return 'Qoldiq tuzatildi';
}
function opSubtitle(op: Op, method: string | null) {
  if (op.kind === 'income') return [op.client_name ? op.client_code : null, method ? methodLabel(method) : null].filter(Boolean).join(' · ');
  return op.note || kassaLabel(op.source);
}

function OpRow({ op, method, onOpen }: { op: Op; method: string | null; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5">
        <OpIcon op={op} method={method} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{opTitle(op)}</div>
          <div className="truncate text-xs text-ink-3">{opSubtitle(op, method)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cx('text-sm font-semibold num', op.kind === 'income' ? 'text-up' : 'text-ink')}>{signedMoney(op.kind, op.amount)}</div>
          <div className="text-xs text-ink-3 num">{timeOf(op.at)}</div>
        </div>
      </button>
    </li>
  );
}

function OpDetails({ op, method, onClose }: { op: Op; method: string | null; onClose: () => void }) {
  const rows: Array<[string, ReactNode]> = [
    ['Turi', KIND_LABEL[op.kind]],
    ['Kassa', kassaLabel(op.source)],
    ...(op.kind === 'income' && method ? [['Toʻlov usuli', methodLabel(method)] as [string, ReactNode]] : []),
    ...(op.kind === 'expense' ? [['Kategoriya', categoryLabel(op.category)] as [string, ReactNode]] : []),
    ...(op.client_code ? [['Mijoz', <>{op.client_code}{op.client_name && <span className="text-ink-2"> · {op.client_name}</span>}</>] as [string, ReactNode]] : []),
    ...(op.trips ? [['Reyslar soni', String(op.trips)] as [string, ReactNode]] : []),
    ...(op.note ? [['Izoh', op.note] as [string, ReactNode]] : []),
    ['Sana va vaqt', dateTime(op.at)],
    ['Kiritgan', op.by_name],
  ];
  return (
    <Modal open onClose={onClose} title="Operatsiya tafsiloti"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Yopish</Button>
        {op.client_code && <a href={href('clients', { id: op.client_code })} onClick={onClose}><Button className="w-full">Mijoz tarixi</Button></a>}
      </>}>
      <div className="flex items-center gap-3">
        <OpIcon op={op} method={method} large />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-ink">{opTitle(op)}</div>
          <div className="truncate text-[13px] text-ink-3">{opSubtitle(op, method)}</div>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3.5">
        <div>
          <div className="text-xs text-ink-3">Summa</div>
          <div className={cx('mt-0.5 text-2xl font-semibold tracking-tight num', op.kind === 'income' ? 'text-up' : 'text-ink')}>{signedMoney(op.kind, op.amount)}</div>
        </div>
        <Badge tone={op.kind === 'income' ? 'success' : op.kind === 'expense' ? 'neutral' : 'warn'}>{KIND_LABEL[op.kind]}</Badge>
      </div>
      <dl className="mt-4 divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <dt className="shrink-0 text-ink-3">{k}</dt>
            <dd className="min-w-0 break-words text-right text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
