import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { Alert, Button, Field, Input } from '../components/ui';

export function LoginPage({ needsSetup, setupKeyConfigured, onAuthenticated }: {
  needsSetup: boolean; setupKeyConfigured: boolean; onAuthenticated: (u: User) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) return setError('Login va parolni kiriting');
    if (needsSetup && password.length < 8) return setError('Parol kamida 8 belgidan iborat boʻlsin');
    setLoading(true);
    try {
      const { user } = needsSetup
        ? await api<{ user: User }>('/setup', { method: 'POST', body: { setupKey, username, fullName, password } })
        : await api<{ user: User }>('/auth/login', { method: 'POST', body: { username, password } });
      onAuthenticated(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_520px]">
      <div className="relative hidden overflow-hidden bg-[#0b0d10] lg:block">
        <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #1baf7a33, transparent 40%), radial-gradient(circle at 80% 70%, #2a78d633, transparent 45%)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-white text-[#0b0d10]">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 5v14h11" /></svg>
            </div>
            <span className="text-base font-semibold tracking-tight">Laylak Cargo</span>
          </div>
          <div className="max-w-lg">
            <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight">Kunlik kassa va hisobotlar — barcha xodimlar uchun yagona bazada.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">Har bir toʻlov serverda saqlanadi va barcha qurilmalarda bir zumda koʻrinadi. Naqd va karta tushumi, xodimlar koʻrsatkichlari va mijozlar tarixi bir joyda.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <ShieldCheck className="size-4" /> Himoyalangan kirish va rollar nazorati
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <form onSubmit={submit} className="w-full max-w-sm anim-rise" noValidate>
          <div className="mb-8 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-fg">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 5v14h11" /></svg>
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{needsSetup ? 'Tizimni sozlash' : 'Tizimga kirish'}</h1>
          <p className="mt-1.5 text-sm text-ink-3">
            {needsSetup ? 'Birinchi administrator akkauntini yarating. Qolgan xodimlarni keyin admin qoʻshadi.' : 'Laylak Cargo Kassa — xodimlar uchun'}
          </p>

          <div className="mt-7 space-y-4">
            {needsSetup && !setupKeyConfigured && (
              <Alert tone="warn">Serverda <b>ADMIN_SETUP_KEY</b> oʻzgaruvchisi sozlanmagan. Uni Vercel → Settings → Environment Variables boʻlimiga qoʻshing va qayta deploy qiling.</Alert>
            )}
            {needsSetup && (
              <>
                <Field label="Sozlash kaliti" htmlFor="setupKey" hint="Vercel’dagi ADMIN_SETUP_KEY qiymati">
                  <Input id="setupKey" type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} autoComplete="off" />
                </Field>
                <Field label="Ism familiya" htmlFor="fullName">
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Masalan, Asliddin Nurdinov" />
                </Field>
              </>
            )}
            <Field label="Login" htmlFor="username">
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="login" />
            </Field>
            <Field label="Parol" htmlFor="password">
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={needsSetup ? 'new-password' : 'current-password'} className="pr-10" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Parolni yashirish' : 'Parolni koʻrsatish'}
                  className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:text-ink">
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} icon={<Lock className="size-4" />}>
              {needsSetup ? 'Admin akkauntini yaratish' : 'Kirish'}
            </Button>
          </div>
          {!needsSetup && <p className="mt-6 text-center text-xs text-ink-3">Akkaunt yoʻqmi? Login va parolni administrator beradi.</p>}
        </form>
      </div>
    </div>
  );
}
