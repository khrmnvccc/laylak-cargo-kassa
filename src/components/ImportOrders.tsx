import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check as CheckIcon, FileSpreadsheet, Printer, Search } from 'lucide-react';
import { bookmarkletHref } from '../lib/bookmarklet';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { can } from '../lib/perms';
import { useLive } from '../lib/live';
import { money, todayTashkent } from '../lib/format';
import { orderKey, parseOrderSheet, parseOrderText, type ImportOrderRow } from '../lib/orderImport';
import { printStickers } from '../lib/print';
import { StickerFormatPicker, useStickerFormat } from './StickerFormatPicker';
import type { Order } from '../lib/types';
import { Alert, Button, Field, Input, Modal, Textarea, cx, td, th, useToast } from './ui';

interface Check { adding: number; total: number; skipped: number; prepaid: number; marking: number; invalid: Array<{ row: number; code: string; error: string }> }
interface Known { invalid: Map<number, string>; existing: Map<string, boolean> }
type Row = ImportOrderRow & { on: boolean };

// The server takes at most 1000 orders a request; a whole admin panel can be several thousand.
const BATCH = 500;
async function inBatches<T extends Check>(rows: ImportOrderRow[], body: Record<string, unknown>, each?: (res: T) => void): Promise<Check> {
  const sum: Check = { adding: 0, total: 0, skipped: 0, prepaid: 0, marking: 0, invalid: [] };
  for (let at = 0; at < rows.length; at += BATCH) {
    const res = await api<T>('/orders/import', { method: 'POST', body: { ...body, rows: rows.slice(at, at + BATCH) } });
    sum.adding += res.adding; sum.total += res.total; sum.skipped += res.skipped;
    sum.prepaid += res.prepaid || 0; sum.marking += res.marking || 0;
    sum.invalid.push(...res.invalid.map((i) => ({ ...i, row: i.row + at })));
    each?.(res);
  }
  return sum;
}

