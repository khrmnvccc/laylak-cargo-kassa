import React, { useState } from 'react';
import {
  Truck,
  Search,
  FileSpreadsheet,
  LogOut,
  History,
  Sun,
  Moon,
  RotateCw,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import { formatMoney, formatDateUz } from '../utils/formatters';
import { ActiveTab, UserSession } from '../types';
import { storage } from '../services/storage';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  kassaBalance: number;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  openQuickAdd: () => void;
  openExcelModal: () => void;
  user: UserSession;
  onLogout: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  kassaBalance,
  selectedDate,
  setSelectedDate,
  openQuickAdd,
  openExcelModal,
  user,
  onLogout,
  theme,
  onToggleTheme,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReportsMenuOpen, setIsReportsMenuOpen] = useState(false);

  const selectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsReportsMenuOpen(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await storage.fetchServerData();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2 sm:gap-2.5 text-left group transition-transform active:scale-95"
            >
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black flex-shrink-0">
                <Truck className="w-4.5 h-4.5 sm:w-6 sm:h-6 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base sm:text-xl tracking-tight text-white whitespace-nowrap">
                    Laylak <span className="text-amber-400">Cargo</span>
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider hidden xs:inline-block">
                    Kassa
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                  Hisobot & Kassa Boshqaruvi
                </p>
              </div>
            </button>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80">
            <button
              onClick={() => selectTab('dashboard')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Bosh sahifa
            </button>

            {/* Kassa - FAQAT BOSH ADMINLAR UCHUN */}
            {user.role === 'admin' && (
              <button
                onClick={() => selectTab('kassa')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'kassa'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                Kassa
              </button>
            )}

            <button
              onClick={() => selectTab('reports')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'reports'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Otchyotlar
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsReportsMenuOpen((open) => !open)}
                aria-expanded={isReportsMenuOpen}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  ['cashCard', 'decade', 'monthly', 'expenses'].includes(activeTab)
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Tahlillar
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isReportsMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {isReportsMenuOpen && (
                <div className="absolute left-0 top-full mt-2 w-52 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
                  {([
                    ['cashCard', 'Naqd / Karta'],
                    ['decade', '10 kunlik hisobot'],
                    ['monthly', 'Oylik hisobot'],
                    ['expenses', 'Xarajatlar'],
                  ] as [ActiveTab, string][]).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => selectTab(tab)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                        activeTab === tab
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Live Kassa Badge - FAQAT BOSH ADMIN UCHUN KORINADI */}
            {user.role === 'admin' && (
              <>
                {/* Desktop Version */}
                <div
                  onClick={() => setActiveTab('kassa')}
                  className="hidden sm:flex cursor-pointer group items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 hover:border-amber-500/50 transition-all hover:bg-slate-800 shadow-sm"
                  title="Kassadagi ayni damdagi qoldiq (Kassaga o'tish)"
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50 flex-shrink-0" />
                  <div className="text-right whitespace-nowrap">
                    <span className="text-[10px] text-slate-400 font-medium block leading-none">
                      Kassa qoldiq
                    </span>
                    <span className={`text-xs sm:text-sm font-black font-mono-num leading-tight ${kassaBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {formatMoney(kassaBalance)}
                    </span>
                  </div>
                </div>

                {/* Mobile Phone Version */}
                <div
                  onClick={() => setActiveTab('kassa')}
                  className="sm:hidden cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/50 active:scale-95 transition-all shadow-sm"
                  title="Kassa balansi"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span className={`text-xs font-black font-mono-num whitespace-nowrap leading-none ${kassaBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatMoney(kassaBalance)}
                  </span>
                </div>
              </>
            )}

            {/* Real-time server sync badge */}
            <div
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 text-[11px] font-medium"
              title="Barcha telefonlar bilan markaziy server orqali real-vaqt sinxronizatsiya"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-slate-300 font-medium">Onlayn baza</span>
            </div>

            {/* Quick Live Refresh Button for all devices */}
            <button
              onClick={handleRefresh}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 hover:border-amber-500/40 text-slate-300 hover:text-amber-400 transition-all active:scale-95 shadow-sm"
              title="Bulutli baza bilan yangilash (Sinxronizatsiya)"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            </button>


            {/* Theme Toggle Button (Yorug' / Qorong'i rejim) */}
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 hover:border-amber-500/40 text-slate-300 hover:text-amber-400 transition-all active:scale-95 shadow-sm"
              title={theme === 'dark' ? "Yorug' interfeysga o'tish" : "Qorong'i interfeysga o'tish"}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-500" />
              )}
            </button>

            {/* Excel Button (Desktop/Tablet) */}
            <button
              onClick={openExcelModal}
              className="hidden sm:flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all active:scale-95 shadow-sm"
              title="Excel Import & Export"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Excel</span>
            </button>

            {/* History / Audit Log Quick Icon (FAQAT BOSH ADMIN, Desktop/Tablet) */}
            {user.role === 'admin' && (
              <button
                onClick={() => setActiveTab('auditLog')}
                className={`hidden md:flex p-2 rounded-xl border transition-all active:scale-95 ${
                  activeTab === 'auditLog'
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
                }`}
                title="Harakatlar tarixi (Faqat Bosh Admin)"
              >
                <History className="w-4 h-4" />
              </button>
            )}

            {/* Search Button */}
            <button
              onClick={() => setActiveTab('search')}
              className={`p-2 rounded-xl border transition-all active:scale-95 ${
                activeTab === 'search'
                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="ID yoki sana bo'yicha qidirish"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Quick Add Button (Desktop) */}
            <button
              onClick={openQuickAdd}
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-95"
            >
              <span>+ Yangi hisobot</span>
            </button>

            {/* Active User Account Badge with Quick Switch / Logout */}
            <div className="flex items-center gap-1.5 pl-1">
              <button
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 hover:border-amber-500/40 transition-all active:scale-95 text-left"
                title={`${user.name || user.username} - Profil va sozlamalar`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[11px] text-slate-950 flex-shrink-0 ${
                    user.role === 'admin' ? 'bg-amber-400' : 'bg-blue-400'
                  }`}
                >
                  {(user.name || user.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block leading-tight max-w-[120px] truncate">
                  <div className="text-xs font-bold text-white truncate">
                    {user.name || user.username}
                  </div>
                  <div className="text-[10px] flex items-center gap-1">
                    <span
                      className={`font-bold ${
                        user.role === 'admin' ? 'text-amber-400' : 'text-blue-400'
                      }`}
                    >
                      {user.role === 'admin' ? 'Bosh Admin' : 'Kassir'}
                    </span>
                  </div>
                </div>
              </button>

              <button
                onClick={onLogout}
                className="p-2 rounded-xl bg-slate-800/60 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 transition-all active:scale-95"
                title={`Akkauntdan chiqish (@${user.username})`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
