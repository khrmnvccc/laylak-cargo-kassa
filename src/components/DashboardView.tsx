import React from 'react';
import {
  Wallet,
  Coins,
  CreditCard,
  Truck,
  Hash,
  Calendar,
  TrendingUp,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ChevronRight,
  FileSpreadsheet,
  Plus,
  Search,
  Activity,
  Package,
} from 'lucide-react';
import {
  formatMoney,
  formatNumber,
  formatDateUz,
} from '../utils/formatters';
import {
  ReportRecord,
  CashRecord,
  ExpenseRecord,
  DecadeSummary,
  ActiveTab,
} from '../types';

interface DashboardViewProps {
  stats: {
    selectedDate: string;
    bugungiUmumiyKassa: number;
    bugungiNaqd: number;
    bugungiKarta: number;
    bugungiYandex: number;
    bugungiPochta: number;
    bugungiReyslar: number;
    bugungiIdlarSoni: number;
    kassadagiQoldiq: number;
    bugungiKassaTushum: number;
    bugungiXarajat: number;
    shuOyJamiTushum: number;
    shuOyJamiReyslar: number;
    shuOyJamiXarajat: number;
    shuOyOxiridagiKassa: number;
    decade10KunlikKassa: number;
    decade10KunlikReyslar: number;
    currentDecadeLabel: string;
  };
  reports: ReportRecord[];
  kassa: CashRecord[];
  decadeSummaries: DecadeSummary[];
  setActiveTab: (tab: ActiveTab) => void;
  openQuickAdd: () => void;
  openExcelModal: () => void;
  onEditReport: (report: ReportRecord) => void;
  onDeleteReport: (id: string) => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  userRole?: 'admin' | 'kassir';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  reports,
  kassa,
  decadeSummaries,
  setActiveTab,
  openQuickAdd,
  openExcelModal,
  onEditReport,
  onDeleteReport,
  selectedDate,
  setSelectedDate,
  userRole = 'admin',
}) => {
  // Recent 5 reports
  const recentReports = reports.slice(0, 5);

  // Recent 5 kassa records
  const recentKassa = kassa.slice(0, 5);

  // Distribution percentages for payment methods
  const paymentTotal = stats.bugungiNaqd + stats.bugungiKarta + stats.bugungiYandex + stats.bugungiPochta;
  const pCash = paymentTotal > 0 ? Math.round((stats.bugungiNaqd / paymentTotal) * 100) : 0;
  const pCard = paymentTotal > 0 ? Math.round((stats.bugungiKarta / paymentTotal) * 100) : 0;
  const pYandex = paymentTotal > 0 ? Math.round((stats.bugungiYandex / paymentTotal) * 100) : 0;
  const pPochta = paymentTotal > 0 ? Math.round((stats.bugungiPochta / paymentTotal) * 100) : 0;

  // Last 7 days trend data from reports
  const last7DaysMap = new Map<string, { total: number; trips: number; cash: number; card: number }>();
  reports.slice(0, 30).forEach((r) => {
    const prev = last7DaysMap.get(r.date) || { total: 0, trips: 0, cash: 0, card: 0 };
    last7DaysMap.set(r.date, {
      total: prev.total + r.total,
      trips: prev.trips + r.tripsCount,
      cash: prev.cash + r.cash,
      card: prev.card + r.card,
    });
  });

  const trendDays = Array.from(last7DaysMap.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .slice(-7);

  const maxTrendTotal = Math.max(...trendDays.map((d) => d[1].total), 1);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner / Date filter quick bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Boshqaruv Paneli
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            Tanlangan sana hisoboti:{' '}
            <span className="text-amber-400 font-bold font-mono-num">
              {formatDateUz(selectedDate)}
            </span>
          </p>
        </div>

        {/* Date Selector & Action buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs sm:text-sm font-semibold focus:outline-none focus:border-amber-500 transition-colors shadow-inner"
          />

          <button
            onClick={openQuickAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Yangi hisobot</span>
          </button>
        </div>
      </div>

      {/* LAYLAK CARGO CORE SNAPSHOT - EXACT FORMAT REQUESTED BY USER:
          KASSA: 916 600 so'm | BUGUNGI TUSHUM: 505 000 | BUGUNGI XARAJAT: 0
          NAQD: 102 000 | KARTA: 917 400 | UMUMIY: 1 019 400 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {/* 1. KASSA QOLDIQ (FAQAT BOSH ADMIN) YOKI BUGUNGI JAMI OTCHYOT (KASSIR UCHUN) */}
        {userRole === 'admin' ? (
          <div
            onClick={() => setActiveTab('kassa')}
            className="cursor-pointer group col-span-2 sm:col-span-1 lg:col-span-2 p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/40 hover:border-amber-400 transition-all shadow-xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Wallet className="w-20 h-20 text-amber-400" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-amber-400 tracking-wider uppercase flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-amber-400" />
                Kassadagi Qoldiq
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                Ayni damda
              </span>
            </div>
            <div
              className={`text-2xl sm:text-3xl font-black font-mono-num tracking-tight mt-1 ${
                stats.kassadagiQoldiq < 0 ? 'text-rose-400' : 'text-white'
              }`}
            >
              {formatMoney(stats.kassadagiQoldiq)}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-medium">
              <span>Laylak Cargo kassa zanjiridagi joriy qoldiq</span>
              <ChevronRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-1 transition-transform" />
            </p>
          </div>
        ) : (
          <div
            onClick={() => setActiveTab('reports')}
            className="cursor-pointer group col-span-2 sm:col-span-1 lg:col-span-2 p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 hover:border-amber-400 transition-all shadow-xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Truck className="w-20 h-20 text-amber-400" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-amber-400 tracking-wider uppercase flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-amber-400" />
                Bugungi Jami Otchyot
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                {stats.bugungiReyslar} ta reys
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono-num tracking-tight mt-1 text-white">
              {formatMoney(stats.bugungiUmumiyKassa)}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-medium">
              <span>Kunlik qabul qilingan reyslar hisoboti</span>
              <ChevronRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-1 transition-transform" />
            </p>
          </div>
        )}

        {/* 2. BUGUNGI TUSHUM */}
        <div className="p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              Bugungi tushum
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono-num text-emerald-400">
            {formatMoney(stats.bugungiKassaTushum || stats.bugungiUmumiyKassa)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1">Kassa / Otchyot</span>
        </div>

        {/* 3. BUGUNGI XARAJAT */}
        <div className="p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
              Bugungi xarajat
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono-num text-rose-400">
            {formatMoney(stats.bugungiXarajat)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1">Tovarga, paketga</span>
        </div>

        {/* 4. NAQD TUSHUM */}
        <div className="p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" />
              Naqd
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono-num text-emerald-300">
            {formatMoney(stats.bugungiNaqd)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1">{pCash}% ulush</span>
        </div>

        {/* 5. KARTA TUSHUMI */}
        <div className="p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />
              Karta
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono-num text-blue-400">
            {formatMoney(stats.bugungiKarta)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1">{pCard}% ulush</span>
        </div>
      </div>

      {/* DETAILED STATS GRID - 8 MAIN CARDS FROM USER SPECIFICATION:
          💰 Bugungi umumiy kassa
          💵 Bugungi naqd
          💳 Bugungi karta
          🟢 Yandex
          📦 Pochta
          🚕 Bugungi reyslar
          📊 Bugungi IDlar soni
          📅 Shu oy jami
          📈 10 kunlik kassa */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* 💰 Bugungi umumiy kassa */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">💰 Bugungi umumiy kassa</span>
            <span className="text-lg font-black font-mono-num text-amber-400">
              {formatMoney(stats.bugungiUmumiyKassa)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* 🟢 Yandex */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">🟢 Yandex tushum</span>
            <span className="text-lg font-black font-mono-num text-emerald-400">
              {formatMoney(stats.bugungiYandex)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 font-black text-xs">
            Y
          </div>
        </div>

        {/* 📦 Pochta */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">📦 Pochta tushum</span>
            <span className="text-lg font-black font-mono-num text-purple-400">
              {formatMoney(stats.bugungiPochta)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* 🚕 Bugungi reyslar */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">🚕 Bugungi reyslar</span>
            <span className="text-lg font-black font-mono-num text-white">
              {formatNumber(stats.bugungiReyslar)} ta
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        {/* 📊 Bugungi IDlar soni */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">📊 Bugungi IDlar</span>
            <span className="text-lg font-black font-mono-num text-white">
              {formatNumber(stats.bugungiIdlarSoni)} ta faol
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Hash className="w-5 h-5" />
          </div>
        </div>

        {/* 📈 10 kunlik kassa */}
        <div
          onClick={() => setActiveTab('decade')}
          className="cursor-pointer group p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all flex items-center justify-between"
        >
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">📈 10 kunlik kassa</span>
            <span className="text-lg font-black font-mono-num text-amber-300">
              {formatMoney(stats.decade10KunlikKassa)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* 📅 Shu oy jami */}
        <div
          onClick={() => setActiveTab('monthly')}
          className="cursor-pointer group p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all flex items-center justify-between"
        >
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">📅 Shu oy jami</span>
            <span className="text-lg font-black font-mono-num text-white">
              {formatMoney(stats.shuOyJamiTushum)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* 📉 Shu oy jami xarajat */}
        <div
          onClick={() => setActiveTab('expenses')}
          className="cursor-pointer group p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-rose-500/40 transition-all flex items-center justify-between"
        >
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">📉 Shu oy xarajat</span>
            <span className="text-lg font-black font-mono-num text-rose-400">
              {formatMoney(stats.shuOyJamiXarajat)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 group-hover:scale-110 transition-transform">
            <Receipt className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. KUNLAR BO'YICHA TUSHUM GRAFIGI */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                Kunlar boʻyicha tushum dinamikasi
              </h2>
              <p className="text-[11px] text-slate-400">Soʻnggi 7 kunlik daromad va reyslar</p>
            </div>
            <span className="text-xs text-amber-400 font-mono-num font-bold">
              {trendDays.length} kun
            </span>
          </div>

          <div className="space-y-3 pt-2">
            {trendDays.map(([date, d]) => {
              const pct = Math.max(8, Math.round((d.total / maxTrendTotal) * 100));
              const isSelected = date === selectedDate;
              return (
                <div
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`cursor-pointer p-2.5 rounded-xl transition-all ${
                    isSelected ? 'bg-amber-500/15 border border-amber-500/40' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-300 font-mono-num">
                      {formatDateUz(date)}
                    </span>
                    <div className="flex items-center gap-2 font-mono-num">
                      <span className="text-slate-400 text-[11px]">{d.trips} reys</span>
                      <span className="font-bold text-amber-400">{formatMoney(d.total)}</span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. TO'LOV TURLARI TAQSIMOTI */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  Toʻlov turlari taqsimoti
                </h2>
                <p className="text-[11px] text-slate-400">Bugungi tushum kanallari</p>
              </div>
              <span className="text-xs text-emerald-400 font-mono-num font-bold">
                {formatMoney(paymentTotal)}
              </span>
            </div>

            {/* Combined progress bar */}
            <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden flex my-4">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${pCash}%` }}
                title={`Naqd: ${pCash}%`}
              />
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${pCard}%` }}
                title={`Karta: ${pCard}%`}
              />
              <div
                className="bg-amber-500 transition-all"
                style={{ width: `${pYandex}%` }}
                title={`Yandex: ${pYandex}%`}
              />
              <div
                className="bg-purple-500 transition-all"
                style={{ width: `${pPochta}%` }}
                title={`Pochta: ${pPochta}%`}
              />
            </div>

            {/* Legend breakdown */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center justify-between text-xs text-emerald-300 mb-1">
                  <span className="font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Naqd pul
                  </span>
                  <span className="font-bold">{pCash}%</span>
                </div>
                <div className="text-sm font-black font-mono-num text-white">
                  {formatMoney(stats.bugungiNaqd)}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center justify-between text-xs text-blue-300 mb-1">
                  <span className="font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    Karta (Plastik)
                  </span>
                  <span className="font-bold">{pCard}%</span>
                </div>
                <div className="text-sm font-black font-mono-num text-white">
                  {formatMoney(stats.bugungiKarta)}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center justify-between text-xs text-amber-300 mb-1">
                  <span className="font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Yandex
                  </span>
                  <span className="font-bold">{pYandex}%</span>
                </div>
                <div className="text-sm font-black font-mono-num text-white">
                  {formatMoney(stats.bugungiYandex)}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center justify-between text-xs text-purple-300 mb-1">
                  <span className="font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    Pochta
                  </span>
                  <span className="font-bold">{pPochta}%</span>
                </div>
                <div className="text-sm font-black font-mono-num text-white">
                  {formatMoney(stats.bugungiPochta)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">Naqd/Karta tahlili sahifasi:</span>
            <button
              onClick={() => setActiveTab('cashCard')}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
            >
              <span>Koʻrish</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* RECENT RECORDS PREVIEWS */}
      <div className={`grid grid-cols-1 ${userRole === 'admin' ? 'lg:grid-cols-2' : ''} gap-6`}>
        {/* So'nggi Otchyotlar */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                Soʻnggi Otchyotlar
              </h2>
              <p className="text-[11px] text-slate-400">Reyslar va toʻlovlar yozuvlari</p>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
            >
              <span>Barchasi</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {recentReports.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Yozuvlar mavjud emas</p>
            ) : (
              recentReports.map((r) => (
                <div
                  key={r.id}
                  className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750 flex items-center justify-between hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-mono-num font-bold text-xs border border-amber-500/20">
                      {r.tripsCount}R
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono-num">
                          ID: {r.idNumber}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono-num">
                          {formatDateUz(r.date)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Naqd: {formatMoney(r.cash)} | Karta: {formatMoney(r.card)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-amber-400 font-mono-num">
                      {formatMoney(r.total)}
                    </div>
                    <span className="text-[10px] text-slate-500">{r.period10Days?.split(' ')[0]}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* So'nggi Kassa Harakatlari - FAQAT BOSH ADMIN UCHUN */}
        {userRole === 'admin' && (
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  Soʻnggi Kassa Harakatlari
                </h2>
                <p className="text-[11px] text-slate-400">Laylak Cargo kassa balansi tarixi</p>
              </div>
              <button
                onClick={() => setActiveTab('kassa')}
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
              >
                <span>Barchasi</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {recentKassa.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Kassa yozuvlari mavjud emas</p>
              ) : (
                recentKassa.map((k) => (
                  <div
                    key={k.id}
                    className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750 flex items-center justify-between hover:bg-slate-800 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono-num">
                          {formatDateUz(k.date)}
                        </span>
                        {k.expense > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Xarajat
                          </span>
                        )}
                        {k.income > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Tushum
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        {k.note || 'Kassa amali'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black font-mono-num text-white">
                        Qoldiq: {formatMoney(k.balance)}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono-num">
                        +{formatMoney(k.income)} / -{formatMoney(k.expense)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
