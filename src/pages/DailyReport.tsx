import { useState } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useApi } from '../lib/live';
import { addDays, formatDate, groupDigits, money, todayTashkent, weekday } from '../lib/format';
import type { PaymentList, Summary } from '../lib/types';
import { PaymentsTable } from '../components/PaymentsTable';
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorState, IconButton, Input, PageHeader, SkeletonRows, StatCard, cx, td, th } from '../components/ui';

export default function DailyReport({ params }: { params: URLSearchParams }) {
  const today = todayTashkent();
  const [date, setDate] = useState(() => params.get('date') || today);
  const summary = useApi<Summary>('/summary', { from: date, to: date });
  const list = useApi<PaymentList>('/payments', { from: date, to: date, limit: 500 });
  const t = summary.data?.totals;
  const p = summary.data?.previous;

  return (
    <>
      <PageHeader
        title="Kunlik hisobot"
        subtitle={<><span className="text-ink-2">{weekday(date)}</span>, {formatDate(date)}</>}
        actions={<>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5 shadow-soft">
            <IconButton label="Oldingi kun" className="size-8" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="size-4" /></IconButton>
            <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 w-[150px] border-0 shadow-none" aria-label="Sana" />
            <IconButton label="Keyingi kun" className="size-8 disabled:opacity-40" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}><ChevronRight className="size-4" /></IconButton>
          </div>
          {date !== today && <Button onClick={() => setDate(today)}>Bugun</Button>}
          <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Chop etish</Button>
        </>}
      />

      {summary.error && !summary.data ? <Card><ErrorState message={summary.error} onRetry={summary.reload} /></Card> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="col-span-2 xl:col-span-1"><StatCard label="Jami tushum" value={t?.total || 0} previous={p?.total} hint="oldingi kunga nisbatan" loading={summary.loading} /></div>
            <StatCard label="Naqd" accent="var(--cash)" value={t?.cash || 0} previous={p?.cash} loading={summary.loading} />
            <StatCard label="Karta" accent="var(--card)" value={t?.card || 0} previous={p?.card} loading={summary.loading} />
            <div className="col-span-2 xl:col-span-1"><StatCard label="Operatsiyalar" value={t?.count || 0} previous={p?.count} format={groupDigits} loading={summary.loading} hint={t ? `${t.clients || 0} ta mijoz` : undefined} /></div>
          </div>

          <Card className="mt-4" padded={false}>
            <div className="px-4 pt-4 sm:px-5"><CardHeader title="Ishchilar kesimida" subtitle="Har bir xodim kiritgan tushum" /></div>
            {summary.loading ? <SkeletonRows rows={3} cols={5} /> : !summary.data?.byWorker.length ? (
              <EmptyState title="Bu kunda operatsiya yoʻq" />
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full">
                  <thead className="border-y border-line bg-surface-2/60">
                    <tr>
                      <th className={th}>Ishchi</th>
                      <th className={cx(th, 'text-right')}>Operatsiya</th>
                      <th className={cx(th, 'text-right')}>Naqd</th>
                      <th className={cx(th, 'text-right')}>Karta</th>
                      <th className={cx(th, 'text-right')}>Jami</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {summary.data.byWorker.map((w) => (
                      <tr key={w.id}>
                        <td className={td}><div className="flex items-center gap-2.5"><Avatar name={w.name} size="sm" />{w.name}</div></td>
                        <td className={cx(td, 'text-right num text-ink-2')}>{w.count}</td>
                        <td className={cx(td, 'text-right num')}>{money(w.cash)}</td>
                        <td className={cx(td, 'text-right num')}>{money(w.card)}</td>
                        <td className={cx(td, 'text-right font-semibold num')}>{money(w.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-surface-2/60">
                    <tr>
                      <td className={cx(td, 'font-semibold')}>Jami</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{t?.count}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{money(t?.cash)}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{money(t?.card)}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{money(t?.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card className="mt-4" padded={false}>
            <div className="px-4 pb-3 pt-4 sm:px-5">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">Kun davomidagi operatsiyalar</h3>
              <p className="mt-0.5 text-[13px] text-ink-3">{list.data ? `${list.data.count} ta faol operatsiya` : ' '}</p>
            </div>
            <div className="border-t border-line">
              {list.loading ? <SkeletonRows rows={5} /> : !list.data?.items.length ? <EmptyState title="Operatsiya yoʻq" /> : <PaymentsTable items={list.data.items} showDate={false} />}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
