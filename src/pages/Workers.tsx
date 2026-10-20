import { useState, type FormEvent } from 'react';
import { Pencil, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useLive } from '../lib/live';
import { groupDigits, money, rangeLabel, relativeDay } from '../lib/format';
import { PERM_INFO, PRESETS, roleLabel, type Perm } from '../lib/perms';
import type { Role, Staff } from '../lib/types';
import { DateRangePicker, presetRange, type Range } from '../components/DateRange';
import { Alert, Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, MethodCells, MethodHeads, Modal, PageHeader, Segmented, SkeletonRows, cx, td, th, useToast } from '../components/ui';

export default function Workers() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [range, setRange] = useState<Range>(() => presetRange('month'));
  const { data, error, loading, reload } = useApi<{ items: Staff[] }>('/staff', range);
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const total = data?.items.reduce((s, w) => s + w.total, 0) || 0;
  const best = data?.items.filter((w) => w.is_active).reduce<Staff | null>((b, w) => (!b || w.total > b.total ? w : b), null);

  return (
    <>
      <PageHeader
        title="Ishchilar"
        subtitle={<>Xodimlar va ularning koʻrsatkichlari · <span className="text-ink-2">{rangeLabel(range.from, range.to)}</span></>}
        actions={<>
          <DateRangePicker value={range} onChange={setRange} />
          {isAdmin && <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setEditing('new')}>Xodim qoʻshish</Button>}
        </>}
      />

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="Faol xodimlar" value={String(data.items.filter((w) => w.is_active).length)} />
          <Kpi label="Xodimlar kiritgan jami" value={money(total)} />
          <Kpi label="Eng yuqori natija" value={best && best.total ? best.full_name : '—'} className="col-span-2 sm:col-span-1" />
        </div>
      )}

      <Card padded={false}>
        {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading ? <SkeletonRows rows={4} cols={6} /> : !data?.items.length ? (
          <EmptyState title="Xodimlar yoʻq" action={isAdmin ? <Button variant="primary" onClick={() => setEditing('new')}>Xodim qoʻshish</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full">
              <thead className="border-b border-line bg-surface-2/60">
                <tr>
                  <th className={th}>Xodim</th>
                  <th className={th}>Rol</th>
                  <th className={cx(th, 'text-right')}>Operatsiya</th>
                  <MethodHeads open={cardOpen} onToggle={() => setCardOpen((o) => !o)} />
                  <th className={cx(th, 'text-right')}>Jami</th>
                  <th className={th}>Ulush</th>
                  <th className={th}>Oxirgi kirish</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((w) => {
                  const share = total ? (w.total / total) * 100 : 0;
                  return (
                    <tr key={w.id} className={cx('hover:bg-surface-2/60', !w.is_active && 'opacity-55')}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <Avatar name={w.full_name} />
                          <div>
                            <div className="font-medium">{w.full_name}</div>
                            <div className="text-xs text-ink-3">@{w.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className={td}>
                        <div className="flex gap-1.5">
                          <Badge tone={w.role === 'admin' ? 'warn' : 'neutral'}>{roleLabel(w)}</Badge>
                          {!w.is_active && <Badge tone="danger">Oʻchirilgan</Badge>}
                        </div>
                      </td>
                      <td className={cx(td, 'text-right num text-ink-2')}>{groupDigits(w.count)}</td>
                      <MethodCells row={w} open={cardOpen} />
                      <td className={cx(td, 'text-right font-semibold num')}>{money(w.total)}</td>
                      <td className={cx(td, 'min-w-[120px]')}>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-ink-2" style={{ width: `${share}%` }} /></div>
                          <span className="w-9 text-right text-xs text-ink-3 num">{Math.round(share)}%</span>
                        </div>
                      </td>
                      <td className={cx(td, 'text-ink-3')}>{w.last_login_at ? relativeDay(w.last_login_at) : 'Hech qachon'}</td>
                      <td className="pr-3">
                        {isAdmin && <Button variant="ghost" size="sm" onClick={() => setEditing(w)} aria-label="Tahrirlash"><Pencil className="size-3.5" /></Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <StaffModal staff={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card className={cx('!p-4', className)}>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tracking-tight text-ink num">{value}</div>
    </Card>
  );
}

function StaffModal({ staff, onClose }: { staff: Staff | null; onClose: () => void }) {
  const { user } = useAuth();
  const { bump } = useLive();
  const toast = useToast();
  const isNew = !staff;
  const [fullName, setFullName] = useState(staff?.full_name || '');
  const [username, setUsername] = useState(staff?.username || '');
  const [role, setRole] = useState<Role>(staff?.role || 'worker');
  const [perms, setPerms] = useState<Perm[]>(staff?.role === 'worker' ? staff.permissions : PRESETS.kassir);
  const kind = role === 'admin' ? 'admin' : perms.includes('payments.create') ? 'kassir' : 'ishchi';
  const pickKind = (k: 'ishchi' | 'kassir' | 'admin') => {
    if (isSelf) return;
    if (k === 'admin') return setRole('admin');
    setRole('worker');
    setPerms(PRESETS[k]);
  };
  const toggle = (p: Perm) => setPerms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));
  const [active, setActive] = useState(staff?.is_active ?? true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSelf = staff?.id === user.id;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError('Xodim ismini kiriting');
    if (isNew && !/^[a-z0-9._-]{3,40}$/.test(username.trim().toLowerCase())) return setError('Login 3–40 ta lotin harfi, raqam yoki . _ - boʻlsin');
    if ((isNew || password) && password.length < 8) return setError('Parol kamida 8 belgidan iborat boʻlsin');
    setBusy(true);
    try {
      if (isNew) {
        await api('/staff', { method: 'POST', body: { fullName, username, role, password, permissions: perms } });
        toast({ tone: 'success', title: 'Xodim qoʻshildi', description: `${fullName} · login: ${username.trim().toLowerCase()}` });
      } else {
        const body: Record<string, unknown> = {};
        if (fullName !== staff.full_name) body.fullName = fullName;
        if (role !== staff.role) body.role = role;
        if (active !== staff.is_active) body.isActive = active;
        if (role === 'worker' && [...perms].sort().join() !== [...(staff.role === 'worker' ? staff.permissions : [])].sort().join()) body.permissions = perms;
        if (password) body.password = password;
        if (!Object.keys(body).length) return onClose();
        await api(`/staff/${staff.id}`, { method: 'PATCH', body });
        toast({ tone: 'success', title: 'Oʻzgarishlar saqlandi', description: password ? 'Parol yangilandi, xodim qayta kirishi kerak' : undefined });
      }
      bump();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Yangi xodim' : 'Xodimni tahrirlash'} description={isNew ? 'Xodim shu login va parol bilan tizimga kiradi' : `@${staff.username}`}
      footer={<>
        <Button onClick={onClose}>Bekor qilish</Button>
        <Button variant="primary" loading={busy} type="submit" form="staff-form">{isNew ? 'Qoʻshish' : 'Saqlash'}</Button>
      </>}>
      <form id="staff-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Ism familiya" required htmlFor="sf-name"><Input id="sf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Masalan, Dilshod Karimov" /></Field>
        {isNew && (
          <Field label="Login" required hint="Kichik lotin harflari, raqamlar, . _ -" htmlFor="sf-login">
            <Input id="sf-login" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} placeholder="dilshod" />
          </Field>
        )}
        <Field label={isNew ? 'Parol' : 'Yangi parol'} required={isNew} hint={isNew ? 'Kamida 8 belgi' : 'Oʻzgartirmaslik uchun boʻsh qoldiring'} htmlFor="sf-pass">
          <Input id="sf-pass" type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
        </Field>
        <Field label="Rol" hint={kind === 'admin' ? 'Hamma narsaga ruxsat: xodimlar, ruxsatlar, balans, bekor qilish' : kind === 'kassir' ? 'Toʻlov kiritadi. Qolgan ruxsatlarni pastda belgilang' : 'Faqat kelish-ketishini belgilaydi. Kerak boʻlsa pastda ruxsat bering'}>
          <Segmented className="flex w-full" value={kind} onChange={pickKind}
            options={[{ value: 'ishchi', label: 'Ishchi' }, { value: 'kassir', label: 'Kassir' }, { value: 'admin', label: 'Admin' }]} />
        </Field>
        {role === 'worker' && (
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink">Ruxsatlar</div>
            <div className="divide-y divide-line rounded-lg border border-line">
              {PERM_INFO.map((p) => (
                <label key={p.perm} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2/60">
                  <input type="checkbox" checked={perms.includes(p.perm)} onChange={() => toggle(p.perm)} className="mt-0.5 size-4 shrink-0 accent-[var(--ink)]" />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{p.label}</span>
                    <span className="block text-xs text-ink-3">{p.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Kelish-ketishni belgilash hammaga ochiq. Oʻzgarish xodimda darhol kuchga kiradi.</p>
          </div>
        )}
        {!isNew && !isSelf && (
          <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-ink">Akkaunt faol</div>
              <div className="text-xs text-ink-3">Oʻchirilgan xodim tizimga kira olmaydi. Uning operatsiyalari saqlanadi.</div>
            </div>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[var(--ink)]" />
          </label>
        )}
        {isSelf && <Alert tone="warn">Oʻz akkauntingizning rolini va faolligini oʻzgartira olmaysiz.</Alert>}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
