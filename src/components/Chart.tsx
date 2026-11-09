import { lazy, Suspense, type ComponentProps } from 'react';
import { PAY_GROUPS } from '../lib/format';

// The chart library is large, so it loads on its own: the page's numbers show at once and the chart
// fills in a moment later instead of the whole page waiting for it.
const Inner = lazy(() => import('./RevenueChart').then((m) => ({ default: m.RevenueChart })));
export type { ChartRow } from './RevenueChart';

export function RevenueChart(props: ComponentProps<typeof Inner>) {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: props.height ?? 260 }} />}>
      <Inner {...props} />
    </Suspense>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {PAY_GROUPS.map((m) => (
        <span key={m.value} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: m.color }} />{m.label}</span>
      ))}
    </div>
  );
}

