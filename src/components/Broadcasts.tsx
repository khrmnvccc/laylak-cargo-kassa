import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarClock, Check, Lock, Megaphone, MessageSquare, Pencil, Plus, Send, Trash2, User, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useLive } from '../lib/live';
import { renderTemplate } from '../lib/tgTemplates';
import { BROADCAST_MAX_BUTTONS, BROADCAST_MAX_TEXT, type Broadcast, type BroadcastButton } from '../lib/broadcast';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Input, cx, useToast } from './ui';
import { Bubble, type LinkedPerson } from './TelegramTemplates';

const STATUS: Record<Broadcast['status'], { label: string; tone: 'neutral' | 'warn' | 'success' | 'danger' | 'card' }> = {
  draft: { label: 'Qoralama', tone: 'neutral' },
  scheduled: { label: 'Rejalashtirilgan', tone: 'card' },
  sending: { label: 'Yuborilmoqda', tone: 'warn' },
  sent: { label: 'Yuborildi', tone: 'success' },
  failed: { label: 'Yetib bormadi', tone: 'danger' },
};

/** "13.11.2026, 18:40" in Tashkent time. */
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
/** ISO -> the value a datetime-local input shows, in Tashkent time. */
const toLocal = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 5 * 3600_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(`${v}:00+05:00`).toISOString() : null);

interface Draft { id: string | null; title: string; text: string; buttons: BroadcastButton[]; all: boolean; users: string[]; later: boolean; sendAt: string; silent: boolean }
const blank = (): Draft => ({ id: null, title: '', text: '', buttons: [], all: true, users: [], later: false, sendAt: '', silent: false });
const fromBroadcast = (b: Broadcast): Draft => ({
  id: b.id, title: b.title, text: b.text, buttons: b.buttons, all: b.audience.all !== false, users: b.audience.users ?? [],
  later: Boolean(b.send_at), sendAt: toLocal(b.send_at), silent: b.silent,
});

/** One message as the staff member will get it, with its buttons under it. */
function Preview({ draft }: { draft: Draft }) {
  const html = useMemo(() => renderTemplate(draft.text, {}), [draft.text]);
  const buttons = draft.buttons.filter((b) => b.text.trim());
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-2.5 border-b border-line bg-surface px-3.5 py-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-[#2aabee] text-white"><Send className="size-4 -translate-x-px" /></span>
        <div><div className="text-sm font-semibold text-ink">Laylak Cargo</div><div className="text-[11px] text-ink-3">bot</div></div>
      </div>
      <div className="min-h-[260px] space-y-1.5 p-3.5" style={{ background: 'linear-gradient(160deg, #dfe9f0, #cddce7)' }}>
        <div className="mx-auto w-fit rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-medium text-white">Bugun</div>
        <Bubble html={html} />
        {buttons.map((b, i) => (
          <div key={i} className="ml-10 max-w-[300px] rounded-xl bg-[#6f8aa3]/70 px-3 py-2 text-center text-[13px] font-semibold text-white">{b.text}</div>
        ))}
      </div>
      <p className="border-t border-line bg-surface px-3 py-2 text-center text-[11px] text-ink-3">Xodim Telegramda xabarni shunday koʻradi.</p>
    </div>
  );
}

function Steps({ step, onStep, done }: { step: number; onStep: (n: number) => void; done: boolean[] }) {
  const names = ['Xabar', 'Kimga va qachon', 'Sinov va yuborish'];
  return (
    <div className="mb-5 grid grid-cols-3 gap-2">
      {names.map((n, i) => (
        <button key={n} type="button" onClick={() => onStep(i)}
          className={cx('flex items-center gap-2 border-b-2 pb-2.5 text-left text-[13px] font-semibold transition-colors sm:text-sm',
            step === i ? 'border-[var(--card)] text-ink' : done[i] ? 'border-success text-ink-2' : 'border-line text-ink-3')}>
          <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full text-xs',
            done[i] && step !== i ? 'bg-success text-white' : step === i ? 'bg-[var(--card)] text-white' : 'bg-surface-3 text-ink-3')}>
            {done[i] && step !== i ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className="truncate">{n}</span>
        </button>
      ))}
    </div>
  );
}

