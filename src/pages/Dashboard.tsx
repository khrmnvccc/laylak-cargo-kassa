import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApi } from '../lib/live';
import { PAY_GROUPS, addDays, compactMoney, groupDigits, money, rangeLabel } from '../lib/format';
import { href } from '../lib/router';
import type { Summary } from '../lib/types';
import { DateRangePicker, presetRange, type Range } from '../components/DateRange';
import { PaymentsTable } from '../components/PaymentsTable';
import { Legend, RevenueChart } from '../components/RevenueChart';
import { Avatar, Card, CardHeader, Delta, EmptyState, ErrorState, MethodStatCards, PageHeader, SkeletonRows, StatCard } from '../components/ui';

export default function Dashboard() {
  const [range, setRange] = useState<Range>(() => presetRange('today'));
  const { data, error, loading, reload } = useApi<Summary>('/summary', range);
  // Chart always shows at least the last 14 days, so a single-day selection still has context.
  const chartRange = range.from === range.to ? { from: addDays(range.to, -13), to: range.to } : range;
  const chart = useApi<Summary>('/summary', chartRange);

  const t = data?.totals;
  const p = data?.previous;
  const single = range.from === range.to;
  const compareLabel = single ? 'oldingi kunga nisbatan' : 'oldingi davrga nisbatan';

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={<>Umumiy moliyaviy holat · <span className="text-ink-2">{rangeLabel(range.from, range.to)}</span></>}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {error && !data ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <StatCard label={single ? 'Jami tushum' : 'Davr tushumi'} value={t?.total || 0} previous={p?.total} hint={`Naqd + karta · ${compareLabel}`} loading={loading} />
            <StatCard label="Operatsiyalar soni" value={t?.count || 0} previous={p?.count} loading={loading} format={(n) => groupDigits(n)}
              hint={t ? `${t.clients || 0} ta mijoz` : undefined} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
            <MethodStatCards t={t} p={p} loading={loading} total={t?.total} />
          </div>

          {t && t.total > 0 && (
            <div className="mt-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="flex h-1.5">
                {PAY_GROUPS.map((m) => <div key={m.value} className="transition-all duration-500" style={{ background: m.color, width: `${(m.sum(t) / t.total) * 100}%` }} />)}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader
                title="Kunlar boʻyicha tushum"
                subtitle={chart.data ? `${rangeLabel(chart.data.from, chart.data.to)} · jami ${money(chart.data.totals.total)}` : ' '}
                action={<Legend />}
              />
              {chart.loading ? <div className="skeleton h-[260px]" /> : chart.error ? <ErrorState message={chart.error} onRetry={chart.reload} /> : (
                <RevenueChart data={(chart.data?.byDay || []).map((d) => ({ key: d.day, cash: d.cash, card: d.card, yandex: d.yandex, pochta: d.pochta, total: d.total, count: d.count }))} />
              )}
            </Card>

            <Card>
              <CardHeader title="Ishchilar tushumi" subtitle={rangeLabel(range.from, range.to)} />
              {loading ? <SkeletonRows rows={4} cols={2} /> : !data?.byWorker.length ? (
                <EmptyState title="Bu davrda operatsiya yoʻq" description="Ishchilar toʻlov kiritgach, ularning tushumi shu yerda koʻrinadi." />
              ) : (
                <ul className="space-y-3.5">
                  {data.byWorker.map((w) => {
                    const share = t?.total ? (w.total / t.total) * 100 : 0;
                    return (
                      <li key={w.id}>
                        <div className="flex items-center gap-3">
                          <Avatar name={w.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium text-ink">{w.name}</span>
                              <span className="text-sm font-semibold text-ink num">{compactMoney(w.total)}</span>
                            </div>
                            <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
                              {PAY_GROUPS.map((m) => <div key={m.value} style={{ background: m.color, width: `${t?.total ? (m.sum(w) / t.total) * 100 : 0}%` }} />)}
                            </div>
                            <div className="mt-1 flex justify-between text-xs text-ink-3 num">
                              <span>{w.count} ta operatsiya</span>
                              <span>{Math.round(share)}%</span>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <Card className="mt-4" padded={false}>
            <div className="flex items-center justify-between px-4 pb-3 pt-4 sm:px-5">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">Oxirgi operatsiyalar</h3>
                {p && t && <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3">Oldingi davr: {money(p.total)} <Delta current={t.total} previous={p.total} /></p>}
              </div>
              <a href={href('operations')} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
                Barchasi <ArrowRight className="size-4" />
              </a>
            </div>
            <div className="border-t border-line">
              {loading ? <SkeletonRows rows={5} /> : !data?.recent.length ? (
                <EmptyState title="Hali operatsiya yoʻq" description="Tanlangan davrda hech qanday toʻlov kiritilmagan." />
              ) : (
                <PaymentsTable items={data.recent} compact />
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
