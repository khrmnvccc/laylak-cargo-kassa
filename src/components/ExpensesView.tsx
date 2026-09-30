import React, { useState } from 'react';
import {
  Receipt,
  Plus,
  Filter,
  Search,
  Trash2,
  Calendar,
  FileSpreadsheet,
  PieChart,
} from 'lucide-react';
import { formatMoney, formatDateUz, CATEGORY_LABELS } from '../utils/formatters';
import { ExpenseRecord, ExpenseCategory } from '../types';

interface ExpensesViewProps {
  expenses: ExpenseRecord[];
  onAddExpense: (data: { date: string; amount: number; category: ExpenseCategory; note: string }) => void;
  onDeleteExpense: (id: string) => void;
  openQuickAdd: () => void;
  openExcelModal: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  onAddExpense,
  onDeleteExpense,
  openQuickAdd,
  openExcelModal,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = expenses.filter((e) => {
    if (selectedCategory !== 'all' && e.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNote = (e.note || '').toLowerCase().includes(q);
      const matchDate = formatDateUz(e.date).includes(q);
      if (!matchNote && !matchDate) return false;
    }
    return true;
  });

  const totalExpenseAmount = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  // Category totals
  const categoryTotals: Record<ExpenseCategory, number> = {
    tovar: 0,
    paket: 0,
    registrator: 0,
    otkazma: 0,
    yoqilgi: 0,
    ijara: 0,
    boshqa: 0,
  };

  expenses.forEach((e) => {
    if (categoryTotals[e.category] !== undefined) {
      categoryTotals[e.category] += e.amount || 0;
    } else {
      categoryTotals.boshqa += e.amount || 0;
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Xarajatlar Boshqaruvi</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Kassadan sarflangan summalar va kategoriyalar tarixi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={openExcelModal}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-900/60 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel Xarajat</span>
          </button>

          <button
            onClick={openQuickAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white text-xs sm:text-sm font-black shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Yangi xarajat</span>
          </button>
        </div>
      </div>

      {/* CATEGORY SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => {
          const info = CATEGORY_LABELS[cat];
          const sum = categoryTotals[cat] || 0;
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(isSelected ? 'all' : cat)}
              className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-rose-500/20 border-rose-500 shadow-md ring-1 ring-rose-500'
                  : 'bg-slate-900 border-slate-800 hover:bg-slate-850'
              }`}
            >
              <div className="flex items-center justify-between text-base mb-1">
                <span>{info.icon}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">{cat}</span>
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-300 block truncate">
                  {info.label.split('/')[0]}
                </span>
                <span className="text-xs font-black font-mono-num text-rose-400 mt-0.5 block">
                  {formatMoney(sum)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">Barcha kategoriyalar</option>
            {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat].icon} {CATEGORY_LABELS[cat].label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Izoh boʻyicha qidirish (paket, tovar...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            Jami sarflangan summa ({filtered.length} ta yozuv):
          </span>
          <span className="text-base font-black font-mono-num text-rose-400">
            {formatMoney(totalExpenseAmount)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">📅 Sana</th>
                <th className="py-3 px-4">Kategoriya</th>
                <th className="py-3 px-4 text-rose-400">Summa</th>
                <th className="py-3 px-4">Izoh</th>
                <th className="py-3 px-4 text-right">Oʻchirish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    Xarajatlar topilmadi
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const catInfo = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.boshqa;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono-num font-bold text-white whitespace-nowrap">
                        {formatDateUz(item.date)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${catInfo.color}`}
                        >
                          <span>{catInfo.icon}</span>
                          <span>{catInfo.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono-num font-black text-rose-400 whitespace-nowrap">
                        -{formatMoney(item.amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-sm">
                        {item.note || '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => onDeleteExpense(item.id)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                          title="Oʻchirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
