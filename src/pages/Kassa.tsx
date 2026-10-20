import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banknote, CheckCircle2, Printer, CreditCard, Loader2, Mail, Navigation, Save, UserCheck, UserPlus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useLive } from '../lib/live';
import { METHODS, dateTime, groupDigits, methodLabel, money, timeOf, todayTashkent } from '../lib/format';
import type { Method, Payment, PaymentList, Summary } from '../lib/types';
import { PaymentsTable } from '../components/PaymentsTable';
import { printPaymentLabel } from '../lib/print';
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, MethodBadge, Modal, PageHeader, SkeletonRows, Textarea, cx, useToast } from '../components/ui';

interface ClientInfo { client: { code: string; full_name: string | null }; stats: { total: number; count: number } }
const METHOD_ICONS = { cash: Banknote, card: CreditCard, yandex: Navigation, pochta: Mail };

type Errors = Partial<Record<'clientCode' | 'clientName' | 'amount' | 'method' | 'paidAt' | 'note', string>>;

function nowLocalInput(): string {
  const d = new Date(Date.now() + 5 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export default function Kassa() {
  const { user } = useAuth();
  const { bump } = useLive();
  const toast = useToast();
  const today = todayTashkent();

  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [note, setNote] = useState('');
  const [customTime, setCustomTime] = useState(false);
  const [paidAtLocal, setPaidAtLocal] = useState(nowLocalInput);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Payment | null>(null);
  const [autoLabel, setAutoLabel] = useState(() => { try { return localStorage.getItem('lk-auto-label') === '1'; } catch { return false; } });
  const toggleAutoLabel = (on: boolean) => { setAutoLabel(on); try { localStorage.setItem('lk-auto-label', on ? '1' : '0'); } catch { /* ignore */ } };
  const [lookup, setLookup] = useState<{ state: 'idle' | 'loading' | 'found' | 'new'; info?: ClientInfo }>({ state: 'idle' });
  const [now, setNow] = useState(() => new Date().toISOString());
  const codeRef = useRef<HTMLInputElement>(null);

  const amount = Number(amountText.replace(/\D/g, '')) || 0;
  const normalizedCode = clientCode.trim().toUpperCase();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Look up the client as the ID is typed.
  useEffect(() => {
    if (!normalizedCode || !/^[A-Z0-9-]{1,40}$/.test(normalizedCode)) { setLookup({ state: 'idle' }); return; }
    setLookup({ state: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const info = await api<ClientInfo>(`/clients/${encodeURIComponent(normalizedCode)}`);
        setLookup({ state: 'found', info });
        if (info.client.full_name) setClientName((name) => name || info.client.full_name || '');
      } catch (e) {
        setLookup(e instanceof ApiError && e.status === 404 ? { state: 'new' } : { state: 'idle' });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [normalizedCode]);

  const todaySummary = useApi<Summary>('/summary', { from: today, to: today });
  const mine = useApi<PaymentList>('/payments', { from: today, to: today, worker: user.id, limit: 20 });

  function validate(): Errors {
    const e: Errors = {};
    if (!normalizedCode) e.clientCode = 'Mijoz ID raqamini kiriting';
    else if (!/^[A-Z0-9-]{1,40}$/.test(normalizedCode)) e.clientCode = 'ID faqat harf, raqam va “-” dan iborat boʻlsin';
    if (!amount) e.amount = 'Toʻlov summasini kiriting';
    else if (amount > 10_000_000_000) e.amount = 'Summa juda katta';
    if (clientName.length > 80) e.clientName = 'Ism juda uzun';
    if (note.length > 500) e.note = 'Izoh 500 belgidan oshmasin';
    if (customTime) {
      const t = Date.parse(`${paidAtLocal}:00+05:00`);
      if (!Number.isFinite(t)) e.paidAt = 'Sana va vaqtni toʻgʻri kiriting';
      else if (t > Date.now() + 60_000) e.paidAt = 'Kelajakdagi vaqtni kiritib boʻlmaydi';
    }
    return e;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setConfirming(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const { payment } = await api<{ payment: Payment }>('/payments', {
        method: 'POST',
        body: {
          clientCode: normalizedCode,
          clientName: clientName.trim(),
          amount,
          method,
          note: note.trim(),
          paidAt: customTime ? new Date(`${paidAtLocal}:00+05:00`).toISOString() : undefined,
        },
      });
      setConfirming(false);
      setLastSaved(payment);
      if (autoLabel) printPaymentLabel(payment);
      toast({ tone: 'success', title: 'Toʻlov saqlandi', description: `${payment.client_code} · ${money(payment.amount)} · ${methodLabel(payment.method)}` });
      setClientCode(''); setClientName(''); setAmountText(''); setNote(''); setErrors({}); setCustomTime(false);
      setLookup({ state: 'idle' });
      bump();
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setConfirming(false);
      if (e instanceof ApiError && e.fields) setErrors(e.fields as Errors);
      setFormError((e as Error).message);
      toast({ tone: 'error', title: 'Toʻlov saqlanmadi', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const t = todaySummary.data?.totals;

  return (
    <>
      <PageHeader title="Toʻlov kiritish" subtitle="Saqlangan toʻlov barcha xodimlarga darhol koʻrinadi." />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {lastSaved && (
              <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_25%,transparent)] bg-success-soft px-4 py-3 anim-rise">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium text-ink">Toʻlov muvaffaqiyatli saqlandi</div>
                  <div className="mt-0.5 text-ink-2 num">
                    {lastSaved.client_code}{lastSaved.client_name ? ` · ${lastSaved.client_name}` : ''} · {money(lastSaved.amount)} · {methodLabel(lastSaved.method)} · {timeOf(lastSaved.paid_at)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Button size="sm" icon={<Printer className="size-4" />} onClick={() => printPaymentLabel(lastSaved)}>Yorliq</Button>
                  <button type="button" className="text-xs font-medium text-ink-3 hover:text-ink" onClick={() => setLastSaved(null)}>Yopish</button>
                </div>
              </div>
            )}
            {formError && <Alert>{formError}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mijoz ID raqami" required htmlFor="clientCode" error={errors.clientCode}
                hint={lookup.state === 'loading' ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Qidirilmoqda…</span>
                  : lookup.state === 'found' ? <span className="inline-flex items-center gap-1 text-success"><UserCheck className="size-3.5" />Mavjud mijoz · {lookup.info!.stats.count} ta toʻlov · {money(lookup.info!.stats.total)}</span>
                  : lookup.state === 'new' ? <span className="inline-flex items-center gap-1"><UserPlus className="size-3.5" />Yangi mijoz sifatida qoʻshiladi</span> : 'Masalan: LC-1024'}>
                <Input id="clientCode" ref={codeRef} value={clientCode} onChange={(e) => setClientCode(e.target.value.toUpperCase())} invalid={Boolean(errors.clientCode)}
                  placeholder="ID" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="h-11 text-base font-medium num" autoFocus />
              </Field>
              <Field label="Mijoz ismi" htmlFor="clientName" error={errors.clientName} hint="Ixtiyoriy">
                <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} invalid={Boolean(errors.clientName)} placeholder="Ism familiya" className="h-11" />
              </Field>
            </div>

            <Field label="Toʻlov summasi" required htmlFor="amount" error={errors.amount}>
              <div className="relative">
                <Input id="amount" inputMode="numeric" value={amountText} invalid={Boolean(errors.amount)}
                  onChange={(e) => { const digits = e.target.value.replace(/\D/g, '').slice(0, 11); setAmountText(digits ? groupDigits(Number(digits)) : ''); }}
                  placeholder="0" className="h-14 pr-16 text-2xl font-semibold tracking-tight num" autoComplete="off" />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-3">soʻm</span>
              </div>
            </Field>

            <Field label="Toʻlov turi" required error={errors.method}>
              <div role="radiogroup" aria-label="Toʻlov turi" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {METHODS.map((m) => {
                  const Icon = METHOD_ICONS[m.value];
                  const active = method === m.value;
                  return (
                    <button key={m.value} type="button" role="radio" aria-checked={active} onClick={() => setMethod(m.value)}
                      className={cx('flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors',
                        active ? 'border-transparent text-ink ring-2' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}
                      style={active ? { background: `color-mix(in srgb, ${m.color} 12%, var(--surface))`, ['--tw-ring-color' as string]: m.color } : undefined}>
                      <Icon className="size-4" style={{ color: m.color }} />{m.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Izoh" htmlFor="note" error={errors.note} hint="Ixtiyoriy">
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: 3 ta posilka, Guanchjou reysi" rows={2} invalid={Boolean(errors.note)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sana va vaqt" error={errors.paidAt}
                hint={user.role === 'admin' ? (customTime ? 'Oʻtgan sanani kiritish (faqat admin)' : 'Saqlash vaqtida avtomatik qoʻyiladi') : 'Server vaqti boʻyicha avtomatik qoʻyiladi'}>
                {customTime ? (
                  <Input type="datetime-local" value={paidAtLocal} max={nowLocalInput()} onChange={(e) => setPaidAtLocal(e.target.value)} invalid={Boolean(errors.paidAt)} />
                ) : (
                  <div className="flex h-10 items-center justify-between rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink-2">
                    <span className="num">{dateTime(now)}</span>
                    {user.role === 'admin' && (
                      <button type="button" className="text-xs font-medium text-ink hover:underline" onClick={() => { setPaidAtLocal(nowLocalInput()); setCustomTime(true); }}>Oʻzgartirish</button>
                    )}
                  </div>
                )}
              </Field>
              <Field label="Operatsiyani kiritgan ishchi">
                <div className="flex h-10 items-center rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink-2">{user.full_name}</div>
              </Field>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={autoLabel} onChange={(e) => toggleAutoLabel(e.target.checked)} />
                Saqlagach yorliqni chop etish (76×130)
              </label>
              <Button type="submit" variant="primary" size="lg" icon={<Save className="size-4" />} className="sm:min-w-[200px]">Toʻlovni saqlash</Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Bugungi kassa" subtitle="Barcha xodimlar boʻyicha" />
            {todaySummary.loading ? <div className="skeleton h-24" /> : (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-ink-3">Jami tushum</div>
                  <div className="text-2xl font-semibold tracking-tight text-ink num">{money(t?.total || 0)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {METHODS.map((m) => <Mini key={m.value} label={m.label} value={money(t?.[m.value] || 0)} color={m.color} />)}
                </div>
                <div className="text-xs text-ink-3">{t?.count || 0} ta operatsiya</div>
              </div>
            )}
          </Card>
          <Card padded={false}>
            <div className="px-4 pb-3 pt-4 sm:px-5">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">Siz bugun kiritganlar</h3>
              <p className="mt-0.5 text-[13px] text-ink-3 num">{mine.data ? `${mine.data.count} ta · ${money(mine.data.total)}` : ' '}</p>
            </div>
            <div className="border-t border-line">
              {mine.loading ? <SkeletonRows rows={3} cols={2} /> : !mine.data?.items.length ? (
                <EmptyState title="Bugun hali toʻlov kiritmadingiz" />
              ) : (
                <PaymentsTable items={mine.data.items} list />
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={confirming} onClose={() => !saving && setConfirming(false)} title="Toʻlovni tasdiqlang" description="Maʼlumotlar toʻgʻriligini tekshiring" size="sm"
        footer={<>
          <Button onClick={() => setConfirming(false)} disabled={saving}>Tahrirlash</Button>
          <Button variant="primary" loading={saving} onClick={save} data-autofocus icon={<Save className="size-4" />}>Saqlash</Button>
        </>}>
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-4 text-center">
          <div className="text-xs text-ink-3">Summa</div>
          <div className="mt-1 text-[28px] font-semibold tracking-tight text-ink num">{money(amount)}</div>
          <div className="mt-2"><MethodBadge method={method} /></div>
        </div>
        <dl className="mt-3 divide-y divide-line text-sm">
          <Row k="Mijoz ID" v={normalizedCode} />
          <Row k="Mijoz ismi" v={clientName.trim() || '—'} />
          <Row k="Sana va vaqt" v={customTime ? dateTime(new Date(`${paidAtLocal}:00+05:00`).toISOString()) : 'Hozir'} />
          <Row k="Ishchi" v={user.full_name} />
          {note.trim() && <Row k="Izoh" v={note.trim()} />}
        </dl>
      </Modal>
    </>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-xs text-ink-3">{color && <span className="size-1.5 rounded-full" style={{ background: color }} />}{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-ink num">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
