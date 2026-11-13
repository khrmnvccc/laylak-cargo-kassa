import { useMemo, useRef, useState } from 'react';
import { RotateCcw, Save, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/live';
import { MAX_TEMPLATE_LENGTH, TEMPLATES, TEMPLATE_BY_KEY, renderTemplate, sampleValues, type TemplateKey } from '../lib/tgTemplates';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Textarea, useToast } from './ui';

type Texts = Partial<Record<TemplateKey, string>>;

/** Owner only: change the words of each Telegram message, with a live Telegram-style preview. */
export default function TelegramTemplates() {
  const toast = useToast();
  const { data, error: loadError, loading } = useApi<{ texts: Texts }>('/telegram/templates');
  const [saved, setSaved] = useState<Texts | null>(null);
  const texts = saved ?? data?.texts ?? {};
  const [key, setKey] = useState<TemplateKey>('payment');
  const [drafts, setDrafts] = useState<Texts>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const def = TEMPLATE_BY_KEY[key];
  const current = texts[key] || def.text;
  const text = drafts[key] ?? current;
  const changed = text !== current;
  const custom = Boolean(texts[key]);
  const preview = useMemo(() => renderTemplate(text || def.text, sampleValues(key)), [text, key, def.text]);

  const setText = (value: string) => setDrafts((d) => ({ ...d, [key]: value }));

  /** Puts {{name}} where the cursor is. */
  const insert = (name: string) => {
    const el = area.current;
    const token = `{{${name}}}`;
    if (!el) return setText(text + token);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    setText(text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };

  async function run(name: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(name);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  const save = (value: string | null) => run(value === null ? 'reset' : 'save', async () => {
    const res = await api<{ texts: Texts }>('/telegram/templates', { method: 'PUT', body: { key, text: value } });
    setSaved(res.texts);
    setDrafts(({ [key]: _gone, ...rest }) => rest);
    toast({ tone: 'success', title: value === null ? 'Asl matn qaytarildi' : 'Matn saqlandi', description: 'Keyingi xabarlar shu matn bilan keladi.' });
  });
  const test = () => run('test', async () => {
    await api('/telegram/templates/test', { method: 'POST', body: { key, text } });
    toast({ tone: 'success', title: 'Namuna Telegramga yuborildi' });
  });

  return (
    <Card className="xl:col-span-2">
      <CardHeader title="Telegram xabar matnlari" subtitle="Har bir xabarni oʻz soʻzlaringiz bilan yozing. Yonida Telegramda qanday koʻrinishi chiqadi." />
      {loadError && !data ? <ErrorState message={loadError} /> : loading && !saved ? <div className="skeleton h-64" /> : (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,320px)]">
          {/* Which message */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {TEMPLATES.map((t) => {
              const active = t.key === key;
              const edited = Boolean(texts[t.key]);
              const unsaved = drafts[t.key] !== undefined && drafts[t.key] !== (texts[t.key] || t.text);
              return (
                <button key={t.key} type="button" onClick={() => setKey(t.key)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors lg:w-full ${active ? 'border-[var(--card)] bg-[color-mix(in_srgb,var(--card)_10%,transparent)]' : 'border-line hover:bg-surface-2'}`}>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    {t.title}
                    {unsaved ? <span className="size-1.5 rounded-full bg-warn" title="Saqlanmagan" /> : edited && <span className="size-1.5 rounded-full bg-success" title="Oʻzgartirilgan" />}
                  </div>
                  <div className="hidden text-xs text-ink-3 lg:block">{t.hint}</div>
                </button>
              );
            })}
          </div>

          {/* The words */}
          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-semibold tracking-wide text-ink-2">MATN</div>
              {custom ? <Badge tone="success">Oʻzgartirilgan</Badge> : <Badge>Asl matn</Badge>}
            </div>
            <Textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={MAX_TEMPLATE_LENGTH}
              spellCheck={false} className="min-h-44 font-mono text-[13px] leading-relaxed" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-ink-3">Qoʻshish:</span>
              {def.vars.map((v) => (
                <button key={v.name} type="button" onClick={() => insert(v.name)} title={`{{${v.name}}}`}
                  className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink-2 transition-colors hover:border-[var(--card)] hover:text-ink">
                  {v.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-3">
              <b>*yulduzcha orasidagi*</b> soʻz qalin chiqadi. Qiymati boʻsh boʻlgan qator (masalan, izoh yozilmasa) xabarga kirmaydi.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Save className="size-4" />} loading={busy === 'save'} disabled={!changed || !text.trim()} onClick={() => save(text)}>Saqlash</Button>
              <Button icon={<Send className="size-4" />} loading={busy === 'test'} onClick={test}>Namunani menga yuborish</Button>
              {(custom || changed) && (
                <Button variant="ghost" icon={<RotateCcw className="size-4" />} loading={busy === 'reset'}
                  onClick={() => (custom ? save(null) : setDrafts(({ [key]: _gone, ...rest }) => rest))}>Asl matnga qaytarish</Button>
              )}
            </div>
            {error && <Alert>{error}</Alert>}
          </div>

          {/* How it looks */}
          <div className="min-w-0">
            <div className="mb-3 text-[13px] font-semibold tracking-wide text-ink-2">TELEGRAMDA KOʻRINISHI</div>
            <div className="rounded-2xl p-3 sm:p-4" style={{ background: 'linear-gradient(160deg, #cfe3c4, #a9cf9a)' }}>
              <div className="ml-auto max-w-[290px] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[14px] leading-snug text-[#111] shadow-sm">
                {key === 'payment' && <div className="mb-2 flex h-28 items-center justify-center rounded-lg bg-[#e8eef3] text-xs text-[#7a8794]">toʻlov rasmi</div>}
                <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: preview }} />
                <div className="mt-1 text-right text-[11px] text-[#8a9aa9]">17:40</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-3">Namunadagi ism va summalar misol uchun. Saqlaganda hech kimga xabar yuborilmaydi.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
