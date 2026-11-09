import { useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useLive } from '../lib/live';
import { formatDate, groupDigits, money, monthLabel } from '../lib/format';
import { bookSource, parseKassaBook } from '../lib/bookImport';
import type { BalanceMonth } from '../lib/types';
import { Alert, Button, Field, Input, Modal, Segmented, cx, td, th, useToast } from './ui';

interface KassaRow { date: string; kind: 'expense' | 'opening'; source: string; category: string; amount: number; note: string }
interface KassaResult {
  dryRun: boolean; alreadyRecorded: number; invalid: number;
  adding: { count: number; total: number; items: Array<{ date: string; source: string; category: string; amount: number; note: string }> };
  opening: Array<{ source: string; date: string; target: number; before: number; adjustment: number }>;
  errors: Array<{ row: number; error: string }>;
}

const CATEGORY_ALIASES: Record<string, string> = {
  tovar: 'tovar', paket: 'paket', qadoq: 'paket', yetkazish: 'yetkazish', dostavka: 'yetkazish',
  yoqilgi: 'yoqilgi', taksi: 'yoqilgi', transport: 'yoqilgi', benzin: 'yoqilgi', ijara: 'ijara', arenda: 'ijara',
  oylik: 'oylik', avans: 'oylik', kommunal: 'kommunal', svet: 'kommunal', internet: 'kommunal', inkassa: 'inkassa', boshqa: 'boshqa',
};
const accountLabel = (s: string) => (s === 'cash' ? '1-kassa · Naqd' : '2-kassa · Karta');
const nextMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };

type Book = { sheet: unknown[][]; names: string[]; fileMonth: string | null };
type Mismatch = Array<{ date: string; file: number; system: number }>;

/** Days whose "tushgan summa" in the book differs from the payments the kassa has for that day. */
async function incomeCheck(book: Book, source: 'cash' | 'card', month: string): Promise<{ mismatch: Mismatch; matched: number }> {
  const days = parseKassaBook(book.sheet as never, source, month).days.filter((d) => d.income > 0);
  if (!days.length) return { mismatch: [], matched: 0 };
  const data = await api<BalanceMonth>('/balance/month', { query: { from: days[0].date, to: days[days.length - 1].date } });
  const sys = (day: string) => Number(data.days.find((d) => d.day === day && d.source === source)?.income || 0);
  const mismatch = days.filter((d) => sys(d.date) !== d.income).map((d) => ({ date: d.date, file: d.income, system: sys(d.date) }));
  return { mismatch, matched: days.length - mismatch.length };
}

