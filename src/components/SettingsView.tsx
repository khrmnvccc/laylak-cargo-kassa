import React, { useState } from 'react';
import {
  Settings,
  ShieldCheck,
  UserPlus,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  Database,
  Lock,
  HardDrive,
  Users,
  Sun,
  Moon,
  Palette,
} from 'lucide-react';
import { UserSession, UserAccount } from '../types';
import { storage } from '../services/storage';

interface SettingsViewProps {
  user: UserSession;
  onUpdateUser: (u: UserSession) => void;
  onLogout: () => void;
  onResetData: () => void;
  onClearData: () => void;
  reportsCount: number;
  kassaCount: number;
  expensesCount: number;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  onLogout,
  onResetData,
  onClearData,
  reportsCount,
  kassaCount,
  expensesCount,
  theme,
  onToggleTheme,
}) => {
  // Accounts state
  const [accounts, setAccounts] = useState<UserAccount[]>(storage.getAccounts());
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);

  // Edit current profile state
  const [editName, setEditName] = useState(user.name);
  const [editUsername, setEditUsername] = useState(user.username);
  const [editPassword, setEditPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // New account form state
  const [newAccName, setNewAccName] = useState('');
  const [newAccUsername, setNewAccUsername] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccRole, setNewAccRole] = useState<'admin' | 'kassir'>('kassir');
  const [newAccMsg, setNewAccMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const handleUpdateCurrentProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);

    const currentAcc = accounts.find(
      (a) => a.username.toLowerCase() === user.username.toLowerCase()
    );

    if (currentAcc) {
      const res = storage.updateAccount(currentAcc.id, {
        name: editName.trim(),
        username: editUsername.trim().toLowerCase(),
        password: editPassword.trim() ? editPassword.trim() : undefined,
      });

      if (!res.success) {
        setProfileMsg({ text: res.error || 'Xatolik yuz berdi!', isError: true });
        return;
      }
    } else {
      storage.register({
        name: editName.trim(),
        username: editUsername.trim().toLowerCase(),
        password: editPassword.trim() || '123456',
        role: user.role,
      });
    }

    setAccounts(storage.getAccounts());
    onUpdateUser(storage.getUser());
    setProfileMsg({ text: 'Maʻlumotlaringiz muvaffaqiyatli saqlandi!' });
    setEditPassword('');
    setTimeout(() => setProfileMsg(null), 3500);
  };

  const handleCreateNewAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setNewAccMsg(null);

    if (!newAccUsername.trim()) {
      setNewAccMsg({ text: 'Login kiritilishi shart!', isError: true });
      return;
    }
    if (!newAccPassword || newAccPassword.length < 4) {
      setNewAccMsg({ text: 'Parol kamida 4 belgidan iborat boʻlishi kerak!', isError: true });
      return;
    }

    const res = storage.register({
      name: newAccName.trim() || newAccUsername.trim(),
      username: newAccUsername.trim(),
      password: newAccPassword,
      role: newAccRole,
    });

    if (!res.success) {
      setNewAccMsg({ text: res.error || 'Akkaunt yaratilmadi!', isError: true });
      return;
    }

    setAccounts(storage.getAccounts());
    setNewAccMsg({ text: 'Yangi akkaunt muvaffaqiyatli qoʻshildi!' });
    setNewAccName('');
    setNewAccUsername('');
    setNewAccPassword('');
    setIsAddAccountOpen(false);
    setTimeout(() => setNewAccMsg(null), 3500);
  };

  const handleDeleteAccount = (id: string, username: string) => {
    if (window.confirm(`Haqiqatan ham @${username} akkauntini oʻchirmoqchimisiz?`)) {
      const res = storage.deleteAccount(id);
      if (!res.success) {
        alert(res.error || 'Akkauntni oʻchirib boʻlmadi!');
      } else {
        setAccounts(storage.getAccounts());
      }
    }
  };

  // Export full JSON backup
  const handleExportBackup = () => {
    const backupData = {
      reports: storage.getReports(),
      kassa: storage.getKassaRecords(),
      expenses: storage.getExpenses(),
      logs: storage.getLogs(),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laylak-cargo-kassa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (parsed.reports && parsed.kassa) {
          storage.importBulk(parsed.reports, parsed.kassa);
          alert('Zaxira nusxa muvaffaqiyatli yuklandi!');
          window.location.reload();
        } else {
          alert('Fayl formati notoʻgʻri!');
        }
      } catch (err) {
        alert('Faylni oʻqishda xatolik yuz berdi!');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Tizim Sozlamalari</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Shaxsiy akkauntlar, xavfsizlik, xodimlar boshqaruvi va maʻlumotlar xotirasi
            </p>
          </div>
        </div>
      </div>

      {/* Interfeys Mavzusi (Theme: Qorong'i / Yorug') */}
      <div className="p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Interfeys Koʻrinishi (Mavzu)</h3>
            <p className="text-xs text-slate-400">
              Qorongʻi (Dark) yoki Yorugʻ (Light) rejimni tanlang
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-800/80 border border-slate-700/80">
          <button
            type="button"
            onClick={() => {
              if (theme === 'light' && onToggleTheme) onToggleTheme();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              theme === 'dark' || !theme
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>Qorongʻi rejim</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (theme === 'dark' && onToggleTheme) onToggleTheme();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              theme === 'light'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>Yorugʻ rejim</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. AKKAUNTLAR VA XAVFSIZLIK */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-white text-base">Akkauntlar & Xavfsizlik</h2>
                <p className="text-xs text-slate-400">Login, parol va xodimlarni boshqarish</p>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all active:scale-95"
              title="Tizimdan chiqish"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Chiqish</span>
            </button>
          </div>

          {/* Active Profile Card */}
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-750 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-lg border border-amber-500/30">
                {(user.name || 'A').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{user.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30 uppercase">
                    {user.role === 'admin' ? 'Bosh Admin' : 'Kassir'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Login: <span className="text-amber-400 font-bold">@{user.username}</span>
                </div>
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              Faol
            </span>
          </div>

          {/* Edit current profile form */}
          <form onSubmit={handleUpdateCurrentProfile} className="space-y-3 pt-1">
            <span className="block text-xs font-bold text-slate-300">
              Oʻz maʻlumotlaringizni yangilash:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Ism va familiya</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ism..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Login</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="Login..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Yangi Parol (agar almashtirmoqchi boʻlsangiz)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Yangi parol (boʻsh qoldirilsa avvalgi parol qoladi)"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors whitespace-nowrap"
                >
                  Saqlash
                </button>
              </div>
            </div>

            {profileMsg && (
              <p
                className={`text-xs font-medium flex items-center gap-1.5 ${
                  profileMsg.isError ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {profileMsg.isError ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>{profileMsg.text}</span>
              </p>
            )}
          </form>

          {/* List of Registered Accounts - FAQAT BOSH ADMIN UCHUN */}
          {user.role === 'admin' && (
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ruxsat berilgan xodimlar ({accounts.length} ta):</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddAccountOpen(!isAddAccountOpen)}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Yangi xodim qoʻshish</span>
                </button>
              </div>

              {/* Collapsible Add Account Form */}
              {isAddAccountOpen && (
                <form
                  onSubmit={handleCreateNewAccount}
                  className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 animate-in fade-in"
                >
                  <span className="text-xs font-bold text-amber-400 block">
                    Yangi xodim akkauntini ochish:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Xodim ismi..."
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Logini (masalan: kassir1)..."
                      value={newAccUsername}
                      onChange={(e) => setNewAccUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="password"
                      placeholder="Parol (kamida 4 belgi)..."
                      value={newAccPassword}
                      onChange={(e) => setNewAccPassword(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
                      required
                    />
                    <select
                      value={newAccRole}
                      onChange={(e) => setNewAccRole(e.target.value as 'admin' | 'kassir')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
                    >
                      <option value="kassir">Kassir / Operator</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddAccountOpen(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                    >
                      Qoʻshish
                    </button>
                  </div>
                  {newAccMsg && (
                    <p
                      className={`text-xs ${
                        newAccMsg.isError ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {newAccMsg.text}
                    </p>
                  )}
                </form>
              )}

              {/* Accounts List */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center font-bold text-white text-[11px]">
                        {acc.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{acc.name}</span>
                          {acc.username === user.username && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                              Siz
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          @{acc.username} • {acc.role === 'admin' ? 'Bosh Admin' : 'Kassir'}
                        </div>
                      </div>
                    </div>

                    {accounts.length > 1 && acc.username !== user.username && (
                      <button
                        onClick={() => handleDeleteAccount(acc.id, acc.username)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                        title="Akkauntni oʻchirish"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. KASSA VA TIZIM XOTIRASI - FAQAT BOSH ADMINLAR UCHUN */}
        {user.role === 'admin' ? (
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-white text-base">Kassa Xotirasi & Zaxira</h2>
                <p className="text-xs text-slate-400">Maʻlumotlar hajmi va xavfsiz nusxalash</p>
              </div>
            </div>

          {/* Database stats */}
          <div className="space-y-2">
            <span className="text-xs text-slate-400 font-medium block">
              Tizimdagi yozuvlar miqdori:
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block mb-1">Otchyotlar</span>
                <span className="text-base font-bold font-mono text-white">{reportsCount} ta</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block mb-1">Kassa amallari</span>
                <span className="text-base font-bold font-mono text-white">{kassaCount} ta</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-800 text-center">
                <span className="text-[11px] text-slate-400 block mb-1">Xarajatlar</span>
                <span className="text-base font-bold font-mono text-white">{expensesCount} ta</span>
              </div>
            </div>
          </div>

          {/* Backup export & import */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <span className="text-xs font-bold text-slate-300 block">
              Zaxira nusxa (Backup) boshqaruvi:
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Barcha kassa hisobotlarini kompyuteringizga yoki telefoningizga zaxira fayl (JSON) koʻrinishida yuklab olishingiz va kerak boʻlganda qayta tiklashingiz mumkin.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Zaxirani yuklab olish</span>
              </button>

              <label className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zaxirani tiklash</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Reset / Clear Buttons */}
          <div className="pt-2 space-y-2">
            <span className="text-xs text-slate-400 font-medium block">
              Xotirani boshqarish:
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (window.confirm('Haqiqatan ham namuna maʻlumotlarni qayta yuklamoqchimisiz?')) {
                    onResetData();
                  }
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Namunani tiklash</span>
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Barcha hisobot va kassa maʻlumotlarini tozalashni tasdiqlaysizmi?')) {
                    onClearData();
                  }
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xotirani tozalash</span>
              </button>
            </div>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
};
