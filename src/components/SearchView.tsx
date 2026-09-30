import React, { useState } from 'react';
import {
  Search,
  Hash,
  Truck,
  Coins,
  CreditCard,
  Calendar,
  FileSpreadsheet,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { formatMoney, formatDateUz } from '../utils/formatters';
import { ReportRecord } from '../types';

interface SearchViewProps {
  reports: ReportRecord[];
  onSelectReport?: (report: ReportRecord) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ reports, onSelectReport }) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all distinct IDs for quick buttons
  const uniqueIds = Array.from(new Set(reports.map((r) => r.idNumber).filter(Boolean)));

  const trimmed = searchQuery.trim().toLowerCase();

  const matchedReports = reports.filter((r) => {
    if (!trimmed) return true;
    const matchId = (r.idNumber || '').toLowerCase().includes(trimmed);
    const matchDate = formatDateUz(r.date).includes(trimmed) || r.date.includes(trimmed);
    const matchNote = (r.note || '').toLowerCase().includes(trimmed);
    return matchId || matchDate || matchNote;
  });

  // Aggregate stats for matched records
  const totalTrips = matchedReports.reduce((s, r) => s + (r.tripsCount || 0), 0);
  const totalCash = matchedReports.reduce((s, r) => s + (r.cash || 0), 0);
  const totalCard = matchedReports.reduce((s, r) => s + (r.card || 0), 0);
  const totalYandex = matchedReports.reduce((s, r) => s + (r.yandex || 0), 0);
  const totalPochta = matchedReports.reduce((s, r) => s + (r.pochta || 0), 0);
  const totalSum = totalCash + totalCard + totalYandex + totalPochta;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">ID & Maʻlumotlar Qidiruvi</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              ID raqami (masalan 101111), sana yoki kalit soʻz boʻyicha bir zumda tahlil
            </p>
          </div>
        </div>

        {/* Large search input */}
        <div className="relative">
          <Search className="w-5 h-5 text-amber-400 absolute left-4 top-3.5" />
          <input
            type="text"
            placeholder="ID kiriting: masalan 101111..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-mono-num font-bold text-base sm:text-lg placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors shadow-inner"
            autoFocus
          />
        </div>

        {/* Quick ID chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">Tezkor IDlar:</span>
          {uniqueIds.map((id) => (
            <button
              key={id}
              onClick={() => setSearchQuery(id)}
              className={`px-3 py-1 rounded-xl text-xs font-mono-num font-bold transition-all ${
                searchQuery === id
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-750'
              }`}
            >
              {id}
            </button>
          ))}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-slate-400 hover:text-rose-400 underline ml-2"
            >
              Tozalash
            </button>
          )}
        </div>
      </div>

      {/* RESULT HIGHLIGHTS (If search has results) */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              {searchQuery ? `"${searchQuery}" boʻyicha natijalar:` : 'Barcha hisobotlar:'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-300 font-bold">
              {matchedReports.length} ta yozuv
            </span>
          </div>
          <span className="text-sm font-black font-mono-num text-amber-400">
            Jami: {formatMoney(totalSum)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750">
            <span className="text-[10px] text-slate-400 block">Jami reyslar</span>
            <span className="text-sm sm:text-base font-bold font-mono-num text-white">
              {totalTrips} ta
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750">
            <span className="text-[10px] text-emerald-400 block">Naqd summa</span>
            <span className="text-sm sm:text-base font-bold font-mono-num text-emerald-400">
              {formatMoney(totalCash)}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750">
            <span className="text-[10px] text-blue-400 block">Karta summa</span>
            <span className="text-sm sm:text-base font-bold font-mono-num text-blue-400">
              {formatMoney(totalCard)}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750">
            <span className="text-[10px] text-amber-400 block">Yandex</span>
            <span className="text-sm sm:text-base font-bold font-mono-num text-amber-400">
              {formatMoney(totalYandex)}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-750">
            <span className="text-[10px] text-purple-400 block">Pochta</span>
            <span className="text-sm sm:text-base font-bold font-mono-num text-purple-400">
              {formatMoney(totalPochta)}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <span className="text-[10px] text-amber-400 block font-bold">Umumiy kassa</span>
            <span className="text-sm sm:text-base font-black font-mono-num text-amber-300">
              {formatMoney(totalSum)}
            </span>
          </div>
        </div>
      </div>

      {/* DETAILED RESULTS TABLE:
          * qaysi kun
          * nechta reys
          * qancha naqd
          * qancha karta
          * qancha Yandex
          * jami summa */}
      <div className="overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Qaysi kun (Sana)</th>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Nechta reys</th>
                <th className="py-3 px-4 text-emerald-400">Qancha naqd</th>
                <th className="py-3 px-4 text-blue-400">Qancha karta</th>
                <th className="py-3 px-4 text-amber-400">Qancha Yandex</th>
                <th className="py-3 px-4 text-purple-400">Pochta</th>
                <th className="py-3 px-4 text-amber-300">Jami summa</th>
                <th className="py-3 px-4">Izoh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs font-medium">
              {matchedReports.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Bunday ID yoki maʻlumot boʻyicha yozuvlar topilmadi
                  </td>
                </tr>
              ) : (
                matchedReports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono-num font-bold text-white whitespace-nowrap">
                      {formatDateUz(r.date)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono-num font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {r.idNumber}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-num font-bold text-slate-200 whitespace-nowrap">
                      {r.tripsCount} ta
                    </td>
                    <td className="py-3 px-4 font-mono-num text-emerald-400 whitespace-nowrap">
                      {formatMoney(r.cash)}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-blue-400 whitespace-nowrap">
                      {formatMoney(r.card)}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-amber-400 whitespace-nowrap">
                      {formatMoney(r.yandex)}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-purple-400 whitespace-nowrap">
                      {formatMoney(r.pochta)}
                    </td>
                    <td className="py-3 px-4 font-mono-num font-black text-amber-300 whitespace-nowrap">
                      {formatMoney(r.total)}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                      {r.note || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
