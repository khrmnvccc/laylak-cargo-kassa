import React, { useState } from 'react';
import {
  Truck,
  Lock,
  User,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { UserAccount } from '../types';

interface LoginModalProps {
  onLogin: (username: string, password: string) => { success: boolean; error?: string };
  onRegister: (data: {
    username: string;
    name: string;
    password: string;
    role?: 'admin' | 'kassir';
  }) => { success: boolean; error?: string };
  accounts: UserAccount[];
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onLogin,
  onRegister,
  accounts,
}) => {
  // If no admin account exists yet in the database, allow the owner a 1-time setup.
  // Once created, public registration is PERMANENTLY LOCKED.
  const isInitialSetupNeeded = accounts.length === 0;

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Initial setup state (only seen once by the owner on blank system)
  const [setupName, setSetupName] = useState('Asliddin Nurdinov');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');

  const [error, setError] = useState<string | null>(null);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = onLogin(username, password);
    if (!result.success) {
      setError(result.error || 'Login yoki parol notoʻgʻri!');
    }
  };

  const handleInitialSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = setupUsername.trim().toLowerCase();
    if (!cleanUser || cleanUser.length < 3) {
      setError('Login kamida 3 ta belgidan iborat boʻlishi kerak!');
      return;
    }
    if (!setupPassword || setupPassword.length < 4) {
      setError('Parol kamida 4 ta belgidan iborat boʻlishi kerak!');
      return;
    }
    if (setupPassword !== setupConfirm) {
      setError('Kiritilgan parollar bir-biriga mos kelmadi!');
      return;
    }

    const result = onRegister({
      name: setupName.trim() || 'Bosh Administrator',
      username: cleanUser,
      password: setupPassword,
      role: 'admin',
    });

    if (!result.success) {
      setError(result.error || 'Akkaunt yaratishda xatolik yuz berdi!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mx-auto shadow-xl shadow-amber-500/20 text-slate-950 font-black">
            <Truck className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight pt-1">
            Laylak <span className="text-amber-400">Cargo</span> Kassa
          </h1>
          <p className="text-xs text-slate-400">
            Shaxsiy yopiq tizim. Faqat ruxsat berilgan xodimlar uchun.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* --- CASE 1: STRICT LOGIN FORM (When admin account is configured) --- */}
        {!isInitialSetupNeeded && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Login
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Loginingizni kiriting"
                  className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Parol
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Parolni kiriting"
                  className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 absolute right-3 top-2.5"
                  title={showPassword ? 'Yashirish' : 'Koʻrsatish'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 pt-3"
            >
              <span>TIZIMGA KIRISH</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
            <div className="pt-2 text-center text-[11px] text-slate-400 bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/60">
              <span className="text-amber-400 font-bold">Standart kirish:</span> Login: <span className="text-amber-300 font-mono font-semibold">admin</span> (yoki <span className="text-amber-300 font-mono font-semibold">asliddin</span>) • Parol: <span className="text-amber-300 font-mono font-semibold">admin</span>
            </div>
          </form>
        )}

        {/* --- CASE 2: ONLY ON VERY FIRST VISIT (Set owner's master login & password) --- */}
        {isInitialSetupNeeded && (
          <form onSubmit={handleInitialSetupSubmit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Tizim egasi uchun dastlabki sozlash</span>
                <span className="text-[11px] text-amber-200/80">
                  Oʻzingiz uchun shaxsiy login va parol oʻrnating. Shundan soʻng tizim yopiladi va boshqa hech kim roʻyxatdan oʻta olmaydi.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Ism va familiyangiz
              </label>
              <input
                type="text"
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                placeholder="Masalan: Asliddin Nurdinov"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Oʻzingizga qulay yangi Login
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="masalan: asliddin yoki laylak"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-amber-500 transition-colors"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Parol
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Kamida 4 belgi"
                    className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-200 absolute right-2 top-2"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Parolni tasdiqlang
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={setupConfirm}
                    onChange={(e) => setSetupConfirm(e.target.value)}
                    placeholder="Qayta yozing"
                    className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 pt-3"
            >
              <span>PAROLNI SAQLASH VA TIZIMNI QULFLASH</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>
          </form>
        )}

        <div className="pt-2 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Begonalar uchun roʻyxatdan oʻtish yopiq</span>
          </p>
        </div>
      </div>
    </div>
  );
};