function Choice({ on, icon, title, sub, onClick }: { on: boolean; icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx('flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors', on ? 'border-[var(--card)] bg-[color-mix(in_srgb,var(--card)_8%,transparent)]' : 'border-line bg-surface hover:bg-surface-2')}>
      <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-[var(--card)] text-white' : 'bg-surface-2 text-ink-2')}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{title}</span><span className="block truncate text-xs text-ink-3">{sub}</span></span>
      <span className={cx('size-4 shrink-0 rounded-full border-2', on ? 'border-[var(--card)] bg-[var(--card)] shadow-[inset_0_0_0_2px_var(--surface)]' : 'border-line')} />
    </button>
  );
}

function Editor({ start, people, onClose }: { start: Draft; people: LinkedPerson[]; onClose: () => void }) {
  const toast = useToast();
  const { bump } = useLive();
  const [d, setD] = useState<Draft>(start);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(Boolean(start.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
  const active = people.filter((p) => p.is_active);
  const set = (change: Partial<Draft>) => { setD((x) => ({ ...x, ...change })); setSaved(false); };
  const count = d.all ? active.length : d.users.filter((id) => active.some((p) => p.id === id)).length;
  const sendAt = d.later ? fromLocal(d.sendAt) : null;
  const laterValid = !d.later || (sendAt !== null && Date.parse(sendAt) > Date.now() + 60_000);
  const done = [d.text.trim().length > 0, count > 0 && laterValid, false];

  /** Saves the draft (creates it the first time); returns its id. */
  async function save(): Promise<string> {
    const body = { title: d.title, text: d.text, buttons: d.buttons, audience: d.all ? { all: true } : { all: false, users: d.users }, silent: d.silent, sendAt };
    const res = d.id
      ? await api<{ broadcast: Broadcast }>(`/broadcasts/${d.id}`, { method: 'PUT', body })
      : await api<{ broadcast: Broadcast }>('/broadcasts', { method: 'POST', body });
    setD((x) => ({ ...x, id: res.broadcast.id }));
    setSaved(true);
    bump();
    return res.broadcast.id;
  }
  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  const go = (n: number) => run('step', async () => { if (!saved && (d.text.trim() || d.id)) await save(); setStep(n); });
  const test = () => run('test', async () => {
    const id = saved && d.id ? d.id : await save();
    await api(`/broadcasts/${id}/test`, { method: 'POST' });
    setTested(true);
    toast({ tone: 'success', title: 'Sinov xabari yuborildi', description: 'Telegramingizni tekshiring.' });
  });
  const send = () => run('send', async () => {
    const id = saved && d.id ? d.id : await save();
    const res = await api<{ broadcast: Broadcast; people: number }>(`/broadcasts/${id}/send`, { method: 'POST' });
    bump();
    toast({ tone: 'success', title: res.broadcast.status === 'scheduled' ? `Rejalashtirildi: ${when(res.broadcast.send_at)}` : `${res.people} ta xodimga yuborilmoqda` });
    onClose();
  });

  const textLeft = BROADCAST_MAX_TEXT - d.text.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={onClose} aria-label="Ortga" />
        <h2 className="text-lg font-bold tracking-tight text-ink">{d.title.trim() || 'Nomsiz xabar'}</h2>
        <span className="flex items-center gap-1.5 text-xs text-ink-3">
          {saved && d.id ? <><Check className="size-3.5 text-success" />Qoralama saqlandi · faqat siz koʻrasiz</> : 'Saqlanmagan'}
        </span>
      </div>
      <Steps step={step} onStep={go} done={done} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {step === 0 && (
            <>
              <Card>
                <div className="mb-2 text-sm font-semibold text-ink">Nomi <span className="font-normal text-ink-3">(faqat sizga, roʻyxatda koʻrinadi)</span></div>
                <Input value={d.title} maxLength={80} placeholder="Masalan, Shanba kungi ish tartibi" onChange={(e) => set({ title: e.target.value })} />
              </Card>
              <Card>
                <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-ink">Matn</div><span className={cx('text-xs', textLeft < 0 ? 'text-danger' : 'text-ink-3')}>{d.text.length}/{BROADCAST_MAX_TEXT}</span></div>
                <textarea value={d.text} onChange={(e) => set({ text: e.target.value })} rows={7} placeholder="Xodimlarga nima demoqchisiz?"
                  className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none focus:border-[var(--card)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--card)_15%,transparent)]" />
                <p className="mt-1.5 text-xs text-ink-3"><b className="text-ink-2">*yulduzcha orasidagi*</b> soʻz qalin chiqadi.</p>
              </Card>
              <Card>
                <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-ink">Tugmalar</div><span className="text-xs text-ink-3">ixtiyoriy · {d.buttons.length}/{BROADCAST_MAX_BUTTONS}</span></div>
                <div className="space-y-2">
                  {d.buttons.map((b, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                      <Input value={b.text} maxLength={40} placeholder="Tugma nomi" onChange={(e) => set({ buttons: d.buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                      <Input value={b.url} placeholder="https://…" className="col-span-1 row-start-2 sm:row-start-auto" onChange={(e) => set({ buttons: d.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                      <Button variant="ghost" icon={<X className="size-4" />} aria-label="Olib tashlash" className="row-span-2 sm:row-span-1" onClick={() => set({ buttons: d.buttons.filter((_, j) => j !== i) })} />
                    </div>
                  ))}
                  {d.buttons.length < BROADCAST_MAX_BUTTONS && (
                    <Button size="sm" icon={<Plus className="size-4" />} onClick={() => set({ buttons: [...d.buttons, { text: '', url: '' }] })}>Tugma qoʻshish</Button>
                  )}
                </div>
              </Card>
            </>
          )}

          {step === 1 && (
            <>
              <Card>
                <div className="mb-3 text-sm font-semibold text-ink">Kimga</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Choice on={d.all} icon={<Users className="size-4" />} title="Barcha xodimlar" sub={`${active.length} ta xodim Telegramini ulagan`} onClick={() => set({ all: true })} />
                  <Choice on={!d.all} icon={<User className="size-4" />} title="Tanlanganlar" sub={d.all ? 'Kimga borishini oʻzingiz belgilaysiz' : `${count} ta tanlandi`} onClick={() => set({ all: false })} />
                </div>
                {!d.all && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {active.map((p) => {
                      const on = d.users.includes(p.id);
                      return (
                        <button key={p.id} type="button" aria-pressed={on} onClick={() => set({ users: on ? d.users.filter((x) => x !== p.id) : [...d.users, p.id] })}
                          className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors', on ? 'border-[var(--card)] bg-[var(--card)] text-white' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}>
                          {on ? <Check className="size-3.5" /> : <User className="size-3.5" />}{p.full_name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!active.length && <div className="mt-3"><Alert tone="warn">Hali hech bir xodim Telegramini ulamagan. Har kim Sozlamalar → Telegram boʻlimida oʻzi ulaydi.</Alert></div>}
              </Card>
              <Card>
                <div className="mb-3 text-sm font-semibold text-ink">Qachon</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Choice on={!d.later} icon={<Send className="size-4" />} title="Hozir" sub="Yuborish tugmasi bosilganda" onClick={() => set({ later: false })} />
                  <Choice on={d.later} icon={<CalendarClock className="size-4" />} title="Vaqtni belgilash" sub="Toshkent vaqti bilan" onClick={() => set({ later: true })} />
                </div>
                {d.later && (
                  <div className="mt-3">
                    <Input type="datetime-local" value={d.sendAt} onChange={(e) => set({ sendAt: e.target.value })} className="max-w-xs" />
                    {d.sendAt && !laterValid && <p className="mt-1.5 text-xs text-danger">Kelajakdagi vaqtni tanlang.</p>}
                    <p className="mt-1.5 text-xs text-ink-3">Belgilangan vaqtdan keyin saytni kimdir ochganda yoki kechqurun avtomatik ketadi.</p>
                  </div>
                )}
                <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={d.silent} onChange={(e) => set({ silent: e.target.checked })} className="mt-0.5 size-4 accent-[var(--ink)]" />
                  <span><span className="block text-sm text-ink">Ovozsiz yuborish</span><span className="block text-xs text-ink-3">Telefon jiringlamaydi, xabar jim keladi</span></span>
                </label>
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <Card padded={false}>
                <div className="px-4 pt-4 text-sm font-semibold text-ink sm:px-5">Tekshiring</div>
                <div className="mt-2 divide-y divide-line">
                  {([
                    ['Xabar', `${d.text.trim() ? 'Matn' : 'Matn yoʻq'}${d.buttons.length ? ` · ${d.buttons.length} ta tugma` : ''}`, 0],
                    ['Kimga', d.all ? `Barcha xodimlar · ${active.length} ta` : `${count} ta tanlangan xodim`, 1],
                    ['Qachon', d.later ? `${when(sendAt)} (Toshkent)` : 'Hozir', 1],
                  ] as const).map(([k, v, s]) => (
                    <div key={k} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                      <span className="w-16 shrink-0 text-ink-3">{k}</span>
                      <span className="min-w-0 flex-1 text-ink">{v}</span>
                      <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => go(s)}>Oʻzgartirish</button>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <div className="text-sm font-semibold text-ink">Oʻzingizga sinab koʻring</div>
                <p className="mt-1 text-xs text-ink-3">Xabar sizning Telegramingizga “Sinov” belgisi bilan keladi. Xodimlarga hali bormaydi.</p>
                <Button className="mt-3" icon={<Send className="size-4" />} loading={busy === 'test'} disabled={!d.text.trim()} onClick={test}>{tested ? 'Yana sinab koʻrish' : 'Sinov yuborish'}</Button>
              </Card>
            </>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            {step > 0 ? <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => go(step - 1)}>Orqaga</Button> : <span />}
            {step < 2 ? (
              <Button variant="primary" loading={busy === 'step'} disabled={!done[step]} onClick={() => go(step + 1)}>Davom etish <ArrowRight className="size-4" /></Button>
            ) : (
              <Button variant="primary" icon={d.later ? <CalendarClock className="size-4" /> : <Send className="size-4" />} loading={busy === 'send'}
                disabled={!done[0] || !done[1] || textLeft < 0} onClick={send}>{d.later ? 'Rejalashtirish' : `${count} ta xodimga yuborish`}</Button>
            )}
          </div>
        </div>
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start"><Preview draft={d} /></div>
      </div>
    </div>
  );
}

/** Ommaviy xabarlar: the list, and the three-step editor for a new or unsent one. */
export default function Broadcasts({ people }: { people: LinkedPerson[] }) {
  const { data, error, reload } = useApi<{ items: Broadcast[]; linked: number }>('/broadcasts');
  const { bump } = useLive();
  const toast = useToast();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (editing) return <Editor start={editing} people={people} onClose={() => setEditing(null)} />;

  const remove = async (b: Broadcast) => {
    setBusy(b.id);
    try { await api(`/broadcasts/${b.id}`, { method: 'DELETE' }); bump(); toast({ tone: 'success', title: 'Xabar oʻchirildi' }); }
    catch (e) { toast({ tone: 'error', title: (e as Error).message }); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink">Ommaviy xabarlar</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">Telegramini ulagan xodimlarga matn va tugma yuborish.</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3"><Lock className="size-3.5" />{data ? `${data.linked} ta xodim ulangan` : '…'} · ulamaganlarga bormaydi</p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank())}>Yangi xabar</Button>
      </div>
      <Card padded={false}>
        {error && !data ? <ErrorState message={error} onRetry={reload} /> : !data ? <div className="skeleton m-4 h-24" /> : !data.items.length ? (
          <EmptyState icon={<Megaphone className="size-5" />} title="Hali xabar yoʻq" description="Birinchi xabarni yozing: hamma xodimlarga yoki tanlanganlarga boradi."
            action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank())}>Yangi xabar</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((b) => {
              const st = STATUS[b.status];
              const open = b.status === 'draft' || b.status === 'scheduled';
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--card)_10%,transparent)] text-[var(--card)]"><MessageSquare className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{b.title || 'Nomsiz xabar'}</div>
                    <div className="truncate text-xs text-ink-3">{b.text.replace(/\s+/g, ' ') || 'Matn yoʻq'}</div>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <div className="w-36 text-xs text-ink-2 num">{when(b.sent_at || b.send_at || b.created_at)}</div>
                  <div className="w-20 text-xs text-ink-2 num" title="Yetkazildi">{b.status === 'sent' || b.status === 'failed' ? `${b.delivered}/${b.delivered + b.failed}` : '—'}</div>
                  <div className="flex items-center gap-1">
                    {open && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(fromBroadcast(b))}>Davom ettirish</Button>}
                    {!open && <Button size="sm" variant="ghost" onClick={() => setEditing({ ...fromBroadcast(b), id: null, later: false, sendAt: '' })}>Nusxa</Button>}
                    {b.status !== 'sending' && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} loading={busy === b.id} onClick={() => remove(b)} aria-label="Oʻchirish" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
