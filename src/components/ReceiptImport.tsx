import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ImagePlus, Loader2, ReceiptText, ScanText, X } from 'lucide-react';
import { api } from '../lib/api';
import { CARD_METHODS, groupDigits, money } from '../lib/format';
import type { Method, Payment } from '../lib/types';
import { Alert, Badge, Button, Field, Input, Modal, cx, useToast } from './ui';

// "Chek orqali": a photo of the client's bank receipt (any bank app) plus a screenshot of their
// orders. The server reads both, the cashier checks what was read, and one card payment per
// client goes into the kassa with the receipt number in the note.

interface Shot { mediaType: string; data: string; url: string }
interface Receipt {
  bank: string | null; transactionId: string | null; amount: number | null; commission: number | null; total: number | null;
  paidAt: string | null; sender: string | null; senderCard: string | null; recipient: string | null; recipientCard: string | null; status: string | null;
}
interface Order { clientName: string | null; code: string | null; orderNo: string | null; transport: string | null; weight: string | null; amount: number | null; clientCode: string }
interface ReadResponse { receipt: Receipt; orders: Order[]; ordersTotal: number | null; notes: string | null; duplicate: { at: string; by: string } | null }
interface Row extends Order { on: boolean; amountText: string }

const MAX_SIDE = 2000;
const MAX_BYTES = 1_000_000;

/** Shrinks a phone photo/screenshot so several fit in one request, keeping small text readable. */
async function shrink(file: File): Promise<Shot> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Rasmni ochib boʻlmadi')); img.src = url; });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.4) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1], url };
}

const digits = (s: string) => Number(s.replace(/\D/g, '')) || 0;

