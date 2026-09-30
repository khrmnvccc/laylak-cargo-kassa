import React, { useState } from 'react';
import {
  CreditCard,
  Coins,
  ArrowUpRight,
  Calendar,
  FileSpreadsheet,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { formatMoney, formatDateUz } from '../utils/formatters';
import { DailyCashCardSummary, ReportRecord } from '../types';

interface CashCardViewProps {
  dailySummaries: DailyCashCardSummary[];
  openQuickAdd: () => void;
  openExcelModal: () => void;
}

export const CashCardView: React.FC<CashCardViewProps> = ({
  dailySummaries,
  openQuickAdd,
  openExcelModal,
}) => {
  const [filterMonth, setFilterMonth] = useState<string>('all');

  const months = Array.from(new Set(dailySummaries.map((d) => d.date.substring(0, 7)))).sort().reverse();

  const filtered = dailySummaries.filter((d) => {
    if (filterMonth !== 'all' && !d.date.startsWith(filterMonth)) return false;
    return true;
  });

  const totalCash = filtered.reduce((s, d) => s + d.cash, 0);
  const totalCard = filtered.reduce((s, d) => s + d.card, 0);
  const grandTotal = totalCash + totalCard;

  const cashShare = grandTotal > 0 ? Math.round((totalCash / grandTotal) * 100) : 0;
  const cardShare = grandTotal > 0 ? Math.round((totalCard / grandTotal) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Naqd / Karta Moduli</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Kunlik naqd va plastik karta tushumlari taqqoslashi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={openExcelModal}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-900/60 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel Eksport</span>
          </button>

          <button
            onClick={openQuickAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Tushum kiritish</span>
          </button>
        </div>
      </div>

      {/* AGGREGATE SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
            <span className="font-semibold flex items-center gap-1.5">
              <Coins className="w-4 h-4" />
              Jami Naqd Tushum
            </span>
            <span className="font-bold">{cashShare}%</span>
          </div>
          <div className="text-2xl font-black font-mono-num text-emerald-400">
            {formatMoney(totalCash)}
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${cashShare}%` }} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-blue-400 mb-1">
            <span className="font-semibold flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" />
              Jami Karta Tushumi
            </span>
            <span className="font-bold">{cardShare}%</span>
          </div>
          <div className="text-2xl font-black font-mono-num text-blue-400">
            {formatMoney(totalCard)}
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${cardShare}%` }} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-amber-400 block mb-1 font-semibold flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Umumiy Tushum (Naqd + Karta)
          </span>
          <div className="text-2xl font-black font-mono-num text-white">
            {formatMoney(grandTotal)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {filtered.length} kunlik jamlama
          </span>
        </div>
      </div>

      {/* Month Filter */}
      <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
        <span className="text-xs text-slate-400 font-medium">Filtrlash:</span>
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
        >
          <option value="all">Barcha oylar</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* TABLE OF DAILY CASH/CARD */}
      <div className="overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">📅 Sana</th>
                <th className="py-3.5 px-4 text-emerald-400">💵 Naqd tushum</th>
                <th className="py-3.5 px-4 text-blue-400">💳 Karta tushumi</th>
                <th className="py-3.5 px-4 text-amber-400">💰 Umumiy tushum</th>
                <th className="py-3.5 px-4">Reyslar</th>
                <th className="py-3.5 px-4">Taqsimot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    Maʻlumotlar mavjud emas
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const dayTotal = row.cash + row.card;
                  const dayCashPct = dayTotal > 0 ? Math.round((row.cash / dayTotal) * 100) : 0;
                  const dayCardPct = 100 - dayCashPct;
                  return (
                    <tr key={row.date} className="hover:bg-slate-800/40 transition-colors">
                      {/* Sana */}
                      <td className="py-3 px-4 font-mono-num font-bold text-white whitespace-nowrap">
                        {formatDateUz(row.date)}
                      </td>

                      {/* Naqd tushum */}
                      <td className="py-3 px-4 font-mono-num font-bold text-emerald-400 whitespace-nowrap">
                        {formatMoney(row.cash)}
                      </td>

                      {/* Karta tushumi */}
                      <td className="py-3 px-4 font-mono-num font-bold text-blue-400 whitespace-nowrap">
                        {formatMoney(row.card)}
                      </td>

                      {/* Umumiy tushum */}
                      <td className="py-3 px-4 font-mono-num font-black text-amber-300 whitespace-nowrap">
                        {formatMoney(dayTotal)}
                      </td>

                      {/* Reyslar */}
                      <td className="py-3 px-4 font-mono-num text-slate-300 whitespace-nowrap">
                        {row.tripsCount} ta reys
                      </td>

                      {/* Taqsimot bar */}
                      <td className="py-3 px-4 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500" style={{ width: `${dayCashPct}%` }} />
                            <div className="bg-blue-500" style={{ width: `${dayCardPct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono-num">
                            {dayCashPct}% / {dayCardPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
