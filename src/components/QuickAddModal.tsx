import React, { useState, useEffect } from 'react';
import {
  X,
  PlusCircle,
  Wallet,
  FileText,
  CreditCard,
  Receipt,
  Calculator,
  Check,
  AlertCircle,
} from 'lucide-react';
import { formatMoney, parseDateInput, CATEGORY_LABELS } from '../utils/formatters';
import { ExpenseCategory } from '../types';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: string;
  onAddReport: (data: {
    date: string;
    idNumber: string;
    tripsCount: number;
    cash: number;
    card: number;
    yandex: number;
    pochta: number;
    note?: string;
  }) => void;
  onAddKassa: (data: {
    date: string;
    income: number;
    expense: number;
    note: string;
    category?: ExpenseCategory;
  }) => void;
  currentKassaBalance: number;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  onAddReport,
  onAddKassa,
  currentKassaBalance,
}) => {
  const [activeType, setActiveType] = useState<'report' | 'kassa' | 'cashCard' | 'expense'>('report');

  // Report fields
  const [reportDate, setReportDate] = useState(defaultDate);
  const [idNumber, setIdNumber] = useState('');
  const [tripsCount, setTripsCount] = useState<string>('');
  const [cash, setCash] = useState<string>('');
  const [card, setCard] = useState<string>('');
  const [yandex, setYandex] = useState<string>('');
  const [pochta, setPochta] = useState<string>('');
  const [reportNote, setReportNote] = useState('');

  // Kassa fields
  const [kassaDate, setKassaDate] = useState(defaultDate);
  const [income, setIncome] = useState<string>('');
  const [expense, setExpense] = useState<string>('');
  const [kassaCategory, setKassaCategory] = useState<ExpenseCategory>('tovar');
  const [kassaNote, setKassaNote] = useState('');

  // Validation error state
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (defaultDate) {
      setReportDate(defaultDate);
      setKassaDate(defaultDate);
    }
  }, [defaultDate, isOpen]);

  if (!isOpen) return null;

  // Real-time calculations
  const numCash = Number(cash) || 0;
  const numCard = Number(card) || 0;
  const numYandex = Number(yandex) || 0;
  const numPochta = Number(pochta) || 0;
  const totalReportSum = numCash + numCard + numYandex + numPochta;

  const numIncome = Number(income) || 0;
  const numExpense = Number(expense) || 0;
  const predictedNewBalance = currentKassaBalance + numIncome - numExpense;

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!idNumber.trim()) {
      setError('ID kiritilishi shart! Masalan: 101111');
      return;
    }
    if (!reportDate) {
      setError('Sana tanlanishi shart!');
      return;
    }

    onAddReport({
      date: reportDate,
      idNumber: idNumber.trim(),
      tripsCount: Number(tripsCount) || 0,
      cash: numCash,
      card: numCard,
      yandex: numYandex,
      pochta: numPochta,
      note: reportNote.trim(),
    });

    setSuccessMsg('Otchyot muvaffaqiyatli saqlandi!');
    setTimeout(() => {
      setSuccessMsg(null);
      // Reset inputs but keep date
      setIdNumber('');
      setTripsCount('');
      setCash('');
      setCard('');
      setYandex('');
      setPochta('');
      setReportNote('');
      onClose();
    }, 600);
  };

  const handleKassaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!kassaDate) {
      setError('Sana kiritilishi shart!');
      return;
    }
    if (numIncome === 0 && numExpense === 0) {
      setError('Tushum yoki xarajat summasidan kamida birini kiriting!');
      return;
    }

    onAddKassa({
      date: kassaDate,
      income: numIncome,
      expense: numExpense,
      note: kassaNote.trim() || (numExpense > 0 ? `${formatMoney(numExpense)} ${kassaCategory}` : 'Kunlik kassa tushumi'),
      category: numExpense > 0 ? kassaCategory : undefined,
    });

    setSuccessMsg('Kassa yozuvi saqlandi!');
    setTimeout(() => {
      setSuccessMsg(null);
      setIncome('');
      setExpense('');
      setKassaNote('');
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Yangi hisobot qoʻshish</h2>
              <p className="text-xs text-slate-400">Tezkor kiritish va avtomatik hisoblash</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Type Tabs */}
        <div className="p-3 bg-slate-950/50 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveType('report');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeType === 'report'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>📋 Otchyot</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveType('kassa');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeType === 'kassa'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>💰 Kassa</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveType('cashCard');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeType === 'cashCard'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>💵 Naqd/Karta</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveType('expense');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeType === 'expense'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>📦 Xarajat</span>
          </button>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: OTCHYOT (REPORTS) */}
        {activeType === 'report' && (
          <form onSubmit={handleReportSubmit} className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  📅 Sana <span className="text-amber-400">*</span>
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  🆔 ID raqam <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Masalan: 101111"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-600"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                🚕 Reyslar soni
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={tripsCount}
                onChange={(e) => setTripsCount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Money Inputs */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-emerald-400 mb-1">
                  💵 Naqd (soʻm)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="95 000"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-blue-400 mb-1">
                  💳 Karta (soʻm)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="2 590 000"
                  value={card}
                  onChange={(e) => setCard(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-400 mb-1">
                  🟢 Yandex (soʻm)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="0"
                  value={yandex}
                  onChange={(e) => setYandex(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-400 mb-1">
                  📦 Pochta (soʻm)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="0"
                  value={pochta}
                  onChange={(e) => setPochta(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Izoh / Hudud (ixtiyoriy)
              </label>
              <input
                type="text"
                placeholder="Masalan: Chilonzor yoʻnalishi"
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/70 border border-slate-700/80 text-white text-xs focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* AUTOMATIC TOTAL BOX */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                  Avtomatik Umumiy Kassa
                </span>
                <span className="text-xs text-slate-400">Naqd + Karta + Yandex + Pochta</span>
              </div>
              <div className="text-right">
                <span className="text-lg sm:text-xl font-black text-amber-400 font-mono-num">
                  {formatMoney(totalReportSum)}
                </span>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>SAQLASH</span>
            </button>
          </form>
        )}

        {/* TAB 2: LAYLAK CARGO KASSA */}
        {activeType === 'kassa' && (
          <form onSubmit={handleKassaSubmit} className="p-4 sm:p-5 space-y-4">
            <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
              <span className="text-xs text-slate-400">Hozirgi kassa qoldigʻi:</span>
              <span className="text-sm font-bold font-mono-num text-white">
                {formatMoney(currentKassaBalance)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                📅 Sana <span className="text-amber-400">*</span>
              </label>
              <input
                type="date"
                value={kassaDate}
                onChange={(e) => setKassaDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-emerald-400 mb-1">
                  💰 Tushgan summa
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="505 000"
                  value={income}
                  onChange={(e) => setIncome(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-rose-400 mb-1">
                  📉 Ishlatilgan summa
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="210 000"
                  value={expense}
                  onChange={(e) => setExpense(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>
            </div>

            {numExpense > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  📦 Xarajat kategoriyasi
                </label>
                <select
                  value={kassaCategory}
                  onChange={(e) => setKassaCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="tovar">📦 Tovar</option>
                  <option value="paket">🛍️ Paket / Qadoq</option>
                  <option value="registrator">📱 Video registrator / Texnika</option>
                  <option value="otkazma">💳 Kartaga oʻtkazma / Naqd berildi</option>
                  <option value="yoqilgi">⛽ Yoqilgʻi / Transport</option>
                  <option value="ijara">🏢 Ijara / Kommunal</option>
                  <option value="boshqa">📝 Boshqa</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                📝 Izoh
              </label>
              <input
                type="text"
                placeholder={numExpense > 0 ? 'Masalan: 210 000 tovarga' : 'Kassa tushumi izohi'}
                value={kassaNote}
                onChange={(e) => setKassaNote(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* PREVIEW OF FORMULA */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Avtomatik Qolgan Summa
                </span>
                <span className="text-[10px] text-slate-400">Bor boʻlgan + Tushgan - Ishlatilgan</span>
              </div>
              <div className="text-right">
                <span
                  className={`text-lg sm:text-xl font-black font-mono-num ${
                    predictedNewBalance < 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {formatMoney(predictedNewBalance)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>KASSANI SAQLASH</span>
            </button>
          </form>
        )}

        {/* TAB 3: NAQD / KARTA */}
        {activeType === 'cashCard' && (
          <form onSubmit={handleReportSubmit} className="p-4 sm:p-5 space-y-4">
            <p className="text-xs text-slate-400">
              Naqd va karta tushumini kiritganda avtomatik umumiy summa hisoblanadi.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  📅 Sana <span className="text-amber-400">*</span>
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  🆔 ID raqam
                </label>
                <input
                  type="text"
                  placeholder="101111"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-emerald-400 mb-1">
                  💵 Naqd tushum
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="102 000"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-blue-400 mb-1">
                  💳 Karta tushumi
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="917 400"
                  value={card}
                  onChange={(e) => setCard(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Jami (Naqd + Karta):</span>
              <span className="text-lg font-black font-mono-num text-amber-400">
                {formatMoney(numCash + numCard)}
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>SAQLASH</span>
            </button>
          </form>
        )}

        {/* TAB 4: EXPENSE QUICK */}
        {activeType === 'expense' && (
          <form onSubmit={handleKassaSubmit} className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                📅 Sana <span className="text-amber-400">*</span>
              </label>
              <input
                type="date"
                value={kassaDate}
                onChange={(e) => setKassaDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-rose-400 mb-1">
                📉 Xarajat summasi (soʻm) <span className="text-amber-400">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="210 000"
                value={expense}
                onChange={(e) => setExpense(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-rose-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Kategoriya
              </label>
              <select
                value={kassaCategory}
                onChange={(e) => setKassaCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="tovar">📦 Tovar</option>
                <option value="paket">🛍️ Paket / Qadoq</option>
                <option value="registrator">📱 Video registrator / Texnika</option>
                <option value="otkazma">💳 Kartaga oʻtkazma / Naqd berildi</option>
                <option value="yoqilgi">⛽ Yoqilgʻi / Transport</option>
                <option value="ijara">🏢 Ijara / Kommunal</option>
                <option value="boshqa">📝 Boshqa</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Izoh
              </label>
              <input
                type="text"
                placeholder="Masalan: 71 000 paketga"
                value={kassaNote}
                onChange={(e) => setKassaNote(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-black text-sm shadow-xl shadow-rose-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>XARAJATNI SAQLASH</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
