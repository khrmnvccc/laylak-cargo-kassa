import { useMemo, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Check, FileSpreadsheet, Image as ImageIcon, Receipt, RotateCcw, Save, Send, Trash2, Undo2, User, Users, Wallet, X, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/live';
import {
  MAX_TEMPLATE_LENGTH, STAFF_TEMPLATES, TEMPLATES, TEMPLATE_BY_KEY, TEMPLATE_GROUPS, renderTemplate, sampleValues,
  type TemplateKey, type TemplateSettings,
} from '../lib/tgTemplates';
import { Alert, Button, Card, ErrorState, useToast } from './ui';

const ICONS: Record<TemplateKey, typeof Wallet> = {
  payment: Wallet, paymentVoid: Undo2, expenseVoid: Receipt, orderDelete: Trash2, dailyReport: BarChart3,
};
const LOG_TITLES: Record<string, string> = { ...Object.fromEntries(TEMPLATES.map((t) => [t.key, t.title])), test: 'Sinov xabari', other: 'Xabar' };

interface LogItem { id: number; at: string; template: string; chat: string; ok: boolean; text: string; error: string | null }

const time = (iso: string) => new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** A small on/off switch. */
export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-success' : 'bg-[color-mix(in_srgb,var(--ink-3)_35%,transparent)]'}`}>
      <span className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

/** One message as Telegram shows it: bot avatar, white bubble, time. */
function Bubble({ html, photo, files, at }: { html: string; photo?: boolean; files?: boolean; at?: string }) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2aabee] text-white shadow-sm"><Send className="size-4 -translate-x-px" /></div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="max-w-[300px] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[14px] leading-snug text-[#111] shadow-sm">
          {photo && <div className="mb-2 flex h-24 items-center justify-center gap-1.5 rounded-lg bg-[#e6edf2] text-xs text-[#7a8794]"><ImageIcon className="size-4" />toʻlov rasmi</div>}
          {html
            ? <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: html }} />
            : <div className="text-[13px] italic text-[#8a9aa9]">Matn boʻsh</div>}
          <div className="mt-1 text-right text-[11px] text-[#8a9aa9]">{at ?? '19:05'}</div>
        </div>
        {files && ['kassa_naxt.xlsx', 'kassa_karta.xlsx', 'otchyot.xlsx', 'laylak-zaxira.json.gz'].map((f) => (
          <div key={f} className="flex max-w-[300px] items-center gap-2.5 rounded-xl bg-white px-3 py-1.5 text-[13px] text-[#2a7ab8] shadow-sm">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#2aabee] text-white"><FileSpreadsheet className="size-3.5" /></span>{f}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="text-[12px] font-semibold tracking-wider text-ink-2">{children}</div>
      {right}
    </div>
  );
}

/** The group as the connection card knows it: linked or not, and what it got before messages had their own say. */
export interface GroupInfo { linked: boolean; name: string | null; payments: boolean; cancels: boolean }

/** A staff member who linked their own Telegram. */
export interface LinkedPerson { id: string; full_name: string; username: string; role: string; is_active: boolean; chat_name: string | null }

/** A pill that says whether one message goes to one chat; pressing it flips that. */
function ChatPill({ on, icon, label, sub, disabled, onClick }: { on: boolean; icon: ReactNode; label: string; sub: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled || !onClick} onClick={onClick}
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-default ${on ? 'border-[var(--card)] bg-[color-mix(in_srgb,var(--card)_10%,transparent)]' : 'border-line bg-surface hover:bg-surface-2'} ${disabled ? 'opacity-60' : ''}`}>
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${on ? 'bg-[var(--card)] text-white' : 'bg-surface-3 text-ink-3'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold ${on ? 'text-ink' : 'text-ink-3'}`}>{label}</span>
        <span className="block truncate text-[11.5px] text-ink-3">{sub}</span>
      </span>
      {onClick && <span className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-[var(--card)] bg-[var(--card)] text-white' : 'border-line'}`}>{on && <Check className="size-3.5" />}</span>}
    </button>
  );
}

