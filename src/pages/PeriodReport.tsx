import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useApi } from '../lib/live';
import { addDays, downloadCsv, formatDate, groupDigits, money, monthLabel, rangeLabel, startOfMonth, startOfWeek, todayTashkent } from '../lib/format';
import type { PeriodRow, Totals } from '../lib/types';
import { DateRangePicker, type Range } from '../components/DateRange';
import { Legend, RevenueChart } from '../components/RevenueChart';
import { Button, Card, CardHeader, Delta, EmptyState, ErrorState, PageHeader, Segmented, SkeletonRows, StatCard, cx, td, th } from '../components/ui';

interface PeriodsResponse { group: 'week' | 'month'; from: string; to: string; rows: PeriodRow[]; totals: Totals }

function defaultRange(group: 'week' | 'month'): Range {
  const t = todayTashkent();
  if (group === 'week') return { from: startOfWeek(addDays(t, -7 * 11)), to: t };
  const d = new Date(`${startOfMonth(t)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 11);
  return { from: d.toISOString().slice(0, 10), to: t };
}

export default function PeriodReport() {
  const [group, setGroup] = useState<'week' | 'month'>('week');
  const [range, setRange] = useState<Range>(() => defaultRange('week'));
  const { data, error, loading, reload } = useApi<PeriodsResponse>('/periods', { group, ...range });

  const label = (period: string) => (group === 'month' ? monthLabel(period) : `${formatDate(period, false)} – ${formatDate(addDays(period, 6))}`);
  const chartData = useMemo(() => [...(data?.rows || [])].reverse().map((r) => ({ key: r.period, cash: r.cash, card: r.card, total: r.total, count: r.count })), [data]);
  const best = data?.rows.reduce<PeriodRow | null>((b, r) => (!b || r.total > b.total ? r : b), null);
  const avg = data && data.rows.length ? Math.round(data.totals.total / data.rows.length) : 0;

  function exportCsv() {
    if (!data) return;
    downloadCsv(`hisobot_${group === 'week' ? 'haftalik' : 'oylik'}_${range.from}_${range.to}.csv`, [
      ['Davr', 'Operatsiyalar', 'Mijozlar', 'Naqd (soʻm)', 'Karta (soʻm)', 'Jami (soʻm)'],
      ...data.rows.map((r) => [label(r.period), r.count, r.clients, r.cash, r.card, r.total]),
      ['Jami', data.totals.count, '', data.totals.cash, data.totals.card, data.totals.total],
    ]);
  }

  return (
    <>
      <PageHeader
        title="Haftalik va oylik hisobot"
        subtitle={rangeLabel(range.from, range.to)}
        actions={<>
          <Segmented value={group} onChange={(g) => { setGroup(g); setRange(defaultRange(g)); }} options={[{ value: 'week', label: 'Haftalik' }, { value: 'month', label: 'Oylik' }]} />
          <DateRangePicker value={range} onChange={setRange} />
          <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!data?.rows.length}>CSV</Button>
        </>}
      />

      {error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="col-span-2 xl:col-span-1"><StatCard label="Davr boʻyicha jami" value={data?.totals.total || 0} loading={loading} hint={data ? `${groupDigits(data.totals.count)} ta operatsiya` : undefined} /></div>
            <StatCard label="Naqd" accent="var(--cash)" value={data?.totals.cash || 0} loading={loading} />
            <StatCard label="Karta" accent="var(--card)" value={data?.totals.card || 0} loading={loading} />
            <div className="col-span-2 xl:col-span-1">
              <StatCard label={group === 'week' ? 'Oʻrtacha haftalik' : 'Oʻrtacha oylik'} value={avg} loading={loading} hint={best ? `Eng yaxshi: ${label(best.period)}` : undefined} />
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader title={group === 'week' ? 'Haftalar boʻyicha tushum' : 'Oylar boʻyicha tushum'} action={<Legend />} />
            {loading ? <div className="skeleton h-[260px]" /> : !chartData.length ? <EmptyState title="Bu davrda maʼlumot yoʻq" /> : <RevenueChart data={chartData} labelMode={group} />}
          </Card>

          <Card className="mt-4" padded={false}>
            {loading ? <SkeletonRows rows={6} cols={6} /> : !data?.rows.length ? <EmptyState title="Bu davrda operatsiya yoʻq" /> : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full">
                  <thead className="border-b border-line bg-surface-2/60">
                    <tr>
                      <th className={th}>{group === 'week' ? 'Hafta' : 'Oy'}</th>
                      <th className={cx(th, 'text-right')}>Operatsiya</th>
                      <th className={cx(th, 'text-right')}>Mijoz</th>
                      <th className={cx(th, 'text-right')}>Naqd</th>
                      <th className={cx(th, 'text-right')}>Karta</th>
                      <th className={cx(th, 'text-right')}>Jami</th>
                      <th className={cx(th, 'text-right')}>Oʻzgarish</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.rows.map((r, i) => {
                      const prev = data.rows[i + 1];
                      return (
                        <tr key={r.period} className="hover:bg-surface-2/60">
                          <td className={cx(td, 'font-medium')}>{label(r.period)}</td>
                          <td className={cx(td, 'text-right num text-ink-2')}>{groupDigits(r.count)}</td>
                          <td className={cx(td, 'text-right num text-ink-2')}>{groupDigits(r.clients)}</td>
                          <td className={cx(td, 'text-right num')}>{money(r.cash)}</td>
                          <td className={cx(td, 'text-right num')}>{money(r.card)}</td>
                          <td className={cx(td, 'text-right font-semibold num')}>{money(r.total)}</td>
                          <td className={cx(td, 'text-right')}>{prev ? <Delta current={r.total} previous={prev.total} /> : <span className="text-xs text-ink-3">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-surface-2/60">
                    <tr>
                      <td className={cx(td, 'font-semibold')}>Jami</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{groupDigits(data.totals.count)}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{groupDigits(data.totals.clients || 0)}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{money(data.totals.cash)}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{money(data.totals.card)}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{money(data.totals.total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
