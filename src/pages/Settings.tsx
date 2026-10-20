import { useState, type FormEvent } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/live';
import { dateTime, groupDigits, money } from '../lib/format';
import { useTheme, type ThemePref } from '../lib/theme';
import type { User } from '../lib/types';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Segmented, SkeletonRows, useToast } from '../components/ui';
import { isBoss, roleLabel } from '../lib/perms';

const ACTIONS: Record<string, string> = {
  setup: 'Tizim sozlandi', login: 'Tizimga kirdi', payment_create: 'Toʻlov kiritdi', payment_void: 'Toʻlovni bekor qildi',
  staff_create: 'Xodim qoʻshdi', staff_update: 'Xodimni oʻzgartirdi', client_update: 'Mijozni oʻzgartirdi', password_change: 'Parolini oʻzgartirdi',
  client_import: 'Mijozlar roʻyxatini yukladi', expense_create: 'Rasxod yozdi', expense_void: 'Rasxodni bekor qildi', balance_adjust: 'Qoldiqni tuzatdi',
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
