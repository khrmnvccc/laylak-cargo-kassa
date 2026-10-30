import { useState, type FormEvent } from 'react';
import { Download, Monitor, Moon, Send, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/live';
import { dateTime, groupDigits, money } from '../lib/format';
import { useTheme, type ThemePref } from '../lib/theme';
import type { User } from '../lib/types';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Segmented, SkeletonRows, useToast } from '../components/ui';
import { isBoss, roleLabel } from '../lib/perms';

const ACTIONS: Record<string, string> = {
  setup: 'Tizim sozlandi', login: 'Tizimga kirdi', payment_create: 'Toʻlov kiritdi', payment_void: 'Toʻlovni bekor qildi', telegram_failed: 'Telegramga yuborilmadi',
  staff_create: 'Xodim qoʻshdi', staff_update: 'Xodimni oʻzgartirdi', client_update: 'Mijozni oʻzgartirdi', password_change: 'Parolini oʻzgartirdi',
  client_import: 'Mijozlar roʻyxatini yukladi', expense_create: 'Rasxod yozdi', expense_void: 'Rasxodni bekor qildi', balance_adjust: 'Qoldiqni tuzatdi',
  telegram_set: 'Telegram botni kiritdi', telegram_connect: 'Telegramni uladi', telegram_remove: 'Telegramni uzdi', telegram_group: 'Telegram guruhini uladi', telegram_group_remove: 'Telegram guruhini uzdi', telegram_group_pause: 'Guruhga yuborishni toʻxtatdi', telegram_group_resume: 'Guruhga yuborishni qayta yoqdi', backup_download: 'Zaxirani yuklab oldi',
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
        {isBoss(user) && <SystemInfo />}
        {user.role === 'owner' && <TelegramCard />}
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
  const legacy = data?.meta.legacy_import_v1;
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
          {legacy && (
            <div className="rounded-lg border border-line px-3 py-2.5 text-[13px] text-ink-2">
              <div className="font-medium text-ink">Eski maʼlumotlar koʻchirilishi</div>
              {legacy.sourceTableFound ? (
                <p className="mt-1">
                  {dateTime(legacy.at)} da {legacy.owners} ta eski akkauntdan {legacy.records} ta yozuv zaxiraga olindi va {legacy.paymentsCreated} ta toʻlov umumiy bazaga koʻchirildi.
                  {legacy.skippedSamples ? ` ${legacy.skippedSamples} ta demo yozuv chiqarib tashlandi.` : ''}
                  {legacy.skippedDeleted ? ` ${legacy.skippedDeleted} ta oʻchirilgan yozuv koʻchirilmadi.` : ''} Eski jadval oʻzgarishsiz saqlanadi.
                </p>
              ) : <p className="mt-1">Eski jadval topilmadi, koʻchiriladigan maʼlumot yoʻq.</p>}
            </div>
          )}
          <p className="text-xs text-ink-3">Toʻlovlarni oʻchirib boʻlmaydi, faqat admin sabab koʻrsatib bekor qila oladi. Bu cheklov maʼlumotlar bazasining oʻzida ham oʻrnatilgan. Barcha summalar soʻmda, sanalar Toshkent vaqti boʻyicha.</p>
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

interface TelegramState { botName: string; connected: boolean; chatName: string | null; code: string | null; groupName: string | null; groupPaused?: boolean; groupCode: string | null }

/** Owner only: connect a Telegram bot for the evening report and nightly backup, and download a backup now. */
function TelegramCard() {
  const toast = useToast();
  const { data, error: loadError, loading } = useApi<{ telegram: TelegramState | null }>('/telegram');
  const [override, setOverride] = useState<{ telegram: TelegramState | null } | null>(null);
  const tg = (override ?? data)?.telegram ?? null;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(name: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(name);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const call = (method: string, path: string, body?: unknown) => run(method + path, async () => {
    setOverride(await api<{ telegram: TelegramState | null }>(path, { method, body }));
    setToken('');
  });
  const sendNow = () => run('send', async () => {
    await api('/telegram/send', { method: 'POST' });
    toast({ tone: 'success', title: 'Hisobot va zaxira Telegramga yuborildi' });
  });
  const download = () => run('backup', async () => {
    const { filename, data: b64 } = await api<{ filename: string; data: string }>('/backup');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  return (
    <Card>
      <CardHeader title="Telegram hisobot va zaxira" subtitle="Faqat Ega koʻradi"
        action={tg?.connected ? <Badge tone="success"><span className="size-1.5 rounded-full bg-success" />Ulangan</Badge> : undefined} />
      {loadError && !data ? <ErrorState message={loadError} /> : loading && !override ? <div className="skeleton h-32" /> : (
        <div className="space-y-4 text-sm">
          {!tg && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); call('PUT', '/telegram', { token: token.trim() }); }}>
              <ol className="list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
                <li>Telegramda <a className="font-medium text-ink underline" href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> ni oching va <b>/newbot</b> deb yozing.</li>
                <li>Botga nom bering. BotFather uzun token beradi.</li>
                <li>Shu tokenni pastga qoʻying. U faqat serverda saqlanadi.</li>
              </ol>
              <Field label="Bot tokeni" htmlFor="tg-token">
                <Input id="tg-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="123456789:AA..." />
              </Field>
              <Button variant="primary" type="submit" loading={busy === 'PUT/telegram'} disabled={!token.trim()}>Botni ulash</Button>
            </form>
          )}
          {tg && !tg.connected && (
            <div className="space-y-3">
              <p className="text-ink-2">Endi botga oʻzingizni tanishtiring: quyidagi tugma Telegramni ochadi, u yerda <b>Start</b> bosing. Keyin “Tekshirish”ni bosing.</p>
              <div className="flex flex-wrap gap-2">
                <a href={`https://t.me/${tg.botName}?start=${tg.code}`} target="_blank" rel="noopener noreferrer"><Button icon={<Send className="size-4" />}>@{tg.botName} ni ochish</Button></a>
                <Button variant="primary" loading={busy === 'POST/telegram/check'} onClick={() => call('POST', '/telegram/check')}>Tekshirish</Button>
              </div>
              <p className="text-xs text-ink-3">{`Tugma ishlamasa, botga ${tg.code} deb yozing.`}</p>
            </div>
          )}
          {tg?.connected && (
            <div className="space-y-3">
              <p className="text-ink-2">{`Xabarlar ${tg.chatName} ga @${tg.botName} orqali keladi.`}</p>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
                <li>Har kuni 19:00 dan keyin: kunlik hisobot, kassa va operatsiyalar Excel fayllari (oxirgi inkassadan beri) va butun bazaning zaxira nusxasi.</li>
                <li>Har bir toʻlovning rasmi: naqd yoki karta, summa, mijoz va kim kiritgani.</li>
                <li>Toʻlov bekor qilinsa, darhol xabar.</li>
              </ul>
              <div className="space-y-2 rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-ink">Guruh</div>
                  {tg.groupName && (tg.groupPaused
                    ? <Badge tone="warn">{tg.groupName} · toʻxtatilgan</Badge>
                    : <Badge tone="success"><span className="size-1.5 rounded-full bg-success" />{tg.groupName}</Badge>)}
                </div>
                {tg.groupName ? (
                  <>
                    <p className="text-[13px] text-ink-2">{tg.groupPaused
                      ? 'Guruhga hozir hech narsa yuborilmaydi. Toʻlov rasmlari va bekor qilingan toʻlovlar faqat sizga keladi. Ishni tugatgach, “Qayta yoqish”ni bosing.'
                      : 'Toʻlov rasmlari va bekor qilingan toʻlovlar bu guruhga ham keladi. Kunlik hisobot va zaxira fayli faqat sizga keladi.'}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant={tg.groupPaused ? 'primary' : 'secondary'} loading={busy === 'PUT/telegram/group/pause'}
                        onClick={() => call('PUT', '/telegram/group/pause', { paused: !tg.groupPaused })}>
                        {tg.groupPaused ? 'Qayta yoqish' : 'Vaqtincha toʻxtatish'}
                      </Button>
                      <Button variant="ghost" size="sm" loading={busy === 'DELETE/telegram/group'} onClick={() => call('DELETE', '/telegram/group')}>Guruhni uzish</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-ink-2">Toʻlov rasmlari guruhga ham kelsin desangiz: botni guruhga qoʻshing, guruhda quyidagini yozing, keyin “Guruhni tekshirish”ni bosing. Mavzuli guruhda qaysi mavzuga yozsangiz, xabarlar oʻsha yerga keladi. Kunlik hisobot va zaxira fayli guruhga bormaydi.</p>
                    {tg.groupCode && (
                      <code className="block select-all rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink">{`/start@${tg.botName} ${tg.groupCode}`}</code>
                    )}
                    <Button size="sm" loading={busy === 'POST/telegram/group'} onClick={() => call('POST', '/telegram/group')}>Guruhni tekshirish</Button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={<Send className="size-4" />} loading={busy === 'send'} onClick={sendNow}>Hozir yuborish</Button>
                <Button variant="ghost" loading={busy === 'DELETE/telegram'} onClick={() => call('DELETE', '/telegram')}>Uzish</Button>
              </div>
            </div>
          )}
          {tg && !tg.connected && <Button variant="ghost" size="sm" onClick={() => call('DELETE', '/telegram')}>Boshqa bot kiritish</Button>}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
            <div>
              <div className="font-medium text-ink">Zaxirani yuklab olish</div>
              <div className="text-xs text-ink-3">Barcha toʻlov, mijoz, rasxod va davomat bitta faylda. Parollar kirmaydi.</div>
            </div>
            <Button icon={<Download className="size-4" />} loading={busy === 'backup'} onClick={download}>Yuklab olish</Button>
          </div>
          {error && <Alert>{error}</Alert>}
        </div>
      )}
    </Card>
  );
}
