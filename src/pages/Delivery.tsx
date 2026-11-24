import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Coins, MapPin, Navigation, Plus, Route, Send, Trash2, Truck, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/live';
import { formatDate, groupDigits, money, monthLabel, startOfMonth, todayTashkent, weekday } from '../lib/format';
import { MAX_STOPS, googlePlaceUrl, googleRouteUrl, roadKmLabel, yandexPlaceUrl, yandexRouteUrl, type Point } from '../lib/delivery';
import { Toggle } from '../components/TelegramTemplates';
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

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${startOfMonth(todayTashkent())}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.unshift(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

export default function Delivery() {
  const toast = useToast();
  const months = useMemo(() => lastMonths(6), []);
  const [month, setMonth] = useState(months[months.length - 1]);
  const { data, error, loading, reload } = useApi<DeliveryData>('/delivery', { month });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Stop | null>(null);
  const [collecting, setCollecting] = useState<Stop | null>(null);
  const [startOpen, setStartOpen] = useState(false);
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

      <div role="tablist" aria-label="Oy" className="no-print -mx-4 mb-3 flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
        {months.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={m === month} onClick={() => setMonth(m)}
            className={cx('h-9 shrink-0 rounded-lg px-3.5 text-sm font-medium transition-colors',
              m === month ? 'bg-primary text-primary-fg shadow-soft' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
            {m.slice(0, 4) === todayTashkent().slice(0, 4) ? monthLabel(`${m}-01`).replace(/\s\d{4}$/, '') : monthLabel(`${m}-01`)}
          </button>
        ))}
      </div>

      {error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
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
              <TripCard key={trip.id} trip={trip} busy={busy} onEdit={setEditing}
                onToggle={(s) => {
                  // Delivered where money is to be taken: ask "Oldim?" first; it counts only after that.
                  if (!s.done && s.fee > 0 && !s.collected) setCollecting(s);
                  else void run(`done-${s.id}`, () => api(`/delivery/stops/${s.id}`, { method: 'PUT', body: { done: !s.done } }));
                }}
                onTelegram={() => run(`tg-${trip.id}`, () => api(`/delivery/trips/${trip.id}/telegram`, { method: 'POST' }), 'Telegramga yuborildi')}
                onDelete={() => { if (confirm('Bu reys oʻchirilsinmi?')) void run(`del-${trip.id}`, () => api(`/delivery/trips/${trip.id}`, { method: 'DELETE' }), 'Reys oʻchirildi'); }} />
            ))}
          </div>

          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <BotCard data={data} onChanged={reload} />
            <Card>
              <CardHeader title="Boshlanish joyi" subtitle="Har bir reys shu yerdan tuziladi"
                action={<Button size="sm" variant="ghost" onClick={() => setStartOpen(true)}>Oʻzgartirish</Button>} />
              {first ? <div className="skeleton h-10" /> : data?.start ? (
                <div className="flex items-start gap-2.5 text-sm">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" />
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{data.start.from === 'office' ? 'Ishxona (Davomatdagi joy)' : data.start.label || 'Belgilangan joy'}</div>
                    <a href={yandexPlaceUrl(data.start)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Xaritada koʻrish</a>
                  </div>
                </div>
              ) : <p className="text-sm text-ink-2">Belgilanmagan: reys birinchi manzildan boshlanadi.</p>}
            </Card>
          </div>
        </div>
      )}

      <NewTripModal open={creating} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />
      <CollectModal stop={collecting} onClose={() => setCollecting(null)} onDone={() => { setCollecting(null); reload(); }} />
      <StopModal stop={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      <StartModal open={startOpen} canReset={data?.start?.from === 'set'} onClose={() => setStartOpen(false)} onDone={() => { setStartOpen(false); reload(); }} />
    </div>
  );
}

