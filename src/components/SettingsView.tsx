import React from 'react';
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
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { UserSession } from '../types';
import { storage } from '../services/storage';

interface SettingsViewProps {
  user: UserSession;
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
  onLogout,
  onResetData,
  onClearData,
  reportsCount,
  kassaCount,
  expensesCount,
  theme,
  onToggleTheme,
}) => {
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
        {/* Account security is managed by Neon Auth; do not store or display passwords in app data. */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400"><ShieldCheck className="w-5 h-5" /></div>
              <div>
                <h2 className="font-bold text-white text-base">Akkaunt va xavfsizlik</h2>
                <p className="text-xs text-slate-400">Email orqali himoyalangan kirish</p>
              </div>
            </div>
            <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/30 text-rose-300 text-xs font-bold">
              <LogOut className="w-3.5 h-3.5" /><span>Chiqish</span>
            </button>
          </div>
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-lg border border-amber-500/30">{(user.name || 'A').charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{user.name}</div>
              <div className="text-xs text-amber-400 font-mono mt-0.5 truncate">{user.username}</div>
            </div>
            <span className="ml-auto text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">Faol</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">Parol va akkauntni tiklash Neon Auth tomonidan boshqariladi. Bu sayt parolingizni o‘z bazasida saqlamaydi.</p>
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
