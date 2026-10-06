import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Filter,
  Search,
  Edit2,
  Trash2,
  Calendar,
  FileSpreadsheet,
  Coins,
  CreditCard,
  Truck,
  Hash,
  X,
  Check,
} from 'lucide-react';
import { addDaysToDateString, formatMoney, formatDateUz, parseDateInput } from '../utils/formatters';
import { ReportRecord, DateFilterType } from '../types';

interface OtchyotlarViewProps {
  reports: ReportRecord[];
  onAddReport: (data: any) => void;
  onUpdateReport: (id: string, data: Partial<ReportRecord>) => void;
  onDeleteReport: (id: string) => void;
  openQuickAdd: () => void;
  openExcelModal: () => void;
  todayDate: string;
  userRole?: 'admin' | 'kassir';
}

export const OtchyotlarView: React.FC<OtchyotlarViewProps> = ({
  reports,
  onUpdateReport,
  onDeleteReport,
  openQuickAdd,
  openExcelModal,
  todayDate,
  userRole = 'admin',
}) => {
  const [filterType, setFilterType] = useState<DateFilterType>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItem, setEditingItem] = useState<ReportRecord | null>(null);

  // Compute date thresholds
  const yesterdayStr = addDaysToDateString(todayDate, -1);
  const d7Str = addDaysToDateString(todayDate, -7);
  const d10Str = addDaysToDateString(todayDate, -10);

  const thisMonthPrefix = todayDate.substring(0, 7);

  // Filter logic
  const filteredReports = reports.filter((r) => {
    // Date filter
    if (filterType === 'today' && r.date !== todayDate) return false;
    if (filterType === 'yesterday' && r.date !== yesterdayStr) return false;
    if (filterType === '7days' && r.date < d7Str) return false;
    if (filterType === '10days' && r.date < d10Str) return false;
    if (filterType === 'thisMonth' && !r.date.startsWith(thisMonthPrefix)) return false;
    if (filterType === 'custom') {
      if (customStart && r.date < customStart) return false;
      if (customEnd && r.date > customEnd) return false;
    }

    // Search query (ID, date, note)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = (r.idNumber || '').toLowerCase().includes(q);
      const matchDate = formatDateUz(r.date).includes(q) || r.date.includes(q);
      const matchNote = (r.note || '').toLowerCase().includes(q);
      if (!matchId && !matchDate && !matchNote) return false;
    }

    return true;
  });

  // Aggregates for filtered rows
  const sumTrips = filteredReports.reduce((s, r) => s + (r.tripsCount || 0), 0);
  const sumCash = filteredReports.reduce((s, r) => s + (r.cash || 0), 0);
  const sumCard = filteredReports.reduce((s, r) => s + (r.card || 0), 0);
  const sumYandex = filteredReports.reduce((s, r) => s + (r.yandex || 0), 0);
  const sumPochta = filteredReports.reduce((s, r) => s + (r.pochta || 0), 0);
  const sumTotal = sumCash + sumCard + sumYandex + sumPochta;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Hisobotlar / Otchyotlar</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Kunlik reyslar, ID lar va tushumlar jadvali
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
            <span>+ Yangi hisobot</span>
          </button>
        </div>
      </div>

      {/* FILTER BUTTONS ROW (As requested: “Bugun”, “Kecha”, “7 kun”, “10 kun”, “Bu oy”, “Custom sana”) */}
      <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            Barchasi
          </button>
          <button
            onClick={() => setFilterType('today')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === 'today'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            Bugun
          </button>
          <button
            onClick={() => setFilterType('yesterday')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === 'yesterday'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            Kecha
          </button>
          <button
            onClick={() => setFilterType('7days')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === '7days'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            7 kun
          </button>
          <button
            onClick={() => setFilterType('10days')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === '10days'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            10 kun
          </button>
          <button
            onClick={() => setFilterType('thisMonth')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === 'thisMonth'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            Bu oy
          </button>
          <button
            onClick={() => setFilterType('custom')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === 'custom'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            Custom sana
          </button>
        </div>

        {/* Custom date range inputs */}
        {filterType === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
            <span className="text-xs text-slate-400">Oraliq:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
            />
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="ID (masalan: 101111), sana yoki izoh boʻyicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* FILTERED SUMMARY BANNER */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-md">
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Jami Reyslar</span>
          <span className="text-base sm:text-lg font-black font-mono-num text-white">
            {sumTrips} ta
          </span>
        </div>
        <div>
          <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Jami Naqd</span>
          <span className="text-base sm:text-lg font-black font-mono-num text-emerald-400">
            {formatMoney(sumCash)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-blue-400 uppercase font-semibold block">Jami Karta</span>
          <span className="text-base sm:text-lg font-black font-mono-num text-blue-400">
            {formatMoney(sumCard)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-amber-400 uppercase font-semibold block">Jami Yandex</span>
          <span className="text-base sm:text-lg font-black font-mono-num text-amber-400">
            {formatMoney(sumYandex)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-purple-400 uppercase font-semibold block">Jami Pochta</span>
          <span className="text-base sm:text-lg font-black font-mono-num text-purple-400">
            {formatMoney(sumPochta)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-amber-300 uppercase font-bold block">Umumiy Kassa</span>
          <span className="text-base sm:text-lg font-black font-mono-num text-amber-300">
            {formatMoney(sumTotal)}
          </span>
        </div>
      </div>

      {/* MAIN TABLE (Sana | ID | Reys | Naqd | Karta | Yandex | Pochta | Jami) */}
      <div className="overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">📅 Sana</th>
                <th className="py-3.5 px-4">🆔 ID</th>
                <th className="py-3.5 px-4">🚕 Reys</th>
                <th className="py-3.5 px-4 text-emerald-400">💵 Naqd</th>
                <th className="py-3.5 px-4 text-blue-400">💳 Karta</th>
                <th className="py-3.5 px-4 text-amber-400">🟢 Yandex</th>
                <th className="py-3.5 px-4 text-purple-400">📦 Pochta</th>
                <th className="py-3.5 px-4 text-amber-300">💰 Jami</th>
                <th className="py-3.5 px-4">Davr</th>
                {userRole === 'admin' && <th className="py-3.5 px-4">👤 Kiritgan</th>}
                <th className="py-3.5 px-4 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs font-medium">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={userRole === 'admin' ? 11 : 10} className="py-12 text-center text-slate-500">
                    Hisobotlar topilmadi
                  </td>
                </tr>
              ) : (
                filteredReports.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Sana */}
                    <td className="py-3 px-4 font-mono-num font-bold text-white whitespace-nowrap">
                      {formatDateUz(item.date)}
                    </td>

                    {/* ID */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono-num font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {item.idNumber}
                      </span>
                    </td>

                    {/* Reys */}
                    <td className="py-3 px-4 font-mono-num font-bold text-slate-200 whitespace-nowrap">
                      {item.tripsCount}
                    </td>

                    {/* Naqd */}
                    <td className="py-3 px-4 font-mono-num text-emerald-400 whitespace-nowrap">
                      {formatMoney(item.cash)}
                    </td>

                    {/* Karta */}
                    <td className="py-3 px-4 font-mono-num text-blue-400 whitespace-nowrap">
                      {formatMoney(item.card)}
                    </td>

                    {/* Yandex */}
                    <td className="py-3 px-4 font-mono-num text-amber-400 whitespace-nowrap">
                      {formatMoney(item.yandex)}
                    </td>

                    {/* Pochta */}
                    <td className="py-3 px-4 font-mono-num text-purple-400 whitespace-nowrap">
                      {formatMoney(item.pochta)}
                    </td>

                    {/* Jami */}
                    <td className="py-3 px-4 font-mono-num font-black text-amber-300 whitespace-nowrap">
                      {formatMoney(item.total)}
                    </td>

                    {/* 10 kunlik davr */}
                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {item.period10Days || '—'}
                    </td>

                    {/* Kiritgan (Faqat Bosh Admin uchun) */}
                    {userRole === 'admin' && (
                      <td className="py-3 px-4 text-slate-300 text-[11px] whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-mono text-amber-300">
                          @{item.createdBy || 'admin'}
                        </span>
                        {item.updatedBy && (
                          <span className="block text-[9px] text-slate-500 mt-0.5 font-mono">
                            tahrir: @{item.updatedBy}
                          </span>
                        )}
                      </td>
                    )}

                    {/* Amallar */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-750 transition-colors"
                          title="Tahrirlash"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteReport(item.id)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                          title="Oʻchirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT REPORT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">Otchyotni tahrirlash</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Sana</label>
                <input
                  type="date"
                  value={editingItem.date}
                  onChange={(e) => setEditingItem({ ...editingItem, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">ID</label>
                <input
                  type="text"
                  value={editingItem.idNumber}
                  onChange={(e) => setEditingItem({ ...editingItem, idNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono-num font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Reyslar soni</label>
              <input
                type="number"
                min="0"
                value={editingItem.tripsCount}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, tripsCount: Number(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono-num"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-emerald-400 mb-1">Naqd</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={editingItem.cash}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, cash: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-blue-400 mb-1">Karta</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={editingItem.card}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, card: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-400 mb-1">Yandex</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={editingItem.yandex}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, yandex: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-400 mb-1">Pochta</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={editingItem.pochta}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, pochta: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono-num"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <span className="text-xs text-amber-400 font-semibold">Umumiy kassa:</span>
              <span className="text-base font-black font-mono-num text-amber-400">
                {formatMoney(
                  editingItem.cash + editingItem.card + editingItem.yandex + editingItem.pochta
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateReport(editingItem.id, editingItem);
                  setEditingItem(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-colors flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Yangilash</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