function TripCard({ trip, busy, onEdit, onToggle, onTelegram, onDelete }: {
  trip: Trip; busy: string | null; onEdit: (s: Stop) => void; onToggle: (s: Stop) => void; onTelegram: () => void; onDelete: () => void;
}) {
  const points = [...(trip.start ? [trip.start] : []), ...trip.stops];
  const earned = trip.stops.filter((s) => s.collected).reduce((a, s) => a + s.fee, 0);
  const waiting = trip.stops.filter((s) => !s.collected).reduce((a, s) => a + s.fee, 0);
  const done = trip.stops.filter((s) => s.done).length;
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">{formatDate(trip.day, false)}</h3>
            <span className="text-[13px] text-ink-3">{weekday(trip.day)}</span>
            {trip.source === 'bot' && <Badge><Bot className="size-3" />Botdan</Badge>}
          </div>
          <div className="mt-0.5 text-[13px] text-ink-3 num">{trip.stops.length} ta manzil · {roadKmLabel(trip.km)} · {done}/{trip.stops.length} yetkazildi</div>
        </div>
        <div className="sm:text-right">
          {(earned > 0 || !waiting) && <div className={cx('text-[15px] font-semibold num', earned ? 'text-up' : 'text-ink-3')}>{earned ? `+${money(earned)}` : 'Bepul'}</div>}
          {!!waiting && <div className={cx('font-medium text-warn num', earned ? 'text-xs' : 'text-[15px]')}>{money(waiting)} olinadi</div>}
        </div>
      </div>
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
        <a href={yandexRouteUrl(points)} target="_blank" rel="noopener noreferrer"><Button size="sm" icon={<Route className="size-4" />}>Yandex: butun yoʻl</Button></a>
        <a href={googleRouteUrl(points)} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost">Google Maps</Button></a>
        <Button size="sm" variant="ghost" icon={<Send className="size-4" />} loading={busy === `tg-${trip.id}`} onClick={onTelegram}>Telegramga</Button>
        <IconButton label="Reysni oʻchirish" className="ml-auto size-8 hover:text-danger" onClick={onDelete}><Trash2 className="size-4" /></IconButton>
      </div>
    </Card>
  );
}

function BotCard({ data, onChanged }: { data?: DeliveryData | null; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const bot = data?.bot;
  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await api('/delivery/bot', { method: 'POST', body: { on } });
      toast({ tone: 'success', title: on ? 'Bot manzil qabul qiladi' : 'Bot manzil qabul qilmaydi' });
      onChanged();
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Telegram bot" subtitle={bot?.botName ? `@${bot.botName}` : 'Lokatsiyalarni botga yuboring'}
        action={bot?.connected ? <Toggle on={bot.on} disabled={busy} label="Botdan manzil qabul qilish" onChange={toggle} /> : undefined} />
      {!data ? <div className="skeleton h-16" /> : !bot?.connected ? (
        <p className="text-sm text-ink-2">Avval botni Xabarlar oynasida ulang.</p>
      ) : !bot.on ? (
        <p className="text-sm text-ink-2">Yoqsangiz, botga yuborgan lokatsiyalaringizdan reys tuzib beradi.</p>
      ) : (
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-ink-2">
          <li>Botga lokatsiya (📎 → Joylashuv) yoki Yandex / Google havolasini yuboring.</li>
          <li>Keyin mijoz ismini yoki olinadigan pulni (masalan <b className="num">30000</b>) yozing.</li>
          <li><b>/reys</b> deb yozing: tartiblangan roʻyxat va xarita tugmasi keladi.</li>
          <li>Yetganda “yetkazdim”ni bosing: “oling” deydi, <b>Oldim</b> bossangiz pul hisobga qoʻshiladi. Jonli joylashuv yuborsangiz, yetganingizni oʻzi eslatadi.</li>
        </ol>
      )}
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

function StartModal({ open, canReset, onClose, onDone }: { open: boolean; canReset: boolean; onClose: () => void; onDone: () => void }) {
  const [place, setPlace] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setPlace(''); setLabel(''); setError(null); } }, [open]);
  async function send(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api('/delivery/start', { method: 'PUT', body });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Boshlanish joyi"
      description="Odatda Davomatdagi ishxona joyi olinadi. Boshqa joydan chiqsangiz, shu yerda belgilang (yoki botga /ombor yozing)."
      footer={<>
        {canReset && <Button variant="ghost" className="mr-auto" disabled={busy} onClick={() => send({ start: null })}>Ishxonaga qaytarish</Button>}
        <Button variant="ghost" onClick={onClose}>Bekor</Button>
        <Button variant="primary" loading={busy} disabled={!place.trim()} onClick={() => send({ place, label })}>Saqlash</Button>
      </>}>
      <div className="space-y-3">
        <Field label="Xarita havolasi yoki koordinata"><Input value={place} placeholder="https://yandex.uz/maps/… yoki 41.31, 69.28" onChange={(e) => setPlace(e.target.value)} /></Field>
        <Field label="Nomi"><Input value={label} maxLength={120} placeholder="Masalan: Ombor" onChange={(e) => setLabel(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
