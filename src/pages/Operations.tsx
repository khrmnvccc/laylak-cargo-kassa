import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/live';
import { METHODS, dateOf, downloadCsv, methodLabel, money, rangeLabel, timeOf } from '../lib/format';
import type { Method, PaymentList, Summary } from '../lib/types';
import { DateRangePicker, presetRange, type Range } from '../components/DateRange';
import { PaymentsTable } from '../components/PaymentsTable';
import { ImportPayments } from '../components/ImportPayments';
import { useAuth } from '../lib/auth';
import { Button, Card, EmptyState, ErrorState, IconButton, Input, PageHeader, Segmented, Select, SkeletonRows, useToast } from '../components/ui';

const PAGE_SIZE = 50;

export default function Operations({ params }: { params: URLSearchParams }) {
  const toast = useToast();
  const [range, setRange] = useState<Range>(() => presetRange(params.get('client') ? '30d' : '7d'));
  const [method, setMethod] = useState<'all' | Method>('all');
  const [worker, setWorker] = useState('');
  const [status, setStatus] = useState<'active' | 'voided' | 'all'>('active');
  const [search, setSearch] = useState(params.get('client') || '');
  const [debounced, setDebounced] = useState(search);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => setPage(0), [range.from, range.to, method, worker, status, debounced]);

  const filters = {
    ...range,
    method: method === 'all' ? undefined : method,
    worker: worker || undefined,
    status,
    q: debounced || undefined,
  };
  const { data, error, loading, reload } = useApi<PaymentList>('/payments', { ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const workers = useApi<Summary>('/summary', range);
  const workerOptions = (workers.data?.byWorker || []).filter((w) => !w.id.startsWith('legacy:'));
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  async function exportCsv() {
    setExporting(true);
    try {
      const rows: Array<Array<string | number>> = [['Sana', 'Vaqt', 'Mijoz ID', 'Mijoz ismi', 'Toʻlov turi', 'Summa (soʻm)', 'Ishchi', 'Izoh', 'Holat']];
      for (let offset = 0; ; offset += 500) {
        const chunk = await api<PaymentList>('/payments', { query: { ...filters, limit: 500, offset } });
        for (const p of chunk.items) {
          rows.push([dateOf(p.paid_at), timeOf(p.paid_at), p.client_code, p.client_name || '', methodLabel(p.method), p.amount,
            p.created_by_name, p.note || '', p.voided_at ? `Bekor qilingan: ${p.void_reason || ''}` : 'Faol']);
        }
        if (chunk.items.length < 500) break;
      }
      downloadCsv(`operatsiyalar_${range.from}_${range.to}.csv`, rows);
    } catch (e) {
      toast({ tone: 'error', title: 'Eksport qilinmadi', description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Operatsiyalar"
        subtitle="Barcha kirimlar tarixi"
        actions={<>
          {user.role === 'admin' && <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>Hisobotni yuklash</Button>}
          <Button icon={<Download className="size-4" />} loading={exporting} onClick={exportCsv} disabled={!data?.count}>Excel (CSV)</Button>
        </>}
      />
      {importing && <ImportPayments onClose={() => setImporting(false)} />}

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:p-4 xl:flex-row xl:items-center">
          <div className="relative flex-1 xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ID, mijoz ismi, izoh yoki ishchi boʻyicha qidirish" className="h-9 pl-9 pr-9" />
            {search && (
              <IconButton label="Tozalash" className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2" onClick={() => setSearch('')}><X className="size-4" /></IconButton>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
            <DateRangePicker value={range} onChange={setRange} />
            <Segmented value={method} onChange={setMethod} options={[{ value: 'all', label: 'Hammasi' }, ...METHODS.map((m) => ({ value: m.value, label: m.label }))]} />
            <Select value={worker} onChange={(e) => setWorker(e.target.value)} className="w-auto min-w-[150px]" aria-label="Ishchi">
              <option value="">Barcha ishchilar</option>
              {workerOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto" aria-label="Holat">
              <option value="active">Faol</option>
              <option value="voided">Bekor qilingan</option>
              <option value="all">Hammasi</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Operatsiyalar', data ? String(data.count) : '—'],
            ['Jami', data ? money(data.total) : '—'],
            ...METHODS.map((m) => [m.label, data ? money(data[m.value]) : '—']),
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-3">
              <div className="text-xs text-ink-3">{k}</div>
              <div className="mt-0.5 text-sm font-semibold text-ink num">{v}</div>
            </div>
          ))}
        </div>

        {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading ? <SkeletonRows rows={8} cols={6} /> : !data?.items.length ? (
          <EmptyState title="Operatsiya topilmadi" description={`${rangeLabel(range.from, range.to)} oraligʻida filtrlarga mos toʻlov yoʻq.`} />
        ) : (
          <>
            <PaymentsTable items={data.items} />
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-3">
              <span className="num">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.count)} / {data.count}</span>
              <div className="flex items-center gap-1">
                <IconButton label="Oldingi sahifa" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40"><ChevronLeft className="size-4" /></IconButton>
                <span className="px-2 num">{page + 1} / {pages}</span>
                <IconButton label="Keyingi sahifa" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40"><ChevronRight className="size-4" /></IconButton>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
