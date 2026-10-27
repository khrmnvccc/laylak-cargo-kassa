import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Printer, ScanLine, Search, Trash2, UserCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useLive } from '../lib/live';
import { formatDate, groupDigits, methodLabel, money, todayTashkent } from '../lib/format';
import { printOrderSticker } from '../lib/print';
import { openSticker } from '../lib/scanner';
import { can } from '../lib/perms';
import type { Order } from '../lib/types';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Segmented, SkeletonRows, td, th, useToast } from '../components/ui';

type Errors = Partial<Record<'clientCode' | 'amount' | 'places' | 'weight' | 'receivedAt', string>>;
const EMPTY = { clientCode: '', clientName: '', phone: '', orderNo: '', transport: 'Avia', places: '1', weight: '', amountText: '', receivedAt: '' };

export default function Orders() {
  const { user } = useAuth();
  const { bump } = useLive();
  const toast = useToast();
  const [form, setForm] = useState({ ...EMPTY, receivedAt: todayTashkent() });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [known, setKnown] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [manual, setManual] = useState('');
  const [removing, setRemoving] = useState<Order | null>(null);
  const list = useApi<{ items: Order[] }>('/orders', { q: q.trim(), status: status === 'all' ? '' : status });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const code = form.clientCode.trim().toUpperCase();
  const amount = Number(form.amountText.replace(/\D/g, '')) || 0;

  // A known client fills in the name and phone by itself.
  useEffect(() => {
    setKnown(null);
    if (!/^[A-Z0-9-]{3,40}$/.test(code)) return;
    const timer = setTimeout(async () => {
      try {
        const info = await api<{ client: { code: string; full_name: string | null; phone: string | null } }>(`/clients/${encodeURIComponent(code)}`);
        setKnown(info.client.code);
        setForm((f) => ({ ...f, clientName: f.clientName || info.client.full_name || '', phone: f.phone || info.client.phone || '' }));
      } catch { /* a new client */ }
    }, 350);
    return () => clearTimeout(timer);
  }, [code]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Errors = {};
    if (!code) e.clientCode = 'Mijoz ID raqamini kiriting';
    if (!amount) e.amount = 'Toʻlanadigan summani kiriting';
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const { order } = await api<{ order: Order }>('/orders', {
        method: 'POST',
        body: {
          clientCode: code, clientName: form.clientName.trim(), phone: form.phone.trim(), orderNo: form.orderNo.trim(),
          transport: form.transport, places: form.places, weight: form.weight, amount, receivedAt: form.receivedAt,
        },
      });
      await printOrderSticker(order);
      toast({ tone: 'success', title: 'Stiker tayyor', description: `${order.client_code} · ${money(order.amount)} · ${order.scan_code}` });
      setForm({ ...EMPTY, transport: form.transport, receivedAt: form.receivedAt });
      setErrors({});
      bump();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields as Errors);
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    try {
      await api(`/orders/${removing.id}`, { method: 'DELETE' });
      toast({ tone: 'success', title: 'Stiker oʻchirildi', description: removing.scan_code });
      bump();
    } catch (e) {
      toast({ tone: 'error', title: 'Oʻchirilmadi', description: (e as Error).message });
    } finally {
      setRemoving(null);
    }
  }

  const items = list.data?.items || [];
  return (
    <>
      <PageHeader title="Buyurtmalar" subtitle="Har bir buyurtmaga stiker chop eting. Kassada skaner qilinsa toʻlov oynasi ochiladi."
        actions={(
          <form className="flex w-full gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { openSticker(manual.replace(/\D/g, '')); setManual(''); } }}>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Stiker kodi" inputMode="numeric" className="h-9 min-w-0 flex-1 sm:w-36 sm:flex-none num" aria-label="Stiker kodi" />
            <Button type="submit" icon={<ScanLine className="size-4" />}>Ochish</Button>
          </form>
        )} />

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title="Yangi stiker" subtitle="Saqlangach stiker darhol chop etiladi" />
          <form onSubmit={submit} noValidate className="space-y-4">
            {formError && <Alert>{formError}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mijoz ID" required htmlFor="o-code" error={errors.clientCode}
                hint={known ? <span className="inline-flex items-center gap-1 text-success"><UserCheck className="size-3.5" />Mavjud mijoz</span> : 'Masalan: TTT-102365'}>
                <Input id="o-code" value={form.clientCode} onChange={(e) => set({ clientCode: e.target.value.toUpperCase() })} invalid={Boolean(errors.clientCode)} autoComplete="off" className="num" />
              </Field>
              <Field label="Buyurtma №" htmlFor="o-no">
                <Input id="o-no" value={form.orderNo} onChange={(e) => set({ orderNo: e.target.value })} autoComplete="off" className="num" />
              </Field>
              <Field label="Mijoz ismi" htmlFor="o-name">
                <Input id="o-name" value={form.clientName} onChange={(e) => set({ clientName: e.target.value })} />
              </Field>
              <Field label="Telefon" htmlFor="o-phone">
                <Input id="o-phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" className="num" />
              </Field>
            </div>
            <Field label="Usul">
              <Segmented value={form.transport} onChange={(v) => set({ transport: v })} className="w-full"
                options={[{ value: 'Avia', label: 'Avia' }, { value: 'Avto', label: 'Avto' }]} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Joylar" htmlFor="o-places" error={errors.places}>
                <Input id="o-places" value={form.places} onChange={(e) => set({ places: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" className="num" />
              </Field>
              <Field label="Ogʻirlik, kg" htmlFor="o-weight" error={errors.weight}>
                <Input id="o-weight" value={form.weight} onChange={(e) => set({ weight: e.target.value.replace(/[^\d.,]/g, '').slice(0, 8) })} inputMode="decimal" className="num" />
              </Field>
              <Field label="Qabul qilingan" htmlFor="o-date" error={errors.receivedAt}>
                <Input id="o-date" type="date" value={form.receivedAt} max={todayTashkent()} onChange={(e) => set({ receivedAt: e.target.value })} className="px-2" />
              </Field>
            </div>
            <Field label="Toʻlanadigan summa" required htmlFor="o-amount" error={errors.amount}>
              <div className="relative">
                <Input id="o-amount" inputMode="numeric" value={form.amountText} invalid={Boolean(errors.amount)} autoComplete="off"
                  onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 11); set({ amountText: d ? groupDigits(Number(d)) : '' }); }}
                  placeholder="0" className="h-12 pr-16 text-xl font-semibold num" />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-3">soʻm</span>
              </div>
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={saving} icon={<Printer className="size-4" />}>Saqlash va stiker chop etish</Button>
          </form>
        </Card>

        <Card padded={false} className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, ism, buyurtma yoki stiker kodi" className="h-9 pl-9" />
            </div>
            <Segmented value={status} onChange={setStatus}
              options={[{ value: 'all', label: 'Hammasi' }, { value: 'unpaid', label: 'Toʻlanmagan' }, { value: 'paid', label: 'Toʻlangan' }]} />
          </div>
          {list.loading && !list.data ? <SkeletonRows rows={6} cols={5} /> : list.error ? <div className="p-4"><Alert>{list.error}</Alert></div> : !items.length ? (
            <EmptyState title="Stikerlar yoʻq" description="Chapdagi formadan birinchi stikerni chop eting." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line">
                  <tr><th className={th}>Stiker</th><th className={th}>Mijoz</th><th className={th}>Buyurtma</th><th className={`${th} text-right`}>Summa</th><th className={th}>Holat</th><th className={th} /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((o) => (
                    <tr key={o.id} className="hover:bg-surface-2">
                      <td className={td}><button type="button" className="font-medium num hover:underline" onClick={() => openSticker(o.scan_code)}>{o.scan_code}</button>
                        <div className="text-xs text-ink-3">{formatDate(o.received_at)}</div></td>
                      <td className={td}><div className="font-medium num">{o.client_code}</div><div className="text-xs text-ink-3">{o.client_name || ''}</div></td>
                      <td className={td}><div className="num">{o.order_no ? `№${o.order_no}` : '—'}</div>
                        <div className="text-xs text-ink-3">{[o.transport, o.weight ? `${o.weight} kg` : ''].filter(Boolean).join(' · ')}</div></td>
                      <td className={`${td} text-right font-medium num`}>{money(o.amount)}</td>
                      <td className={td}>{o.payment_id ? <Badge tone="success">{methodLabel(o.paid_method!)}</Badge> : <Badge tone="warn">Toʻlanmagan</Badge>}</td>
                      <td className={`${td} text-right`}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => void printOrderSticker(o)} aria-label="Chop etish" />
                          {!o.payment_id && can(user, 'payments.void') && (
                            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setRemoving(o)} aria-label="Oʻchirish" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.loading && list.data && <div className="flex justify-center p-2 text-ink-3"><Loader2 className="size-4 animate-spin" /></div>}
        </Card>
      </div>

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title="Stikerni oʻchirish" size="sm"
        description={removing ? `${removing.scan_code} · ${removing.client_code} · ${money(removing.amount)}` : undefined}
        footer={<><Button onClick={() => setRemoving(null)}>Bekor qilish</Button><Button variant="danger" onClick={() => void remove()}>Oʻchirish</Button></>}>
        <p className="text-sm text-ink-2">Bu stiker endi skaner qilinganda ochilmaydi. Toʻlovlarga taʼsir qilmaydi.</p>
      </Modal>
    </>
  );
}
