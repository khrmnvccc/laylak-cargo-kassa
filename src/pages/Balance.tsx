import { Fragment, useState } from 'react';
import { Ban, ChevronLeft, ChevronRight, Minus, Plus, Scale, Upload, Wallet } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { printBalance } from '../lib/reports';
import { PrintButton } from '../components/PrintButton';
import { ImportKassa } from '../components/ImportKassa';
import { useApi, useLive } from '../lib/live';
import { addDays, dateTime, formatDate, groupDigits, methodColor, methodLabel, money, nowMs, timeOf, todayTashkent, weekday } from '../lib/format';
import type { BalanceReport, Expense, ExpenseCategory, SourceBalance } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, IconButton, Input, MethodBadge, Modal, PageHeader, Segmented, Select,
  SkeletonRows, Textarea, cx, td, th, useToast,
} from '../components/ui';

export const EXPENSE_CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'tovar', label: 'Tovar xaridi' },
  { value: 'paket', label: 'Paket va qadoq' },
  { value: 'yetkazish', label: 'Yetkazib berish' },
  { value: 'yoqilgi', label: 'Yoqilgʻi va transport' },
  { value: 'ijara', label: 'Ijara' },
  { value: 'oylik', label: 'Oylik va avans' },
  { value: 'kommunal', label: 'Kommunal va aloqa' },
  { value: 'inkassa', label: 'Inkassa (pul topshirildi)' },
  { value: 'boshqa', label: 'Boshqa' },
];
const ACCOUNTS = [
  { value: 'cash', label: 'Naqd (kassada)', color: 'var(--cash)', hint: 'Hozirgi qoldiq' },
  { value: 'card', label: 'Kartada', color: 'var(--card)', hint: 'Karta + Yandex + Pochta' },
] as const;
const accountLabel = (s: string) => (s === 'cash' ? 'Naqd' : 'Karta');

const categoryLabel = (c: string) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

const signed = (n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : money(0));
const parseDigits = (text: string) => Number(text.replace(/\D/g, '') || 0);
const digitsInput = (value: string) => { const d = value.replace(/\D/g, '').slice(0, 11); return d ? groupDigits(Number(d)) : ''; };

