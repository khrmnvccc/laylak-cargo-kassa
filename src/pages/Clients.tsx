import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Search, Tag, Upload, X } from 'lucide-react';
import { PrintButton } from '../components/PrintButton';
import { printClientLabel } from '../lib/print';
import { printClientStatement } from '../lib/reports';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useLive } from '../lib/live';
import { compactMoney, dateOf, formatDate, groupDigits, money, relativeDay } from '../lib/format';
import { navigate } from '../lib/router';
import type { ClientList, Payment } from '../lib/types';
import { PaymentsTable } from '../components/PaymentsTable';
import { Alert, Button, Card, EmptyState, ErrorState, Field, IconButton, Input, MethodStatCards, Modal, PageHeader, Segmented, SkeletonRows, StatCard, cx, td, th, useToast } from '../components/ui';
import { can } from '../lib/perms';

interface ClientDetail {
  client: { code: string; full_name: string | null; phone: string | null; created_at: string };
  stats: { total: number; cash: number; card: number; yandex: number; pochta: number; count: number; first_paid_at: string | null; last_paid_at: string | null };
  payments: Payment[];
  orders: ClientOrder[];
}
interface ClientOrder {
  order_no: string | null; code: string | null; transport: string | null; amount: number; paid_at: string;
  bank: string | null; transaction_id: string | null; created_by_name: string; voided: boolean;
}

export default function Clients({ params }: { params: URLSearchParams }) {
  const selected = params.get('id');
  return selected ? <ClientView code={selected} /> : <ClientSearch />;
}

type ClientSort = ClientList['sort'];
const PAGE_SIZE = 50;

function ClientSearch() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<ClientSort>('active');
  const [page, setPage] = useState(0);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => setPage(0), [debounced, sort]);
  const { data, error, loading, reload } = useApi<ClientList>('/clients', { q: debounced, sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const exact = data?.items.find((c) => c.code === debounced.toUpperCase());
  const pages = data ? Math.max(1, Math.ceil(data.clients / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Mijozlar"
        subtitle="Har bir mijoz qancha toʻlagani: naqd va karta boʻyicha"
        actions={can(user, 'clients.edit') ? <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>Roʻyxatni yuklash</Button> : undefined}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Mijozlar" value={data?.clients || 0} format={groupDigits} loading={loading && !data} hint={data ? `${groupDigits(data.active30)} tasi oxirgi 30 kunda toʻlagan` : undefined} />
        <StatCard label="Jami toʻlangan" value={data?.total || 0} loading={loading && !data} />
        <StatCard label="Naqd" accent="var(--cash)" value={data?.cash || 0} loading={loading && !data} />
        <StatCard label="Karta" accent="var(--card)" value={data?.card || 0} loading={loading && !data} hint="Yandex va Pochta bilan" />
      </div>

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:p-4 lg:flex-row lg:items-center">
          <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); if (exact) navigate('clients', { id: exact.code }); }}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mijoz ID, ismi yoki telefon raqami" className="h-10 pl-10 pr-10" />
            {q && <IconButton label="Tozalash" type="button" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setQ('')}><X className="size-4" /></IconButton>}
          </form>
          <Segmented value={sort} onChange={setSort} className="max-w-full self-start overflow-x-auto scrollbar-thin"
            options={[
              { value: 'active', label: 'Faollar' },
              { value: 'most', label: 'Koʻp toʻlagan' },
              { value: 'least', label: 'Kam toʻlagan' },
              { value: 'recent', label: 'Oxirgi toʻlov' },
            ]} />
        </div>
        {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={6} cols={5} /> : !data?.items.length ? (
          <EmptyState title={debounced ? `“${debounced}” boʻyicha mijoz topilmadi` : 'Hali mijozlar yoʻq'}
            description={debounced ? 'ID toʻgʻri yozilganini tekshiring. Yangi mijoz birinchi toʻlov kiritilganda avtomatik qoʻshiladi.' : 'Mijozlar birinchi toʻlov kiritilganda yoki roʻyxat yuklanganda qoʻshiladi.'} />
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full">
                <thead className="border-b border-line bg-surface-2/60">
                  <tr>
                    <th className={cx(th, 'hidden w-10 text-right sm:table-cell')}>#</th>
                    <th className={th}>Mijoz</th>
                    <th className={cx(th, 'hidden text-right sm:table-cell')}>Toʻlovlar</th>
                    <th className={cx(th, 'hidden text-right sm:table-cell')}>Naqd</th>
                    <th className={cx(th, 'hidden text-right sm:table-cell')}>Karta</th>
                    <th className={cx(th, 'text-right')}>Jami</th>
                    <th className={cx(th, 'hidden md:table-cell')}>Oxirgi toʻlov</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((c, i) => (
                    <tr key={c.code} onClick={() => navigate('clients', { id: c.code })} className="cursor-pointer hover:bg-surface-2/70">
                      <td className={cx(td, 'hidden text-right text-ink-3 num sm:table-cell')}>{page * PAGE_SIZE + i + 1}</td>
                      <td className={td}>
                        <div className="font-semibold num">{c.code}</div>
                        <div className="max-w-[160px] truncate text-xs text-ink-3 sm:max-w-[220px]">{[c.full_name, c.phone].filter(Boolean).join(' · ') || 'Ismi kiritilmagan'}</div>
                        <div className="text-xs text-ink-3 num sm:hidden">Naqd {compactMoney(c.cash)} · Karta {compactMoney(c.card)}</div>
                      </td>
                      <td className={cx(td, 'hidden text-right num text-ink-2 sm:table-cell')}>{groupDigits(c.count)}</td>
                      <td className={cx(td, 'hidden text-right num sm:table-cell', !c.cash && 'text-ink-3')}>{money(c.cash)}</td>
                      <td className={cx(td, 'hidden text-right num sm:table-cell', !c.card && 'text-ink-3')}>
                        {money(c.card)}
                        {c.online > 0 && <div className="text-xs text-ink-3">shundan Yandex/Pochta {money(c.online)}</div>}
                      </td>
                      <td className={cx(td, 'text-right font-semibold num')}>
                        {money(c.total)}
                      </td>
                      <td className={cx(td, 'hidden text-ink-3 md:table-cell')}>{c.last_paid_at ? relativeDay(c.last_paid_at) : 'Toʻlov yoʻq'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-3">
              <span className="num">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.clients)} / {groupDigits(data.clients)}</span>
              <div className="flex items-center gap-1">
                <IconButton label="Oldingi sahifa" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40"><ChevronLeft className="size-4" /></IconButton>
                <span className="px-2 num">{page + 1} / {pages}</span>
                <IconButton label="Keyingi sahifa" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40"><ChevronRight className="size-4" /></IconButton>
              </div>
            </div>
          </>
        )}
      </Card>
      {importing && <ImportClients onClose={() => setImporting(false)} />}
    </>
  );
}