// CSV from Excel: sana, turi (rasxod | boshlangich qoldiq), hisob (naqd | karta), toifa, summa, izoh — with a header row.
function parseKassa(text: string): KassaRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
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
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (re: RegExp, fallback: number) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : fallback; };
  const idx = { date: col(/sana|date/, 0), kind: col(/turi|type/, 1), source: col(/hisob|account/, 2), category: col(/toifa|category/, 3), amount: col(/summa|amount/, 4), note: col(/izoh|note/, 5) };
  return lines.slice(1).map(split).map((r) => {
    const rawDate = r[idx.date] || '';
    const dmy = rawDate.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    const source = (r[idx.source] || '').toLowerCase();
    return {
      date: dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : rawDate,
      kind: /qoldiq|opening/i.test(r[idx.kind] || '') ? 'opening' as const : 'expense' as const,
      source: /karta|card/.test(source) ? 'card' : /naqd|naxt|cash/.test(source) ? 'cash' : source,
      category: CATEGORY_ALIASES[(r[idx.category] || '').toLowerCase()] || (r[idx.category] || ''),
      amount: Number((r[idx.amount] || '').replace(/[\s ']/g, '')),
      note: r[idx.note] || '',
    };
  }).filter((r) => r.amount || r.note);
}

export function ImportKassa({ allowed, onClose, categoryLabel }: { allowed: Array<'cash' | 'card'>; onClose: () => void; categoryLabel: (c: string) => string }) {
  const { bump } = useLive();
  const toast = useToast();
  const [rows, setRows] = useState<KassaRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<KassaResult | null>(null);
  const [done, setDone] = useState<KassaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // An Excel book in the kassa's own layout ("kassa naxt" / "kassa karta"): which kassa it is and
  // which month its dates belong to (a copied book sometimes still carries last month's dates).
  const [book, setBook] = useState<Book | null>(null);
  const [source, setSource] = useState<'cash' | 'card'>(allowed[0] ?? 'cash');
  const [month, setMonth] = useState('');
  const [check, setCheck] = useState<{ mismatch: Mismatch; matched: number; moved?: string } | null>(null);

  async function runPreview(parsed: KassaRow[]) {
    setRows(parsed); setPreview(null);
    setBusy(true);
    try {
      setPreview(await api<KassaResult>('/expenses/import', { method: 'POST', body: { rows: parsed, dryRun: true } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadBook(b: Book, src: 'cash' | 'card', m: string, moved?: string) {
    setError(null);
    const parsed = parseKassaBook(b.sheet as never, src, m).rows as KassaRow[];
    if (!parsed.length) { setError('Kitobda sanali qator topilmadi'); return; }
    incomeCheck(b, src, m).then((c) => setCheck({ ...c, moved })).catch(() => setCheck(null));
    await runPreview(parsed);
  }

  async function onFile(file: File | undefined) {
    setError(null); setPreview(null); setRows(null); setBook(null); setCheck(null);
    if (!file) return;
    setFileName(file.name);
    if (/\.xlsx?$/i.test(file.name)) {
      try {
        const { default: readXlsxFile, readSheetNames } = await import('read-excel-file');
        const names = await readSheetNames(file);
        const name = names.find((n) => /kassa/i.test(n)) ?? names[0];
        const sheet = await readXlsxFile(file, { sheet: name }) as unknown[][];
        const detected = bookSource([name, file.name]);
        const src = detected && allowed.includes(detected) ? detected : allowed[0] ?? 'cash';
        const fileMonth = parseKassaBook(sheet as never, src).fileMonth;
        if (!fileMonth) { setError('Kitobda sana topilmadi. Birinchi ustun: sana'); return; }
        const b = { sheet, names: [name, file.name], fileMonth };
        setBook(b); setSource(src);
        // The takings in the book are already in the kassa from the daily report: if they line up
        // with the next month rather than the one written in the book, the dates are a month behind.
        let m = fileMonth, moved: string | undefined;
        try {
          const [here, next] = await Promise.all([incomeCheck(b, src, fileMonth), incomeCheck(b, src, nextMonth(fileMonth))]);
          if (next.matched > here.matched) { m = nextMonth(fileMonth); moved = fileMonth; }
        } catch { /* no check: keep the book's own month */ }
        setMonth(m);
        await loadBook(b, src, m, moved);
      } catch (e) {
        setError(`Excel ochilmadi: ${(e as Error).message}`);
      }
      return;
    }
    const parsed = parseKassa(await file.text());
    if (!parsed.length) { setError('Faylda maʼlumot topilmadi. Ustunlar: sana, turi, hisob, toifa, summa, izoh'); return; }
    await runPreview(parsed);
  }

  async function save() {
    if (!rows?.length) return;
    setBusy(true); setError(null);
    try {
      const r = await api<KassaResult>('/expenses/import', { method: 'POST', body: { rows } });
      setDone(r);
      bump();
      toast({ tone: 'success', title: 'Kassa daftari yuklandi', description: `${r.adding.count} ta rasxod · ${money(r.adding.total)}` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shown = done || preview;
  const changes = preview ? preview.adding.count + preview.opening.filter((o) => o.adjustment).length : 0;
  return (
    <Modal open onClose={() => !busy && onClose()} title="Kassa daftarini yuklash" description="Excel kitob (kassa naxt / kassa karta) yoki CSV: sana, turi, hisob, toifa, summa, izoh" size="lg"
      footer={done ? <Button variant="primary" onClick={onClose}>Tayyor</Button> : <>
        <Button onClick={onClose} disabled={busy}>Bekor</Button>
        <Button variant="primary" loading={busy && !!preview} disabled={!changes} onClick={save}>Saqlash</Button>
      </>}>
      <div className="space-y-4">
        {!done && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center hover:bg-surface-3">
            <Upload className="size-5 text-ink-3" />
            <span className="text-sm font-medium text-ink">{fileName || 'Excel yoki CSV faylni tanlang'}</span>
            <span className="text-xs text-ink-3">Allaqachon yozilgan rasxodlar (shu kun, hisob, toifa va summa) qayta qoʻshilmaydi.</span>
            <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        )}
        {error && <Alert>{error}</Alert>}
        {book && !done && (
          <div className="grid gap-3 sm:grid-cols-2">
            {allowed.length > 1 ? (
              <Field label="Qaysi kassa">
                <Segmented className="flex w-full" value={source} onChange={(v) => { setSource(v); loadBook(book, v, month); }}
                  options={[{ value: 'cash' as const, label: '1-kassa · Naqd' }, { value: 'card' as const, label: '2-kassa · Karta' }]} />
              </Field>
            ) : <Field label="Kassa"><div className="flex h-9 items-center text-sm text-ink">{accountLabel(source)}</div></Field>}
            <Field label="Qaysi oy" htmlFor="kb-month" hint={book.fileMonth && month !== book.fileMonth ? `Kitobda ${monthLabel(`${book.fileMonth}-01`)} deb yozilgan` : undefined}>
              <Input id="kb-month" type="month" value={month} onChange={(e) => { if (!e.target.value) return; setMonth(e.target.value); loadBook(book, source, e.target.value); }} />
            </Field>
          </div>
        )}
        {book && check?.moved && !done && (
          <Alert tone="warn">Kitobdagi sanalar {monthLabel(`${check.moved}-01`)} deb yozilgan, lekin tushumlar {monthLabel(`${month}-01`)} bilan mos keldi. Sanalar {monthLabel(`${month}-01`)}ga oʻtkazildi.</Alert>
        )}
        {book && check && check.mismatch.length > 0 && !done && (
          <Alert tone="warn">
            {groupDigits(check.mismatch.length)} kunda kitobdagi tushum saytdagidan farq qiladi (avval otchyotni yuklang):
            <ul className="mt-1 space-y-0.5">{check.mismatch.slice(0, 5).map((m) => <li key={m.date} className="num">{formatDate(m.date)}: kitobda {money(m.file)}, saytda {money(m.system)}</li>)}</ul>
          </Alert>
        )}
        {busy && !preview && <p className="text-sm text-ink-3">Fayl tekshirilmoqda…</p>}
        {shown && (
          <>
            {done && <Alert tone="success">Kassa daftari saqlandi.</Alert>}
            {shown.opening.map((o) => (
              <div key={o.source} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
                <div className="font-medium text-ink">{accountLabel(o.source)}: {formatDate(o.date)} kun boshidagi qoldiq <span className="num">{money(o.target)}</span></div>
                <div className="mt-0.5 text-ink-3">
                  {o.adjustment ? <>Tizimda <span className="num">{money(o.before)}</span> edi, <span className="num">{o.adjustment > 0 ? '+' : '−'}{money(Math.abs(o.adjustment))}</span> tuzatish {done ? 'yozildi' : 'yoziladi'}.</> : 'Tizimdagi qoldiq allaqachon shunday, tuzatish kerak emas.'}
                </div>
              </div>
            ))}
            {shown.adding.count > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full">
                  <thead><tr><th className={th}>Sana</th><th className={th}>Toifa</th><th className={th}>Izoh</th><th className={cx(th, 'text-right')}>Summa</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {shown.adding.items.map((e, i) => (
                      <tr key={i}>
                        <td className={cx(td, 'whitespace-nowrap num')}>{e.date.slice(8)}.{e.date.slice(5, 7)}</td>
                        <td className={td}>{categoryLabel(e.category)} <span className="text-ink-3">· {accountLabel(e.source)}</span></td>
                        <td className={cx(td, 'max-w-[9rem] truncate text-ink-3')} title={e.note}>{e.note || '—'}</td>
                        <td className={cx(td, 'text-right num whitespace-nowrap')}>{money(e.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold"><td className={td} colSpan={3}>Jami · {groupDigits(shown.adding.count)} ta rasxod</td><td className={cx(td, 'text-right num')}>{money(shown.adding.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-ink-3">Yangi rasxod yoʻq.</p>}
            <ul className="space-y-1 text-sm text-ink-2">
              {shown.alreadyRecorded > 0 && <li>{groupDigits(shown.alreadyRecorded)} ta rasxod allaqachon yozilgan, qayta qoʻshilmaydi.</li>}
              {shown.invalid > 0 && <li className="text-danger">{groupDigits(shown.invalid)} ta qator xato, oʻtkazib yuboriladi.</li>}
            </ul>
            {shown.errors.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-ink-3">{shown.errors.slice(0, 10).map((e) => <li key={e.row}>{e.row + 1}-qator: {e.error}</li>)}</ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
