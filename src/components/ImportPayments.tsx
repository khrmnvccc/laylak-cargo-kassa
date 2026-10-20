import { useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useLive } from '../lib/live';
import { formatDate, groupDigits, money } from '../lib/format';
import { Alert, Button, Modal, cx, td, th, useToast } from './ui';

interface ImportRow { date: string; code: string; method: string; amount: number; note: string }
interface ImportResult {
  dryRun: boolean; from: string; to: string; alreadyInKassa: number; invalid: number; newClients: number;
  adding: { cash: number; card: number; yandex: number; pochta: number; total: number; count: number };
  errors: Array<{ row: number; error: string }>;
}

const METHOD_ALIASES: Record<string, string> = {
  naqd: 'cash', naxt: 'cash', nalichka: 'cash', cash: 'cash',
  karta: 'card', card: 'card', plastik: 'card',
  yandex: 'yandex', pochta: 'pochta', pocta: 'pochta',
};

// CSV from Excel (comma, semicolon or tab): sana, id, turi, summa, izoh — with a header row.
function parsePayments(text: string): ImportRow[] {
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
  const idx = { date: col(/sana|date/, 0), code: col(/^id|kod|code/, 1), method: col(/turi|type|method/, 2), amount: col(/summa|amount/, 3), note: col(/izoh|note/, 4) };
  return lines.slice(1).map(split).map((r) => {
    const rawDate = r[idx.date] || '';
    const dmy = rawDate.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    return {
      date: dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : rawDate,
      code: (r[idx.code] || '').replace(/\s+/g, '').toUpperCase(),
      method: METHOD_ALIASES[(r[idx.method] || '').toLowerCase()] || r[idx.method] || '',
      amount: Number((r[idx.amount] || '').replace(/[\s ']/g, '')),
      note: r[idx.note] || '',
    };
  }).filter((r) => r.code || r.amount);
}

export function ImportPayments({ onClose }: { onClose: () => void }) {
  const { bump } = useLive();
  const toast = useToast();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setError(null); setPreview(null); setRows(null);
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) { setError('Excel faylni “Saqlash → CSV (UTF-8)” qilib saqlang yoki faylni chatga yuboring.'); return; }
    setFileName(file.name);
    const parsed = parsePayments(await file.text());
    if (!parsed.length) { setError('Faylda toʻlov topilmadi. Ustunlar: sana, id, turi, summa, izoh'); return; }
    setRows(parsed);
    setBusy(true);
    try {
      setPreview(await api<ImportResult>('/payments/import', { method: 'POST', body: { rows: parsed, dryRun: true } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!rows?.length) return;
    setBusy(true); setError(null);
    try {
      const r = await api<ImportResult>('/payments/import', { method: 'POST', body: { rows } });
      setDone(r);
      bump();
      toast({ tone: 'success', title: 'Toʻlovlar yuklandi', description: `${groupDigits(r.adding.count)} ta toʻlov · ${money(r.adding.total)}` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shown = done || preview;
  const canSave = !done && !!preview && preview.adding.count > 0;
  return (
    <Modal open onClose={() => !busy && onClose()} title="Hisobotdan toʻlovlarni yuklash" description="CSV fayl: sana, id, turi, summa, izoh" size="lg"
      footer={done ? <Button variant="primary" onClick={onClose}>Tayyor</Button> : <>
        <Button onClick={onClose} disabled={busy}>Bekor</Button>
        <Button variant="primary" loading={busy && !!preview} disabled={!canSave} onClick={save}>
          {preview ? `${groupDigits(preview.adding.count)} ta toʻlovni qoʻshish` : 'Qoʻshish'}
        </Button>
      </>}>
      <div className="space-y-4">
        {!done && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center hover:bg-surface-3">
            <Upload className="size-5 text-ink-3" />
            <span className="text-sm font-medium text-ink">{fileName || 'CSV faylni tanlang'}</span>
            <span className="text-xs text-ink-3">Kassada allaqachon bor toʻlovlar (shu kun, shu mijoz, shu tur va summa) qayta qoʻshilmaydi.</span>
            <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        )}
        {error && <Alert>{error}</Alert>}
        {busy && !preview && <p className="text-sm text-ink-3">Fayl tekshirilmoqda…</p>}
        {shown && (
          <>
            {done && <Alert tone="success">{groupDigits(done.adding.count)} ta toʻlov kassaga qoʻshildi.</Alert>}
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="border-b border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">
                {formatDate(shown.from)} – {formatDate(shown.to)} · {done ? 'qoʻshildi' : 'qoʻshiladi'}
              </div>
              <table className="w-full">
                <thead><tr><th className={th}>Turi</th><th className={cx(th, 'text-right')}>Summa</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {([['Naqd', shown.adding.cash], ['Karta', shown.adding.card], ['Yandex', shown.adding.yandex], ['Pochta', shown.adding.pochta]] as const).map(([k, v]) => (
                    <tr key={k}><td className={td}>{k}</td><td className={cx(td, 'text-right num')}>{money(v)}</td></tr>
                  ))}
                  <tr className="font-semibold"><td className={td}>Jami · {groupDigits(shown.adding.count)} ta toʻlov</td><td className={cx(td, 'text-right num')}>{money(shown.adding.total)}</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="space-y-1 text-sm text-ink-2">
              {shown.alreadyInKassa > 0 && <li>{groupDigits(shown.alreadyInKassa)} ta toʻlov kassada allaqachon bor, ular qoʻshilmaydi.</li>}
              {shown.newClients > 0 && <li>{groupDigits(shown.newClients)} ta yangi mijoz ID roʻyxatga qoʻshiladi.</li>}
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
