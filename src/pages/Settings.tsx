import { useState, type FormEvent } from 'react';
import { Building2, Download, Monitor, Moon, Plus, Send, Sun, Trash2 } from 'lucide-react';
import { useBranches } from '../lib/branch';
import { TEMPLATE_BY_KEY, type TemplateKey } from '../lib/tgTemplates';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { clearApiCache, useApi } from '../lib/live';
import { dateTime, groupDigits, money } from '../lib/format';
import { useTheme, type ThemePref } from '../lib/theme';
import type { User } from '../lib/types';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, PageHeader, Segmented, SkeletonRows, useToast } from '../components/ui';
import { isBoss, roleLabel } from '../lib/perms';
import { NAV } from '../components/Layout';
import { Toggle } from '../components/TelegramTemplates';
import { ALWAYS_OPEN, MAX_PAGE_LABEL, type PageKey, type PageSetting, type PageSettings, type PageWho } from '../lib/pageConfig';
import { setPageSettings } from '../lib/perms';
import { useLive } from '../lib/live';

const ACTIONS: Record<string, string> = {
  setup: 'Tizim sozlandi', login: 'Tizimga kirdi', payment_create: 'Toʻlov kiritdi', payment_void: 'Toʻlovni bekor qildi', telegram_failed: 'Telegramga yuborilmadi',
  staff_create: 'Xodim qoʻshdi', staff_update: 'Xodimni oʻzgartirdi', client_update: 'Mijozni oʻzgartirdi', password_change: 'Parolini oʻzgartirdi',
  client_import: 'Mijozlar roʻyxatini yukladi', expense_create: 'Rasxod yozdi', expense_void: 'Rasxodni bekor qildi', balance_adjust: 'Qoldiqni tuzatdi',
  telegram_set: 'Telegram botni kiritdi', telegram_connect: 'Telegramni uladi', telegram_remove: 'Telegramni uzdi', telegram_group: 'Telegram guruhini uladi', telegram_group_remove: 'Telegram guruhini uzdi', telegram_group_pause: 'Guruhga yuborishni toʻxtatdi', telegram_group_resume: 'Guruhga yuborishni qayta yoqdi', backup_download: 'Zaxirani yuklab oldi', payment_import: 'Toʻlovlarni Exceldan yukladi', expense_import: 'Kassa daftarini yukladi', attendance_edit: 'Davomatni tuzatdi', office_set: 'Ishxona joyini belgiladi', office_clear: 'Ishxona joyini olib tashladi', order_create: 'Stiker yaratdi', order_import: 'Buyurtmalar roʻyxatini yukladi', receipt_confirm: 'Chekdan toʻlov kiritdi', telegram_template_on: 'Telegram xabarini yoqdi', telegram_template_off: 'Telegram xabarini oʻchirdi', telegram_template: 'Telegram xabar matnini oʻzgartirdi', telegram_group_kinds: 'Guruhga boradigan xabarlarni tanladi', telegram_template_chats: 'Xabar qayerga borishini oʻzgartirdi', pages_set: 'Oynalar sozlamasini oʻzgartirdi', telegram_person_link: 'Oʻz Telegramini uladi', telegram_person_unlink: 'Telegramni uzdi', telegram_personal_pause: 'Shaxsiy chatga yuborishni toʻxtatdi', telegram_personal_resume: 'Shaxsiy chatga yuborishni qayta yoqdi', data_reset: 'Barcha maʼlumotlarni tozaladi',
  branch_create: 'Yangi filial ochdi', branch_rename: 'Filial nomini oʻzgartirdi',
  order_issue: 'Tovarni berdi', order_unissue: 'Tovarni omborga qaytardi', order_delete: 'Stikerni oʻchirdi', order_prepaid: 'Buyurtmani oldin toʻlangan deb belgiladi', order_unprepaid: 'Oldin toʻlangan belgisini olib tashladi',
};

