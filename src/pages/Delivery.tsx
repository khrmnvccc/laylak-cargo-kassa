import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, ChevronDown, Coins, MapPin, Navigation, Play, Plus, Route, Send, Trash2, Truck, X } from 'lucide-react';
import { href, navigate } from '../lib/router';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/live';
import { formatDate, groupDigits, money, monthLabel, startOfMonth, todayTashkent, weekday } from '../lib/format';
import { MAX_STOPS, googlePlaceUrl, googleRouteUrl, roadKmLabel, yandexPlaceUrl, yandexRouteUrl, type Point } from '../lib/delivery';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, IconButton, Input, Modal, PageHeader, cx, useToast } from '../components/ui';

interface Stop { id: number; position: number; lat: number; lng: number; label: string; fee: number; done: boolean; collected: boolean }
interface Trip { id: number; day: string; km: number; source: 'site' | 'bot'; start: Point | null; created_by_name: string | null; created_at: string; stops: Stop[] }
interface DraftStop extends Point { label?: string; fee?: number }
interface DeliveryData {
  month: string;
  trips: Trip[];
  draft: DraftStop[];
  start: (Point & { label?: string; from: 'set' | 'office' }) | null;
  bot: { connected: boolean; on: boolean; botName: string | null };
  totals: { trips: number; stops: number; done: number; earned: number; paidStops: number; waiting: number; km: number };
}

