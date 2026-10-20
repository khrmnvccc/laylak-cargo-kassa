import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Pencil, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useLive } from '../lib/live';
import { dateOf, formatDate, groupDigits, money, relativeDay } from '../lib/format';
import { navigate } from '../lib/router';
import type { ClientRow, Payment } from '../lib/types';
import { PaymentsTable } from '../components/PaymentsTable';
import { Alert, Button, Card, EmptyState, ErrorState, Field, IconButton, Input, Modal, PageHeader, SkeletonRows, StatCard, cx, td, th, useToast } from '../components/ui';

interface ClientDetail {
  client: { code: string; full_name: string | null; phone: string | null; created_at: string };
  stats: { total: number; cash: number; card: number; yandex: number; pochta: number; count: number; first_paid_at: string | null; last_paid_at: string | null };
  payments: Payment[];
}

export default function Clients({ params }: { params: URLSearchParams }) {
  const selected = params.get('id');
  return selected ? <ClientView code={selected} /> : <ClientSearch />;
}

function ClientSearch() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const { data, error, loading, reload } = useApi<{ items: ClientRow[] }>('/clients', { q: debounced });
  const exact = data?.items.find((c) => c.code === debounced.toUpperCase());

  return (
    <>
      <PageHeader title="Mijozlar" subtitle="Mijozni ID raqami yoki ismi boʻyicha toping va toʻlovlar tarixini koʻring" />
      <Card padded={false}>
        <form className="border-b border-line p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); if (exact) navigate('clients', { id: exact.code }); }}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mijoz ID, ismi yoki telefon raqami" className="h-12 pl-11 pr-10 text-base" autoFocus />
            {q && <IconButton label="Tozalash" type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setQ('')}><X className="size-4" /></IconButton>}
          </div>
        </form>
        {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading ? <SkeletonRows rows={6} cols={4} /> : !data?.items.length ? (
          <EmptyState title={debounced ? `“${debounced}” boʻyicha mijoz topilmadi` : 'Hali mijozlar yoʻq'} description={debounced ? 'ID toʻgʻri yozilganini tekshiring. Yangi mijoz birinchi toʻlov kiritilganda avtomatik qoʻshiladi.' : 'Mijozlar birinchi toʻlov kiritilganda avtomatik qoʻshiladi.'} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full">
              <thead className="border-b border-line bg-surface-2/60">
                <tr>
                  <th className={th}>Mijoz ID</th>
                  <th className={th}>Ism</th>
                  <th className={cx(th, 'text-right')}>Toʻlovlar</th>
                  <th className={cx(th, 'text-right')}>Jami</th>
                  <th className={cx(th, 'hidden sm:table-cell')}>Oxirgi toʻlov</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((c) => (
                  <tr key={c.code} onClick={() => navigate('clients', { id: c.code })} className="cursor-pointer hover:bg-surface-2/70">
                    <td className={cx(td, 'font-semibold num')}>{c.code}</td>
                    <td className={cx(td, 'max-w-[220px] truncate text-ink-2')}>{c.full_name || '—'}</td>
                    <td className={cx(td, 'text-right num text-ink-2')}>{groupDigits(c.count)}</td>
                    <td className={cx(td, 'text-right font-medium num')}>{money(c.total)}</td>
                    <td className={cx(td, 'hidden text-ink-3 sm:table-cell')}>{c.last_paid_at ? relativeDay(c.last_paid_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ClientView({ code }: { code: string }) {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<ClientDetail>(`/clients/${encodeURIComponent(code)}`);
  const [editing, setEditing] = useState(false);
  const s = data?.stats;

  return (
    <>
      <button onClick={() => navigate('clients')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Mijozlar
      </button>
      {error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : (
        <>
          <PageHeader
            title={`Mijoz ${code.toUpperCase()}`}
            subtitle={data ? [data.client.full_name || 'Ismi kiritilmagan', data.client.phone].filter(Boolean).join(' · ') : ' '}
            actions={user.role === 'admin' && data ? <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Tahrirlash</Button> : undefined}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            <div className="col-span-2 xl:col-span-1"><StatCard label="Jami toʻlangan" value={s?.total || 0} loading={loading} hint={s ? `${s.count} ta toʻlov` : undefined} /></div>
            <StatCard label="Naqd" accent="var(--cash)" value={s?.cash || 0} loading={loading} />
            <StatCard label="Karta" accent="var(--card)" value={s?.card || 0} loading={loading} />
            <StatCard label="Yandex" accent="var(--yandex)" value={s?.yandex || 0} loading={loading} />
            <StatCard label="Pochta" accent="var(--pochta)" value={s?.pochta || 0} loading={loading} />
            <div className="col-span-2 xl:col-span-1">
              <Card className="h-full">
                <div className="text-[13px] font-medium text-ink-2">Faollik</div>
                {loading ? <div className="skeleton mt-3 h-7 w-3/4" /> : (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2"><span className="text-ink-3">Birinchi</span><span className="text-ink num">{s?.first_paid_at ? formatDate(dateOf(s.first_paid_at)) : '—'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-ink-3">Oxirgi</span><span className="text-ink num">{s?.last_paid_at ? formatDate(dateOf(s.last_paid_at)) : '—'}</span></div>
                  </div>
                )}
              </Card>
            </div>
          </div>
          <Card className="mt-4" padded={false}>
            <div className="px-4 pb-3 pt-4 sm:px-5"><h3 className="text-[15px] font-semibold tracking-tight text-ink">Toʻlovlar tarixi</h3></div>
            <div className="border-t border-line">
              {loading ? <SkeletonRows rows={5} /> : !data?.payments.length ? <EmptyState title="Toʻlovlar yoʻq" /> : <PaymentsTable items={data.payments} />}
            </div>
          </Card>
          {editing && data && <EditClient client={data.client} onClose={() => setEditing(false)} />}
        </>
      )}
    </>
  );
}

function EditClient({ client, onClose }: { client: ClientDetail['client']; onClose: () => void }) {
  const { bump } = useLive();
  const toast = useToast();
  const [fullName, setFullName] = useState(client.full_name || '');
  const [phone, setPhone] = useState(client.phone || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/clients/${encodeURIComponent(client.code)}`, { method: 'PATCH', body: { fullName, phone } });
      toast({ tone: 'success', title: 'Mijoz maʼlumotlari saqlandi' });
      bump();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Mijozni tahrirlash" description={`ID: ${client.code}`}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" type="submit" form="client-form" loading={busy}>Saqlash</Button></>}>
      <form id="client-form" onSubmit={submit} className="space-y-4">
        <Field label="Ism familiya" htmlFor="cl-name"><Input id="cl-name" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        <Field label="Telefon" htmlFor="cl-phone"><Input id="cl-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" /></Field>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
