import React, { useState, useEffect } from 'react';
import {
  X,
  PlusCircle,
  Wallet,
  FileText,
  CreditCard,
  Receipt,
  Check,
  AlertCircle,
  Calendar,
  Hash,
  Car,
  Banknote,
  Send,
  Package,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { addDaysToDateString, formatMoney, getTodayDateString } from '../utils/formatters';
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

  // Active input quick-add helper target
  const [focusedField, setFocusedField] = useState<'cash' | 'card' | 'yandex' | 'pochta' | 'income' | 'expense'>('cash');

  // Kassa fields
  const [kassaDate, setKassaDate] = useState(defaultDate);
  const [income, setIncome] = useState<string>('');
  const [expense, setExpense] = useState<string>('');
  const [kassaCategory, setKassaCategory] = useState<ExpenseCategory>('tovar');
  const [kassaNote, setKassaNote] = useState('');

  // Validation & alerts
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (defaultDate) {
      setReportDate(defaultDate);
      setKassaDate(defaultDate);
    }
  }, [defaultDate, isOpen]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Real-time numeric calculations
  const numCash = Math.max(0, Number(cash) || 0);
  const numCard = Math.max(0, Number(card) || 0);
  const numYandex = Math.max(0, Number(yandex) || 0);
  const numPochta = Math.max(0, Number(pochta) || 0);
  const totalReportSum = numCash + numCard + numYandex + numPochta;

  // Percentage calculations for breakdown bar
  const cashPct = totalReportSum > 0 ? (numCash / totalReportSum) * 100 : 0;
  const cardPct = totalReportSum > 0 ? (numCard / totalReportSum) * 100 : 0;
  const yandexPct = totalReportSum > 0 ? (numYandex / totalReportSum) * 100 : 0;
  const pochtaPct = totalReportSum > 0 ? (numPochta / totalReportSum) * 100 : 0;

  const numIncome = Math.max(0, Number(income) || 0);
  const numExpense = Math.max(0, Number(expense) || 0);
  const predictedNewBalance = currentKassaBalance + numIncome - numExpense;

  // Quick preset dates
  const setQuickDate = (type: 'today' | 'yesterday') => {
    const iso = addDaysToDateString(getTodayDateString(), type === 'yesterday' ? -1 : 0);
    setReportDate(iso);
    setKassaDate(iso);
  };

  // Quick amount adder helper
  const addAmount = (amount: number) => {
    if (activeType === 'report' || activeType === 'cashCard') {
      if (focusedField === 'cash') {
        setCash(String(numCash + amount));
      } else if (focusedField === 'card') {
        setCard(String(numCard + amount));
      } else if (focusedField === 'yandex') {
        setYandex(String(numYandex + amount));
      } else if (focusedField === 'pochta') {
        setPochta(String(numPochta + amount));
      }
    } else if (activeType === 'kassa') {
      if (focusedField === 'income') {
        setIncome(String(numIncome + amount));
      } else {
        setExpense(String(numExpense + amount));
      }
    } else if (activeType === 'expense') {
      setExpense(String(numExpense + amount));
    }
  };

  const clearFocusedAmount = () => {
    if (activeType === 'report' || activeType === 'cashCard') {
      if (focusedField === 'cash') setCash('');
      if (focusedField === 'card') setCard('');
      if (focusedField === 'yandex') setYandex('');
      if (focusedField === 'pochta') setPochta('');
    } else if (activeType === 'kassa') {
      if (focusedField === 'income') setIncome('');
      if (focusedField === 'expense') setExpense('');
    } else if (activeType === 'expense') {
      setExpense('');
    }
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!idNumber.trim()) {
      setError('ID raqamini kiritish shart! Masalan: 101111');
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

    setSuccessMsg('Kassa yozuvi muvaffaqiyatli saqlandi!');
    setTimeout(() => {
      setSuccessMsg(null);
      setIncome('');
      setExpense('');
      setKassaNote('');
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-xl overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900/95 border border-amber-500/30 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.85)] ring-1 ring-white/10 overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        {/* Top glowing ambient line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-b from-slate-800/90 to-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/25 font-black">
              <PlusCircle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Yangi Hisobot Kiritish
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                  Tezkor
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Laylak Cargo • Avtomatik hisob-kitob va real-vaqt sinxronizatsiya
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 hover:border-slate-600 transition-all active:scale-95"
            title="Yopish (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="p-2.5 sm:p-3 bg-slate-950/70 border-b border-slate-800/80">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setActiveType('report');
                setError(null);
                setFocusedField('cash');
              }}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeType === 'report'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Reys Otchyot</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveType('kassa');
                setError(null);
                setFocusedField('income');
              }}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeType === 'kassa'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Kassa Balansi</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveType('cashCard');
                setError(null);
                setFocusedField('cash');
              }}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeType === 'cashCard'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Naqd / Karta</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveType('expense');
                setError(null);
                setFocusedField('expense');
              }}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeType === 'expense'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Xarajat</span>
            </button>
          </div>
        </div>

        {/* Notifications / Alerts */}
        {error && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5 shadow-sm animate-in slide-in-from-top-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5 shadow-sm animate-in slide-in-from-top-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {/* TAB 1: REYS OTCHYOTI */}
        {activeType === 'report' && (
          <form onSubmit={handleReportSubmit} className="p-4 sm:p-6 space-y-4">
            {/* Row 1: Date & ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Date with quick presets */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sana</span>
                    <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setQuickDate('today')}
                      className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-amber-400 rounded-md border border-slate-700/60 transition-colors"
                    >
                      Bugun
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate('yesterday')}
                      className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-amber-400 rounded-md border border-slate-700/60 transition-colors"
                    >
                      Kecha
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-all font-medium"
                  required
                />
              </div>

              {/* ID raqam */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-amber-400" />
                  <span>ID Raqami</span>
                  <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Masalan: 101111"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-white text-sm font-mono-num font-bold tracking-wider placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-all"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-500 font-mono">
                    ID
                  </span>
                </div>
              </div>
            </div>

            {/* Row 2: Trips count */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-blue-400" />
                  <span>Reyslar soni</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Kunlik qatnovlar miqdori</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  placeholder="0 ta reys"
                  value={tripsCount}
                  onChange={(e) => setTripsCount(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-white text-sm font-mono-num font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-all placeholder:text-slate-600"
                />
                <div className="flex items-center gap-1">
                  {[1, 5, 10, 15].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setTripsCount(String((Number(tripsCount) || 0) + step))}
                      className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono font-bold transition-all active:scale-95"
                    >
                      +{step}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section Divider: Money Channels */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Toʻlov kanallari (soʻm)</span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  Tanlangan maydon: <strong className="text-amber-400 uppercase">{focusedField}</strong>
                </span>
              </div>

              {/* 4 Cards Grid for Channels */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Naqd */}
                <div
                  onClick={() => setFocusedField('cash')}
                  className={`p-3 rounded-2xl border transition-all ${
                    focusedField === 'cash'
                      ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30'
                      : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5" />
                      <span>Naqd pul</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono-num font-bold">
                      {numCash > 0 ? formatMoney(numCash) : '0 soʻm'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="95 000"
                    value={cash}
                    onFocus={() => setFocusedField('cash')}
                    onChange={(e) => setCash(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                </div>

                {/* 2. Karta */}
                <div
                  onClick={() => setFocusedField('card')}
                  className={`p-3 rounded-2xl border transition-all ${
                    focusedField === 'card'
                      ? 'bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/30'
                      : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Karta / Plastik</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono-num font-bold">
                      {numCard > 0 ? formatMoney(numCard) : '0 soʻm'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="2 590 000"
                    value={card}
                    onFocus={() => setFocusedField('card')}
                    onChange={(e) => setCard(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-blue-400 transition-colors"
                  />
                </div>

                {/* 3. Yandex */}
                <div
                  onClick={() => setFocusedField('yandex')}
                  className={`p-3 rounded-2xl border transition-all ${
                    focusedField === 'yandex'
                      ? 'bg-amber-950/40 border-amber-500/60 ring-1 ring-amber-500/30'
                      : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" />
                      <span>Yandex</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono-num font-bold">
                      {numYandex > 0 ? formatMoney(numYandex) : '0 soʻm'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="0"
                    value={yandex}
                    onFocus={() => setFocusedField('yandex')}
                    onChange={(e) => setYandex(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                {/* 4. Pochta */}
                <div
                  onClick={() => setFocusedField('pochta')}
                  className={`p-3 rounded-2xl border transition-all ${
                    focusedField === 'pochta'
                      ? 'bg-purple-950/40 border-purple-500/60 ring-1 ring-purple-500/30'
                      : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      <span>Pochta</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono-num font-bold">
                      {numPochta > 0 ? formatMoney(numPochta) : '0 soʻm'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="0"
                    value={pochta}
                    onFocus={() => setFocusedField('pochta')}
                    onChange={(e) => setPochta(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-purple-400 transition-colors"
                  />
                </div>
              </div>

              {/* Quick Amount Adder Pills */}
              <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> Tezkor:
                </span>
                {[50000, 100000, 500000, 1000000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => addAmount(amt)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-[11px] font-mono-num font-semibold transition-all active:scale-95 shadow-sm"
                  >
                    +{amt >= 1000000 ? `${amt / 1000000} mln` : `${amt / 1000} ming`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearFocusedAmount}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700/60 text-[11px] font-semibold transition-all ml-auto flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Tozalash
                </button>
              </div>
            </div>

            {/* Note field */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Hudud / Qoʻshimcha izoh (ixtiyoriy)
              </label>
              <input
                type="text"
                placeholder="Masalan: Chilonzor yoʻnalishi yoki markaziy filial"
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/80 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-all"
              />
            </div>

            {/* GRAND TOTAL FINANCIAL SHOWCASE CARD */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-500/15 via-slate-800/95 to-slate-900 border border-amber-500/40 shadow-xl shadow-amber-500/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] font-black text-amber-400 uppercase tracking-widest block leading-tight">
                      Umumiy Kassa Summasi
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Naqd + Karta + Yandex + Pochta
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono-num tracking-tight block">
                    {formatMoney(totalReportSum)}
                  </span>
                </div>
              </div>

              {/* Multi-Channel Distribution Bar */}
              {totalReportSum > 0 ? (
                <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
                  <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden flex p-0.5 gap-0.5">
                    {cashPct > 0 && (
                      <div
                        style={{ width: `${cashPct}%` }}
                        className="h-full rounded-sm bg-emerald-400"
                        title={`Naqd: ${cashPct.toFixed(1)}%`}
                      />
                    )}
                    {cardPct > 0 && (
                      <div
                        style={{ width: `${cardPct}%` }}
                        className="h-full rounded-sm bg-blue-400"
                        title={`Karta: ${cardPct.toFixed(1)}%`}
                      />
                    )}
                    {yandexPct > 0 && (
                      <div
                        style={{ width: `${yandexPct}%` }}
                        className="h-full rounded-sm bg-amber-400"
                        title={`Yandex: ${yandexPct.toFixed(1)}%`}
                      />
                    )}
                    {pochtaPct > 0 && (
                      <div
                        style={{ width: `${pochtaPct}%` }}
                        className="h-full rounded-sm bg-purple-400"
                        title={`Pochta: ${pochtaPct.toFixed(1)}%`}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono-num font-medium">
                    <span className="text-emerald-400">Naqd: {cashPct.toFixed(0)}%</span>
                    <span className="text-blue-400">Karta: {cardPct.toFixed(0)}%</span>
                    <span className="text-amber-400">Yandex: {yandexPct.toFixed(0)}%</span>
                    <span className="text-purple-400">Pochta: {pochtaPct.toFixed(0)}%</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-700/50">
                  Summalarni kiriting, umumiy hisob avtomatik shakllanadi
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm sm:text-base tracking-wide shadow-xl shadow-amber-500/25 active:scale-98 transition-all flex items-center justify-center gap-2.5 cursor-pointer border border-amber-300/40"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>HISOBOTNI TASDIQLASH VA SAQLASH</span>
            </button>
          </form>
        )}

        {/* TAB 2: KASSA BALANSI (KIRIM / CHIQIM) */}
        {activeType === 'kassa' && (
          <form onSubmit={handleKassaSubmit} className="p-4 sm:p-6 space-y-4">
            {/* Balance Overview Card */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between shadow-inner">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Kassadagi ayni damdagi qoldiq:</span>
                  <span className="text-xs text-slate-400">Avvalgi kundan oʻtgan summa</span>
                </div>
              </div>
              <span className={`text-base sm:text-lg font-black font-mono-num ${currentKassaBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatMoney(currentKassaBalance)}
              </span>
            </div>

            {/* Date input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Kassa sanasi</span>
                  <span className="text-amber-400">*</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuickDate('today')}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-amber-400 rounded-md border border-slate-700/60"
                  >
                    Bugun
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate('yesterday')}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-amber-400 rounded-md border border-slate-700/60"
                  >
                    Kecha
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={kassaDate}
                onChange={(e) => setKassaDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-all font-medium"
                required
              />
            </div>

            {/* 2 Big Cards: Income and Expense */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Kirim */}
              <div
                onClick={() => setFocusedField('income')}
                className={`p-3.5 rounded-2xl border transition-all ${
                  focusedField === 'income'
                    ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30'
                    : 'bg-slate-800/70 border-slate-700/80 hover:border-slate-600'
                }`}
              >
                <label className="block text-xs font-black text-emerald-400 mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>💰 Tushgan summa (Kirim)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="505 000"
                  value={income}
                  onFocus={() => setFocusedField('income')}
                  onChange={(e) => setIncome(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono-num font-black focus:outline-none focus:border-emerald-400 transition-colors"
                />
                <span className="text-[10px] text-slate-400 font-mono-num mt-1 block">
                  {numIncome > 0 ? formatMoney(numIncome) : '0 soʻm'}
                </span>
              </div>

              {/* Chiqim */}
              <div
                onClick={() => setFocusedField('expense')}
                className={`p-3.5 rounded-2xl border transition-all ${
                  focusedField === 'expense'
                    ? 'bg-rose-950/40 border-rose-500/60 ring-1 ring-rose-500/30'
                    : 'bg-slate-800/70 border-slate-700/80 hover:border-slate-600'
                }`}
              >
                <label className="block text-xs font-black text-rose-400 mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  <span>📉 Ishlatilgan (Chiqim)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="210 000"
                  value={expense}
                  onFocus={() => setFocusedField('expense')}
                  onChange={(e) => setExpense(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono-num font-black focus:outline-none focus:border-rose-400 transition-colors"
                />
                <span className="text-[10px] text-slate-400 font-mono-num mt-1 block">
                  {numExpense > 0 ? formatMoney(numExpense) : '0 soʻm'}
                </span>
              </div>
            </div>

            {/* Quick Adders for Income/Expense */}
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                + Tezkor summa:
              </span>
              {[50000, 100000, 500000, 1000000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => addAmount(amt)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700 text-[11px] font-mono-num font-semibold active:scale-95"
                >
                  +{amt >= 1000000 ? `${amt / 1000000} mln` : `${amt / 1000} ming`}
                </button>
              ))}
            </div>

            {/* Category selection if expense entered */}
            {numExpense > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700/80">
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  📦 Xarajat kategoriyasi
                </label>
                <select
                  value={kassaCategory}
                  onChange={(e) => setKassaCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
                >
                  <option value="tovar">📦 Tovar uchun toʻlov</option>
                  <option value="paket">🛍️ Paket / Qadoqlash materiallari</option>
                  <option value="registrator">📱 Video registrator / Texnika</option>
                  <option value="otkazma">💳 Kartaga oʻtkazma / Naqd berildi</option>
                  <option value="yoqilgi">⛽ Yoqilgʻi / Transport</option>
                  <option value="ijara">🏢 Ombor ijarasi / Kommunal</option>
                  <option value="boshqa">📝 Boshqa xarajat</option>
                </select>
              </div>
            )}

            {/* Note field */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                📝 Izoh
              </label>
              <input
                type="text"
                placeholder={numExpense > 0 ? 'Masalan: Ombor ijarasi uchun' : 'Kunlik kassa tushumi'}
                value={kassaNote}
                onChange={(e) => setKassaNote(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            {/* FORMULA PREVIEW ACCORDION */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/30 via-slate-800/90 to-slate-900 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider block">
                    Avtomatik Yangi Qoldiq
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Bor boʻlgan ({formatMoney(currentKassaBalance)}) + Tushgan - Ishlatilgan
                  </span>
                </div>
                <span
                  className={`text-xl font-black font-mono-num ${
                    predictedNewBalance < 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {formatMoney(predictedNewBalance)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm sm:text-base tracking-wide shadow-xl shadow-amber-500/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border border-amber-400/40"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>KASSANI TASDIQLASH VA SAQLASH</span>
            </button>
          </form>
        )}

        {/* TAB 3: NAQD VA KARTA TAQSIMOTI */}
        {activeType === 'cashCard' && (
          <form onSubmit={handleReportSubmit} className="p-4 sm:p-6 space-y-4">
            <p className="text-xs text-slate-400">
              Kunlik mijozlardan tushgan naqd va plastik karta summalarini kiriting.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sana</span>
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-amber-400" />
                  <span>ID Raqam</span>
                </label>
                <input
                  type="text"
                  placeholder="Masalan: 101111"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div
                onClick={() => setFocusedField('cash')}
                className={`p-3.5 rounded-2xl border transition-all ${
                  focusedField === 'cash'
                    ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30'
                    : 'bg-slate-800/70 border-slate-700/80'
                }`}
              >
                <label className="block text-xs font-bold text-emerald-400 mb-1.5 flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5" />
                  <span>💵 Naqd tushum (soʻm)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="102 000"
                  value={cash}
                  onFocus={() => setFocusedField('cash')}
                  onChange={(e) => setCash(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-emerald-400"
                />
                <span className="text-[10px] text-slate-400 font-mono-num mt-1 block">
                  {numCash > 0 ? formatMoney(numCash) : '0 soʻm'}
                </span>
              </div>

              <div
                onClick={() => setFocusedField('card')}
                className={`p-3.5 rounded-2xl border transition-all ${
                  focusedField === 'card'
                    ? 'bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/30'
                    : 'bg-slate-800/70 border-slate-700/80'
                }`}
              >
                <label className="block text-xs font-bold text-blue-400 mb-1.5 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>💳 Karta tushumi (soʻm)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="917 400"
                  value={card}
                  onFocus={() => setFocusedField('card')}
                  onChange={(e) => setCard(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono-num font-bold focus:outline-none focus:border-blue-400"
                />
                <span className="text-[10px] text-slate-400 font-mono-num mt-1 block">
                  {numCard > 0 ? formatMoney(numCard) : '0 soʻm'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-300 block">Jami Naqd + Karta:</span>
                <span className="text-[10px] text-slate-400">Kunlik umumiy tushum</span>
              </div>
              <span className="text-xl font-black font-mono-num text-amber-400">
                {formatMoney(numCash + numCard)}
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm tracking-wide shadow-xl shadow-amber-500/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border border-amber-400/40"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>SAQLASH</span>
            </button>
          </form>
        )}

        {/* TAB 4: TEZKOR XARAJAT */}
        {activeType === 'expense' && (
          <form onSubmit={handleKassaSubmit} className="p-4 sm:p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Sana</span>
                <span className="text-amber-400">*</span>
              </label>
              <input
                type="date"
                value={kassaDate}
                onChange={(e) => setKassaDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400 font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black text-rose-400 mb-1.5 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                <span>Xarajat summasi (soʻm)</span>
                <span className="text-amber-400">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="210 000"
                value={expense}
                onChange={(e) => setExpense(e.target.value)}
                className="w-full px-3.5 py-3 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-base font-mono-num font-black focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-400"
                required
              />
              <span className="text-xs text-rose-300 font-mono-num font-bold mt-1 block">
                {numExpense > 0 ? formatMoney(numExpense) : '0 soʻm'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Xarajat kategoriyasi
              </label>
              <select
                value={kassaCategory}
                onChange={(e) => setKassaCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-400"
              >
                <option value="tovar">📦 Tovar uchun toʻlov</option>
                <option value="paket">🛍️ Paket / Qadoqlash materiallari</option>
                <option value="registrator">📱 Video registrator / Texnika</option>
                <option value="otkazma">💳 Kartaga oʻtkazma / Naqd berildi</option>
                <option value="yoqilgi">⛽ Yoqilgʻi / Transport</option>
                <option value="ijara">🏢 Ombor ijarasi / Kommunal</option>
                <option value="boshqa">📝 Boshqa xarajat</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Izoh / Kvitansiya
              </label>
              <input
                type="text"
                placeholder="Masalan: 71 000 soʻm qora skotch va paketlar"
                value={kassaNote}
                onChange={(e) => setKassaNote(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 hover:from-rose-400 hover:to-rose-500 text-white font-black text-sm sm:text-base tracking-wide shadow-xl shadow-rose-500/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border border-rose-400/40"
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
