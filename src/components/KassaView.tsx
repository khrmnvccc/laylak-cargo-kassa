import React, { useState } from 'react';
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Edit2,
  Trash2,
  Calendar,
  AlertCircle,
  Filter,
  Check,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { formatMoney, formatDateUz, CATEGORY_LABELS } from '../utils/formatters';
import { CashRecord, ExpenseCategory } from '../types';

interface KassaViewProps {
  kassa: CashRecord[];
  onAddKassa: (data: {
    date: string;
    income: number;
    expense: number;
    note: string;
    category?: ExpenseCategory;
  }) => void;
  onUpdateKassa: (id: string, data: Partial<CashRecord>) => void;
  onDeleteKassa: (id: string) => void;
  openQuickAdd: () => void;
  openExcelModal: () => void;
}

export const KassaView: React.FC<KassaViewProps> = ({
  kassa,
  onAddKassa,
  onUpdateKassa,
  onDeleteKassa,
  openQuickAdd,
  openExcelModal,
}) => {
  const [editingItem, setEditingItem] = useState<CashRecord | null>(null);
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Collect distinct months for filtering
  const months = Array.from(new Set(kassa.map((k) => k.date.substring(0, 7)))).sort().reverse();

  // Filtered kassa
  const filtered = kassa.filter((k) => {
    if (filterMonth !== 'all' && !k.date.startsWith(filterMonth)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNote = (k.note || '').toLowerCase().includes(q);
      const matchDate = formatDateUz(k.date).includes(q);
      if (!matchNote && !matchDate) return false;
    }
    return true;
  });

  // Aggregates for filtered view
  const totalIncome = filtered.reduce((s, k) => s + (k.income || 0), 0);
  const totalExpense = filtered.reduce((s, k) => s + (k.expense || 0), 0);
  const latestBalance = kassa.length > 0 ? kassa[0].balance : 0; // kassa is sorted desc by default

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Laylak Cargo Kassa</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Avtomatik zanjirli kunlik kassa qoldigʻi va xarajatlar boshqaruvi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={openExcelModal}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-900/60 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel Kassa</span>
          </button>

          <button
            onClick={openQuickAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-amber-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Kassa qoʻshish</span>
          </button>
        </div>
      </div>

      {/* SUMMARY STATS BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Ayni damdagi Kassa Qoldigʻi</span>
          <div
            className={`text-2xl font-black font-mono-num ${
              latestBalance < 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {formatMoney(latestBalance)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Zanjir boʻyicha hisoblangan</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-emerald-400 block mb-1 flex items-center gap-1">
            <ArrowUpRight className="w-4 h-4" />
            Jami Kassa Tushumi
          </span>
          <div className="text-2xl font-black font-mono-num text-white">
            {formatMoney(totalIncome)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">{filtered.length} ta yozuv</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-rose-400 block mb-1 flex items-center gap-1">
            <ArrowDownRight className="w-4 h-4" />
            Jami Sarflangan Xarajat
          </span>
          <div className="text-2xl font-black font-mono-num text-rose-400">
            {formatMoney(totalExpense)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Tovarga, paketga va boshqalar</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
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

        <div className="flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Izoh yoki sana boʻyicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* FORMULA EXPLANATION BANNER */}
      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded">
            Avtomatik Formula
          </span>
          <span>
            <strong>Qolgan summa</strong> = Bor boʻlgan summa + Tushgan summa - Ishlatilgan summa
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          *Keyingi kunning “Bor boʻlgan summasi” oldingi kunning “Qolgan summasi”dan avtomatik olindi
        </span>
      </div>

      {/* MAIN TABLE */}
      <div className="overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">📅 Sana</th>
                <th className="py-3.5 px-4">Bor boʻlgan summa</th>
                <th className="py-3.5 px-4 text-emerald-400">Tushgan summa</th>
                <th className="py-3.5 px-4 text-rose-400">Ishlatilgan summa</th>
                <th className="py-3.5 px-4 text-amber-400">Qolgan summa</th>
                <th className="py-3.5 px-4">Izoh</th>
                <th className="py-3.5 px-4 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Kassa yozuvlari topilmadi
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isEditing = editingItem?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Sana */}
                      <td className="py-3 px-4 font-mono-num font-bold text-white whitespace-nowrap">
                        {formatDateUz(item.date)}
                      </td>

                      {/* Bor bo'lgan summa */}
                      <td className="py-3 px-4 font-mono-num text-slate-300 whitespace-nowrap">
                        {formatMoney(item.startingBalance)}
                      </td>

                      {/* Tushgan summa */}
                      <td className="py-3 px-4 font-mono-num font-bold text-emerald-400 whitespace-nowrap">
                        {item.income > 0 ? `+${formatMoney(item.income)}` : '0'}
                      </td>

                      {/* Ishlatilgan summa */}
                      <td className="py-3 px-4 font-mono-num font-bold text-rose-400 whitespace-nowrap">
                        {item.expense > 0 ? `-${formatMoney(item.expense)}` : '0'}
                      </td>

                      {/* Qolgan summa */}
                      <td className="py-3 px-4 font-mono-num font-black whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-lg ${
                            item.balance < 0
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {formatMoney(item.balance)}
                        </span>
                      </td>

                      {/* Izoh */}
                      <td className="py-3 px-4 text-slate-300 max-w-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.category && CATEGORY_LABELS[item.category] && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                CATEGORY_LABELS[item.category].color
                              }`}
                            >
                              {CATEGORY_LABELS[item.category].icon} {CATEGORY_LABELS[item.category].label}
                            </span>
                          )}
                          <span className="truncate">{item.note || '—'}</span>
                          <span className="text-[10px] font-mono text-amber-400/90 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60 ml-auto whitespace-nowrap">
                            @{item.createdBy || 'admin'}
                          </span>
                        </div>
                      </td>

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
                            onClick={() => onDeleteKassa(item.id)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                            title="Oʻchirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">Kassa yozuvini tahrirlash</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Sana</label>
              <input
                type="date"
                value={editingItem.date}
                onChange={(e) => setEditingItem({ ...editingItem, date: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-emerald-400 mb-1">
                  Tushgan summa
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={editingItem.income}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, income: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1">
                  Ishlatilgan summa
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={editingItem.expense}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, expense: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Izoh</label>
              <input
                type="text"
                value={editingItem.note}
                onChange={(e) => setEditingItem({ ...editingItem, note: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
              />
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
                  onUpdateKassa(editingItem.id, editingItem);
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