// The same order on two pages of the panel is kept once.
function unique(list: ImportOrderRow[]) {
  const seen = new Set<string>();
  return list.filter((r) => {
    const k = orderKey(r.clientCode, r.orderNo);
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const keyOf = (r: ImportOrderRow) => orderKey(r.clientCode, r.orderNo);
const PAGE = 200;

/** One order in the list; drawn again only when its own row changes, so ticking stays quick in a long list. */
const ImportRow = memo(function ImportRow({ r, i, state, canMarkPaid, onToggle, onPaid }: {
  r: Row; i: number; state: 'new' | 'have' | 'bad'; canMarkPaid: boolean; onToggle: (i: number) => void; onPaid: (i: number, paid: boolean) => void;
}) {
  return (
    <tr className={cx('cursor-pointer', !r.on && 'opacity-45')} onClick={() => onToggle(i)}>
      <td className={`${td} w-10 pr-0`}>
        <input type="checkbox" aria-label="Tanlash" className="size-4 accent-[var(--primary)]" checked={r.on} readOnly tabIndex={-1} />
      </td>
      {canMarkPaid && (
        <td className={`${td} w-12 px-1 sm:w-28 sm:px-2`} onClick={(e) => e.stopPropagation()}>
          <button type="button" disabled={!r.on} onClick={() => onPaid(i, !r.paid)} aria-label="Toʻlangan" aria-pressed={Boolean(r.paid)}
            className={cx('inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-50',
              r.paid ? 'border-transparent bg-success-soft text-success' : 'border-line text-ink-3 hover:text-ink')}>
            <CheckIcon className={cx('size-3.5', !r.paid && 'sm:hidden')} /><span className="hidden sm:inline">Toʻlangan</span>
          </button>
        </td>
      )}
      <td className={td}><div className="font-medium num">{r.clientCode || '—'}</div><div className="max-w-44 truncate text-xs text-ink-3">{r.clientName}</div>
        {r.orderNo && <div className="text-xs text-ink-3 num sm:hidden">№{r.orderNo}</div>}</td>
      <td className={`${td} hidden sm:table-cell`}><div className="num">{r.orderNo ? `№${r.orderNo}` : '—'}</div>
        <div className="text-xs text-ink-3">{[r.transport, r.places ? `${r.places} ta` : '', r.weight != null ? `${r.weight} kg` : ''].filter(Boolean).join(' · ')}</div></td>
      <td className={`${td} text-right`}>
        <div className="font-medium num">{r.amount ? money(r.amount) : '—'}</div>
        {state !== 'new' && <div className={cx('text-xs', state === 'bad' ? 'text-danger' : 'text-ink-3')}>{state === 'bad' ? 'Xato' : 'Kassada bor'}</div>}
      </td>
    </tr>
  );
});

/** Loads a whole list of orders at once: pasted from the admin panel or Excel, or an .xlsx / .csv file. */
export function ImportOrders({ open, onClose, text }: { open: boolean; onClose: () => void; text?: string | null }) {
  const { user } = useAuth();
  const canMarkPaid = can(user, 'payments.void');
  const { bump } = useLive();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [known, setKnown] = useState<Known | null>(null);
  const [marked, setMarked] = useState<number | null>(null);
  const [date, setDate] = useState(todayTashkent());
  const [done, setDone] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [find, setFind] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [format, setFormat] = useStickerFormat();
  const bookmark = useRef<HTMLAnchorElement>(null);

  // A list brought by the browser bookmark from the admin panel.
  useEffect(() => {
    if (open && text) { reset(); load(parseOrderText(text)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);
  // React refuses javascript: links in JSX, so the bookmark's address is set directly.
  useEffect(() => { bookmark.current?.setAttribute('href', bookmarkletHref()); });

  function reset() {
    setRows(null); setKnown(null); setDone(null); setMarked(null); setError(null); setFind(''); setLimit(PAGE);
  }

  function load(all: ImportOrderRow[]) {
    const list = unique(all);
    setError(null); setKnown(null);
    if (!list.length) { setRows(null); setError('Roʻyxatda buyurtma topilmadi. Admin paneldagi jadvalni belgilab nusxa oling yoki Excel faylni tanlang.'); return; }
    setRows(list.map((r) => ({ ...r, paid: false, on: true })));
  }

  // The server is asked once per list (and date): which rows have mistakes, which orders the kassa already has.
  // Ticking rows after that is counted here, without asking again.
  const listId = rows ? rows.length + (rows[0]?.clientCode || '') + (rows[rows.length - 1]?.orderNo || '') : '';
  useEffect(() => {
    if (!rows || done) return;
    let live = true;
    setChecking(true);
    const plain = rows.map(({ on, paid, ...r }) => r);
    const existing = new Map<string, boolean>();
    inBatches<Check & { existing: Array<{ key: string; unpaid: boolean }> }>(plain, { receivedAt: date, dryRun: true },
      (res) => res.existing?.forEach((e) => existing.set(e.key, e.unpaid)))
      .then((res) => { if (live) { setKnown({ invalid: new Map(res.invalid.map((i) => [i.row - 1, i.error])), existing }); setError(null); } })
      .catch((e) => { if (live) setError((e as Error).message); })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, date, done]);

  const onToggle = useCallback((i: number) => setRows((list) => list && list.map((r, j) => (j === i ? { ...r, on: !r.on } : r))), []);
  const onPaid = useCallback((i: number, paid: boolean) => setRows((list) => list && list.map((r, j) => (j === i ? { ...r, paid } : r))), []);
  const stateOf = (r: Row, i: number): 'new' | 'have' | 'bad' => (known?.invalid.has(i) ? 'bad' : known?.existing.has(keyOf(r)) ? 'have' : 'new');

  const check: Check | null = useMemo(() => {
    if (!rows || !known) return null;
    const c: Check = { adding: 0, total: 0, skipped: 0, prepaid: 0, marking: 0, invalid: [] };
    rows.forEach((r, i) => {
      if (!r.on) return;
      const bad = known.invalid.get(i);
      if (bad) { c.invalid.push({ row: i + 1, code: r.clientCode, error: bad }); return; }
      const have = known.existing.get(keyOf(r));
      if (have !== undefined) { c.skipped += 1; if (r.paid && have) c.marking += 1; return; }
      c.adding += 1; c.total += r.amount; if (r.paid) c.prepaid += 1;
    });
    return c;
  }, [rows, known]);

  const selected = rows ? rows.filter((r) => r.on) : [];
  const allPicked = Boolean(rows?.length) && rows!.every((r) => r.on);
  const allPaid = selected.length > 0 && selected.every((r) => r.paid);
  const setAll = (patch: (r: Row) => Partial<Row>) => setRows((list) => list && list.map((r) => ({ ...r, ...patch(r) })));
  const q = find.trim().toUpperCase();
  const visible = rows ? rows.map((r, i) => ({ r, i })).filter(({ r }) => !q || `${r.clientCode} ${r.orderNo} ${r.clientName}`.toUpperCase().includes(q)) : [];

  async function onFile(file: File | undefined) {
    if (!file) return;
    reset();
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file');
        load(parseOrderSheet(await readXlsxFile(file)));
      } else if (/\.xls$/i.test(file.name)) {
        setError('Eski .xls fayl ochilmaydi: Excelda “Saqlash → Excel kitobi (.xlsx)” qilib saqlang.');
      } else {
        load(parseOrderText(await file.text()));
      }
    } catch {
      setError('Fayl ochilmadi. .xlsx yoki .csv fayl tanlang.');
    }
  }

  async function save() {
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    try {
      const added: Order[] = [];
      const send = selected.map(({ on, ...r }) => r);
      const res = await inBatches<Check & { orders: Order[] }>(send, { receivedAt: date }, (r) => added.push(...r.orders));
      setDone(added);
      setMarked(res.marking);
      bump();
      toast({ tone: 'success', title: `${added.length} ta buyurtma qoʻshildi`, description: [money(res.total), res.marking ? `${res.marking} tasi toʻlangan deb belgilandi` : ''].filter(Boolean).join(' · ') });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const close = () => { reset(); onClose(); };
  const changes = check ? check.adding + check.marking : 0;

  return (
    <Modal open={open} onClose={close} size="xl" title="Roʻyxatdan yuklash"
      description="Admin paneldagi buyurtmalar jadvalini belgilab nusxa oling (Ctrl+A, Ctrl+C) va shu yerga qoʻying, yoki Excel faylni tanlang."
      footer={done ? (
        <>
          {done.length > 0 && <StickerFormatPicker value={format} onChange={setFormat} count={done.length} className="sm:mr-auto sm:w-64" />}
          <Button onClick={close}>Yopish</Button>
          {done.length > 0 && <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => void printStickers(done, format)}>{done.length} ta stikerni chop etish</Button>}
        </>
      ) : (
        <>
          <Button onClick={close}>Bekor qilish</Button>
          <Button variant="primary" loading={busy || checking} disabled={!check || !changes} onClick={() => void save()}>
            {check?.adding ? `${check.adding} ta buyurtmani qoʻshish` : check?.marking ? `${check.marking} tasini toʻlangan deb belgilash` : 'Qoʻshish'}
          </Button>
        </>
      )}>
      {done ? (
        <div className="space-y-3">
          <Alert tone="success">
            {done.length} ta buyurtma kassaga qoʻshildi.{marked ? ` Kassada bor ${marked} ta buyurtma toʻlangan deb belgilandi.` : ''}
            {done.length > 0 && ' Endi stikerlarni chop eting: har biri alohida yorliqqa chiqadi.'}
          </Alert>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <Field label="Roʻyxat" hint="Har qatorda: mijoz, kod, buyurtma №, usul, joylar, vazn, summa">
              <Textarea rows={4} placeholder="Shu yerga qoʻying (Ctrl+V)" className="text-xs"
                value="" onChange={() => undefined}
                onPaste={(e) => { const text = e.clipboardData.getData('text'); e.preventDefault(); reset(); load(parseOrderText(text)); }} />
            </Field>
            <div className="space-y-3">
              <Field label="Qabul qilingan sana" htmlFor="imp-date">
                <Input id="imp-date" type="date" value={date} max={todayTashkent()} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
              <Button className="w-full" icon={<FileSpreadsheet className="size-4" />} onClick={() => fileRef.current?.click()}>Excel fayl tanlash</Button>
            </div>
          </div>

          {!rows && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line p-3 text-[13px] text-ink-2">
              <a ref={bookmark} draggable onClick={(e) => e.preventDefault()}
                className="inline-flex shrink-0 cursor-grab items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-fg">
                <Bookmark className="size-4" />Kassaga yuklash
              </a>
              <span className="min-w-0 flex-1">Bu tugmani sichqoncha bilan zakladkalar paneliga torting. Keyin admin panelda shu zakladkani bossangiz: belgilangan buyurtmalar, hech biri belgilanmagan boʻlsa esa hamma sahifalardagi buyurtmalar kassada ochiladi.</span>
            </div>
          )}

          {check && (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg border border-line p-3"><div className="text-ink-3">Qoʻshiladi</div><div className="text-lg font-semibold num">{check.adding} ta</div>
                <div className="text-xs text-ink-3 num">{money(check.total)}{check.prepaid ? ` · ${check.prepaid} tasi toʻlangan` : ''}</div></div>
              <div className="rounded-lg border border-line p-3"><div className="text-ink-3">Kassada bor</div><div className="text-lg font-semibold num">{check.skipped} ta</div>
                <div className="text-xs text-ink-3">{check.marking ? `${check.marking} tasi toʻlangan deb belgilanadi` : 'qayta qoʻshilmaydi'}</div></div>
              <div className="rounded-lg border border-line p-3"><div className="text-ink-3">Xato</div><div className="text-lg font-semibold num">{check.invalid.length} ta</div><div className="text-xs text-ink-3">oʻtkazib yuboriladi</div></div>
            </div>
          )}
          {check && check.invalid.length > 0 && (
            <Alert tone="warn">{check.invalid.slice(0, 5).map((i) => `${i.row}-qator ${i.code || ''}: ${i.error}`).join('; ')}</Alert>
          )}

          {rows && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <span className="mr-auto">Tanlangan: <b className="text-ink num">{selected.length}</b> / <span className="num">{rows.length}</span> · kassaga faqat belgilanganlari oʻtadi</span>
                {canMarkPaid && selected.length > 0 && (
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setAll((r) => (r.on ? { paid: !allPaid } : {}))}>
                    {allPaid ? 'Toʻlangan belgisini olib tashlash' : 'Tanlanganlarning hammasi toʻlangan'}
                  </button>
                )}
              </div>
              {rows.length > 20 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                  <Input value={find} onChange={(e) => { setFind(e.target.value); setLimit(PAGE); }} placeholder="Roʻyxatdan qidirish: ID, ism yoki buyurtma №" className="h-9 pl-9" />
                </div>
              )}
              <div className="max-h-[50vh] overflow-auto rounded-lg border border-line">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 [background:linear-gradient(var(--surface-2),var(--surface-2)),var(--bg)]">
                    <tr>
                      <th className={`${th} w-10 pr-0`}>
                        <input type="checkbox" aria-label="Hammasini tanlash" className="size-4 accent-[var(--primary)]" checked={allPicked}
                          onChange={(e) => { const on = e.target.checked; setAll(() => ({ on })); }} />
                      </th>
                      {canMarkPaid && <th className={`${th} px-1 sm:px-2`}>Toʻlov</th>}
                      <th className={th}>Mijoz</th><th className={`${th} hidden sm:table-cell`}>Buyurtma</th><th className={`${th} text-right`}>Summa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visible.slice(0, limit).map(({ r, i }) => (
                      <ImportRow key={i} r={r} i={i} state={stateOf(r, i)} canMarkPaid={canMarkPaid} onToggle={onToggle} onPaid={onPaid} />
                    ))}
                  </tbody>
                </table>
                {visible.length > limit && (
                  <div className="p-2 text-center">
                    <Button size="sm" onClick={() => setLimit((n) => n + PAGE)}>Yana koʻrsatish ({visible.length - limit} ta qoldi)</Button>
                  </div>
                )}
                {!visible.length && <div className="p-4 text-center text-[13px] text-ink-3">Topilmadi</div>}
              </div>
              {canMarkPaid && (
                <p className="text-xs text-ink-3">“Toʻlangan”: admin panelda toʻlangan buyurtma kassaga toʻlangan boʻlib tushadi. Kassadagi pulga qoʻshilmaydi.</p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
