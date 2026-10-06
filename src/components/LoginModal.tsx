import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, Truck, User } from 'lucide-react';

type AuthResult = { success: boolean; error?: string };

interface LoginModalProps {
  onLogin: (email: string, password: string) => Promise<AuthResult>;
  onRegister: (email: string, name: string, password: string) => Promise<AuthResult>;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin, onRegister }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = isRegistering
        ? await onRegister(email.trim().toLowerCase(), name.trim(), password)
        : await onLogin(email.trim().toLowerCase(), password);
      if (!result.success) setError(result.error || 'Kirish amalga oshmadi. Ma’lumotlarni tekshiring.');
    } catch {
      setError('Ulanishda xatolik. Internetni tekshirib, qayta urinib ko‘ring.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mx-auto text-slate-950">
            <Truck className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Laylak <span className="text-amber-400">Cargo</span> Kassa</h1>
          <p className="text-xs text-slate-400">Hisobotlaringiz akkauntingizda saqlanadi va qurilmalar orasida sinxronlanadi.</p>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {isRegistering && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Ism</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Ismingiz" required className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Parol</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegistering ? 'new-password' : 'current-password'} placeholder="Parolni kiriting" minLength={8} required className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="p-1.5 text-slate-400 hover:text-slate-200 absolute right-3 top-2.5" aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button disabled={isSubmitting} type="submit" className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-60 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2">
            <span>{isSubmitting ? 'KUTILMOQDA…' : isRegistering ? 'AKKAUNT OCHISH' : 'TIZIMGA KIRISH'}</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          {isRegistering ? 'Akkauntingiz bormi?' : 'Birinchi marta kirdingizmi?'}{' '}
          <button type="button" onClick={() => { setIsRegistering((value) => !value); setError(null); }} className="text-amber-400 hover:text-amber-300 font-bold">
            {isRegistering ? 'Kirish' : 'Akkaunt ochish'}
          </button>
        </div>

        <div className="pt-2 border-t border-slate-800/80 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Ma’lumotlar faqat shu email akkauntiga tegishli bo‘ladi.</span>
        </div>
      </div>
    </div>
  );
};