export default function Settings() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Sozlamalar" subtitle="Akkaunt va tizim sozlamalari" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Profile />
        <Password />
        <Appearance />
        {user.role !== 'owner' && <MyTelegram />}
        {isBoss(user) && <SystemInfo />}
        {user.role === 'owner' && <BranchesCard />}
        {user.role === 'owner' && <PagesCard />}
        {user.role === 'owner' && <BackupCard />}
        {user.role === 'owner' && <ResetCard />}
      </div>
      {isBoss(user) && <AuditLog />}
    </>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState(user.full_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user: updated } = await api<{ user: User }>('/auth/profile', { method: 'PATCH', body: { fullName } });
      setUser(updated);
      toast({ tone: 'success', title: 'Profil saqlandi' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Profil" subtitle="Ismingiz operatsiyalarda koʻrinadi" />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ism familiya" htmlFor="pf-name"><Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Login" htmlFor="pf-login"><Input id="pf-login" value={user.username} disabled /></Field>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Badge tone={isBoss(user) ? 'warn' : 'neutral'}>{roleLabel(user)}</Badge>
          <Button type="submit" variant="primary" loading={busy} disabled={fullName.trim() === user.full_name}>Saqlash</Button>
        </div>
        {error && <Alert>{error}</Alert>}
      </form>
    </Card>
  );
}

function Password() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('Yangi parol kamida 8 belgidan iborat boʻlsin');
    if (next !== repeat) return setError('Yangi parollar mos kelmadi');
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setCurrent(''); setNext(''); setRepeat('');
      toast({ tone: 'success', title: 'Parol oʻzgartirildi', description: 'Boshqa qurilmalardagi seanslar yopildi' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Parolni oʻzgartirish" subtitle="Yangi paroldan soʻng boshqa qurilmalardan chiqarilasiz" />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Joriy parol" htmlFor="pw-cur"><Input id="pw-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Yangi parol" htmlFor="pw-new"><Input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Yangi parolni takrorlang" htmlFor="pw-rep"><Input id="pw-rep" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" /></Field>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy} disabled={!current || !next}>Parolni yangilash</Button></div>
      </form>
    </Card>
  );
}

function Appearance() {
  const { pref, setPref } = useTheme();
  return (
    <Card>
      <CardHeader title="Koʻrinish" subtitle="Interfeys mavzusi faqat shu qurilmada saqlanadi" />
      <Segmented<ThemePref> className="flex w-full" value={pref} onChange={setPref} options={[
        { value: 'light', label: <><Sun className="size-4" />Yorugʻ</> },
        { value: 'dark', label: <><Moon className="size-4" />Qorongʻi</> },
        { value: 'system', label: <><Monitor className="size-4" />Tizim</> },
      ]} />
    </Card>
  );
}

