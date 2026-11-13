import { useState } from 'react';
import { Send, UserMinus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/live';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, useToast } from '../components/ui';
import TelegramTemplates, { type LinkedPerson } from '../components/TelegramTemplates';
import { useLive } from '../lib/live';

// Xabarlar: everything the kassa sends to Telegram. Who it goes to (the owner's own account, the group),
// whether each message is sent at all, and in which words. The owner, or someone the owner allowed.

export default function Messages() {
  const { data, error } = useApi<{ telegram: TelegramState | null }>('/telegram');
  const [override, setOverride] = useState<{ telegram: TelegramState | null } | null>(null);
  const tg = (override ?? data)?.telegram ?? null;
  const ready = Boolean(override || data);
  const people = useApi<{ items: LinkedPerson[]; notLinked: number }>(tg?.connected ? '/telegram/people' : null);
  return (
    <>
      <PageHeader title="Xabarlar" subtitle="Telegram: akkauntingizga va guruhga boradigan xabarlar" />
      <div className="grid gap-4">
        <TelegramCard tg={tg} ready={ready} loadError={error} setOverride={setOverride} />
        {tg?.connected && <PeopleCard items={people.data?.items} notLinked={people.data?.notLinked ?? 0} />}
        {tg?.connected && (
          <TelegramTemplates personalName={tg.chatName} people={people.data?.items ?? []}
            group={{ linked: Boolean(tg.groupName), name: tg.groupName, payments: tg.groupPayments !== false, cancels: tg.groupCancels !== false }} />
        )}
      </div>
    </>
  );
}

/** Staff who linked their own Telegram: the owner sees who, and can unlink someone. */
function PeopleCard({ items, notLinked }: { items?: LinkedPerson[]; notLinked: number }) {
  const { bump } = useLive();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const unlink = async (p: LinkedPerson) => {
    setBusy(p.id);
    try {
      await api(`/telegram/people/${p.id}`, { method: 'DELETE' });
      bump();
      toast({ tone: 'success', title: `${p.full_name} Telegrami uzildi` });
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <CardHeader title="Xodimlar Telegrami" subtitle="Har bir xodim Sozlamalar → Telegram boʻlimida oʻzi ulaydi. Kimga qaysi xabar borishini pastda, har bir xabarda belgilaysiz." />
      {!items ? <div className="skeleton h-16" /> : !items.length ? (
        <p className="text-sm text-ink-2">Hali hech kim ulamagan.{notLinked ? ` ${notLinked} ta faol xodim ulanmagan.` : ''}</p>
      ) : (
        <>
          <div className="divide-y divide-line rounded-lg border border-line">
            {items.map((p) => (
              <div key={p.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${p.is_active ? '' : 'opacity-55'}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{p.full_name} <span className="font-normal text-ink-3">@{p.username}</span></div>
                  <div className="truncate text-xs text-ink-3">Telegram: {p.chat_name || '—'}{p.is_active ? '' : ' · akkaunt oʻchirilgan'}</div>
                </div>
                <Button size="sm" variant="ghost" icon={<UserMinus className="size-4" />} loading={busy === p.id} onClick={() => unlink(p)}>Uzish</Button>
              </div>
            ))}
          </div>
          {notLinked > 0 && <p className="mt-2 text-xs text-ink-3">{notLinked} ta faol xodim hali ulamagan.</p>}
        </>
      )}
    </Card>
  );
}

interface TelegramState { botName: string; connected: boolean; chatName: string | null; code: string | null; groupName: string | null; groupPaused?: boolean; personalPaused?: boolean; groupCode: string | null;
  groupPayments?: boolean; groupCancels?: boolean; errors?: { chat: 'personal' | 'group'; message: string; at: string }[] }

/** Telegram's refusal in plain words, with what to do about it. */
function telegramErrorHint(message: string) {
  const m = message.toLowerCase();
  if (m.includes('blocked')) return 'Bot bloklangan. Telegramda botni ochib, “Blokdan chiqarish” va “Start”ni bosing.';
  if (m.includes('kicked') || m.includes('not a member')) return 'Bot guruhdan chiqarib yuborilgan. Botni guruhga qayta qoʻshing.';
  if (m.includes('chat not found')) return 'Chat topilmadi. Guruhni uzib, qayta ulang.';
  if (m.includes('not enough rights') || m.includes('have no rights')) return 'Botga guruhda yozish huquqi yoʻq. Guruh sozlamalarida ruxsat bering.';
  if (m.includes('aloqa boʻlmadi')) return 'Telegram bilan aloqa boʻlmadi. Odatda oʻzi tuzaladi.';
  return null;
}

function TelegramCard({ tg, ready, loadError, setOverride }: {
  tg: TelegramState | null; ready: boolean; loadError: string | null; setOverride: (v: { telegram: TelegramState | null } | null) => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  // Linking the bot and the chats, unlinking, and the report with the backup stay with the owner.
  const isOwner = user.role === 'owner';
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
  const testChat = (target: 'personal' | 'group') => run(`test-${target}`, async () => {
    try {
      setOverride(await api<{ telegram: TelegramState | null }>('/telegram/test', { method: 'POST', body: { target } }));
    } catch (err) {
      // The failure is now remembered on the server: show it in the card as well.
      setOverride(await api<{ telegram: TelegramState | null }>('/telegram').catch(() => null));
      throw err;
    }
    toast({ tone: 'success', title: 'Sinov xabari yuborildi', description: 'Telegramni tekshiring.' });
  });

  return (
    <Card>
      <CardHeader title="Ulanish" subtitle="Sizning akkauntingiz va guruh: alohida yoqiladi va toʻxtatiladi"
        action={tg?.connected ? <Badge tone="success"><span className="size-1.5 rounded-full bg-success" />Ulangan</Badge> : undefined} />
      {loadError && !ready ? <ErrorState message={loadError} /> : !ready ? <div className="skeleton h-32" /> : (
        <div className="space-y-4 text-sm">
          {!tg && !isOwner && <p className="text-ink-2">Telegram bot hali ulanmagan. Uni Ega ulaydi.</p>}
          {!tg && isOwner && (
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
          {tg && !tg.connected && !isOwner && <p className="text-ink-2">Ega botga hali Start bosmagan.</p>}
          {tg && !tg.connected && isOwner && (
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
              {(tg.errors ?? []).map((e) => (
                <Alert key={e.chat}>
                  <b>{e.chat === 'group' ? 'Guruhga' : 'Sizga'} oxirgi xabar yetib bormadi</b>
                  {` (${new Date(e.at).toLocaleString('uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}). `}
                  {telegramErrorHint(e.message) ?? e.message}
                  {' '}Tuzatgach, “Sinov xabari”ni bosing: yetib borsa, bu yozuv yoʻqoladi.
                </Alert>
              ))}
              <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-ink">Akkaunt (shaxsiy chat)</div>
                  {tg.personalPaused
                    ? <Badge tone="warn">{tg.chatName} · toʻxtatilgan</Badge>
                    : <Badge tone="success"><span className="size-1.5 rounded-full bg-success" />{tg.chatName}</Badge>}
                </div>
                <p className="text-[13px] text-ink-2">{tg.personalPaused
                  ? 'Hozir hech qanday xabar kelmaydi. Kechki hisobot va zaxira fayli baribir keladi.'
                  : 'Pastda tanlangan xabarlar shu chatga keladi. Guruhdan alohida toʻxtatish mumkin.'}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={tg.personalPaused ? 'primary' : 'secondary'} loading={busy === 'PUT/telegram/personal/pause'}
                    onClick={() => call('PUT', '/telegram/personal/pause', { paused: !tg.personalPaused })}>
                    {tg.personalPaused ? 'Qayta yoqish' : 'Vaqtincha toʻxtatish'}
                  </Button>
                  <Button variant="ghost" size="sm" loading={busy === 'test-personal'} onClick={() => testChat('personal')}>Sinov xabari</Button>
                </div>
              </div>
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
                      ? 'Guruhga hozir hech narsa yuborilmaydi. Ishni tugatgach, “Qayta yoqish”ni bosing. Shaxsiy chatingiz bunga bogʻliq emas.'
                      : 'Pastda tanlangan xabarlar guruhga keladi. Kechki hisobot va zaxira fayli guruhga bormaydi.'}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant={tg.groupPaused ? 'primary' : 'secondary'} loading={busy === 'PUT/telegram/group/pause'}
                        onClick={() => call('PUT', '/telegram/group/pause', { paused: !tg.groupPaused })}>
                        {tg.groupPaused ? 'Qayta yoqish' : 'Vaqtincha toʻxtatish'}
                      </Button>
                      <Button variant="ghost" size="sm" loading={busy === 'test-group'} onClick={() => testChat('group')}>Sinov xabari</Button>
                      {isOwner && <Button variant="ghost" size="sm" loading={busy === 'DELETE/telegram/group'} onClick={() => call('DELETE', '/telegram/group')}>Guruhni uzish</Button>}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-ink-2">Toʻlov rasmlari guruhga ham kelsin desangiz: botni guruhga qoʻshing, guruhda quyidagini yozing, keyin “Guruhni tekshirish”ni bosing. Mavzuli guruhda qaysi mavzuga yozsangiz, xabarlar oʻsha yerga keladi. Kunlik hisobot va zaxira fayli guruhga bormaydi.</p>
                    {isOwner && tg.groupCode && (
                      <code className="block select-all rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink">{`/start@${tg.botName} ${tg.groupCode}`}</code>
                    )}
                    {isOwner && <Button size="sm" loading={busy === 'POST/telegram/group'} onClick={() => call('POST', '/telegram/group')}>Guruhni tekshirish</Button>}
                  </>
                )}
              </div>
              </div>
              {isOwner && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={<Send className="size-4" />} loading={busy === 'send'} onClick={sendNow}>Kechki hisobotni hozir yuborish</Button>
                  <Button variant="ghost" loading={busy === 'DELETE/telegram'} onClick={() => call('DELETE', '/telegram')}>Botni uzish</Button>
                </div>
              )}
            </div>
          )}
          {tg && !tg.connected && isOwner && <Button variant="ghost" size="sm" onClick={() => call('DELETE', '/telegram')}>Boshqa bot kiritish</Button>}
          {error && <Alert>{error}</Alert>}
        </div>
      )}
    </Card>
  );
}