export default function Balance() {
  const { user } = useAuth();
  const today = todayTashkent();
  const [date, setDate] = useState(today);
  const { data, error, loading, reload } = useApi<BalanceReport>('/balance', { date }, { keep: true });
  // The 14-day table always ends today, so picking one of its days does not shift the list.
  const todays = useApi<BalanceReport>(date === today ? null : '/balance', { date: today }, { keep: true });
  const recent = (date === today ? data : todays.data || data)?.recent;
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [modal, setModal] = useState<'expense' | 'adjust' | 'import' | Expense | null>(null);

  const sources = data?.sources || [];
  const sum = (k: keyof Omit<SourceBalance, 'source'>) => sources.reduce((s, r) => s + Number(r[k]), 0);
  const isToday = date === today;
  const activeExpenses = data?.expenses.filter((e) => !e.voided_at) || [];
  const expenseTotal = activeExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader
        title="Kassa balansi"
        subtitle="Naqd va kartada qancha pul borligi, kunlik rasxodlar · faqat admin koʻradi"
        actions={<>
          <Button icon={<Upload className="size-4" />} onClick={() => setModal('import')}>Daftarni yuklash</Button>
          <PrintButton disabled={!data} run={() => data && printBalance(data, user.full_name)} />
          <Button icon={<Scale className="size-4" />} onClick={() => setModal('adjust')}>Qoldiqni tuzatish</Button>
          <Button variant="primary" icon={<Minus className="size-4" />} onClick={() => setModal('expense')}>Rasxod qoʻshish</Button>
        </>}
      />

      {error && !data ? <Card><ErrorState message={error} onRetry={reload} /></Card> : (
        <>
          <section aria-label="Hozirgi qoldiq">
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1.2fr_2fr]">
              <Card className="anim-rise flex flex-col justify-between">
                <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><Wallet className="size-4" />Hozir jami pul</div>
                {loading && !data ? <div className="skeleton mt-3 h-9 w-2/3" /> : (
                  <div className={cx('mt-2 text-[32px] font-semibold leading-tight tracking-tight num', sum('current') < 0 ? 'text-danger' : 'text-ink')}>{money(sum('current'))}</div>
                )}
                <p className="mt-2 text-xs leading-relaxed text-ink-3">Barcha tushumlar − rasxodlar ± tuzatishlar. Bekor qilingan yozuvlar hisobga olinmaydi.</p>
              </Card>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {ACCOUNTS.map((m) => {
                  const row = sources.find((s) => s.source === m.value);
                  return (
                    <Card key={m.value} className="anim-rise">
                      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                        <span className="size-2 rounded-full" style={{ background: m.color }} />{m.label}
                      </div>
                      {loading && !data ? <div className="skeleton mt-3 h-7 w-3/4" /> : (
                        <div className={cx('mt-1.5 text-base font-semibold tracking-tight num min-[400px]:text-lg sm:text-2xl', (row?.current || 0) < 0 ? 'text-danger' : 'text-ink')}>{money(row?.current || 0)}</div>
                      )}
                      <div className="mt-1 text-xs text-ink-3">{m.hint}</div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>

          <Card className={cx('mt-4 transition-opacity', loading && data && 'opacity-60')} padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">Kunlik harakat</h3>
                <p className="mt-0.5 text-[13px] text-ink-3">{weekday(date)}, {formatDate(date)}{isToday ? ' · bugun' : ''}</p>
              </div>
              <div className="flex items-center gap-1">
                <IconButton label="Oldingi kun" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="size-4" /></IconButton>
                <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} className="h-9 w-auto" aria-label="Sana" />
                <IconButton label="Keyingi kun" disabled={isToday} onClick={() => setDate(addDays(date, 1))} className="disabled:opacity-40"><ChevronRight className="size-4" /></IconButton>
                {!isToday && <Button size="sm" variant="ghost" onClick={() => setDate(today)}>Bugun</Button>}
              </div>
            </div>
            {data && (
              <ul className="mt-3 divide-y divide-line border-t border-line sm:hidden">
                {sources.map((r) => (
                  <li key={r.source} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-medium"><span className="size-2 rounded-full" style={{ background: methodColor(r.source) }} />{accountLabel(r.source)}</span>
                      <span className={cx('text-sm font-semibold num', r.closing < 0 && 'text-danger')}>{money(r.closing)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-3 num">
                      <span>Boshida {money(r.opening)}</span>
                      {r.income > 0 && <span className="text-up">+{money(r.income)}</span>}
                      {r.expense > 0 && <span className="text-down">−{money(r.expense)}</span>}
                      {r.adjustment !== 0 && <span>tuzatish {signed(r.adjustment)}</span>}
                    </div>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 bg-surface-2/60 px-4 py-3 text-sm font-semibold">
                  <span>Jami</span><span className="num">{money(sum('closing'))}</span>
                </li>
              </ul>
            )}
            <div className={cx('mt-3 overflow-x-auto scrollbar-thin border-t border-line', data && 'hidden sm:block')}>
              {loading && !data ? <SkeletonRows rows={4} cols={6} /> : (
                <table className="w-full">
                  <thead className="border-b border-line bg-surface-2/60">
                    <tr>
                      <th className={th}>Hisob</th>
                      <th className={cx(th, 'text-right')}>Kun boshida</th>
                      <th className={cx(th, 'text-right')}>Tushum (+)</th>
                      <th className={cx(th, 'text-right')}>Rasxod (−)</th>
                      <th className={cx(th, 'text-right')}>Tuzatish</th>
                      <th className={cx(th, 'text-right')}>Kun oxirida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sources.map((r) => (
                      <tr key={r.source}>
                        <td className={td}>
                          <span className="flex items-center gap-2 font-medium"><span className="size-2 rounded-full" style={{ background: methodColor(r.source) }} />{accountLabel(r.source)}</span>
                          {r.source === 'card' && <span className="ml-4 block text-xs text-ink-3">Yandex va Pochta ham shu yerga</span>}
                        </td>
                        <td className={cx(td, 'text-right text-ink-2 num')}>{money(r.opening)}</td>
                        <td className={cx(td, 'text-right num', r.income ? 'text-up' : 'text-ink-3')}>
                          {r.income ? `+${money(r.income)}` : '—'}
                          {r.source === 'card' && (r.income_yandex > 0 || r.income_pochta > 0) && (
                            <span className="block text-xs text-ink-3">
                              {[['Karta', r.income - r.income_yandex - r.income_pochta], ['Yandex', r.income_yandex], ['Pochta', r.income_pochta]].filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${money(Number(v))}`).join(' · ')}
                            </span>
                          )}
                        </td>
                        <td className={cx(td, 'text-right num', r.expense ? 'text-down' : 'text-ink-3')}>{r.expense ? `−${money(r.expense)}` : '—'}</td>
                        <td className={cx(td, 'text-right num', r.adjustment ? 'text-ink' : 'text-ink-3')}>{r.adjustment ? signed(r.adjustment) : '—'}</td>
                        <td className={cx(td, 'text-right font-semibold num', r.closing < 0 && 'text-danger')}>{money(r.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-line-strong bg-surface-2/60">
                    <tr>
                      <td className={cx(td, 'font-semibold')}>Jami</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{money(sum('opening'))}</td>
                      <td className={cx(td, 'text-right font-semibold text-up num')}>+{money(sum('income'))}</td>
                      <td className={cx(td, 'text-right font-semibold num', sum('expense') ? 'text-down' : 'text-ink-3')}>{sum('expense') ? `−${money(sum('expense'))}` : money(0)}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{signed(sum('adjustment'))}</td>
                      <td className={cx(td, 'text-right font-semibold num')}>{money(sum('closing'))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </Card>

          <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
            <Card padded={false}>
              <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight text-ink">Kunlik rasxod</h3>
                  <p className="mt-0.5 text-[13px] text-ink-3 num">{data ? `${activeExpenses.length} ta · jami ${money(expenseTotal)}` : ' '}</p>
                </div>
                <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setModal('expense')}>Qoʻshish</Button>
              </div>
              <div className="mt-3 border-t border-line">
                {loading && !data ? <SkeletonRows rows={3} cols={3} /> : !data?.expenses.length ? (
                  <EmptyState title="Bu kunda rasxod yoʻq" description="Kassadan yoki kartadan pul chiqsa, shu yerga yozing." />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.expenses.map((e) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => setModal(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-ink">{categoryLabel(e.category)}</span>
                              <MethodBadge method={e.source} />
                              {e.voided_at && <Badge tone="danger"><Ban className="size-3" />Bekor qilingan</Badge>}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-ink-3">{timeOf(e.spent_at)} · {e.created_by_name}{e.note ? ` · ${e.note}` : ''}</div>
                          </div>
                          <span className={cx('text-sm font-semibold num', e.voided_at ? 'text-ink-3 line-through' : 'text-down')}>−{money(e.amount)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!!data?.adjustments.length && (
                  <div className="border-t border-line px-4 py-3 sm:px-5">
                    <div className="mb-2 text-xs font-medium text-ink-3">Qoldiq tuzatishlari</div>
                    <ul className="space-y-1.5">
                      {data.adjustments.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-ink-2">{timeOf(a.at)} · {accountLabel(a.source)} · {a.note} · {a.created_by_name}</span>
                          <span className="font-medium text-ink num">{signed(a.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>

            <Card padded={false}>
              <div className="px-4 pt-4 sm:px-5"><CardHeader title="Oxirgi 14 kun" subtitle="Barcha hisoblar boʻyicha tushum va rasxod" /></div>
              <div className="overflow-x-auto scrollbar-thin border-t border-line">
                {loading && !data ? <SkeletonRows rows={6} cols={4} /> : (
                  <table className="w-full">
                    <thead className="border-b border-line bg-surface-2/60">
                      <tr>
                        <th className={th}>Kun</th>
                        <th className={cx(th, 'text-right')}>Tushum</th>
                        <th className={cx(th, 'hidden text-right sm:table-cell')}>Rasxod</th>
                        <th className={cx(th, 'hidden text-right sm:table-cell')}>Sof</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {recent?.map((d) => (
                        <Fragment key={d.day}>
                        <tr onClick={() => { setDate(d.day); setOpenDay((o) => (o === d.day ? null : d.day)); }} aria-expanded={openDay === d.day}
                          className={cx('cursor-pointer transition-colors hover:bg-surface-2', d.day === date && 'bg-surface-2')}>
                          <td className={td}>
                            <ChevronRight className={cx('mr-1 inline size-3.5 text-ink-3 transition-transform', openDay === d.day && 'rotate-90')} />
                            {formatDate(d.day, false)} <span className="text-ink-3">{weekday(d.day, true)}</span>
                          </td>
                          <td className={cx(td, 'text-right num', !d.income && 'text-ink-3')}>
                            {money(d.income)}
                            {d.expense > 0 && <span className="block text-xs text-down sm:hidden">−{money(d.expense)}</span>}
                          </td>
                          <td className={cx(td, 'hidden text-right num sm:table-cell', d.expense ? 'text-down' : 'text-ink-3')}>{d.expense ? `−${money(d.expense)}` : money(0)}</td>
                          <td className={cx(td, 'hidden text-right font-medium num sm:table-cell', d.income - d.expense < 0 && 'text-danger')}>{signed(d.income - d.expense)}</td>
                        </tr>
                        {openDay === d.day && (
                          <tr className="bg-surface-2/60">
                            <td colSpan={4} className="px-4 pb-3 pt-1 sm:px-5">
                              <DaySplit day={d} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {modal === 'expense' && <ExpenseForm date={date} onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportKassa categoryLabel={categoryLabel} onClose={() => setModal(null)} />}
      {modal === 'adjust' && <AdjustForm sources={sources} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <ExpenseDetail expense={modal} onClose={() => setModal(null)} />}
    </>
  );
}

/** One day of the 14-day table opened up: how the takings split between cash and card. */
function DaySplit({ day }: { day: BalanceReport['recent'][number] }) {
  const parts = [
    { label: 'Naqd', amount: day.cash_income, color: 'var(--cash)' },
    { label: 'Karta', amount: day.card_income, color: methodColor('card') },
    { label: 'Yandex', amount: day.yandex_income, color: methodColor('yandex') },
    { label: 'Pochta', amount: day.pochta_income, color: methodColor('pochta') },
  ];
  const card = day.card_income + day.yandex_income + day.pochta_income;
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label} className="rounded-lg border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-ink-3"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.label}</div>
            <div className={cx('font-semibold num', !p.amount && 'text-ink-3')}>{money(p.amount)}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ink-2">
        <span>Jami tushum: <b className="text-ink num">{money(day.income)}</b> · naqd <b className="text-ink num">{money(day.cash_income)}</b> · kartaga <b className="text-ink num">{money(card)}</b></span>
        {day.expense > 0 && <span>Rasxod: <b className="text-down num">−{money(day.expense)}</b> · naqd <b className="text-ink num">{money(day.cash_expense)}</b> · karta <b className="text-ink num">{money(day.card_expense)}</b> · sof <b className="text-ink num">{signed(day.income - day.expense)}</b></span>}
      </div>
    </div>
  );
}

function nowLocal(): string {
  return new Date(nowMs() + 5 * 3600_000).toISOString().slice(0, 16);
}

function ExpenseForm({ date, onClose }: { date: string; onClose: () => void }) {
  const { bump } = useLive();
  const toast = useToast();
  const [amountText, setAmountText] = useState('');
  const [source, setSource] = useState<'cash' | 'card'>('cash');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState(() => (date === todayTashkent() ? nowLocal() : `${date}T18:00`));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const amount = parseDigits(amountText);
    const local: Record<string, string> = {};
    if (!amount) local.amount = 'Summani kiriting';
    if (!category) local.category = 'Toifani tanlang';
    if (category === 'boshqa' && note.trim().length < 3) local.note = '“Boshqa” uchun izoh yozing';
    if (!at) local.at = 'Vaqtni kiriting';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api('/expenses', { method: 'POST', body: { amount, source, category, note: note.trim(), spentAt: new Date(`${at}:00+05:00`).toISOString() } });
      toast({ tone: 'success', title: 'Rasxod yozildi', description: `${categoryLabel(category)} · ${money(amount)} · ${methodLabel(source)}` });
      bump();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast({ tone: 'error', title: 'Rasxod saqlanmadi', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Rasxod qoʻshish" description="Kassadan yoki kartadan chiqqan pul"
      footer={<><Button onClick={onClose} disabled={busy}>Bekor</Button><Button variant="primary" loading={busy} onClick={save}>Saqlash</Button></>}>
      <div className="space-y-4">
        <Field label="Summa" required htmlFor="ex-amount" error={errors.amount}>
          <div className="relative">
            <Input id="ex-amount" inputMode="numeric" value={amountText} onChange={(e) => setAmountText(digitsInput(e.target.value))} placeholder="0"
              className="h-12 pr-14 text-xl font-semibold num" invalid={Boolean(errors.amount)} autoComplete="off" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">soʻm</span>
          </div>
        </Field>
        <Field label="Qayerdan toʻlandi" required error={errors.source}>
          <Segmented className="flex w-full" value={source} onChange={setSource} options={[{ value: 'cash', label: 'Naqd (kassadan)' }, { value: 'card', label: 'Kartadan' }]} />
        </Field>
        <Field label="Toifa" required htmlFor="ex-cat" error={errors.category}>
          <Select id="ex-cat" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="w-full">
            <option value="">Tanlang…</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Izoh" htmlFor="ex-note" error={errors.note} hint={category === 'boshqa' ? 'Majburiy' : 'Ixtiyoriy'}>
          <Textarea id="ex-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Masalan: 200 ta paket" invalid={Boolean(errors.note)} />
        </Field>
        <Field label="Sana va vaqt" htmlFor="ex-at" error={errors.at}>
          <Input id="ex-at" type="datetime-local" value={at} max={nowLocal()} onChange={(e) => setAt(e.target.value)} invalid={Boolean(errors.at)} />
        </Field>
      </div>
    </Modal>
  );
}

function AdjustForm({ sources, onClose }: { sources: SourceBalance[]; onClose: () => void }) {
  const { bump } = useLive();
  const toast = useToast();
  const [source, setSource] = useState<'cash' | 'card'>('cash');
  const [mode, setMode] = useState<'actual' | 'plus' | 'minus'>('actual');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const current = sources.find((s) => s.source === source)?.current || 0;
  const value = parseDigits(amountText);
  const delta = mode === 'actual' ? value - current : mode === 'plus' ? value : -value;

  async function save() {
    const local: Record<string, string> = {};
    if (!amountText) local.amount = 'Summani kiriting';
    else if (!delta) local.amount = mode === 'actual' ? 'Qoldiq allaqachon shu summaga teng' : 'Summani kiriting';
    if (note.trim().length < 3) local.note = 'Sababini yozing';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api('/adjustments', { method: 'POST', body: { source, amount: delta, note: note.trim() } });
      toast({ tone: 'success', title: 'Qoldiq tuzatildi', description: `${accountLabel(source)} · ${signed(delta)}` });
      bump();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast({ tone: 'error', title: 'Saqlanmadi', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Qoldiqni tuzatish" description="Boshlangʻich qoldiq, sanoqdagi farq yoki olib chiqilgan pul"
      footer={<><Button onClick={onClose} disabled={busy}>Bekor</Button><Button variant="primary" loading={busy} onClick={save}>Saqlash</Button></>}>
      <div className="space-y-4">
        <Field label="Hisob" required htmlFor="adj-src">
          <Select id="adj-src" value={source} onChange={(e) => setSource(e.target.value as 'cash' | 'card')} className="w-full">
            <option value="cash">Naqd (kassa)</option>
            <option value="card">Karta (Yandex va Pochta bilan)</option>
          </Select>
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
          <span className="text-ink-3">Tizimdagi qoldiq</span>
          <span className="font-semibold text-ink num">{money(current)}</span>
        </div>
        <Segmented className="flex w-full" value={mode} onChange={(m) => { setMode(m); setErrors({}); }}
          options={[{ value: 'actual', label: 'Haqiqiy summa' }, { value: 'plus', label: 'Qoʻshish' }, { value: 'minus', label: 'Ayirish' }]} />
        <Field label={mode === 'actual' ? 'Sanab chiqilgan haqiqiy summa' : 'Summa'} required htmlFor="adj-amount" error={errors.amount}
          hint={mode === 'actual' && amountText ? <>Farq: <span className="font-medium text-ink num">{signed(delta)}</span> tuzatish sifatida yoziladi</> : undefined}>
          <div className="relative">
            <Input id="adj-amount" inputMode="numeric" value={amountText} onChange={(e) => setAmountText(digitsInput(e.target.value))} placeholder="0"
              className="h-12 pr-14 text-xl font-semibold num" invalid={Boolean(errors.amount)} autoComplete="off" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">soʻm</span>
          </div>
        </Field>
        <Field label="Sabab" required htmlFor="adj-note" error={errors.note}>
          <Textarea id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Masalan: boshlangʻich qoldiq, kechki sanoq" invalid={Boolean(errors.note)} />
        </Field>
        <Alert tone="warn">Tuzatishni oʻchirib boʻlmaydi. Xato boʻlsa, teskari summali yangi tuzatish kiriting.</Alert>
      </div>
    </Modal>
  );
}

function ExpenseDetail({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { bump } = useLive();
  const toast = useToast();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doVoid() {
    if (reason.trim().length < 3) { setError('Sababini yozing'); return; }
    setBusy(true);
    try {
      await api(`/expenses/${expense.id}/void`, { method: 'POST', body: { reason: reason.trim() } });
      toast({ tone: 'success', title: 'Rasxod bekor qilindi' });
      bump();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows: Array<[string, string]> = [
    ['Toifa', categoryLabel(expense.category)],
    ['Hisob', methodLabel(expense.source)],
    ['Vaqt', dateTime(expense.spent_at)],
    ['Kiritgan', expense.created_by_name],
    ['Izoh', expense.note || '—'],
  ];
  if (expense.voided_at) rows.push(['Bekor qilgan', expense.voided_by_name || '—'], ['Sabab', expense.void_reason || '—']);

  return (
    <Modal open onClose={() => !busy && onClose()} title="Rasxod" size="sm"
      footer={voiding ? (
        <><Button onClick={() => setVoiding(false)}>Ortga</Button><Button variant="danger" loading={busy} onClick={doVoid} icon={<Ban className="size-4" />}>Bekor qilishni tasdiqlash</Button></>
      ) : (
        <>
          {!expense.voided_at && <Button variant="ghost" className="text-danger hover:text-danger sm:mr-auto" onClick={() => setVoiding(true)} icon={<Ban className="size-4" />}>Bekor qilish</Button>}
          <Button onClick={onClose} data-autofocus>Yopish</Button>
        </>
      )}>
      <div className="mb-4 rounded-xl border border-line bg-surface-2 px-4 py-4 text-center">
        <div className="text-xs text-ink-3">Summa</div>
        <div className={cx('mt-1 text-[28px] font-semibold tracking-tight text-ink num', expense.voided_at && 'line-through opacity-60')}>{money(expense.amount)}</div>
      </div>
      {voiding ? (
        <div className="space-y-3">
          <Alert tone="warn">Bekor qilingan rasxod balansdan chiqariladi, lekin tarixda saqlanadi.</Alert>
          <Field label="Sabab" required error={error || undefined}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: ikki marta yozilgan" invalid={Boolean(error)} />
          </Field>
        </div>
      ) : (
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4 py-2.5 text-sm"><dt className="text-ink-3">{k}</dt><dd className="text-right text-ink">{v}</dd></div>
          ))}
        </dl>
      )}
    </Modal>
  );
}