function SystemInfo() {
  const { data, error, loading, reload } = useApi<{ meta: Record<string, any>; counts: Record<string, number> }>('/system');
  return (
    <Card>
      <CardHeader title="Tizim holati" subtitle="Umumiy server maʼlumotlar bazasi (PostgreSQL)" action={<Badge tone="success"><span className="size-1.5 rounded-full bg-success" />Ulangan</Badge>} />
      {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="skeleton h-32" /> : data && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Toʻlovlar', data.counts.payments], ['Bekor qilingan', data.counts.voided], ['Mijozlar', data.counts.clients], ['Xodimlar', data.counts.users]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <div className="text-xs text-ink-3">{k}</div>
                <div className="font-semibold text-ink num">{groupDigits(Number(v))}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function AuditLog() {
  const { data, error, loading, reload } = useApi<{ items: Array<{ id: number; at: string; user_name: string | null; action: string; entity_id: string | null; details: any }> }>('/audit');
  return (
    <Card className="mt-4" padded={false}>
      <div className="px-4 pt-4 sm:px-5"><CardHeader title="Faoliyat jurnali" subtitle="Oxirgi 200 ta amal" /></div>
      <div className="border-t border-line">
        {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading ? <SkeletonRows rows={5} cols={3} /> : (
          <ul className="max-h-[420px] divide-y divide-line overflow-y-auto scrollbar-thin">
            {data?.items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span className="w-[150px] shrink-0 text-xs text-ink-3 num">{dateTime(a.at)}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-ink">{a.user_name || 'Tizim'}</span>{' '}
                  <span className="text-ink-2">{ACTIONS[a.action] || a.action}</span>
                  {a.details?.clientCode && <span className="text-ink-3"> · {a.details.clientCode} · {money(a.details.amount)}</span>}
                  {a.action === 'payment_void' && a.details?.reason && <span className="text-ink-3"> · {a.details.client_code} · {money(a.details.amount)} · “{a.details.reason}”</span>}
                  {a.details?.username && <span className="text-ink-3"> · @{a.details.username}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** Saves the server's full backup (.json.gz) to the device. */
async function downloadBackup() {
  const { filename, data: b64 } = await api<{ filename: string; data: string }>('/backup');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Owner only: wipe every payment, expense, order and attendance mark; staff accounts and settings stay. */
function ResetCard() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [withClients, setWithClients] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!busy) { setOpen(false); setTyped(''); setError(''); setWithClients(false); } };

  const reset = async () => {
    setBusy(true);
    setError('');
    try {
      // A copy of everything goes to the device first, so a mistake can still be undone by hand.
      await downloadBackup();
      await api('/system/reset', { method: 'POST', body: { confirm: 'TOZALASH', clients: withClients } });
      clearApiCache();
      toast({ tone: 'success', title: 'Maʼlumotlar tozalandi', description: 'Zaxira nusxasi qurilmangizga yuklab olindi.' });
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card className="self-start">
      <CardHeader title="Maʼlumotlarni tozalash" subtitle="Faqat Ega koʻradi" />
      <p className="text-sm text-ink-2">
        Kassani noldan boshlash: barcha kirim, chiqim, buyurtma va davomat oʻchadi. Ishchilar, ularning parollari va sozlamalar qoladi.
      </p>
      <div className="mt-4">
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>Tozalash…</Button>
      </div>
      <Modal open={open} onClose={close} title="Barcha maʼlumotlarni tozalash" size="sm"
        description="Bu amalni ortga qaytarib boʻlmaydi. Oʻchirishdan oldin toʻliq zaxira nusxasi qurilmangizga yuklab olinadi."
        footer={<>
          <Button onClick={close} disabled={busy}>Bekor qilish</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} loading={busy} disabled={typed.trim().toUpperCase() !== 'TOZALASH'} onClick={reset}>Zaxira olib, tozalash</Button>
        </>}>
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-medium text-ink">Oʻchadi:</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">
              <li>Barcha toʻlovlar (kirim), rasxodlar va balans tuzatishlari</li>
              <li>Buyurtmalar, stikerlar va cheklar</li>
              <li>Davomat (kim qachon kelib-ketgani)</li>
              <li>Faoliyat jurnali va eski koʻchirilgan maʼlumotlar</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-ink">Qoladi:</div>
            <p className="mt-1 text-ink-2">Ishchilar va ularning ruxsatlari, ishxona joyi, Telegram sozlamalari{withClients ? '' : ', mijozlar roʻyxati'}.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5">
            <input type="checkbox" checked={withClients} onChange={(e) => setWithClients(e.target.checked)} className="mt-0.5 size-4 accent-[var(--danger)]" />
            <span><span className="font-medium text-ink">Mijozlar roʻyxatini ham oʻchirish</span><span className="block text-xs text-ink-3">ID, ism va telefonlar. Belgilanmasa qoladi.</span></span>
          </label>
          <Field label="Tasdiqlash uchun TOZALASH deb yozing" htmlFor="reset-confirm">
            <Input id="reset-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder="TOZALASH" />
          </Field>
          {error && <Alert>{error}</Alert>}
        </div>
      </Modal>
    </Card>
  );
}


/** Owner only: a copy of everything to the device. */
function BackupCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try { await downloadBackup(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card className="self-start">
      <CardHeader title="Zaxira" subtitle="Faqat Ega koʻradi" />
      <p className="text-sm text-ink-2">Barcha toʻlov, mijoz, rasxod va davomat bitta faylda. Parollar kirmaydi. Har kecha Telegramga ham keladi.</p>
      <div className="mt-4"><Button icon={<Download className="size-4" />} loading={busy} onClick={download}>Yuklab olish</Button></div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Card>
  );
}

/** Owner only: open a new branch or rename one. Each keeps its own payments, kassa, expenses and orders. */
function BranchesCard() {
  const { all } = useBranches();
  const { bump } = useLive();
  const toast = useToast();
  const [names, setNames] = useState<Record<number, string>>({});
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: number | 'new', fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      bump();
      toast({ tone: 'success', title: done });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await run('new', () => api('/branches', { method: 'POST', body: { name: fresh } }), `“${fresh.trim()}” filiali ochildi`)) setFresh('');
  };
  const rename = (id: number) => run(id, () => api(`/branches/${id}`, { method: 'PATCH', body: { name: names[id] } }), 'Nomi saqlandi')
    .then((ok) => ok && setNames(({ [id]: _, ...rest }) => rest));

  return (
    <Card className="self-start">
      <CardHeader title="Filiallar" subtitle="Har filialning toʻlovlari, kassasi, rasxodi va buyurtmalari alohida. Mijozlar roʻyxati umumiy." />
      <div className="divide-y divide-line rounded-xl border border-line">
        {all.map((b) => {
          const value = names[b.id] ?? b.name;
          const changed = value.trim() !== b.name;
          return (
            <div key={b.id} className="flex items-center gap-2.5 px-3 py-2">
              <Building2 className="size-4 shrink-0 text-ink-3" />
              <Input aria-label="Filial nomi" value={value} maxLength={40} onChange={(e) => setNames((n) => ({ ...n, [b.id]: e.target.value }))} className="h-9 flex-1" />
              {changed && <Button size="sm" variant="primary" loading={busy === b.id} onClick={() => rename(b.id)}>Saqlash</Button>}
            </div>
          );
        })}
      </div>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input aria-label="Yangi filial nomi" value={fresh} maxLength={40} onChange={(e) => setFresh(e.target.value)} placeholder="Yangi filial nomi, masalan Chilonzor" className="h-9 flex-1" />
        <Button size="sm" type="submit" icon={<Plus className="size-4" />} loading={busy === 'new'} disabled={fresh.trim().length < 2}>Ochish</Button>
      </form>
      <p className="mt-3 text-xs text-ink-3">
        {all.length > 1
          ? 'Tepada filialni tanlab ishlaysiz. Xodimga qaysi filiallarni koʻrishini Ishchilar sahifasida belgilang.'
          : 'Ikkinchi filial ochilganda tepada filial tanlash paydo boʻladi. Hozirgi barcha maʼlumotlar birinchi filialda qoladi.'}
      </p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Card>
  );
}

const WHO_OPTIONS: Array<{ value: PageWho; label: string }> = [
  { value: 'all', label: 'Ruxsati borlar' },
  { value: 'boss', label: 'Ega va admin' },
  { value: 'owner', label: 'Faqat Ega' },
];

/** Owner only: for every page, pause it for a while, choose who sees it, rename it in the menu. */
function PagesCard() {
  const toast = useToast();
  const { bump } = useLive();
  const { data, error: loadError } = useApi<{ pages: PageSettings }>('/pages');
  const [draft, setDraft] = useState<PageSettings | null>(null);
  const saved = data?.pages ?? {};
  const pages = draft ?? saved;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const edit = (page: PageKey, change: Partial<PageSetting>) => setDraft((d) => {
    const base = d ?? saved;
    const next: PageSetting = { ...base[page], ...change };
    if (!next.paused) delete next.paused;
    if (!next.who || next.who === 'all') delete next.who;
    if (!next.label) delete next.label;
    return { ...base, [page]: next };
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ pages: PageSettings }>('/pages', { method: 'PUT', body: { pages } });
      setPageSettings(res.pages);
      setDraft(null);
      bump();
      toast({ tone: 'success', title: 'Oynalar saqlandi', description: 'Xodimlarda darhol koʻrinadi.' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="xl:col-span-2" padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">Oynalar</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">Har bir oynani vaqtincha toʻxtating, kimga koʻrinishini tanlang yoki menyudagi nomini oʻzgartiring. Siz hammasini doim koʻrasiz.</p>
        </div>
        <div className="flex gap-2">
          {changed && <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Bekor</Button>}
          <Button size="sm" variant="primary" loading={busy} disabled={!changed} onClick={save}>Saqlash</Button>
        </div>
      </div>
      {loadError && !data ? <div className="p-5"><ErrorState message={loadError} /></div> : !data ? <div className="skeleton m-5 h-64" /> : (
        <div className="divide-y divide-line">
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="bg-surface-2/60 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3 sm:px-5">{group.group}</div>
              <div className="divide-y divide-line">
                {group.items.map((item) => {
                  const key = item.page as PageKey;
                  const s = pages[key] ?? {};
                  const locked = ALWAYS_OPEN.includes(key);
                  return (
                    <div key={key} className="grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${s.paused ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-2'}`}><item.icon className="size-[18px]" /></span>
                        <div className="min-w-0 flex-1">
                          <Input aria-label={`${item.label} nomi`} value={s.label ?? ''} placeholder={item.label} maxLength={MAX_PAGE_LABEL}
                            onChange={(e) => edit(key, { label: e.target.value })} className="h-9 max-w-xs" />
                        </div>
                      </div>
                      {locked ? (
                        <span className="text-xs text-ink-3 lg:col-span-2">Doim ochiq: shu yerdan qolganlarini boshqarasiz</span>
                      ) : (
                        <>
                          <Segmented value={s.who ?? 'all'} onChange={(v) => edit(key, { who: v })} options={WHO_OPTIONS} />
                          <div className="flex items-center justify-between gap-2.5 text-[13px] text-ink-2 lg:justify-start">
                            <span>{s.paused ? <Badge tone="warn">Vaqtincha toʻxtatilgan</Badge> : 'Ishlayapti'}</span>
                            <Toggle on={!s.paused} label={`${item.label} ishlaydi`} onChange={(on) => edit(key, { paused: !on })} />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="p-4"><Alert>{error}</Alert></div>}
    </Card>
  );
}

interface MyTelegramState { botName: string; linked: boolean; chatName: string | null; code: string | null; messages: TemplateKey[] }

/** Anyone links their own Telegram to the kassa bot; the owner decides which messages reach them. */
function MyTelegram() {
  const toast = useToast();
  const { data, error: loadError } = useApi<{ telegram: MyTelegramState | null }>('/telegram/me');
  const [override, setOverride] = useState<{ telegram: MyTelegramState | null } | null>(null);
  const tg = (override ?? data)?.telegram;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const call = async (name: string, method: string, path: string) => {
    setBusy(name);
    setError(null);
    try {
      const res = await api<{ telegram: MyTelegramState | null }>(path, { method });
      setOverride(res);
      if (name === 'check') toast({ tone: 'success', title: 'Telegram ulandi' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="self-start">
      <CardHeader title="Telegram" subtitle="Kassa xabarlari sizning Telegramingizga"
        action={tg?.linked ? <Badge tone="success"><span className="size-1.5 rounded-full bg-success" />Ulangan</Badge> : undefined} />
      {loadError && !data ? <ErrorState message={loadError} /> : !(override ?? data) ? <div className="skeleton h-20" /> : !tg ? (
        <p className="text-sm text-ink-2">Kassa boti hali ulanmagan. Uni Ega ulaydi.</p>
      ) : tg.linked ? (
        <div className="space-y-3 text-sm">
          <p className="text-ink-2">{`Xabarlar ${tg.chatName ?? 'Telegramingiz'} ga @${tg.botName} orqali keladi.`}</p>
          <div className="rounded-lg border border-line px-3 py-2.5">
            <div className="text-xs font-medium text-ink-3">Sizga keladigan xabarlar (Ega belgilaydi)</div>
            {tg.messages.length
              ? <ul className="mt-1 list-disc pl-5 text-ink">{tg.messages.map((k) => <li key={k}>{TEMPLATE_BY_KEY[k].title}</li>)}</ul>
              : <p className="mt-1 text-ink-2">Hozircha hech qaysi. Ega belgilagach kela boshlaydi.</p>}
          </div>
          <Button size="sm" variant="ghost" loading={busy === 'unlink'} onClick={() => call('unlink', 'DELETE', '/telegram/me')}>Uzish</Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-ink-2">Quyidagi tugma Telegramni ochadi: u yerda <b>Start</b> bosing, keyin “Tekshirish”ni bosing.</p>
          <div className="flex flex-wrap gap-2">
            <a href={`https://t.me/${tg.botName}?start=${tg.code}`} target="_blank" rel="noopener noreferrer"><Button icon={<Send className="size-4" />}>@{tg.botName} ni ochish</Button></a>
            <Button variant="primary" loading={busy === 'check'} onClick={() => call('check', 'POST', '/telegram/me/check')}>Tekshirish</Button>
          </div>
          <p className="text-xs text-ink-3">{`Tugma ishlamasa, botga ${tg.code} deb yozing.`}</p>
        </div>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Card>
  );
}
