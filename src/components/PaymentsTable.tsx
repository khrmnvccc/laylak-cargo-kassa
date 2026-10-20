import { useState } from 'react';
import { Ban, ChevronRight, Printer } from 'lucide-react';
import { printPaymentLabel } from '../lib/print';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/live';
import { dateTime, methodColor, methodLabel, money, relativeDay } from '../lib/format';
import { href } from '../lib/router';
import type { Payment } from '../lib/types';
import { Alert, Avatar, Badge, Button, Field, MethodBadge, Modal, Textarea, cx, td, th, useToast } from './ui';

export function PaymentsTable({ items, showDate = true, compact = false, list = false }: { items: Payment[]; showDate?: boolean; compact?: boolean; list?: boolean }) {
  const [selected, setSelected] = useState<Payment | null>(null);
  return (
    <>
      {/* Desktop */}
      <div className={cx('hidden overflow-x-auto scrollbar-thin', !list && 'md:block')}>
        <table className="w-full">
          <thead className="border-b border-line bg-surface-2/60">
            <tr>
              <th className={th}>{showDate ? 'Sana va vaqt' : 'Vaqt'}</th>
              <th className={th}>Mijoz</th>
              <th className={th}>Turi</th>
              <th className={cx(th, 'text-right')}>Summa</th>
              <th className={th}>Kiritgan</th>
              {!compact && <th className={th}>Izoh</th>}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((p) => (
              <tr key={p.id} onClick={() => setSelected(p)} className={cx('group cursor-pointer transition-colors hover:bg-surface-2/70', p.voided_at && 'opacity-55')}>
                <td className={cx(td, 'text-ink-2 num')}>{showDate ? relativeDay(p.paid_at) : relativeDay(p.paid_at).split(', ').pop()}</td>
                <td className={td}>
                  <div className="font-medium num">{p.client_code}</div>
                  {p.client_name && <div className="max-w-[180px] truncate text-xs text-ink-3">{p.client_name}</div>}
                </td>
                <td className={td}><MethodBadge method={p.method} /></td>
                <td className={cx(td, 'text-right font-semibold num', p.voided_at && 'line-through')}>{money(p.amount)}</td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <Avatar name={p.created_by_name} size="sm" />
                    <span className="max-w-[140px] truncate text-ink-2">{p.created_by_name}</span>
                  </div>
                </td>
                {!compact && (
                  <td className={cx(td, 'max-w-[260px] truncate text-ink-3')}>
                    {p.voided_at ? <Badge tone="danger"><Ban className="size-3" />Bekor qilingan</Badge> : p.note || '—'}
                  </td>
                )}
                <td className="pr-3 text-ink-3"><ChevronRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className={cx('divide-y divide-line', !list && 'md:hidden')}>
        {items.map((p) => (
          <li key={p.id}>
            <button onClick={() => setSelected(p)} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2', p.voided_at && 'opacity-55')}>
              <span className="size-2 shrink-0 rounded-full" style={{ background: methodColor(p.method) }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink num">{p.client_code}</span>
                  {p.client_name && <span className="truncate text-xs text-ink-3">{p.client_name}</span>}
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-3">{relativeDay(p.paid_at)} · {p.created_by_name}</div>
              </div>
              <div className="text-right">
                <div className={cx('text-sm font-semibold text-ink num', p.voided_at && 'line-through')}>{money(p.amount)}</div>
                <div className="text-xs text-ink-3">{p.voided_at ? 'Bekor qilingan' : methodLabel(p.method)}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <PaymentDetail payment={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function PaymentDetail({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const { user } = useAuth();
  const { bump } = useLive();
  const toast = useToast();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => { setVoiding(false); setReason(''); setError(null); onClose(); };

  async function doVoid() {
    if (!payment) return;
    if (reason.trim().length < 3) return setError('Bekor qilish sababini yozing');
    setBusy(true);
    try {
      await api(`/payments/${payment.id}/void`, { method: 'POST', body: { reason } });
      toast({ tone: 'success', title: 'Operatsiya bekor qilindi', description: `${payment.client_code} · ${money(payment.amount)}` });
      bump();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!payment) return null;
  const rows: Array<[string, React.ReactNode]> = [
    ['Mijoz ID', <a key="c" href={href('clients', { id: payment.client_code })} className="font-medium underline-offset-2 hover:underline num">{payment.client_code}</a>],
    ['Mijoz ismi', payment.client_name || '—'],
    ['Toʻlov turi', <MethodBadge key="m" method={payment.method} />],
    ['Sana va vaqt', dateTime(payment.paid_at)],
    ['Kiritgan ishchi', payment.created_by_name],
    ['Izoh', payment.note || '—'],
  ];
  if (payment.is_legacy) rows.push(['Manba', payment.created_by_name === 'Excel hisobot' ? 'Excel hisobotdan yuklangan' : 'Eski tizimdan koʻchirilgan']);
  if (payment.voided_at) {
    rows.push(['Bekor qilgan', `${payment.voided_by_name || '—'}, ${dateTime(payment.voided_at)}`]);
    rows.push(['Sabab', payment.void_reason || '—']);
  }

  return (
    <Modal open onClose={close} title="Operatsiya tafsilotlari"
      footer={
        voiding ? (
          <>
            <Button onClick={() => setVoiding(false)}>Ortga</Button>
            <Button variant="danger" loading={busy} onClick={doVoid} icon={<Ban className="size-4" />}>Bekor qilishni tasdiqlash</Button>
          </>
        ) : (
          <>
            {user.role === 'admin' && !payment.voided_at && (
              <Button variant="ghost" className="text-danger hover:text-danger sm:mr-auto" onClick={() => setVoiding(true)} icon={<Ban className="size-4" />}>Bekor qilish</Button>
            )}
            <Button icon={<Printer className="size-4" />} onClick={() => printPaymentLabel(payment)}>Yorliq (76×130)</Button>
            <Button onClick={close} data-autofocus>Yopish</Button>
          </>
        )
      }>
      <div className="mb-4 rounded-xl border border-line bg-surface-2 px-4 py-4 text-center">
        <div className="text-xs text-ink-3">Summa</div>
        <div className={cx('mt-1 text-[28px] font-semibold tracking-tight text-ink num', payment.voided_at && 'line-through opacity-60')}>{money(payment.amount)}</div>
        {payment.voided_at && <Badge tone="danger" className="mt-2"><Ban className="size-3" />Bekor qilingan</Badge>}
      </div>
      {voiding ? (
        <div className="space-y-3">
          <Alert tone="warn">Bekor qilingan operatsiya hisobotlardan chiqariladi, lekin tarixda saqlanib qoladi.</Alert>
          <Field label="Sabab" required error={error || undefined}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: summa xato kiritilgan" invalid={Boolean(error)} />
          </Field>
        </div>
      ) : (
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4 py-2.5 text-sm">
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-right text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  );
}
