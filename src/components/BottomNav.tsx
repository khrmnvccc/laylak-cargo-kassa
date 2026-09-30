import React, { useState } from 'react';
import {
  LayoutDashboard,
  Wallet,
  Plus,
  FileText,
  Menu,
  CreditCard,
  Calendar,
  Layers,
  Search,
  Settings,
  X,
  Receipt,
  FileSpreadsheet,
  History,
} from 'lucide-react';
import { ActiveTab, UserSession } from '../types';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  openQuickAdd: () => void;
  openExcelModal: () => void;
  user: UserSession;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  openQuickAdd,
  openExcelModal,
  user,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const selectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setShowMoreMenu(false);
  };

  return (
    <>
      {/* "More" Drawer for Mobile */}
      {showMoreMenu && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm md:hidden flex flex-col justify-end animate-in fade-in duration-200"
          onClick={() => setShowMoreMenu(false)}
        >
          <div
            className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-8 shadow-2xl max-w-lg mx-auto w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">Barcha boʻlimlar</span>
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">Laylak Cargo</span>
              </div>
              <button
                onClick={() => setShowMoreMenu(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => selectTab('cashCard')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  activeTab === 'cashCard'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold">Naqd / Karta</div>
                  <div className="text-[10px] text-slate-400">Kunlik taqsimot</div>
                </div>
              </button>

              <button
                onClick={() => selectTab('decade')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  activeTab === 'decade'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold">10 kunlik</div>
                  <div className="text-[10px] text-slate-400">Dekada hisoboti</div>
                </div>
              </button>

              <button
                onClick={() => selectTab('monthly')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  activeTab === 'monthly'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold">Oylik hisobot</div>
                  <div className="text-[10px] text-slate-400">Oylar arxivi</div>
                </div>
              </button>

              <button
                onClick={() => selectTab('expenses')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  activeTab === 'expenses'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold">Xarajatlar</div>
                  <div className="text-[10px] text-slate-400">Tovar, paket, ijara</div>
                </div>
              </button>

              <button
                onClick={() => selectTab('search')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  activeTab === 'search'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold">ID Qidirish</div>
                  <div className="text-[10px] text-slate-400">101111 va boshqalar</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  openExcelModal();
                }}
                className="flex items-center gap-3 p-3 rounded-xl border bg-emerald-950/40 border-emerald-500/30 text-emerald-200 hover:bg-emerald-900/40 text-left transition-all"
              >
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold">Excel Import/Export</div>
                  <div className="text-[10px] text-emerald-400/80">XLSX yuklash/olish</div>
                </div>
              </button>

              {user.role === 'admin' && (
                <button
                  onClick={() => selectTab('auditLog')}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    activeTab === 'auditLog'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">Harakatlar tarixi</div>
                    <div className="text-[10px] text-slate-400">Audit jurnali</div>
                  </div>
                </button>
              )}

              <button
                onClick={() => selectTab('settings')}
                className={`col-span-2 flex items-center justify-center gap-2 p-3 rounded-xl border text-center transition-all ${
                  activeTab === 'settings'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="text-xs font-semibold">Tizim Sozlamalari</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Bottom Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 md:hidden px-3 py-2">
        <div className="max-w-md mx-auto flex items-center justify-between">
          {/* Dashboard */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              activeTab === 'dashboard' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-semibold">Bosh sahifa</span>
          </button>

          {/* Kassa (Faqat Bosh Admin) yoki Naqd/Karta (Kassir uchun) */}
          {user.role === 'admin' ? (
            <button
              onClick={() => setActiveTab('kassa')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                activeTab === 'kassa' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wallet className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-semibold">Kassa</span>
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('cashCard')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                activeTab === 'cashCard' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CreditCard className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-semibold">Naqd/Karta</span>
            </button>
          )}

          {/* Big Add Button */}
          <div className="flex-1 flex justify-center -mt-5">
            <button
              onClick={openQuickAdd}
              aria-label="Yangi yozuv qo'shish"
              className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 flex items-center justify-center shadow-xl shadow-amber-500/30 transition-transform active:scale-90 border-2 border-slate-900"
            >
              <Plus className="w-7 h-7 stroke-[2.5]" />
            </button>
          </div>

          {/* Otchyotlar */}
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              activeTab === 'reports' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-semibold">Otchyotlar</span>
          </button>

          {/* More Menu */}
          <button
            onClick={() => setShowMoreMenu(true)}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              ['cashCard', 'decade', 'monthly', 'expenses', 'search', 'settings'].includes(activeTab)
                ? 'text-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Menu className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-semibold">Menyu</span>
          </button>
        </div>
      </nav>
    </>
  );
};
