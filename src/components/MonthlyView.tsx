import React, { useState } from 'react';
import {
  Calendar,
  Truck,
  Coins,
  CreditCard,
  FileSpreadsheet,
  TrendingUp,
  Receipt,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { formatMoney, formatNumber } from '../utils/formatters';
import { MonthlySummary } from '../types';

interface MonthlyViewProps {
  monthlySummaries: MonthlySummary[];
  openExcelModal: () => void;
}

export const MonthlyView: React.FC<MonthlyViewProps> = ({
  monthlySummaries,
  openExcelModal,
}) => {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(
    monthlySummaries.length > 0 ? monthlySummaries[0].monthKey : ''
  );

  const selectedMonth =
    monthlySummaries.find((m) => m.monthKey === selectedMonthKey) || monthlySummaries[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Oylik Hisobotlar</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Oylar kesimidagi tushumlar, reyslar, kassa va xarajatlar taqsimoti
            </p>
          </div>
        </div>

        <button
          onClick={openExcelModal}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-900/60 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Excel Oylik</span>
        </button>
      </div>

      {/* Month Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {monthlySummaries.map((m) => (
          <button
            key={m.monthKey}
            onClick={() => setSelectedMonthKey(m.monthKey)}
            className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
              (selectedMonth?.monthKey === m.monthKey)
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {m.monthName}
          </button>
        ))}
      </div>

      {selectedMonth ? (
        <div className="space-y-6">
          {/* Main Highlights for Selected Month */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block mb-1">
                💰 Jami Kassa Tushumi
              </span>
              <div className="text-2xl font-black font-mono-num text-white">
                {formatMoney(selectedMonth.totalRevenue)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {selectedMonth.reportsCount} ta otchyot yozuvi
              </span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider block mb-1">
                🚕 Jami Reyslar
              </span>
              <div className="text-2xl font-black font-mono-num text-white">
                {formatNumber(selectedMonth.tripsCount)} ta
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Yetkazib berilgan reyslar</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5" />
                Oylik Xarajatlar
              </span>
              <div className="text-2xl font-black font-mono-num text-rose-400">
                {formatMoney(selectedMonth.kassaExpense)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Sarflangan summa</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" />
                Oy Oxiridagi Qoldiq
              </span>
              <div className="text-2xl font-black font-mono-num text-emerald-400">
                {formatMoney(selectedMonth.kassaFinalBalance)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Kassa zanjiri yakuni</span>
            </div>
          </div>

          {/* Breakdown by Payment Channel */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-400" />
              <span>{selectedMonth.monthName} — Toʻlov Turlari Tafsiloti</span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-xs text-emerald-400 font-semibold block mb-1">💵 Jami Naqd</span>
                <div className="text-lg sm:text-xl font-black font-mono-num text-white">
                  {formatMoney(selectedMonth.cash)}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                <span className="text-xs text-blue-400 font-semibold block mb-1">💳 Jami Karta</span>
                <div className="text-lg sm:text-xl font-black font-mono-num text-white">
                  {formatMoney(selectedMonth.card)}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-xs text-amber-400 font-semibold block mb-1">🟢 Jami Yandex</span>
                <div className="text-lg sm:text-xl font-black font-mono-num text-white">
                  {formatMoney(selectedMonth.yandex)}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                <span className="text-xs text-purple-400 font-semibold block mb-1">📦 Jami Pochta</span>
                <div className="text-lg sm:text-xl font-black font-mono-num text-white">
                  {formatMoney(selectedMonth.pochta)}
                </div>
              </div>
            </div>
          </div>

          {/* Historical comparison table of all months */}
          <div className="overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
            <div className="p-4 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white">Barcha Oylar Boʻyicha Tarixiy Jadval</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Oy</th>
                    <th className="py-3 px-4">Reyslar</th>
                    <th className="py-3 px-4 text-emerald-400">Naqd</th>
                    <th className="py-3 px-4 text-blue-400">Karta</th>
                    <th className="py-3 px-4 text-amber-400">Yandex</th>
                    <th className="py-3 px-4 text-purple-400">Pochta</th>
                    <th className="py-3 px-4 text-amber-300">Jami Daromad</th>
                    <th className="py-3 px-4 text-rose-400">Xarajat</th>
                    <th className="py-3 px-4 text-right">Qoldiq</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs font-medium">
                  {monthlySummaries.map((m) => (
                    <tr
                      key={m.monthKey}
                      onClick={() => setSelectedMonthKey(m.monthKey)}
                      className={`cursor-pointer hover:bg-slate-800/40 transition-colors ${
                        m.monthKey === selectedMonth.monthKey ? 'bg-purple-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                        {m.monthName}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-slate-300">{m.tripsCount} ta</td>
                      <td className="py-3 px-4 font-mono-num text-emerald-400">
                        {formatMoney(m.cash)}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-blue-400">
                        {formatMoney(m.card)}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-amber-400">
                        {formatMoney(m.yandex)}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-purple-400">
                        {formatMoney(m.pochta)}
                      </td>
                      <td className="py-3 px-4 font-mono-num font-black text-amber-300">
                        {formatMoney(m.totalRevenue)}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-rose-400">
                        {formatMoney(m.kassaExpense)}
                      </td>
                      <td className="py-3 px-4 font-mono-num font-bold text-right text-emerald-400">
                        {formatMoney(m.kassaFinalBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
