import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useApi } from '../lib/live';
import { addDays, cardTotal, downloadCsv, formatDate, groupDigits, money, monthLabel, rangeLabel, startOfMonth, startOfWeek, todayTashkent } from '../lib/format';
import type { PeriodRow, Totals } from '../lib/types';
import { DateRangePicker, type Range } from '../components/DateRange';
import { Legend, RevenueChart } from '../components/RevenueChart';
import { PrintButton } from '../components/PrintButton';
import { useAuth } from '../lib/auth';
import { printPeriodReport } from '../lib/reports';
import { Button, Card, CardHeader, Delta, EmptyState, ErrorState, MethodCells, MethodHeads, MethodStatCards, PageHeader, Segmented, SkeletonRows, StatCard, cx, td, th } from '../components/ui';

interface PeriodsResponse { group: 'week' | 'month'; from: string; to: string; rows: PeriodRow[]; totals: Totals }

function defaultRange(group: 'week' | 'month'): Range {
  const t = todayTashkent();
  if (group === 'week') return { from: startOfWeek(addDays(t, -7 * 11)), to: t };
  const d = new Date(`${startOfMonth(t)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 11);
  return { from: d.toISOString().slice(0, 10), to: t };
}

export default function PeriodReport() {
  const { user } = useAuth();
  const [group, setGroup] = useState<'week' | 'month'>('week');
  const [range, setRange] = useState<Range>(() => defaultRange('week'));
  const [cardOpen, setCardOpen] = useState(false);
  const { data, error, loading, reload } = useApi<PeriodsResponse>('/periods', { group, ...range });

  const label = (period: string) => (group === 'month' ? monthLabel(period) : `${formatDate(period, false)} – ${formatDate(addDays(period, 6))}`);
  const chartData = useMemo(() => [...(data?.rows || [])].reverse().map((r) => ({ key: r.period, cash: r.cash, card: r.card, yandex: r.yandex, pochta: r.pochta, total: r.total, count: r.count })), [data]);
  const best = data?.rows.reduce<PeriodRow | null>((b, r) => (!b || r.total > b.total ? r : b), null);
  const avg = data && data.rows.length ? Math.round(data.totals.total / data.rows.length) : 0;

  function exportCsv() {
    if (!data) return;
    downloadCsv(`hisobot_${group === 'week' ? 'haftalik' : 'oylik'}_${range.from}_${range.to}.csv`, [
      ['Davr', 'Operatsiyalar', 'Mijozlar', 'Naqd (soʻm)', 'Karta jami (soʻm)', 'shundan karta', 'shundan Yandex', 'shundan Pochta', 'Jami (soʻm)'],
      ...data.rows.map((r) => [label(r.period), r.count, r.clients, r.cash, cardTotal(r), r.card, r.yandex, r.pochta, r.total]),
      ['Jami', data.totals.count, '', data.totals.cash, cardTotal(data.totals), data.totals.card, data.totals.yandex, data.totals.pochta, data.totals.total],
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
          <PrintButton disabled={!data?.rows.length} run={() => data && printPeriodReport({ group, from: data.from, to: data.to, rows: data.rows, totals: data.totals, label, printedBy: user.full_name })} />
        </>}
      />

      {error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="col-span-2 xl:col-span-1"><StatCard label="Davr boʻyicha jami" value={data?.totals.total || 0} loading={loading} hint={data ? `${groupDigits(data.totals.count)} ta operatsiya` : undefined} /></div>
            <MethodStatCards t={data?.totals} loading={loading} />
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
                      <MethodHeads open={cardOpen} onToggle={() => setCardOpen((o) => !o)} />
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
                          <MethodCells row={r} open={cardOpen} />
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
                      <MethodCells row={data.totals} open={cardOpen} bold />
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