const digitsInput = (value: string) => { const d = value.replace(/\D/g, '').slice(0, 8); return d ? groupDigits(Number(d)) : ''; };
const digitsOf = (value: string) => Number(value.replace(/\D/g, '')) || 0;
const placeName = (s: { label?: string; lat: number; lng: number }) => s.label || `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;

/** "Noy", "Okt", "Iyun"; with the year when it is not this year. */
function shortMonth(m: string) {
  const name = monthLabel(`${m}-01`).replace(/\s\d{4}$/, '');
  const short = name.length <= 4 ? name : name.slice(0, 3);
  return m.slice(0, 4) === todayTashkent().slice(0, 4) ? short : `${short} ʼ${m.slice(2, 4)}`;
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

export default function Delivery({ params }: { params: URLSearchParams }) {
  const toast = useToast();
  const months = useMemo(() => lastMonths(4), []);
  const [month, setMonth] = useState(months[months.length - 1]);
  const { data, error, loading, reload } = useApi<DeliveryData>('/delivery', { month });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Stop | null>(null);
  const [collecting, setCollecting] = useState<Stop | null>(null);
  // Reys rejimi: opened from the bot's "Saytda reysni boshlash", a notification, or the trip's own button.
  const driveId = Number(params.get('drive')) || 0;
  const driving = driveId && data ? data.trips.find((t) => t.id === driveId) ?? null : null;
  const drive = (id: number | null) => navigate('delivery', id ? { drive: String(id) } : undefined);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(name: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(name);
    try {
      await fn();
      if (success) toast({ tone: 'success', title: success });
      reload();
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const t = data?.totals;
  const first = !data && loading;

  return (
    <div>
      <PageHeader title="Yetkazish" subtitle="Shahar ichidagi kechki yetkazishlar: reys tartibi va alohida daromad. Kassaga qoʻshilmaydi."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Yangi reys</Button>} />

      <div role="tablist" aria-label="Oy" className="no-print mx-auto mb-3 flex w-fit max-w-3xl gap-0.5 rounded-lg bg-surface-2 p-0.5">
        {months.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={m === month} onClick={() => setMonth(m)} title={monthLabel(`${m}-01`)}
            className={cx('h-7 rounded-md px-3 text-[13px] font-medium transition-colors',
              m === month ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink')}>
            {shortMonth(m)}
          </button>
        ))}
      </div>

      {error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : (
        <div className="mx-auto max-w-3xl">
          <div className="min-w-0 space-y-4">
            {data && !data.bot.on && (
              <p className="text-[13px] text-ink-3">Telegram bot lokatsiya qabul qilmayapti. Yoqish va boshlanish joyi: <a href={href('settings')} className="font-medium text-primary hover:underline">Sozlamalar → Yetkazish</a></p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <Card className="col-span-2 sm:col-span-1">
                <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><Coins className="size-4 text-up" />Yetkazishdan pul</div>
                {first ? <div className="skeleton mt-3 h-7 w-2/3" /> : <div className="mt-2 text-2xl font-semibold tracking-tight text-up num">{money(t?.earned)}</div>}
                <div className="mt-1 text-xs text-ink-3 num">{t ? (t.waiting ? `Yana ${money(t.waiting)} olinishi kerak` : `${t.paidStops} ta manzildan · kassadan alohida`) : ' '}</div>
              </Card>
              <Card>
                <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><Truck className="size-4 text-ink-3" />Reyslar</div>
                {first ? <div className="skeleton mt-3 h-7 w-1/2" /> : <div className="mt-2 text-2xl font-semibold tracking-tight text-ink num">{t?.trips ?? 0}</div>}
                <div className="mt-1 text-xs text-ink-3 num">{t ? `${t.stops} ta manzil, ${t.done} tasi yetkazildi` : ' '}</div>
              </Card>
              <Card>
                <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><Route className="size-4 text-ink-3" />Yoʻl</div>
                {first ? <div className="skeleton mt-3 h-7 w-1/2" /> : <div className="mt-2 text-2xl font-semibold tracking-tight text-ink num">{roadKmLabel(t?.km ?? 0)}</div>}
                <div className="mt-1 text-xs text-ink-3">taxminiy, shahar yoʻllari boʻyicha</div>
              </Card>
            </div>

            {!!data?.draft.length && (
              <Card className="border-[var(--card)]">
                <CardHeader title={`Botga yuborilgan manzillar: ${data.draft.length} ta`} subtitle="Hali reys tuzilmagan. Botda /reys yozing yoki shu yerda tuzing." />
                <ol className="mb-4 space-y-1.5 text-sm">
                  {data.draft.map((s, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-2 num">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{placeName(s)}</span>
                      {!!s.fee && <span className="text-ink-2 num">{money(s.fee)}</span>}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={<Route className="size-4" />} loading={busy === 'plan'}
                    onClick={() => run('plan', () => api('/delivery/draft/plan', { method: 'POST' }), 'Reys tuzildi')}>Reys tuzish</Button>
                  <Button variant="ghost" loading={busy === 'clear'} onClick={() => run('clear', () => api('/delivery/draft', { method: 'DELETE' }))}>Tozalash</Button>
                </div>
              </Card>
            )}

            {first ? <Card><div className="skeleton h-40" /></Card> : !data?.trips.length ? (
              <Card>
                <EmptyState icon={<Truck className="size-5" />} title={`${monthLabel(`${month}-01`)}da reys yoʻq`}
                  description="Botga lokatsiyalarni yuboring yoki “Yangi reys” bilan manzillarni shu yerda kiriting: eng qisqa tartibni oʻzi tuzadi."
                  action={<Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Yangi reys</Button>} />
              </Card>
            ) : data.trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} busy={busy} onEdit={setEditing} onDrive={() => drive(trip.id)}
                onToggle={(s) => {
                  // Delivered where money is to be taken: ask "Oldim?" first; it counts only after that.
                  if (!s.done && s.fee > 0 && !s.collected) setCollecting(s);
                  else void run(`done-${s.id}`, () => api(`/delivery/stops/${s.id}`, { method: 'PUT', body: { done: !s.done } }));
                }}
                onTelegram={() => run(`tg-${trip.id}`, () => api(`/delivery/trips/${trip.id}/telegram`, { method: 'POST' }), 'Telegramga yuborildi')}
                onDelete={() => { if (confirm('Bu reys oʻchirilsinmi?')) void run(`del-${trip.id}`, () => api(`/delivery/trips/${trip.id}`, { method: 'DELETE' }), 'Reys oʻchirildi'); }} />
            ))}
          </div>

        </div>
      )}

      <NewTripModal open={creating} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />
      {driving && <DriveMode trip={driving} onClose={() => drive(null)} onChanged={reload} />}
      <CollectModal stop={collecting} onClose={() => setCollecting(null)} onDone={() => { setCollecting(null); reload(); }} />
      <StopModal stop={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
    </div>
  );
}

function TripCard({ trip, busy, onEdit, onToggle, onTelegram, onDelete, onDrive }: {
  trip: Trip; busy: string | null; onDrive: () => void; onEdit: (s: Stop) => void; onToggle: (s: Stop) => void; onTelegram: () => void; onDelete: () => void;
}) {
  const points = [...(trip.start ? [trip.start] : []), ...trip.stops];
  const earned = trip.stops.filter((s) => s.collected).reduce((a, s) => a + s.fee, 0);
  const waiting = trip.stops.filter((s) => !s.collected).reduce((a, s) => a + s.fee, 0);
  const done = trip.stops.filter((s) => s.done).length;
  // A finished run is folded to one line; tapping it opens it.
  const finished = done === trip.stops.length;
  const [open, setOpen] = useState(!finished);
  useEffect(() => { if (!finished) setOpen(true); }, [finished]);
  return (
    <Card padded={false} className={cx(!open && 'opacity-90')}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className={cx('flex w-full items-start gap-3 px-4 py-3.5 text-left sm:px-5', open && 'border-b border-line')}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-ink">{formatDate(trip.day, false)}</h3>
            <span className="text-[13px] text-ink-3">{weekday(trip.day)}</span>
            {trip.source === 'bot' && <Badge><Bot className="size-3" />Botdan</Badge>}
            {finished && <Badge tone="success"><Check className="size-3" />Tugadi</Badge>}
          </div>
          <div className="mt-0.5 text-[13px] text-ink-3 num">{trip.stops.length} ta manzil · {roadKmLabel(trip.km)} · {done}/{trip.stops.length} yetkazildi</div>
        </div>
        <div className="shrink-0 text-right">
          {(earned > 0 || !waiting) && <div className={cx('text-[15px] font-semibold num', earned ? 'text-up' : 'text-ink-3')}>{earned ? `+${money(earned)}` : 'Bepul'}</div>}
          {!!waiting && <div className={cx('font-medium text-warn num', earned ? 'text-xs' : 'text-[15px]')}>{money(waiting)} olinadi</div>}
        </div>
        <ChevronDown className={cx('mt-1 size-4 shrink-0 text-ink-3 transition-transform max-sm:hidden', open && 'rotate-180')} />
      </button>
      {open && <>
      <ol className="divide-y divide-line">
        {trip.stops.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <button type="button" onClick={() => onToggle(s)} disabled={busy === `done-${s.id}`} aria-pressed={s.done}
              aria-label={s.done ? 'Yetkazilmadi deb belgilash' : 'Yetkazildi deb belgilash'}
              className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors num',
                s.done ? 'border-success bg-success text-white' : 'border-line bg-surface-2 text-ink-2 hover:border-ink-3')}>
              {s.done ? <Check className="size-4" /> : s.position}
            </button>
            <button type="button" onClick={() => onEdit(s)} className="min-w-0 flex-1 text-left">
              <div className={cx('truncate text-sm', s.done ? 'text-ink-3 line-through' : 'text-ink', !s.label && 'num')}>{placeName(s)}</div>
              <div className={cx('text-xs num', !s.fee ? 'text-ink-3' : s.collected ? 'text-up' : s.done ? 'text-danger' : 'text-warn')}>
                {!s.fee ? 'Pul olinmaydi' : s.collected ? `✓ ${money(s.fee)} olindi` : s.done ? `${money(s.fee)} olinmadi` : `${money(s.fee)} olinadi`}
              </div>
            </button>
            <a href={yandexPlaceUrl(s)} target="_blank" rel="noopener noreferrer" title="Yandex xaritada"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><Navigation className="size-4" /></a>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        {done < trip.stops.length && <Button size="sm" variant="primary" icon={<Play className="size-4" />} onClick={onDrive}>Reysni boshlash</Button>}
        <a href={yandexRouteUrl(points)} target="_blank" rel="noopener noreferrer"><Button size="sm" icon={<Route className="size-4" />}>Yandex: butun yoʻl</Button></a>
        <a href={googleRouteUrl(points)} target="_blank" rel="noopener noreferrer" className="max-sm:hidden"><Button size="sm" variant="ghost">Google Maps</Button></a>
        <Button size="sm" variant="ghost" icon={<Send className="size-4" />} loading={busy === `tg-${trip.id}`} onClick={onTelegram}>Telegramga</Button>
        <IconButton label="Reysni oʻchirish" className="ml-auto size-8 hover:text-danger" onClick={onDelete}><Trash2 className="size-4" /></IconButton>
      </div>
      </>}
    </Card>
  );
}


interface Row { place: string; label: string; fee: string }
const emptyRow = (): Row => ({ place: '', label: '', fee: '' });

function NewTripModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(), emptyRow()]);
  const [day, setDay] = useState(todayTashkent());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setRows([emptyRow(), emptyRow()]); setDay(todayTashkent()); setErrors({}); setError(null); } }, [open]);

  const set = (i: number, change: Partial<Row>) => setRows((r) => r.map((row, k) => (k === i ? { ...row, ...change } : row)));
  const filled = rows.filter((r) => r.place.trim());

  async function submit() {
    setBusy(true);
    setError(null);
    setErrors({});
    const used = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.place.trim());
    try {
      await api('/delivery/trips', { method: 'POST', body: { day, stops: used.map(({ r }) => ({ place: r.place, label: r.label, fee: digitsOf(r.fee) })) } });
      toast({ tone: 'success', title: 'Reys tuzildi', description: 'Manzillar eng qisqa tartibda joylandi.' });
      onDone();
    } catch (e) {
      const sent = e instanceof ApiError ? e.fields : undefined;
      if (sent) setErrors(Object.fromEntries(Object.entries(sent).map(([k, v]) => [String(used[Number(k)]?.i), v])));
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Yangi reys"
      description="Har bir qatorga xarita havolasi (Yandex yoki Google) yoki “41.31, 69.28” yozing. Tartibni oʻzi tuzadi."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Bekor</Button>
        <Button variant="primary" loading={busy} disabled={!filled.length} onClick={submit}>Reys tuzish{filled.length ? ` (${filled.length})` : ''}</Button>
      </>}>
      <div className="space-y-3">
        <Field label="Sana" className="max-w-[200px]"><Input type="date" value={day} max={todayTashkent()} onChange={(e) => setDay(e.target.value)} /></Field>
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-line p-2.5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-2 num">{i + 1}</span>
              <Input ref={i === rows.length - 1 ? lastRef : undefined} value={row.place} invalid={!!errors[i]} placeholder="Havola yoki koordinata"
                onChange={(e) => set(i, { place: e.target.value })} className="h-9 flex-1" />
              {rows.length > 1 && <IconButton label="Olib tashlash" className="size-8" onClick={() => setRows((r) => r.filter((_, k) => k !== i))}><X className="size-4" /></IconButton>}
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_130px] gap-2 pl-8">
              <Input value={row.label} placeholder="Mijoz yoki izoh" maxLength={120} onChange={(e) => set(i, { label: e.target.value })} className="h-9" />
              <Input value={row.fee} inputMode="numeric" placeholder="Olinadigan pul" onChange={(e) => set(i, { fee: digitsInput(e.target.value) })} className="h-9 text-right num" />
            </div>
            {errors[i] && <p className="mt-1.5 pl-8 text-xs text-danger">{errors[i]}</p>}
          </div>
        ))}
        {rows.length < MAX_STOPS && (
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => { setRows((r) => [...r, emptyRow()]); setTimeout(() => lastRef.current?.focus(), 0); }}>Manzil qoʻshish</Button>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

function StopModal({ stop, onClose, onDone }: { stop: Stop | null; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (stop) { setLabel(stop.label); setFee(stop.fee ? groupDigits(stop.fee) : ''); setError(null); } }, [stop]);
  async function save() {
    if (!stop) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/delivery/stops/${stop.id}`, { method: 'PUT', body: { label, fee: digitsOf(fee) } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={!!stop} onClose={onClose} size="sm" title={stop ? `${stop.position}-manzil` : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Bekor</Button><Button variant="primary" loading={busy} onClick={save}>Saqlash</Button></>}>
      {stop && (
        <div className="space-y-3">
          <Field label="Mijoz yoki izoh"><Input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="Olinadigan pul" hint="Hisobga “Oldim” bosilgandan keyin qoʻshiladi"><Input value={fee} inputMode="numeric" placeholder="0" onChange={(e) => setFee(digitsInput(e.target.value))} className="num" /></Field>
          <div className="flex gap-3 text-sm">
            <a href={yandexPlaceUrl(stop)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Yandex xarita</a>
            <a href={googlePlaceUrl(stop)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Maps</a>
          </div>
          {error && <Alert>{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

/** Delivered where money is to be taken: "take X soʻm", and it counts only after "Oldim". */
function CollectModal({ stop, onClose, onDone }: { stop: Stop | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  async function answer(took: boolean) {
    if (!stop) return;
    setBusy(took ? 'yes' : 'no');
    try {
      await api(`/delivery/stops/${stop.id}`, { method: 'PUT', body: took ? { collected: true } : { done: true, collected: false } });
      toast({ tone: 'success', title: took ? `${money(stop.fee)} hisobga qoʻshildi` : 'Yetkazildi, pul olinmadi' });
      onDone();
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal open={!!stop} onClose={onClose} size="sm" title={stop ? `${stop.position}. ${placeName(stop)}` : ''}
      footer={<>
        <Button variant="ghost" loading={busy === 'no'} disabled={!!busy} onClick={() => answer(false)}>Olmadim</Button>
        <Button variant="success" icon={<Coins className="size-4" />} loading={busy === 'yes'} disabled={!!busy} onClick={() => answer(true)}>Oldim</Button>
      </>}>
      {stop && (
        <div className="py-2 text-center">
          <div className="text-sm text-ink-2">Mijozdan oling</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-ink num">{money(stop.fee)}</div>
          <p className="mt-2 text-xs text-ink-3">Pul “Oldim” bosilgandan keyin hisobga qoʻshiladi.</p>
        </div>
      )}
    </Modal>
  );
}


const navigateUrl = (p: Point) => `https://yandex.uz/maps/?rtext=~${p.lat},${p.lng}&rtt=auto`;

/**
 * Reys rejimi: the run one stop at a time, like a courier app. The current stop is big, with the way there,
 * "Yetib keldim", then the money to take and Oldim / Olmadim. While it is open the phone's position is sent
 * every few seconds, so reaching a stop opens its money step by itself.
 */
function DriveMode({ trip, onClose, onChanged }: { trip: Trip; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState<'go' | 'collect'>('go');
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState<'off' | 'on' | 'denied'>('off');
  // Answers given here show at once, before the list reloads.
  const [local, setLocal] = useState<Record<number, Partial<Stop>>>({});
  const stops = trip.stops.map((s) => ({ ...s, ...local[s.id] }));
  const current = stops.find((s) => !s.done) ?? null;
  const earned = stops.filter((s) => s.collected).reduce((a, s) => a + s.fee, 0);
  const missed = stops.filter((s) => s.done && !s.collected).reduce((a, s) => a + s.fee, 0);
  const doneCount = stops.filter((s) => s.done).length;
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => { setStep('go'); }, [current?.id]);

  // The phone's position while this screen is open (a closed screen relies on Telegram's live location).
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    let latest: { lat: number; lng: number } | null = null;
    let sentAt = 0;
    const send = () => {
      if (!latest) return;
      sentAt = Date.now();
      api<{ arrived: { id: number } | null }>('/delivery/location', { method: 'POST', body: latest })
        .then((r) => {
          if (r.arrived && r.arrived.id === currentRef.current?.id) {
            navigator.vibrate?.([200, 100, 200]);
            setStep('collect');
          }
        }).catch(() => undefined);
      latest = null;
    };
    const id = navigator.geolocation.watchPosition((pos) => {
      setGps('on');
      latest = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (Date.now() - sentAt > 8000) send();
    }, (err) => setGps(err.code === err.PERMISSION_DENIED ? 'denied' : 'off'), { enableHighAccuracy: true, maximumAge: 5000 });
    // At most one position every 8 seconds; the newest one is never dropped.
    const timer = setInterval(send, 8000);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(timer); };
  }, []);

  async function answer(s: Stop, body: Partial<Stop>, note?: string) {
    setBusy(true);
    try {
      await api(`/delivery/stops/${s.id}`, { method: 'PUT', body });
      setLocal((l) => ({ ...l, [s.id]: { ...l[s.id], ...body, done: true } }));
      if (note) toast({ tone: 'success', title: note });
      onChanged();
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const arrived = (s: Stop) => (s.fee > 0 && !s.collected ? setStep('collect') : void answer(s, { done: true }, 'Yetkazildi'));

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-[var(--bg)]">
      <div className="flex items-center gap-3 border-b border-line px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <IconButton label="Yopish" onClick={onClose}><X className="size-5" /></IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink">Reys rejimi</div>
          <div className="text-xs text-ink-3 num">{doneCount}/{stops.length} yetkazildi · {gps === 'on' ? 'joylashuv kuzatilmoqda' : gps === 'denied' ? 'joylashuvga ruxsat yoʻq' : 'joylashuv kutilmoqda'}</div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-semibold text-up num">{money(earned)}</div>
          <div className="text-[11px] text-ink-3">olindi</div>
        </div>
      </div>
      <div className="h-1 bg-surface-2"><div className="h-full bg-success transition-all" style={{ width: `${(doneCount / Math.max(1, stops.length)) * 100}%` }} /></div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {!current ? (
          <div className="mx-auto max-w-md pt-10 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft text-success"><Check className="size-8" /></div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Reys tugadi</h2>
            <p className="mt-1 text-sm text-ink-3">{stops.length} ta manzil yetkazildi</p>
            <div className="mt-6 text-4xl font-semibold tracking-tight text-up num">{money(earned)}</div>
            <div className="mt-1 text-sm text-ink-3">yetkazishdan olindi</div>
            {!!missed && <div className="mt-3 text-sm font-medium text-danger num">{money(missed)} olinmadi</div>}
            <Button size="lg" className="mt-8 w-full" onClick={onClose}>Yopish</Button>
          </div>
        ) : step === 'collect' ? (
          <div className="mx-auto max-w-md pt-6 text-center">
            <div className="text-sm font-medium text-ink-3">{current.position}. {placeName(current)}</div>
            <div className="mt-6 text-base text-ink-2">Mijozdan oling</div>
            <div className="mt-1 text-5xl font-semibold tracking-tight text-ink num">{money(current.fee)}</div>
            <p className="mt-3 text-xs text-ink-3">“Oldim” bosilgandan keyin hisobga qoʻshiladi</p>
            <div className="mt-10 space-y-3">
              <Button size="lg" variant="success" className="h-14 w-full text-lg" icon={<Coins className="size-5" />} disabled={busy}
                onClick={() => answer(current, { collected: true }, `${money(current.fee)} qoʻshildi`)}>Oldim</Button>
              <Button size="lg" variant="ghost" className="w-full" disabled={busy} onClick={() => answer(current, { done: true, collected: false }, 'Pul olinmadi')}>Olmadim</Button>
              <button type="button" className="text-xs text-ink-3 underline" onClick={() => setStep('go')}>Orqaga</button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-md">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-ink-3">Hozirgi manzil</div>
            <div className="mt-2 rounded-2xl border border-line bg-surface p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-fg num">{current.position}</span>
                <div className="min-w-0">
                  <div className="text-xl font-semibold tracking-tight text-ink">{placeName(current)}</div>
                  <div className={cx('mt-1 text-[15px] font-medium num', current.fee ? 'text-warn' : 'text-ink-3')}>
                    {current.fee ? `💵 ${money(current.fee)} olasiz` : 'Pul olinmaydi'}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
                <a href={navigateUrl(current)} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="w-full" icon={<Navigation className="size-5" />}>Yoʻlni ochish</Button>
                </a>
                <a href={googlePlaceUrl(current)} target="_blank" rel="noopener noreferrer"><Button size="lg" variant="ghost">Google</Button></a>
              </div>
            </div>
            <Button size="lg" variant="primary" className="mt-4 h-14 w-full text-lg" icon={<MapPin className="size-5" />} disabled={busy} onClick={() => arrived(current)}>Yetib keldim</Button>
            {stops.some((s) => !s.done && s.id !== current.id) && (
              <>
                <div className="mt-8 text-xs font-medium uppercase tracking-[0.08em] text-ink-3">Keyingilari</div>
                <ol className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
                  {stops.filter((s) => !s.done && s.id !== current.id).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-2 num">{s.position}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{placeName(s)}</span>
                      {!!s.fee && <span className="text-ink-2 num">{money(s.fee)}</span>}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

