import React, { useState } from 'react';
import {
  Layers,
  Calendar,
  Truck,
  Coins,
  CreditCard,
  FileSpreadsheet,
  TrendingUp,
  Package,
} from 'lucide-react';
import { formatMoney, formatNumber } from '../utils/formatters';
import { DecadeSummary } from '../types';

interface DecadeViewProps {
  decadeSummaries: DecadeSummary[];
  openExcelModal: () => void;
}

export const DecadeView: React.FC<DecadeViewProps> = ({
  decadeSummaries,
  openExcelModal,
}) => {
  const [filterMonth, setFilterMonth] = useState<string>('all');

  const months = Array.from(new Set(decadeSummaries.map((d) => d.month))).sort().reverse();

  const filtered = decadeSummaries.filter((d) => {
    if (filterMonth !== 'all' && d.month !== filterMonth) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">10 Kunlik Hisobotlar</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Har 10 kunlik davr (dekada) boʻyicha avtomatik hisob-kitoblar va taqqoslash
            </p>
          </div>
        </div>

        <button
          onClick={openExcelModal}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-900/60 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Excel 10 Kunlik</span>
        </button>
      </div>

      {/* Month Filter */}
      <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
        <span className="text-xs text-slate-400 font-medium">Oyni tanlang:</span>
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

      {/* 10 KUNLIK DAVRLAR ALOHIDA KARTOCHKALARDA (As specifically requested) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900 rounded-3xl border border-slate-800">
            10 kunlik maʻlumotlar topilmadi
          </div>
        ) : (
          filtered.map((d) => (
            <div
              key={d.decadeKey}
              className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 transition-all shadow-xl flex flex-col justify-between space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs">
                    {d.decadeIndex}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">{d.periodLabel}</h3>
                    <span className="text-[11px] text-slate-400">{d.recordsCount} ta otchyot</span>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-lg bg-slate-800 text-[11px] font-mono-num font-bold text-slate-300">
                  {d.tripsCount} reys
                </div>
              </div>

              {/* Total revenue */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  10 Kunlik Umumiy Kassa
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono-num text-amber-300 mt-0.5">
                  {formatMoney(d.total)}
                </div>
              </div>

              {/* Breakdown metrics (Reyslar, Naqd, Karta, Yandex, Pochta) */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-750">
                  <span className="text-[10px] text-emerald-400 block font-semibold flex items-center gap-1">
                    <Coins className="w-3 h-3" /> Naqd
                  </span>
                  <span className="font-mono-num font-bold text-white text-xs">
                    {formatMoney(d.cash)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-750">
                  <span className="text-[10px] text-blue-400 block font-semibold flex items-center gap-1">
                    <CreditCard className="w-3 h-3" /> Karta
                  </span>
                  <span className="font-mono-num font-bold text-white text-xs">
                    {formatMoney(d.card)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-750">
                  <span className="text-[10px] text-amber-400 block font-semibold">🟢 Yandex</span>
                  <span className="font-mono-num font-bold text-white text-xs">
                    {formatMoney(d.yandex)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-750">
                  <span className="text-[10px] text-purple-400 block font-semibold">📦 Pochta</span>
                  <span className="font-mono-num font-bold text-white text-xs">
                    {formatMoney(d.pochta)}
                  </span>
                </div>
              </div>

              {/* Trips info */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-amber-400" />
                  Jami reyslar:
                </span>
                <span className="font-bold text-white font-mono-num">{d.tripsCount} ta</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
