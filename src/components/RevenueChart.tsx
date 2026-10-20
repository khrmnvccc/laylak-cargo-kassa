import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compactMoney, formatDate, formatDateShort, monthLabel, money, weekday } from '../lib/format';

export interface ChartRow { key: string; cash: number; card: number; total: number; count?: number }

function ChartTooltip({ active, payload, labelMode }: any) {
  if (!active || !payload?.length) return null;
  const row: ChartRow = payload[0].payload;
  const title = labelMode === 'month' ? monthLabel(row.key) : labelMode === 'week' ? `${formatDate(row.key, false)} dan boshlangan hafta` : `${weekday(row.key)}, ${formatDate(row.key)}`;
  return (
    <div className="min-w-[200px] rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] shadow-pop">
      <div className="mb-2 font-medium text-ink">{title}</div>
      <div className="space-y-1">
        <Row color="var(--cash)" label="Naqd" value={row.cash} />
        <Row color="var(--card)" label="Karta" value={row.card} />
      </div>
      <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium text-ink num">
        <span>Jami</span><span>{money(row.total)}</span>
      </div>
      {row.count !== undefined && <div className="mt-1 text-xs text-ink-3">{row.count} ta operatsiya</div>}
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-6 text-ink-2">
      <span className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: color }} />{label}</span>
      <span className="num text-ink">{money(value)}</span>
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-ink-2">
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-cash" />Naqd</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-card" />Karta</span>
    </div>
  );
}

export function RevenueChart({ data, labelMode = 'day', height = 260 }: { data: ChartRow[]; labelMode?: 'day' | 'week' | 'month'; height?: number }) {
  const tick = (key: string) => (labelMode === 'month' ? monthLabel(key).slice(0, 3) : formatDateShort(key));
  return (
    <div style={{ height }} className="-ml-2 select-none">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
          <XAxis dataKey="key" tickFormatter={tick} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} minTickGap={12} dy={6} />
          <YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} width={58} />
          <Tooltip content={<ChartTooltip labelMode={labelMode} />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="cash" stackId="a" fill="var(--cash)" maxBarSize={36} stroke="var(--surface)" strokeWidth={1} isAnimationActive animationDuration={500} />
          <Bar dataKey="card" stackId="a" fill="var(--card)" maxBarSize={36} radius={[4, 4, 0, 0]} stroke="var(--surface)" strokeWidth={1} isAnimationActive animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
