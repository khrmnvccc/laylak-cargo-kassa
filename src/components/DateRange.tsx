import { useEffect, useRef, useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { addDays, endOfMonth, rangeLabel, startOfMonth, startOfWeek, todayTashkent } from '../lib/format';
import { Button, Input, cx } from './ui';

export interface Range { from: string; to: string }

export function presets(): Array<{ key: string; label: string; range: Range }> {
  const t = todayTashkent();
  const lastMonthEnd = addDays(startOfMonth(t), -1);
  return [
    { key: 'today', label: 'Bugun', range: { from: t, to: t } },
    { key: 'yesterday', label: 'Kecha', range: { from: addDays(t, -1), to: addDays(t, -1) } },
    { key: 'week', label: 'Shu hafta', range: { from: startOfWeek(t), to: t } },
    { key: '7d', label: 'Oxirgi 7 kun', range: { from: addDays(t, -6), to: t } },
    { key: '30d', label: 'Oxirgi 30 kun', range: { from: addDays(t, -29), to: t } },
    { key: 'month', label: 'Shu oy', range: { from: startOfMonth(t), to: t } },
    { key: 'lastMonth', label: 'Oʻtgan oy', range: { from: startOfMonth(lastMonthEnd), to: endOfMonth(lastMonthEnd) } },
  ];
}

export function presetRange(key: string): Range {
  return presets().find((p) => p.key === key)?.range || presets()[0].range;
}

export function DateRangePicker({ value, onChange, align = 'right' }: { value: Range; onChange: (r: Range) => void; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const list = presets();
  const active = list.find((p) => p.range.from === value.from && p.range.to === value.to);

  useEffect(() => setDraft(value), [value.from, value.to]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const today = todayTashkent();
  const valid = draft.from && draft.to && draft.from <= draft.to && draft.to <= today;

  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((o) => !o)} icon={<CalendarRange className="size-4 text-ink-3" />} aria-expanded={open}>
        <span className="max-w-[220px] truncate">{active ? active.label : rangeLabel(value.from, value.to)}</span>
        <ChevronDown className="size-3.5 text-ink-3" />
      </Button>
      {open && (
        <div className={cx('absolute top-11 z-40 w-[300px] rounded-xl border border-line bg-surface p-2 shadow-pop anim-pop sm:w-[440px]', align === 'right' ? 'right-0' : 'left-0', 'max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:w-auto')}>
          <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
            <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-1">
              {list.map((p) => (
                <button key={p.key} onClick={() => { onChange(p.range); setOpen(false); }}
                  className={cx('rounded-md px-2.5 py-1.5 text-left text-sm transition-colors', active?.key === p.key ? 'bg-surface-3 font-medium text-ink' : 'text-ink-2 hover:bg-surface-2')}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="space-y-3 border-line p-2 sm:border-l sm:pl-3">
              <div className="text-xs font-medium text-ink-3">Oraliqni tanlash</div>
              <label className="block space-y-1 text-xs text-ink-2">
                Boshlanish
                <Input type="date" value={draft.from} max={today} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="h-9" />
              </label>
              <label className="block space-y-1 text-xs text-ink-2">
                Tugash
                <Input type="date" value={draft.to} max={today} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="h-9" />
              </label>
              <Button variant="primary" size="sm" className="w-full" disabled={!valid} onClick={() => { onChange(draft); setOpen(false); }}>Qoʻllash</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
