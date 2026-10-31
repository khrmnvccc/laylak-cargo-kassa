import { useEffect, useState, type FormEvent } from 'react';
import { BadgeCheck, Copy, FileSpreadsheet, Loader2, Plus, Printer, ScanLine, Search, Trash2, UserCheck } from 'lucide-react';
import { ImportOrders } from '../components/ImportOrders';
import { bookmarkText, clearBookmarkText } from '../lib/bookmarklet';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useLive } from '../lib/live';
import { formatDate, groupDigits, methodLabel, money, todayTashkent } from '../lib/format';
import { printOrderSticker, printStickers } from '../lib/print';
import { StickerFormatPicker, useStickerFormat } from '../components/StickerFormatPicker';
import { openSticker } from '../lib/scanner';
import { can } from '../lib/perms';
import type { Order } from '../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, SkeletonRows, td, th, useToast } from '../components/ui';

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
  const [status, setStatus] = useState<'all' | 'stock' | 'issued' | 'unpaid'>('all');
  const [manual, setManual] = useState('');
  const [removing, setRemoving] = useState<Order | null>(null);
  const [prepaying, setPrepaying] = useState<Order | null>(null);
  const [prepaySaving, setPrepaySaving] = useState(false);
  const [printingList, setPrintingList] = useState(false);
  const [format, setFormat] = useStickerFormat();
  const [creating, setCreating] = useState(false);
  // Opened by the admin panel bookmark: the list comes with the tab.
  const [importText] = useState(bookmarkText);
  const [importing, setImporting] = useState(Boolean(importText));
  // Search once typing pauses, not on every key.
  const [debounced, setDebounced] = useState(q.trim());
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const list = useApi<{ items: Order[]; total: number; totalAmount: number }>('/orders', { q: debounced, status: status === 'all' ? '' : status }, { keep: true });
  // Orders entered twice; only someone who may delete stickers is shown them.
  const dups = useApi<{ groups: Order[][] }>(can(user, 'payments.void') ? '/orders/duplicates' : null);
  const dupGroups = dups.data?.groups || [];
  const extraCopies = dupGroups.reduce((n, g) => n + g.length - 1, 0);
  const [showDups, setShowDups] = useState(false);
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
      setCreating(false);
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

  async function setPrepaid(o: Order, prepaid: boolean) {
    setPrepaySaving(true);
    try {
      await api(`/orders/${o.id}/prepaid`, { method: 'POST', body: { prepaid } });
      toast({ tone: 'success', title: prepaid ? 'Toʻlangan deb belgilandi' : 'Belgi olib tashlandi', description: `${o.client_code} · ${money(o.amount)}` });
      bump();
      setPrepaying(null);
    } catch (e) {
      toast({ tone: 'error', title: 'Saqlanmadi', description: (e as Error).message });
    } finally {
      setPrepaySaving(false);
    }
  }

  const items = list.data?.items || [];
  return (
    <>
      <PageHeader title="Buyurtmalar" subtitle="Har bir buyurtmaga stiker chop eting. Kassada skaner qilinsa toʻlov oynasi ochiladi."
        actions={(
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="primary" className="flex-1 sm:flex-none" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Yangi stiker</Button>
            <Button className="flex-1 sm:flex-none" icon={<FileSpreadsheet className="size-4" />} onClick={() => setImporting(true)}>Roʻyxatdan yuklash</Button>
          </div>
          <form className="flex min-w-0 flex-1 gap-2 sm:flex-none" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { openSticker(manual.replace(/\D/g, '')); setManual(''); } }}>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Stiker kodi" inputMode="numeric" className="h-9 min-w-0 flex-1 sm:w-36 sm:flex-none num" aria-label="Stiker kodi" />
            <Button type="submit" icon={<ScanLine className="size-4" />}>Ochish</Button>
          </form>
          </div>
        )} />
      <ImportOrders open={importing} text={importText} onClose={() => { setImporting(false); clearBookmarkText(); if (window.location.hash.includes('import=')) window.history.replaceState(null, '', '#/orders'); }} />

      <Modal open={creating} onClose={() => setCreating(false)} title="Yangi stiker" description="Saqlangach stiker darhol chop etiladi">
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Joylar" htmlFor="o-places" error={errors.places}>
                <Input id="o-places" value={form.places} onChange={(e) => set({ places: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" className="num" />
              </Field>
              <Field label="Ogʻirlik, kg" htmlFor="o-weight" error={errors.weight}>
                <Input id="o-weight" value={form.weight} onChange={(e) => set({ weight: e.target.value.replace(/[^\d.,]/g, '').slice(0, 8) })} inputMode="decimal" className="num" />
              </Field>
              <Field label="Qabul qilingan" htmlFor="o-date" error={errors.receivedAt} className="col-span-2 sm:col-span-1">
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
      </Modal>

      <div className="space-y-3">
        {extraCopies > 0 && (
          <Alert tone="warn">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="min-w-0 flex-1"><b>{extraCopies} ta buyurtma ikki marta kiritilgan.</b> Ortiqchasini oʻchirsangiz, sanoq admin panel bilan bir xil boʻladi.</span>
              <Button size="sm" icon={<Copy className="size-4" />} onClick={() => setShowDups(true)}>Koʻrish</Button>
            </div>
          </Alert>
        )}

        <Card padded={false} className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, ism, buyurtma yoki stiker kodi" className="h-9 pl-9" />
            </div>
            <Segmented value={status} onChange={setStatus}
              options={[{ value: 'all', label: 'Hammasi' }, { value: 'stock', label: 'Omborda' }, { value: 'issued', label: 'Berilgan' }, { value: 'unpaid', label: 'Toʻlanmagan' }]} />
          </div>
          {list.data && (
            <div className="border-b border-line px-4 py-2 text-[13px] text-ink-2">
              {{ all: 'Jami', stock: 'Omborda', issued: 'Berilgan', unpaid: 'Toʻlanmagan' }[status]}: <b className="text-ink num">{list.data.total} ta</b> · <b className="text-ink num">{money(list.data.totalAmount)}</b>
              {list.data.total > items.length && <span className="text-ink-3"> · oxirgi {items.length} tasi koʻrsatilgan, qidiruvdan foydalaning</span>}
              {items.length > 0 && (
                <button type="button" className="float-right inline-flex items-center gap-1.5 font-medium text-ink-2 hover:text-ink" onClick={() => setPrintingList(true)}>
                  <Printer className="size-3.5" />Roʻyxatni chop etish
                </button>
              )}
            </div>
          )}
          {list.loading && !list.data ? <SkeletonRows rows={6} cols={5} /> : list.error ? <div className="p-4"><Alert>{list.error}</Alert></div> : !items.length ? (
            <EmptyState title="Stikerlar yoʻq" description="“Yangi stiker” tugmasini bosib birinchi stikerni chop eting." />
          ) : (
            <>
            <ul className="divide-y divide-line md:hidden">
              {items.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openSticker(o.scan_code)}>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-sm font-medium text-ink num">{o.client_code}</span>
                      {o.client_name && <span className="truncate text-xs text-ink-3">{o.client_name}</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-3 num">
                      {[o.scan_code, o.order_no ? `№${o.order_no}` : '', o.transport, o.weight ? `${o.weight} kg` : '', formatDate(o.received_at)].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-ink num">{money(o.amount)}</div>
                    <div className="mt-0.5 flex justify-end gap-1"><IssuedBadge o={o} /><PaidBadge o={o} /></div>
                  </div>
                  {!o.payment_id && can(user, 'payments.void') && (
                    <Button size="sm" variant="ghost" icon={<BadgeCheck className="size-4" />} onClick={() => setPrepaying(o)} aria-label="Toʻlangan deb belgilash" />
                  )}
                  <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => void printOrderSticker(o)} aria-label="Chop etish" />
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
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
                      <td className={td}><div className="flex flex-wrap gap-1"><IssuedBadge o={o} /><PaidBadge o={o} /></div></td>
                      <td className={`${td} text-right`}>
                        <div className="flex justify-end gap-1">
                          {!o.payment_id && can(user, 'payments.void') && (
                            <Button size="sm" variant="ghost" icon={<BadgeCheck className="size-4" />} onClick={() => setPrepaying(o)}
                              aria-label={o.prepaid_at ? 'Toʻlangan belgisi' : 'Toʻlangan deb belgilash'} />
                          )}
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
            </>
          )}
          {list.loading && list.data && <div className="flex justify-center p-2 text-ink-3"><Loader2 className="size-4 animate-spin" /></div>}
        </Card>
      </div>

      <Modal open={printingList} onClose={() => setPrintingList(false)} title="Stikerlarni chop etish" size="sm"
        description={`Roʻyxatda koʻrinib turgan ${items.length} ta buyurtma`}
        footer={<><Button onClick={() => setPrintingList(false)}>Bekor qilish</Button><Button variant="primary" icon={<Printer className="size-4" />}
          onClick={() => { setPrintingList(false); void printStickers(items, format); }}>Chop etish</Button></>}>
        <StickerFormatPicker value={format} onChange={setFormat} count={items.length} />
      </Modal>

      <Modal open={Boolean(prepaying)} onClose={() => setPrepaying(null)} size="sm"
        title={prepaying?.prepaid_at ? 'Oldin toʻlangan' : 'Toʻlangan deb belgilash'}
        description={prepaying ? `${prepaying.client_code} · ${prepaying.order_no ? `№${prepaying.order_no} · ` : ''}${money(prepaying.amount)}` : undefined}
        footer={prepaying && (prepaying.prepaid_at ? (
          <><Button onClick={() => setPrepaying(null)}>Yopish</Button><Button variant="danger" loading={prepaySaving} onClick={() => void setPrepaid(prepaying, false)}>Belgini olib tashlash</Button></>
        ) : (
          <><Button onClick={() => setPrepaying(null)}>Bekor qilish</Button><Button variant="primary" loading={prepaySaving} icon={<BadgeCheck className="size-4" />} onClick={() => void setPrepaid(prepaying, true)}>Toʻlangan</Button></>
        ))}>
        <p className="text-sm text-ink-2">
          {prepaying?.prepaid_at
            ? `${prepaying.prepaid_by_name || ''} toʻlangan deb belgilagan. Belgi olib tashlansa, buyurtma yana “Toʻlanmagan” boʻladi.`
            : 'Admin panelda toʻlangan buyurtma uchun. Kassaga pul qoʻshilmaydi, buyurtma “Toʻlanmagan” roʻyxatidan chiqadi.'}
        </p>
      </Modal>

      <Modal open={showDups} onClose={() => setShowDups(false)} title="Ikki marta kiritilgan buyurtmalar"
        description="Har guruhda birinchisi (eng oldin kiritilgani) qoldiriladi. Ortiqchasini oʻchiring."
        footer={<Button onClick={() => setShowDups(false)}>Yopish</Button>}>
        {!dupGroups.length ? <p className="text-sm text-ink-2">Takror buyurtma qolmadi.</p> : (
          <div className="space-y-3">
            {dupGroups.map((g) => (
              <div key={g[0].id} className="rounded-lg border border-line">
                <div className="border-b border-line px-3 py-2 text-sm">
                  <b className="num">{g[0].client_code}</b> {g[0].client_name && <span className="text-ink-3">{g[0].client_name}</span>}
                  <span className="text-ink-3 num"> · {g[0].order_no ? `№${g[0].order_no}` : 'raqamsiz'} · {g.length} ta</span>
                </div>
                <ul className="divide-y divide-line">
                  {g.map((o, i) => (
                    <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium num">{o.scan_code} · {money(o.amount)}</div>
                        <div className="truncate text-xs text-ink-3">
                          {[formatDate(o.received_at), o.created_by_name, i === 0 ? 'qoldiriladi' : ''].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1"><IssuedBadge o={o} /><PaidBadge o={o} /></div>
                      {i > 0 && (o.payment_id
                        ? <span className="w-9 text-center text-xs text-ink-3" title="Toʻlangan, avval toʻlovni bekor qiling">—</span>
                        : <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setRemoving(o)} aria-label="Oʻchirish" />)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title="Stikerni oʻchirish" size="sm"
        description={removing ? `${removing.scan_code} · ${removing.client_code} · ${money(removing.amount)}` : undefined}
        footer={<><Button onClick={() => setRemoving(null)}>Bekor qilish</Button><Button variant="danger" onClick={() => void remove()}>Oʻchirish</Button></>}>
        <p className="text-sm text-ink-2">Bu stiker endi skaner qilinganda ochilmaydi. Toʻlovlarga taʼsir qilmaydi.</p>
      </Modal>
    </>
  );
}

function PaidBadge({ o }: { o: Order }) {
  if (o.payment_id) return <Badge tone="success">{methodLabel(o.paid_method!)}</Badge>;
  return o.prepaid_at ? <Badge tone="success">Oldin toʻlangan</Badge> : <Badge tone="warn">Toʻlanmagan</Badge>;
}

function IssuedBadge({ o }: { o: Order }) {
  return o.issued_at ? <Badge tone="neutral">Berildi</Badge> : <Badge tone="card">Omborda</Badge>;
}
