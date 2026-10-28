import { useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Loader2, Mail, Navigation, Package, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { useLive } from '../lib/live';
import { dateTime, formatDate, methodLabel, money } from '../lib/format';
import { printOrderSticker } from '../lib/print';
import { TELEGRAM_MISS } from '../lib/photo';
import { useStickerScanner } from '../lib/scanner';
import type { Method, Order } from '../lib/types';
import { Alert, Button, Modal, cx, useToast } from './ui';

type Unpaid = Array<{ scan_code: string; order_no: string | null; amount: number }>;
type View =
  | { state: 'closed' }
  | { state: 'loading'; code: string }
  | { state: 'error'; code: string; message: string }
  | { state: 'ready'; order: Order; unpaid: Unpaid; step: 'method' | 'card'; saving?: Method; error?: string }
  | { state: 'done'; order: Order };

/** Scanning a kassa sticker anywhere in the app opens the parcel: what is owed, then Naqd or Karta (Yandex / Pochta). */
export function StickerPay() {
  const [view, setView] = useState<View>({ state: 'closed' });
  const { bump } = useLive();
  const toast = useToast();

  async function open(code: string) {
    setView({ state: 'loading', code });
    try {
      const { order, unpaid } = await api<{ order: Order; unpaid: Unpaid }>(`/orders/scan/${encodeURIComponent(code)}`);
      setView({ state: 'ready', order, unpaid, step: 'method' });
    } catch (e) {
      setView({ state: 'error', code, message: (e as Error).message });
    }
  }
  useStickerScanner((code) => { void open(code); });

  async function pay(method: Method) {
    if (view.state !== 'ready' || view.saving) return;
    setView({ ...view, saving: method, error: undefined });
    try {
      const { order, telegram } = await api<{ order: Order; telegram: 'queued' | 'off' }>(`/orders/${view.order.id}/pay`, { method: 'POST', body: { method } });
      setView({ state: 'done', order });
      bump();
      if (telegram === 'off') toast({ tone: 'error', title: 'Telegramga yuborilmadi', description: TELEGRAM_MISS.off });
    } catch (e) {
      setView({ ...view, saving: undefined, error: (e as Error).message });
    }
  }

  const close = () => setView({ state: 'closed' });
  const order = view.state === 'ready' || view.state === 'done' ? view.order : null;

  return (
    <Modal open={view.state !== 'closed'} onClose={close} title="Stiker boʻyicha toʻlov"
      description={order ? `Stiker ${order.scan_code}` : view.state === 'loading' || view.state === 'error' ? `Kod ${view.code}` : undefined}
      footer={<Button onClick={close}>{view.state === 'done' ? 'Tayyor' : 'Yopish'}</Button>}>
      {view.state === 'loading' && <div className="flex h-40 items-center justify-center text-ink-3"><Loader2 className="size-6 animate-spin" /></div>}
      {view.state === 'error' && <Alert>{view.message}</Alert>}
      {order && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold tracking-tight text-ink num">{order.client_code}</div>
                {order.client_name && <div className="text-sm text-ink-2">{order.client_name}</div>}
                {order.phone && <div className="text-sm text-ink-3 num">{order.phone}</div>}
              </div>
              <Package className="size-6 shrink-0 text-ink-3" />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {order.order_no && <><dt className="text-ink-3">Buyurtma</dt><dd className="text-right font-medium num">№{order.order_no}</dd></>}
              {order.transport && <><dt className="text-ink-3">Usul</dt><dd className="text-right font-medium">{order.transport}</dd></>}
              {order.places != null && <><dt className="text-ink-3">Joylar</dt><dd className="text-right font-medium num">{order.places} ta</dd></>}
              {order.weight != null && <><dt className="text-ink-3">Ogʻirlik</dt><dd className="text-right font-medium num">{order.weight} kg</dd></>}
              <dt className="text-ink-3">Qabul qilingan</dt><dd className="text-right font-medium">{formatDate(order.received_at)}</dd>
              <dt className="text-ink-3">Kiritgan</dt><dd className="text-right font-medium">{order.created_by_name}</dd>
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sm text-ink-3">Toʻlanadi</span>
              <span className="text-2xl font-semibold tracking-tight text-ink num">{money(order.amount)}</span>
            </div>
          </div>

          {view.state === 'done' && (
            <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_25%,transparent)] bg-success-soft px-4 py-3 anim-rise">
              <CheckCircle2 className="size-6 shrink-0 text-success" />
              <div className="text-sm">
                <div className="font-medium text-ink">Toʻlov qabul qilindi</div>
                <div className="text-ink-2">{methodLabel(order.paid_method!)} · {money(order.amount)}</div>
              </div>
            </div>
          )}

          {view.state === 'ready' && order.payment_id && (
            <Alert tone="warn">
              Bu buyurtma allaqachon toʻlangan: {methodLabel(order.paid_method!)} · {dateTime(order.paid_at!)} · {order.paid_by}
            </Alert>
          )}

          {view.state === 'ready' && !order.payment_id && (
            <div className="space-y-2">
              {view.error && <Alert>{view.error}</Alert>}
              <div className="text-[13px] font-medium text-ink-2">{view.step === 'method' ? 'Qanday toʻlaydi?' : 'Qaysi kartaga?'}</div>
              <div className={cx('grid gap-2', view.step === 'method' ? 'grid-cols-2' : 'grid-cols-3')}>
                {(view.step === 'method'
                  ? [
                    { key: 'cash', label: 'Naqd', icon: Banknote, color: 'var(--cash)', run: () => pay('cash') },
                    { key: 'card', label: 'Karta', icon: CreditCard, color: 'var(--card)', run: () => setView({ ...view, step: 'card', error: undefined }) },
                  ]
                  : [
                    { key: 'card', label: 'Karta', icon: CreditCard, color: 'var(--card)', run: () => pay('card') },
                    { key: 'yandex', label: 'Yandex', icon: Navigation, color: 'var(--yandex)', run: () => pay('yandex') },
                    { key: 'pochta', label: 'Pochta', icon: Mail, color: 'var(--pochta)', run: () => pay('pochta') },
                  ]).map((b) => (
                  <button key={b.key} type="button" onClick={b.run} disabled={Boolean(view.saving)}
                    className={cx('flex h-16 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-xl px-2 text-center border border-line bg-surface text-base font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60')}
                    style={{ boxShadow: `inset 0 -3px 0 ${b.color}` }}>
                    {view.saving === b.key ? <Loader2 className="size-5 animate-spin" /> : <b.icon className="size-5" style={{ color: b.color }} />}
                    {b.label}
                  </button>
                ))}
              </div>
              {view.step === 'card' && (
                <button type="button" className="text-xs font-medium text-ink-3 hover:text-ink" onClick={() => setView({ ...view, step: 'method' })}>← Orqaga</button>
              )}
            </div>
          )}

          {view.state === 'ready' && view.unpaid.length > 0 && (
            <p className="text-[13px] text-ink-3">
              Bu mijozning yana {view.unpaid.length} ta toʻlanmagan buyurtmasi bor: {money(view.unpaid.reduce((s, u) => s + u.amount, 0))}
            </p>
          )}
          <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink" onClick={() => void printOrderSticker(order)}>
            <Printer className="size-3.5" />Stikerni qayta chop etish
          </button>
        </div>
      )}
    </Modal>
  );
}
