import { useEffect, useRef, useState } from 'react';
import { Bookmark, FileSpreadsheet, Printer } from 'lucide-react';
import { bookmarkletHref } from '../lib/bookmarklet';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { can } from '../lib/perms';
import { useLive } from '../lib/live';
import { money, todayTashkent } from '../lib/format';
import { parseOrderSheet, parseOrderText, type ImportOrderRow } from '../lib/orderImport';
import { printStickers } from '../lib/print';
import { StickerFormatPicker, useStickerFormat } from './StickerFormatPicker';
import type { Order } from '../lib/types';
import { Alert, Button, Field, Input, Modal, Textarea, td, th, useToast } from './ui';

interface Check { adding: number; total: number; skipped: number; prepaid: number; marking: number; invalid: Array<{ row: number; code: string; error: string }> }

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
    if (!r.orderNo) return true;
    const k = `${r.clientCode}|${r.orderNo}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Loads a whole list of orders at once: pasted from the admin panel or Excel, or an .xlsx / .csv file. */
export function ImportOrders({ open, onClose, text }: { open: boolean; onClose: () => void; text?: string | null }) {
  const { user } = useAuth();
  const canMarkPaid = can(user, 'payments.void');
  const { bump } = useLive();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportOrderRow[] | null>(null);
  // Which rows go into the kassa: all at first, the cashier unticks the ones to leave out.
  const [picked, setPicked] = useState<boolean[]>([]);
  const [marked, setMarked] = useState<number | null>(null);
  const [date, setDate] = useState(todayTashkent());
  const [check, setCheck] = useState<Check | null>(null);
  const [done, setDone] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useStickerFormat();
  const bookmark = useRef<HTMLAnchorElement>(null);

  // A list brought by the browser bookmark from the admin panel.
  useEffect(() => {
    if (open && text) { reset(); void load(parseOrderText(text)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);
  // React refuses javascript: links in JSX, so the bookmark's address is set directly.
  useEffect(() => { bookmark.current?.setAttribute('href', bookmarkletHref()); });

  function reset() {
    setRows(null); setPicked([]); setCheck(null); setDone(null); setMarked(null); setError(null);
  }

  function load(all: ImportOrderRow[]) {
    const list = unique(all);
    setError(null); setCheck(null);
    if (!list.length) { setRows(null); setError('Roʻyxatda buyurtma topilmadi. Admin paneldagi jadvalni belgilab nusxa oling yoki Excel faylni tanlang.'); return; }
    setRows(list);
    setPicked(list.map(() => true));
  }

  const selected = rows ? rows.filter((_, i) => picked[i]) : [];
  const selectedAt = rows ? rows.map((_, i) => i).filter((i) => picked[i]) : [];
  // The server checks the ticked rows again a moment after the last change (what is new, what is already in the kassa).
  useEffect(() => {
    if (!rows || done) return;
    setCheck(null);
    if (!selected.length) return;
    let live = true;
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await inBatches(selected, { receivedAt: date, dryRun: true });
        if (live) { setCheck(res); setError(null); }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setBusy(false);
      }
    }, 400);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, picked, date, done]);

  const setRow = (i: number, patch: Partial<ImportOrderRow>) => setRows((list) => list && list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const allPicked = picked.length > 0 && picked.every(Boolean);
  const allPaid = selected.length > 0 && selected.every((r) => r.paid);
  const setAllPaid = (paid: boolean) => setRows((list) => list && list.map((r, i) => (picked[i] ? { ...r, paid } : r)));

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
      const res = await inBatches<Check & { orders: Order[] }>(selected, { receivedAt: date }, (r) => added.push(...r.orders));
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
    <Modal open={open} onClose={close} size="lg" title="Roʻyxatdan yuklash"
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
          <Button variant="primary" loading={busy} disabled={!check || !changes} onClick={() => void save()}>
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
            <Alert tone="warn">{check.invalid.slice(0, 5).map((i) => `${(selectedAt[i.row - 1] ?? i.row - 1) + 1}-qator ${i.code || ''}: ${i.error}`).join('; ')}</Alert>
          )}

          {rows && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-2">
                <span>Tanlangan: <b className="text-ink num">{selected.length}</b> / <span className="num">{rows.length}</span> · kassaga faqat belgilanganlari oʻtadi</span>
                {canMarkPaid && selected.length > 0 && (
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setAllPaid(!allPaid)}>
                    {allPaid ? 'Toʻlangan belgisini olib tashlash' : 'Tanlanganlarning hammasi toʻlangan'}
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-line">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-surface-2">
                    <tr>
                      <th className={`${th} w-10`}>
                        <input type="checkbox" aria-label="Hammasini tanlash" className="size-4 accent-[var(--primary)]" checked={allPicked}
                          onChange={(e) => setPicked(rows.map(() => e.target.checked))} />
                      </th>
                      <th className={th}>Mijoz</th><th className={th}>Buyurtma</th><th className={`${th} text-right`}>Vazn</th><th className={`${th} text-right`}>Summa</th>
                      {canMarkPaid && <th className={`${th} text-center`}>Toʻlangan</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r, i) => (
                      <tr key={i} className={picked[i] ? 'cursor-pointer' : 'cursor-pointer opacity-45'}
                        onClick={() => setPicked((p) => p.map((v, j) => (j === i ? !v : v)))}>
                        <td className={td}>
                          <input type="checkbox" aria-label="Tanlash" className="size-4 accent-[var(--primary)]" checked={Boolean(picked[i])} readOnly tabIndex={-1} />
                        </td>
                        <td className={td}><div className="font-medium num">{r.clientCode || '—'}</div><div className="text-xs text-ink-3">{r.clientName}</div></td>
                        <td className={td}><div className="num">{r.orderNo ? `№${r.orderNo}` : '—'}</div>
                          <div className="text-xs text-ink-3">{[r.transport, r.places ? `${r.places} ta` : ''].filter(Boolean).join(' · ')}</div></td>
                        <td className={`${td} text-right num`}>{r.weight != null ? `${r.weight} kg` : '—'}</td>
                        <td className={`${td} text-right font-medium num`}>{r.amount ? money(r.amount) : '—'}</td>
                        {canMarkPaid && (
                          <td className={`${td} text-center`} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" aria-label="Toʻlangan" className="size-4 accent-[var(--success)]" disabled={!picked[i]}
                              checked={Boolean(r.paid)} onChange={(e) => setRow(i, { paid: e.target.checked })} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canMarkPaid && (
                <p className="text-xs text-ink-3">“Toʻlangan” belgisi: admin panelda toʻlangan buyurtma kassaga toʻlangan boʻlib tushadi. Kassadagi pulga qoʻshilmaydi.</p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