interface ImportRow { code: string; name: string; phone: string }

// Accepts CSV/TSV exported from Excel (comma, semicolon or tab). Columns: ID, Ism, Telefon (header optional).
function parseClientList(text: string): ImportRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delimiter = ['\t', ';', ','].find((d) => lines[0].includes(d)) || ',';
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if (ch === delimiter && !quoted) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  let rows = lines.map(split);
  let idx = { code: 0, name: 1, phone: 2 };
  const head = rows[0].map((h) => h.toLowerCase());
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  if (find(/^(id|kod|code|mijoz id|id raqam)/) >= 0 || find(/ism|name|fio/) >= 0) {
    idx = { code: Math.max(find(/id|kod|code/), 0), name: find(/ism|name|fio|mijoz$/), phone: find(/tel|phone|nomer|raqam/) };
    rows = rows.slice(1);
  }
  return rows
    .map((r) => ({ code: (r[idx.code] || '').replace(/\s+/g, '').toUpperCase(), name: idx.name >= 0 ? r[idx.name] || '' : '', phone: idx.phone >= 0 ? r[idx.phone] || '' : '' }))
    .filter((r) => r.code || r.name);
}

function ImportClients({ onClose }: { onClose: () => void }) {
  const { bump } = useLive();
  const toast = useToast();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: Array<{ row: number; error: string }> } | null>(null);

  async function onFile(file: File | undefined) {
    setError(null); setResult(null);
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) { setError('Excel faylni “Saqlash → CSV (UTF-8)” qilib saqlang yoki faylni chatga yuboring.'); return; }
    setFileName(file.name);
    const parsed = parseClientList(await file.text());
    if (!parsed.length) setError('Faylda mijoz topilmadi');
    setRows(parsed);
  }

  async function save() {
    if (!rows?.length) return;
    setBusy(true); setError(null);
    try {
      const r = await api<NonNullable<typeof result>>('/clients/import', { method: 'POST', body: { rows } });
      setResult(r);
      bump();
      toast({ tone: 'success', title: 'Mijozlar yuklandi', description: `${r.created} ta yangi, ${r.updated} ta yangilandi` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Mijozlar roʻyxatini yuklash" description="CSV fayl: ID, Ism, Telefon ustunlari" size="lg"
      footer={result ? <Button variant="primary" onClick={onClose}>Tayyor</Button> : <>
        <Button onClick={onClose} disabled={busy}>Bekor</Button>
        <Button variant="primary" loading={busy} disabled={!rows?.length} onClick={save}>{rows?.length ? `${groupDigits(rows.length)} ta mijozni yuklash` : 'Yuklash'}</Button>
      </>}>
      <div className="space-y-4">
        {result ? (
          <Alert tone="success">
            {result.created} ta yangi mijoz qoʻshildi, {result.updated} tasining maʼlumoti yangilandi{result.skipped ? `, ${result.skipped} ta qator oʻtkazib yuborildi` : ''}.
            {result.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs">{result.errors.slice(0, 10).map((e) => <li key={e.row}>{e.row}-qator: {e.error}</li>)}</ul>}
          </Alert>
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center hover:bg-surface-3">
              <Upload className="size-5 text-ink-3" />
              <span className="text-sm font-medium text-ink">{fileName || 'CSV faylni tanlang'}</span>
              <span className="text-xs text-ink-3">Excel’da: Fayl → Saqlash → CSV UTF-8. Mavjud mijozlar oʻchmaydi, faqat ism va telefon toʻldiriladi.</span>
              <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {error && <Alert>{error}</Alert>}
            {rows && rows.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-line">
                <div className="border-b border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">Birinchi {Math.min(5, rows.length)} ta qator · jami {groupDigits(rows.length)}</div>
                <table className="w-full">
                  <tbody className="divide-y divide-line">
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}><td className={cx(td, 'font-semibold num')}>{r.code || <span className="text-danger">ID yoʻq</span>}</td><td className={td}>{r.name || '—'}</td><td className={cx(td, 'text-ink-3')}>{r.phone || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
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
            actions={data ? <>
              <Button icon={<Tag className="size-4" />} onClick={() => printClientLabel({ code: data.client.code, name: data.client.full_name, phone: data.client.phone })}>Yorliq (76×130)</Button>
              <PrintButton run={() => printClientStatement(data, user.full_name)} />
              {can(user, 'clients.edit') && <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Tahrirlash</Button>}
            </> : undefined}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="col-span-2 xl:col-span-1"><StatCard label="Jami toʻlangan" value={s?.total || 0} loading={loading} hint={s ? `${s.count} ta toʻlov` : undefined} /></div>
            <MethodStatCards t={s} loading={loading} />
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
            <div className="px-4 pb-3 pt-4 sm:px-5">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">Buyurtmalar</h3>
              <p className="mt-0.5 text-[13px] text-ink-3">“Chek orqali” toʻlangan buyurtmalar. Qoʻlda kiritilgan toʻlovlarning buyurtmalari rasmda, Telegramda qoladi.</p>
            </div>
            <div className="border-t border-line">
              {loading ? <SkeletonRows rows={3} /> : !data?.orders?.length ? <EmptyState title="Buyurtmalar yoʻq" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-line bg-surface-2/60">
                      <tr>
                        <th className={th}>Sana</th>
                        <th className={th}>Buyurtma</th>
                        <th className={cx(th, 'hidden sm:table-cell')}>Usul</th>
                        <th className={cx(th, 'text-right')}>Summa</th>
                        <th className={cx(th, 'hidden md:table-cell')}>Chek</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.orders.map((o, i) => (
                        <tr key={i} className={o.voided ? 'opacity-50' : undefined}>
                          <td className={cx(td, 'num text-ink-2')}>{formatDate(dateOf(o.paid_at))}</td>
                          <td className={td}>
                            <div className="font-medium num">{o.order_no ? `№${o.order_no}` : '—'}</div>
                            {o.code && <div className="text-xs text-ink-3 num">{o.code}</div>}
                          </td>
                          <td className={cx(td, 'hidden sm:table-cell')}>{o.transport || '—'}</td>
                          <td className={cx(td, 'text-right font-medium num', o.voided && 'line-through')}>{money(o.amount)}</td>
                          <td className={cx(td, 'hidden text-ink-3 md:table-cell')}>{[o.bank, o.transaction_id && `№${o.transaction_id}`].filter(Boolean).join(' ') || '—'}{o.voided ? ' · bekor qilingan' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
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
