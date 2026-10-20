import { useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, LogIn, LogOut, MapPin, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { currentPosition, duration, fromLocalInput, groupByDay, minutesBetween, toLocalInput, type DayAttendance } from '../lib/attendance';
import { formatDate, nowMs, rangeLabel, timeOf, todayTashkent, weekday } from '../lib/format';
import { useApi, useLive } from '../lib/live';
import { can } from '../lib/perms';
import type { AttendanceRow } from '../lib/types';
import { useAttendanceActions, useMinuteTick } from '../components/AttendanceButton';
import { DateRangePicker, presetRange, type Range } from '../components/DateRange';
import { Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, PageHeader, SkeletonRows, cx, td, th, useToast } from '../components/ui';

export default function Attendance() {
  const { user } = useAuth();
  const seesAll = can(user, 'staff.view');
  useMinuteTick();
  return (
    <>
      <PageHeader title="Davomat" subtitle={seesAll ? 'Kim qachon kelib-ketgani va qancha ishlagani' : 'Ishga kelish va ketishingiz'} />
      <div className="space-y-4">
        <div className={cx('grid gap-4', can(user, 'staff.manage') && 'lg:grid-cols-2')}>
          <TodayCard />
          {can(user, 'staff.manage') && <OfficeCard />}
        </div>
        {seesAll ? <TeamReport /> : <MyHistory />}
      </div>
    </>
  );
}

function TodayCard() {
  const { me, busy, mark } = useAttendanceActions();
  const today = todayTashkent();
  const days = useMemo(() => groupByDay(me.data?.items || []), [me.data]);
  const todayRow = days.find((d) => d.day === today);
  const open = me.data?.open;

  return (
    <Card>
      <CardHeader title="Bugun" subtitle={<><span className="text-ink-2">{weekday(today)}</span>, {formatDate(today)}</>} />
      {me.error && !me.data ? <ErrorState message={me.error} onRetry={me.reload} /> : !me.data ? <div className="skeleton h-28" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Keldim" value={todayRow ? timeOf(todayRow.firstIn) : '—'} />
            <Mini label="Ketdim" value={todayRow?.lastOut && !open ? timeOf(todayRow.lastOut) : '—'} />
            <Mini label="Ishladim" value={todayRow ? duration(todayRow.minutes) : '—'} />
          </div>
          {open ? (
            <Button variant="danger" size="lg" className="w-full" loading={busy === 'check-out'} icon={<LogOut className="size-5" />} onClick={() => void mark('check-out')}>
              Ketdim
            </Button>
          ) : (
            <Button variant="success" size="lg" className="w-full" loading={busy === 'check-in'} icon={<LogIn className="size-5" />} onClick={() => void mark('check-in')}>
              Keldim
            </Button>
          )}
          <p className="flex items-start gap-1.5 text-xs text-ink-3">
            <MapPin className="mt-px size-3.5 shrink-0" />
            {me.data.officeSet
              ? `Belgilash faqat ishxonadan ${me.data.radius} m ichida ishlaydi. Telefon joylashuvni soʻrasa, ruxsat bering.`
              : 'Ishxona joylashuvi hali belgilanmagan, shuning uchun hozircha istalgan joydan belgilanadi.'}
          </p>
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2.5">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold text-ink num">{value}</div>
    </div>
  );
}

function OfficeCard() {
  const office = useApi<{ office: { lat: number; lng: number; radius: number } | null }>('/office');
  const { bump } = useLive();
  const toast = useToast();
  const [radius, setRadius] = useState('');
  const [busy, setBusy] = useState(false);
  const current = office.data?.office;
  const r = Number(radius || current?.radius || 150);

  async function setHere() {
    if (!Number.isInteger(r) || r < 20 || r > 5000) return toast({ tone: 'error', title: 'Radius 20 dan 5000 metrgacha boʻlsin' });
    setBusy(true);
    try {
      const pos = await currentPosition();
      await api('/office', { method: 'PUT', body: { lat: pos.lat, lng: pos.lng, radius: r } });
      toast({ tone: 'success', title: 'Ishxona joylashuvi saqlandi', description: `Radius ${r} m · aniqlik ±${Math.round(pos.accuracy)} m` });
      office.reload();
      bump();
    } catch (e) {
      toast({ tone: 'error', title: 'Saqlanmadi', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await api('/office', { method: 'PUT', body: { office: null } });
      toast({ tone: 'success', title: 'Ishxona joylashuvi oʻchirildi', description: 'Endi istalgan joydan belgilash mumkin' });
      office.reload();
      bump();
    } catch (e) {
      toast({ tone: 'error', title: 'Oʻchirilmadi', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Ishxona joylashuvi" subtitle="Xodimlar faqat shu joy yonida “Keldim” va “Ketdim” bosa oladi" />
      {office.loading ? <div className="skeleton h-20" /> : (
        <div className="space-y-3">
          {current ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
              <span className="text-ink-2 num">{current.lat.toFixed(5)}, {current.lng.toFixed(5)} · {current.radius} m</span>
              <a className="shrink-0 text-xs font-medium text-ink hover:underline" target="_blank" rel="noopener noreferrer"
                href={`https://www.google.com/maps?q=${current.lat},${current.lng}`}>Xaritada</a>
            </div>
          ) : <Alert tone="warn">Belgilanmagan: hozir xodimlar istalgan joydan belgilay oladi.</Alert>}
          <Field label="Radius, metr" hint="Ishxona atrofidagi ruxsat etilgan masofa. Odatda 100–200 m." htmlFor="of-radius">
            <Input id="of-radius" inputMode="numeric" value={radius} placeholder={String(current?.radius || 150)} onChange={(e) => setRadius(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Button variant="primary" className="w-full" loading={busy} icon={<MapPin className="size-4" />} onClick={() => void setHere()}>
            Hozirgi joyimni ishxona deb belgilash
          </Button>
          {current && <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void clear()}>Joylashuv cheklovini oʻchirish</Button>}
          <p className="text-xs text-ink-3">Bu tugmani ishxonaning ichida turib bosing.</p>
        </div>
      )}
    </Card>
  );
}

function MyHistory() {
  const me = useApi<{ items: AttendanceRow[] }>('/attendance/me');
  const days = useMemo(() => groupByDay(me.data?.items || []), [me.data]);
  const month = todayTashkent().slice(0, 7);
  const thisMonth = days.filter((d) => d.day.startsWith(month));
  return (
    <Card padded={false}>
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">Mening davomatim</h3>
        <p className="mt-0.5 text-[13px] text-ink-3">{`Shu oy: ${thisMonth.length} kun · ${duration(thisMonth.reduce((s, d) => s + d.minutes, 0))}`}</p>
      </div>
      <div className="border-t border-line">
        {me.error && !me.data ? <ErrorState message={me.error} onRetry={me.reload} /> : me.loading ? <SkeletonRows rows={4} cols={4} /> : !days.length ? (
          <EmptyState title="Hali belgilanmagan" description="Ishga kelganingizda “Keldim” ni bosing" />
        ) : <DaysTable days={days} />}
      </div>
    </Card>
  );
}

function DayOut({ d }: { d: DayAttendance }) {
  return d.open ? <Badge tone="success">Ishda</Badge> : d.forgot ? <Badge tone="warn">Ketdim bosilmagan</Badge> : <>{d.lastOut ? timeOf(d.lastOut) : '—'}</>;
}

function DaysTable({ days, showName, onEdit }: { days: DayAttendance[]; showName?: boolean; onEdit?: (r: AttendanceRow) => void }) {
  return (
    <>
    {/* Phones: one compact line per day. */}
    <ul className="divide-y divide-line sm:hidden">
      {days.map((d) => (
        <li key={`${d.userId}|${d.day}`} className="flex items-center gap-3 px-4 py-2.5">
          <div className="w-24 shrink-0">
            <div className="text-sm font-medium text-ink">{formatDate(d.day, false)}</div>
            <div className="text-xs text-ink-3">{weekday(d.day)}</div>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-sm text-ink-2 num">
            {timeOf(d.firstIn)} – <DayOut d={d} />
          </div>
          <div className="shrink-0 text-right text-sm font-medium text-ink num">{duration(d.minutes)}</div>
          {onEdit && <Button variant="ghost" size="sm" aria-label="Tahrirlash" onClick={() => onEdit(d.rows[d.rows.length - 1])}><Pencil className="size-3.5" /></Button>}
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto scrollbar-thin sm:block">
      <table className="w-full">
        <thead className="border-b border-line bg-surface-2/60">
          <tr>
            <th className={th}>Sana</th>
            {showName && <th className={th}>Xodim</th>}
            <th className={th}>Keldi</th>
            <th className={th}>Ketdi</th>
            <th className={cx(th, 'text-right')}>Ishladi</th>
            {onEdit && <th className="w-10" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {days.map((d) => (
            <tr key={`${d.userId}|${d.day}`} className="hover:bg-surface-2/60">
              <td className={td}>
                <div className="font-medium">{formatDate(d.day, false)}</div>
                <div className="text-xs text-ink-3">{weekday(d.day)}</div>
              </td>
              {showName && <td className={td}>{d.name}</td>}
              <td className={cx(td, 'num')}>{timeOf(d.firstIn)}</td>
              <td className={cx(td, 'num')}>
                <DayOut d={d} />
                {d.rows.length > 1 && <div className="text-xs text-ink-3">{`${d.rows.length} marta kelgan`}</div>}
              </td>
              <td className={cx(td, 'text-right font-medium num')}>{duration(d.minutes)}</td>
              {onEdit && (
                <td className="pr-3">
                  <Button variant="ghost" size="sm" aria-label="Tahrirlash" onClick={() => onEdit(d.rows[d.rows.length - 1])}><Pencil className="size-3.5" /></Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

interface TeamData { from: string; to: string; items: AttendanceRow[]; staff: Array<{ id: string; full_name: string; role: string; is_active: boolean }> }

function TeamReport() {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>(() => presetRange('month'));
  const { data, error, loading, reload } = useApi<TeamData>('/attendance', range);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  const days = useMemo(() => groupByDay(data?.items || []), [data]);

  const people = useMemo(() => {
    if (!data) return [];
    return data.staff.map((s) => {
      const mine = days.filter((d) => d.userId === s.id);
      const minutes = mine.reduce((sum, d) => sum + d.minutes, 0);
      // Usual arrival: average clock time of the first arrival of each day.
      const arrivals = mine.map((d) => { const [h, m] = timeOf(d.firstIn).split(':').map(Number); return h * 60 + m; });
      const avgIn = arrivals.length ? Math.round(arrivals.reduce((a, b) => a + b, 0) / arrivals.length) : null;
      return { ...s, days: mine, minutes, avgIn, atWork: mine.some((d) => d.open), forgot: mine.filter((d) => d.forgot).length };
    }).filter((p) => p.is_active || p.days.length);
  }, [data, days]);

  const atWork = people.filter((p) => p.atWork).length;
  const totalMinutes = people.reduce((s, p) => s + p.minutes, 0);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-3">{rangeLabel(range.from, range.to)}</div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Hozir ishda" value={data ? `${atWork} / ${people.filter((p) => p.is_active).length}` : '—'} />
        <Kpi label="Jami ishlangan vaqt" value={data ? duration(totalMinutes) : '—'} />
        <Kpi label="Ish kunlari (jami)" value={data ? String(days.length) : '—'} className="col-span-2 sm:col-span-1" />
      </div>
      <Card padded={false}>
        {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading ? <SkeletonRows rows={4} cols={5} /> : !people.length ? (
          <EmptyState title="Xodimlar yoʻq" />
        ) : (
          <>
          {/* Phones: a card line per person, tap to see the days. */}
          <ul className="divide-y divide-line sm:hidden">
            {people.map((p) => {
              const expanded = openId === p.id;
              const open = p.days.find((d) => d.open);
              return (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpenId(expanded ? null : p.id)}>
                    <Avatar name={p.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{p.full_name}</div>
                      <div className="text-xs text-ink-3 num">{`${p.days.length} kun · ${duration(p.minutes)}`}</div>
                      {p.forgot > 0 && <div className="text-xs text-warn">{`${p.forgot} kun “Ketdim” bosilmagan`}</div>}
                    </div>
                    {open ? <Badge tone="success">Ishda</Badge> : <span className="text-xs text-ink-3">Yoʻq</span>}
                    <ChevronDown className={cx('size-4 shrink-0 text-ink-3 transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && (
                    <div className="border-t border-line bg-surface-2/40">
                      {p.days.length ? <DaysTable days={p.days} onEdit={can(user, 'staff.manage') ? setEditing : undefined} /> : <div className="px-4 py-3 text-sm text-ink-3">Bu davrda belgilanmagan</div>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto scrollbar-thin sm:block">
            <table className="w-full">
              <thead className="border-b border-line bg-surface-2/60">
                <tr>
                  <th className={th}>Xodim</th>
                  <th className={cx(th, 'text-right')}>Kunlar</th>
                  <th className={cx(th, 'text-right')}>Jami vaqt</th>
                  <th className={cx(th, 'text-right')}>Kuniga oʻrtacha</th>
                  <th className={cx(th, 'text-right')}>Odatda keladi</th>
                  <th className={th}>Hozir</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => {
                  const expanded = openId === p.id;
                  return (
                    <PersonRows key={p.id} expanded={expanded} onToggle={() => setOpenId(expanded ? null : p.id)}
                      person={p} onEdit={can(user, 'staff.manage') ? setEditing : undefined} />
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
      {editing && <EditModal row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PersonRows({ person: p, expanded, onToggle, onEdit }: {
  person: { id: string; full_name: string; days: DayAttendance[]; minutes: number; avgIn: number | null; atWork: boolean; forgot: number };
  expanded: boolean; onToggle: () => void; onEdit?: (r: AttendanceRow) => void;
}) {
  const open = p.days.find((d) => d.open);
  return (
    <>
      <tr className="cursor-pointer hover:bg-surface-2/60" onClick={onToggle}>
        <td className={td}>
          <div className="flex items-center gap-3">
            <Avatar name={p.full_name} size="sm" />
            <div>
              <div className="font-medium">{p.full_name}</div>
              {p.forgot > 0 && <div className="text-xs text-warn">{`${p.forgot} kun “Ketdim” bosilmagan`}</div>}
            </div>
          </div>
        </td>
        <td className={cx(td, 'text-right num')}>{p.days.length}</td>
        <td className={cx(td, 'text-right font-semibold num')}>{duration(p.minutes)}</td>
        <td className={cx(td, 'text-right num text-ink-2')}>{p.days.length ? duration(p.minutes / p.days.length) : '—'}</td>
        <td className={cx(td, 'text-right num text-ink-2')}>{p.avgIn === null ? '—' : `${String(Math.floor(p.avgIn / 60)).padStart(2, '0')}:${String(p.avgIn % 60).padStart(2, '0')}`}</td>
        <td className={td}>
          {open ? <Badge tone="success">{`Ishda · ${duration(minutesBetween(open.rows[open.rows.length - 1].check_in_at, nowMs()))}`}</Badge> : <span className="text-xs text-ink-3">Yoʻq</span>}
        </td>
        <td className="pr-3 text-ink-3"><ChevronDown className={cx('size-4 transition-transform', expanded && 'rotate-180')} /></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-surface-2/40 p-0">
            {p.days.length ? <DaysTable days={p.days} onEdit={onEdit} /> : <div className="px-4 py-4 text-sm text-ink-3">Bu davrda belgilanmagan</div>}
          </td>
        </tr>
      )}
    </>
  );
}

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card className={cx('!p-4', className)}>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tracking-tight text-ink num">{value}</div>
    </Card>
  );
}

function EditModal({ row, onClose }: { row: AttendanceRow; onClose: () => void }) {
  const { bump } = useLive();
  const toast = useToast();
  const [inAt, setInAt] = useState(toLocalInput(row.check_in_at));
  const [outAt, setOutAt] = useState(row.check_out_at && !row.forgot_out ? toLocalInput(row.check_out_at) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!inAt) return setError('Kelish vaqtini kiriting');
    if (outAt && outAt < inAt) return setError('Ketish vaqti kelish vaqtidan oldin boʻlmasin');
    setBusy(true);
    try {
      await api(`/attendance/${row.id}`, { method: 'PATCH', body: { checkInAt: fromLocalInput(inAt), checkOutAt: outAt ? fromLocalInput(outAt) : null } });
      toast({ tone: 'success', title: 'Vaqt tuzatildi' });
      bump();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" title="Vaqtni tuzatish" description={`${row.user_name} · ${formatDate(row.day)}`}
      footer={<>
        <Button onClick={onClose}>Bekor qilish</Button>
        <Button variant="primary" type="submit" form="att-form" loading={busy}>Saqlash</Button>
      </>}>
      <form id="att-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Keldi" htmlFor="att-in"><Input id="att-in" type="datetime-local" value={inAt} onChange={(e) => setInAt(e.target.value)} /></Field>
        <Field label="Ketdi" hint="Hali ishda boʻlsa, boʻsh qoldiring" htmlFor="att-out"><Input id="att-out" type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} /></Field>
        {row.edited_by_name && <p className="text-xs text-ink-3">Oldin {row.edited_by_name} tuzatgan</p>}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