/** Every Telegram message the kassa sends, each with its own words, its own switch and its own chats, plus what was sent lately. */
export default function TelegramTemplates({ group, personalName, people }: { group: GroupInfo; personalName: string | null; people: LinkedPerson[] }) {
  const toast = useToast();
  const { data, error: loadError, loading } = useApi<TemplateSettings>('/telegram/templates');
  const log = useApi<{ items: LogItem[]; total: number }>('/telegram/log', { limit: 40 });
  const [saved, setSaved] = useState<TemplateSettings | null>(null);
  const settings: TemplateSettings = saved ?? data ?? { texts: {}, off: [] };
  const [tab, setTab] = useState<'templates' | 'sent'>('templates');
  const [key, setKey] = useState<TemplateKey>('payment');
  const [drafts, setDrafts] = useState<Partial<Record<TemplateKey, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const def = TEMPLATE_BY_KEY[key];
  const Icon = ICONS[key];
  const current = settings.texts[key] || def.text;
  const text = drafts[key] ?? current;
  const changed = text !== current;
  const custom = Boolean(settings.texts[key]);
  const isOn = (k: TemplateKey) => !settings.off.includes(k);
  // Where each message goes. The evening report (with the files and the backup) only ever goes to the owner.
  const toMe = (k: TemplateKey) => k === 'dailyReport' || settings.chats?.[k]?.personal !== false;
  const toGroup = (k: TemplateKey) => k !== 'dailyReport' && (settings.chats?.[k]?.group ?? (k === 'payment' ? group.payments : group.cancels));
  const onCount = TEMPLATES.filter((t) => isOn(t.key)).length;
  const preview = useMemo(() => renderTemplate(text, sampleValues(key)), [text, key]);

  const setText = (value: string) => setDrafts((d) => ({ ...d, [key]: value }));
  const dropDraft = (k: TemplateKey) => setDrafts(({ [k]: _gone, ...rest }) => rest);

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
  const staffOf = (k: TemplateKey) => settings.chats?.[k]?.staff ?? [];
  const activePeople = people.filter((p) => p.is_active);
  const staffCount = (k: TemplateKey) => staffOf(k).filter((id) => activePeople.some((p) => p.id === id)).length;
  const put = (k: TemplateKey, body: { text?: string | null; on?: boolean; chats?: { personal?: boolean; group?: boolean; staff?: string[] } }) =>
    api<TemplateSettings>('/telegram/templates', { method: 'PUT', body: { key: k, ...body } }).then(setSaved);
  const save = () => run('save', async () => {
    await put(key, { text });
    dropDraft(key);
    toast({ tone: 'success', title: 'Matn saqlandi', description: 'Keyingi xabarlar shu matn bilan keladi.' });
  });
  const reset = () => run('reset', async () => {
    if (custom) await put(key, { text: null });
    dropDraft(key);
    toast({ tone: 'success', title: 'Asl matn qaytarildi' });
  });
  const toggle = (k: TemplateKey, on: boolean) => run(`toggle-${k}`, async () => {
    await put(k, { on });
    toast({ tone: 'success', title: `${TEMPLATE_BY_KEY[k].title}: ${on ? 'yoqildi' : 'oʻchirildi'}` });
  });
  const route = (k: TemplateKey, chat: 'personal' | 'group', on: boolean) => run(`chat-${chat}`, async () => {
    await put(k, { chats: { [chat]: on } });
    toast({ tone: 'success', title: `${TEMPLATE_BY_KEY[k].title}: ${chat === 'group' ? 'guruhga' : 'sizga'} ${on ? 'boradi' : 'bormaydi'}` });
  });
  const toggleStaff = (k: TemplateKey, person: LinkedPerson) => run(`staff-${person.id}`, async () => {
    const list = staffOf(k);
    const on = !list.includes(person.id);
    await put(k, { chats: { staff: on ? [...list, person.id] : list.filter((id) => id !== person.id) } });
    toast({ tone: 'success', title: `${person.full_name}: “${TEMPLATE_BY_KEY[k].title}” ${on ? 'keladi' : 'kelmaydi'}` });
  });
  const test = () => run('test', async () => {
    await api('/telegram/templates/test', { method: 'POST', body: { key, text } });
    toast({ tone: 'success', title: 'Namuna Telegramga yuborildi' });
  });

  const sentCount = log.data?.total ?? 0;

  return (
    <Card className="xl:col-span-2" padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">Xabarlar</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">Har bir xabarni yoqing yoki oʻchiring, kimga borishini tanlang, matnini oʻzingiz yozing.</p>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">{onCount}/{TEMPLATES.length} yoqilgan</span>
      </div>

      {loadError && !data ? <div className="p-5"><ErrorState message={loadError} /></div> : loading && !saved ? <div className="skeleton m-5 h-72" /> : (
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* ----- left: tabs + list ----- */}
          <div className="border-line p-3 sm:p-4 lg:border-r">
            <div className="mb-4 grid grid-cols-2 rounded-xl bg-surface-2 p-1">
              {([['templates', 'Shablonlar'], ['sent', `Yuborilgan · ${sentCount}`]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTab(k)}
                  className={`h-9 rounded-lg text-[13px] font-semibold transition-colors ${tab === k ? 'bg-[var(--card)] text-white shadow-sm' : 'text-ink-2 hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'templates' ? (
              <div className="space-y-4">
                {TEMPLATE_GROUPS.map((g) => (
                  <div key={g.key}>
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wider text-ink-2">
                      <span className="flex size-5 items-center justify-center rounded-md bg-[var(--card)] text-[11px] text-white">{g.letter}</span>{g.title}
                    </div>
                    <div className="space-y-2">
                      {TEMPLATES.filter((t) => t.group === g.key).map((t) => {
                        const TIcon = ICONS[t.key];
                        const active = t.key === key;
                        const unsaved = drafts[t.key] !== undefined && drafts[t.key] !== (settings.texts[t.key] || t.text);
                        return (
                          <div key={t.key} role="button" tabIndex={0} onClick={() => setKey(t.key)} onKeyDown={(e) => e.key === 'Enter' && setKey(t.key)}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${active ? 'border-[var(--card)] bg-[color-mix(in_srgb,var(--card)_8%,transparent)]' : 'border-line bg-surface hover:bg-surface-2'}`}>
                            <TIcon className={`size-5 shrink-0 ${isOn(t.key) ? 'text-ink-2' : 'text-ink-3'}`} />
                            <div className="min-w-0 flex-1">
                              <div className={`flex items-center gap-1.5 text-[13.5px] font-semibold ${isOn(t.key) ? 'text-ink' : 'text-ink-3 line-through'}`}>
                                <span className="truncate">{t.title}</span>
                                {unsaved && <span className="size-1.5 shrink-0 rounded-full bg-warn" title="Saqlanmagan" />}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-ink-3">
                                {t.photo && <span title="Rasm bilan"><ImageIcon className="size-3.5" /></span>}
                                {isOn(t.key) && toMe(t.key) && <span title="Sizga boradi"><User className="size-3.5" /></span>}
                                {isOn(t.key) && toGroup(t.key) && group.linked && <span title="Guruhga boradi"><Users className="size-3.5" /></span>}
                                {isOn(t.key) && staffCount(t.key) > 0 && <span className="text-[11px] font-medium text-ink-2" title="Xodimlarga boradi">+{staffCount(t.key)} xodim</span>}
                                {t.files && <span title="Excel va zaxira fayllari bilan"><FileSpreadsheet className="size-3.5" /></span>}
                                {settings.texts[t.key] && <span className="text-[11px] font-medium text-success">oʻzgartirilgan</span>}
                              </div>
                            </div>
                            <Toggle on={isOn(t.key)} label={t.title} disabled={busy === `toggle-${t.key}`} onChange={(on) => toggle(t.key, on)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-1 text-[13px] text-ink-3">Oxirgi yuborilgan xabarlar: qaysi chatga ketgani va yetib borgani. Eng yangisi tepada.</p>
            )}
          </div>

          {/* ----- right: editor or sent list ----- */}
          <div className="min-w-0 p-4 sm:p-5">
            {tab === 'sent' ? (
              log.error && !log.data ? <ErrorState message={log.error} /> : !log.data ? <div className="skeleton h-64" /> : !log.data.items.length ? (
                <div className="py-16 text-center text-sm text-ink-3">Hali hech qanday xabar yuborilmagan.</div>
              ) : (
                <div className="grid max-h-[680px] gap-3 overflow-y-auto pr-1 xl:grid-cols-2">
                  {log.data.items.map((m) => (
                    <div key={m.id} className="rounded-xl border border-line p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-ink">{LOG_TITLES[m.template] ?? m.template}</span>
                        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-ink-2">{m.chat === 'group' ? 'Guruh' : m.chat.startsWith('staff:') ? m.chat.slice(6) || 'Xodim' : 'Siz'}</span>
                        {m.ok
                          ? <span className="inline-flex items-center gap-1 text-success"><Check className="size-3.5" />yetib bordi</span>
                          : <span className="inline-flex items-center gap-1 text-danger"><X className="size-3.5" />yetib bormadi</span>}
                        <span className="ml-auto text-ink-3">{time(m.at)}</span>
                      </div>
                      {m.error && <p className="mb-2 text-xs text-danger">{m.error}</p>}
                      <div className="rounded-xl p-3" style={{ background: 'linear-gradient(160deg, #dfe9f0, #cddce7)' }}>
                        <Bubble html={m.text} at={time(m.at).slice(-5)} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-ink"><Icon className="size-5 text-ink-2" />{def.title}</h2>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2">
                      <Zap className="size-3.5" />{def.hint}
                    </span>
                  </div>
                  <label className="flex items-center gap-2.5 text-[13px] font-medium text-ink-2">
                    {isOn(key) ? 'Yoqilgan' : 'Oʻchirilgan'}
                    <Toggle on={isOn(key)} label={def.title} disabled={busy === `toggle-${key}`} onChange={(on) => toggle(key, on)} />
                  </label>
                </div>
                {!isOn(key) && <div className="mb-4"><Alert tone="warn">Bu xabar hozir yuborilmaydi.{def.files ? ' Excel fayllari va zaxira baribir keladi.' : ''}</Alert></div>}

                <div className="mb-5">
                  <SectionLabel>QAYERGA BORADI</SectionLabel>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <ChatPill on={toMe(key)} icon={<User className="size-4" />} label="Sizning akkauntingiz" sub={personalName ?? 'Shaxsiy chat ulanmagan'}
                      disabled={busy === 'chat-personal'} onClick={key === 'dailyReport' ? undefined : () => route(key, 'personal', !toMe(key))} />
                    <ChatPill on={toGroup(key) && group.linked} icon={<Users className="size-4" />} label="Guruh"
                      sub={key === 'dailyReport' ? 'Hisobot va fayllar guruhga bormaydi' : group.linked ? group.name ?? 'Guruh' : 'Guruh ulanmagan'}
                      disabled={busy === 'chat-group' || !group.linked} onClick={key === 'dailyReport' || !group.linked ? undefined : () => route(key, 'group', !toGroup(key))} />
                  </div>
                  {STAFF_TEMPLATES.includes(key) && (
                    <div className="mt-3">
                      <div className="mb-1.5 text-xs font-medium text-ink-2">Xodimlar</div>
                      {activePeople.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activePeople.map((p) => {
                            const on = staffOf(key).includes(p.id);
                            return (
                              <button key={p.id} type="button" aria-pressed={on} disabled={busy === `staff-${p.id}`} onClick={() => toggleStaff(key, p)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-60 ${on ? 'border-[var(--card)] bg-[var(--card)] text-white' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}>
                                {on ? <Check className="size-3.5" /> : <User className="size-3.5" />}{p.full_name}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-3">Hali hech bir xodim Telegramini ulamagan. Har kim Sozlamalar → Telegram boʻlimida oʻzi ulaydi.</p>
                      )}
                    </div>
                  )}
                  {isOn(key) && !toMe(key) && !(toGroup(key) && group.linked) && staffCount(key) === 0 && <p className="mt-2 text-xs text-warn">Hech qaysi chat tanlanmagan: bu xabar hech kimga bormaydi.</p>}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
                  <div className="min-w-0">
                    <SectionLabel right={custom ? <span className="text-xs font-medium text-success">Oʻzgartirilgan</span> : <span className="text-xs text-ink-3">Asl matn</span>}>MATN</SectionLabel>
                    <textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} rows={9} maxLength={MAX_TEMPLATE_LENGTH} spellCheck={false}
                      className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none transition-colors focus:border-[var(--card)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--card)_15%,transparent)]" />
                    <div className="mt-1 flex justify-end text-[11px] text-ink-3">{text.length}/{MAX_TEMPLATE_LENGTH}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-ink-3">Oʻzgaruvchi qoʻshish:</span>
                      {def.vars.map((v) => (
                        <button key={v.name} type="button" onClick={() => insert(v.name)} title={v.label}
                          className="rounded-md border border-[color-mix(in_srgb,var(--card)_30%,transparent)] bg-[color-mix(in_srgb,var(--card)_8%,transparent)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--card)] transition-colors hover:bg-[color-mix(in_srgb,var(--card)_16%,transparent)]">
                          {`{{${v.name}}}`}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-ink-2">
                      <div><b className="text-ink">*yulduzcha orasidagi*</b> soʻz qalin chiqadi.</div>
                      <div>Oʻzgaruvchi boʻsh boʻlsa (masalan, izoh yozilmagan), oʻsha qator xabarga kirmaydi.</div>
                      <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                        {def.vars.map((v) => <div key={v.name}><code className="font-mono text-[var(--card)]">{`{{${v.name}}}`}</code> — {v.label}</div>)}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <SectionLabel>TELEGRAMDA KOʻRINISHI</SectionLabel>
                    <div className="rounded-2xl p-3.5" style={{ background: 'linear-gradient(160deg, #dfe9f0, #cddce7)' }}>
                      <Bubble html={preview} photo={def.photo} files={def.files} />
                    </div>
                    <Button variant="primary" size="lg" className="mt-3 w-full" icon={<Save className="size-4" />} loading={busy === 'save'}
                      disabled={!changed || !text.trim()} onClick={save}>Saqlash</Button>
                    <p className="mt-1.5 text-center text-xs text-ink-3">Saqlaganda xabar yuborilmaydi.</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button size="sm" icon={<Send className="size-3.5" />} loading={busy === 'test'} onClick={test}>Namuna yuborish</Button>
                      <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} loading={busy === 'reset'} disabled={!custom && !changed} onClick={reset}>Asl matn</Button>
                    </div>
                    {error && <div className="mt-3"><Alert>{error}</Alert></div>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