export function ReceiptImport({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (payments: Payment[]) => void }) {
  const toast = useToast();
  const [receiptShot, setReceiptShot] = useState<Shot | null>(null);
  const [orderShots, setOrderShots] = useState<Shot[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<ReadResponse | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [amountText, setAmountText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [method, setMethod] = useState<Method>('card');

  const reset = () => {
    setReceiptShot(null); setOrderShots([]); setRead(null); setReceipt(null); setRows([]); setError(null); setMethod('card'); setAmountText('');
  };
  const close = () => { if (!reading && !saving) { reset(); onClose(); } };

  const add = async (files: FileList | File[] | null, slot: 'receipt' | 'orders') => {
    if (!files?.length) return;
    setError(null);
    try {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (!list.length) throw new Error('Faqat rasm yuklang');
      if (slot === 'receipt') setReceiptShot(await shrink(list[0]));
      else {
        const shots = await Promise.all(list.slice(0, 3).map(shrink));
        setOrderShots((prev) => [...prev, ...shots].slice(0, 3));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Ctrl+V of a screenshot fills the receipt first, then the orders.
  useEffect(() => {
    if (!open || read) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      void add(files, receiptShot ? 'orders' : 'receipt');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  async function analyze() {
    if (!receiptShot || !orderShots.length) return;
    setReading(true);
    setError(null);
    try {
      const res = await api<ReadResponse>('/receipts/read', {
        method: 'POST',
        body: { images: [receiptShot, ...orderShots].map(({ mediaType, data }) => ({ mediaType, data })) },
      });
      setRead(res);
      setReceipt(res.receipt);
      setAmountText(res.receipt.amount ? groupDigits(res.receipt.amount) : '');
      setRows(res.orders.map((o) => ({ ...o, on: true, amountText: o.amount ? groupDigits(o.amount) : '' })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }

  const amount = digits(amountText);
  const chosen = rows.filter((r) => r.on);
  const ordersSum = chosen.reduce((s, r) => s + digits(r.amountText), 0);
  const diff = amount - ordersSum;
  const badIds = chosen.some((r) => !/^[A-Z0-9-]{1,40}$/.test(r.clientCode));
  const canSave = Boolean(read && amount > 0 && chosen.length && diff === 0 && !badIds && !read.duplicate);

  async function save() {
    if (!receipt || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { payments } = await api<{ payments: Payment[] }>('/receipts/confirm', {
        method: 'POST',
        body: {
          receipt: { ...receipt, amount },
          method,
          orders: chosen.map((r) => ({ clientCode: r.clientCode, clientName: r.clientName, code: r.code, orderNo: r.orderNo, transport: r.transport, amount: digits(r.amountText) })),
        },
      });
      toast({ tone: 'success', title: 'Chek hisobotga qoʻshildi', description: `${payments.map((p) => p.client_code).join(', ')} · ${money(amount)}` });
      onSaved(payments);
      reset();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Modal open={open} onClose={close} size="lg" title="Chek orqali toʻlov"
      description={read ? 'Oʻqilgan maʼlumotni tekshiring, keyin hisobotga qoʻshing' : 'Toʻlov cheki va buyurtmalar rasmini yuklang'}
      footer={read ? <>
        <Button onClick={() => { setRead(null); setError(null); }} disabled={saving} icon={<ArrowLeft className="size-4" />}>Orqaga</Button>
        <Button variant="primary" loading={saving} disabled={!canSave} onClick={save} icon={<CheckCircle2 className="size-4" />}>Hisobotga qoʻshish</Button>
      </> : <>
        <Button onClick={close} disabled={reading}>Bekor qilish</Button>
        <Button variant="primary" loading={reading} disabled={!receiptShot || !orderShots.length} onClick={analyze} icon={<ScanText className="size-4" />}>
          {reading ? 'Oʻqilmoqda…' : 'Tekshirish'}
        </Button>
      </>}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {!read ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Slot title="1. Toʻlov cheki" hint="Istalgan bank ilovasidan skrinshot" shots={receiptShot ? [receiptShot] : []}
                onPick={(f) => add(f, 'receipt')} onRemove={() => setReceiptShot(null)} max={1} />
              <Slot title="2. Buyurtmalar" hint="Narxi koʻrinib turgan roʻyxat, 3 tagacha rasm" shots={orderShots}
                onPick={(f) => add(f, 'orders')} onRemove={(i) => setOrderShots((s) => s.filter((_, j) => j !== i))} max={3} multiple />
            </div>
            {reading ? (
              <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
                <Loader2 className="size-4 animate-spin" />Rasmlar oʻqilmoqda, bu 10–30 soniya olishi mumkin…
              </div>
            ) : (
              <p className="text-xs text-ink-3">Rasmni tanlang yoki skrinshotni shu oynaga Ctrl+V bilan qoʻying. Rasmlar saqlanmaydi, faqat oʻqilgan raqamlar saqlanadi.</p>
            )}
          </>
        ) : receipt && (
          <>
            {read.duplicate && (
              <Alert>Bu chek allaqachon kiritilgan: {read.duplicate.by}, {new Date(read.duplicate.at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}. Ikkinchi marta qoʻshib boʻlmaydi.</Alert>
            )}
            {read.notes && <Alert tone="warn">{read.notes}</Alert>}

            <section className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <ReceiptText className="size-4 text-ink-3" />
                <span className="text-sm font-semibold text-ink">Chek</span>
                {receipt.bank && <Badge tone="card">{receipt.bank}</Badge>}
                {receipt.status && <Badge tone="success">{receipt.status}</Badge>}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Summa (komissiyasiz)" htmlFor="rc-amount" hint={receipt.commission ? `Komissiya: ${groupDigits(receipt.commission)} · jami ${groupDigits(receipt.total || 0)}` : undefined}>
                  <Input id="rc-amount" inputMode="numeric" className="num font-semibold" value={amountText}
                    onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 11); setAmountText(d ? groupDigits(Number(d)) : ''); }} />
                </Field>
                <Field label="Tranzaksiya raqami" htmlFor="rc-txn">
                  <Input id="rc-txn" className="num" value={receipt.transactionId || ''} onChange={(e) => setReceipt({ ...receipt, transactionId: e.target.value })} />
                </Field>
                <Field label="Sana va vaqt" htmlFor="rc-at">
                  <Input id="rc-at" type="datetime-local" value={receipt.paidAt || ''} onChange={(e) => setReceipt({ ...receipt, paidAt: e.target.value })} />
                </Field>
              </div>
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
                <Pair k="Yuboruvchi" v={[receipt.sender, receipt.senderCard].filter(Boolean).join(' · ')} />
                <Pair k="Qabul qiluvchi" v={[receipt.recipient, receipt.recipientCard].filter(Boolean).join(' · ')} />
              </dl>
            </section>

            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-ink">Buyurtmalar</h3>
                {read.ordersTotal != null && <span className="text-xs text-ink-3 num">Rasmda jami: {money(read.ordersTotal)}</span>}
              </div>
              {!rows.length ? (
                <Alert tone="warn">Buyurtmalar rasmidan qator topilmadi. Boshqa skrinshot yuklab koʻring.</Alert>
              ) : (
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {rows.map((r, i) => (
                    <div key={i} className={cx('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_130px_140px] sm:items-center', !r.on && 'opacity-50')}>
                      <input type="checkbox" aria-label="Tanlash" className="size-4 accent-[var(--primary)]" checked={r.on} onChange={(e) => setRow(i, { on: e.target.checked })} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{r.clientName || 'Ism yoʻq'}</div>
                        <div className="truncate text-xs text-ink-3 num">
                          {[r.code, r.orderNo && `№${r.orderNo}`, r.transport, r.weight].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <label className="col-start-2 sm:col-start-auto">
                        <span className="mb-1 block text-[11px] text-ink-3">Mijoz ID</span>
                        <Input value={r.clientCode} className="h-9 num" invalid={r.on && !/^[A-Z0-9-]{1,40}$/.test(r.clientCode)}
                          onChange={(e) => setRow(i, { clientCode: e.target.value.toUpperCase().replace(/\s/g, '') })} />
                      </label>
                      <label className="col-start-2 sm:col-start-auto">
                        <span className="mb-1 block text-[11px] text-ink-3">Summa</span>
                        <Input value={r.amountText} inputMode="numeric" className="h-9 num"
                          onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 11); setRow(i, { amountText: d ? groupDigits(Number(d)) : '' }); }} />
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className={cx('flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3',
              diff === 0 && amount ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-success-soft' : 'border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-warn-soft')}>
              <div className="text-sm text-ink num">Chek <b>{money(amount)}</b> · Buyurtmalar <b>{money(ordersSum)}</b></div>
              {diff === 0 && amount ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 className="size-4" />Mos keldi</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warn"><AlertTriangle className="size-4" />Farq {money(Math.abs(diff))}</span>
              )}
            </div>
            {diff !== 0 && <p className="text-xs text-ink-3">Summalar teng boʻlmasa saqlab boʻlmaydi. Keraksiz buyurtmani olib tashlang yoki summani toʻgʻrilang.</p>}

            <Field label="Pul qayerga tushdi">
              <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
                {CARD_METHODS.map((m) => (
                  <button key={m.value} type="button" role="radio" aria-checked={method === m.value} onClick={() => setMethod(m.value)}
                    className={cx('flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors',
                      method === m.value ? 'border-transparent bg-surface text-ink ring-2' : 'border-line text-ink-2 hover:bg-surface-2')}
                    style={method === m.value ? { ['--tw-ring-color' as string]: m.color } : undefined}>
                    <span className="size-1.5 rounded-full" style={{ background: m.color }} />{m.label}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-ink-3">{k}:</dt>
      <dd className="truncate text-ink">{v || '—'}</dd>
    </div>
  );
}

function Slot({ title, hint, shots, onPick, onRemove, max, multiple }: {
  title: string; hint: ReactNode; shots: Shot[]; onPick: (files: FileList | null) => void; onRemove: (i: number) => void; max: number; multiple?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="mb-2.5 text-xs text-ink-3">{hint}</div>
      <div className="flex flex-wrap gap-2">
        {shots.map((s, i) => (
          <div key={s.url} className="relative">
            <img src={s.url} alt="" className="h-28 w-20 rounded-lg border border-line object-cover object-top" />
            <button type="button" aria-label="Olib tashlash" onClick={() => onRemove(i)}
              className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-soft hover:text-ink">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {shots.length < max && (
          <label className="flex h-28 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-surface text-ink-3 transition-colors hover:border-[var(--card)] hover:text-ink">
            <ImagePlus className="size-5" />
            <span className="text-[11px] font-medium">Rasm</span>
            <input type="file" accept="image/*" multiple={multiple} className="sr-only" onChange={(e) => { onPick(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
    </div>
  );
}
