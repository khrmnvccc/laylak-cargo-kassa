import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Layers,
  Calendar,
  Wallet,
  Coins,
  FileText,
} from 'lucide-react';
import {
  exportToExcel,
  parseExcelFile,
  downloadTemplateExcel,
} from '../utils/excelHelper';
import {
  ReportRecord,
  CashRecord,
  ExpenseRecord,
  DecadeSummary,
  MonthlySummary,
} from '../types';

interface ExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: ReportRecord[];
  kassa: CashRecord[];
  expenses: ExpenseRecord[];
  decadeSummaries: DecadeSummary[];
  monthlySummaries: MonthlySummary[];
  todayDate: string;
  onBulkImport: (reports: ReportRecord[], kassa: CashRecord[]) => void;
}

export const ExcelModal: React.FC<ExcelModalProps> = ({
  isOpen,
  onClose,
  reports,
  kassa,
  expenses,
  decadeSummaries,
  monthlySummaries,
  todayDate,
  onBulkImport,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'template'>('export');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    success?: boolean;
    message?: string;
    details?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = (
    type: 'all' | 'today' | 'decade' | 'monthly' | 'kassa' | 'reports' | 'cashCard'
  ) => {
    try {
      exportToExcel(type, {
        reports,
        kassa,
        expenses,
        decadeSummaries,
        monthlySummaries,
        todayDate,
      });
    } catch (err: any) {
      alert(`Eksportda xatolik: ${err.message}`);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportStatus(null);

    try {
      const result = await parseExcelFile(file);
      if (result.reports.length === 0 && result.kassa.length === 0) {
        setImportStatus({
          success: false,
          message: 'Excel faylidan mos keluvchi ustunlar yoki varaqlar topilmadi.',
          details: 'Iltimos, namuna shablonini yuklab olib, maʻlumotlarni tekshiring.',
        });
      } else {
        onBulkImport(result.reports, result.kassa);
        setImportStatus({
          success: true,
          message: 'Excel maʻlumotlari muvaffaqiyatli import qilindi!',
          details: `${result.reports.length} ta otchyot va ${result.kassa.length} ta kassa yozuvi qoʻshildi.`,
        });
      }
    } catch (err: any) {
      setImportStatus({
        success: false,
        message: 'Faylni oʻqishda xatolik yuz berdi.',
        details: err.message,
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Excel Integratsiyasi</h2>
              <p className="text-xs text-slate-400">Import qilish, eksport qilish va shablonlar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="p-3 bg-slate-950/60 border-b border-slate-800 grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveTab('export')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'export'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>📤 Eksport</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'import'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>📥 Import</span>
          </button>
          <button
            onClick={() => setActiveTab('template')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'template'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>📋 Shablon</span>
          </button>
        </div>

        {/* TAB 1: EXPORT OPTIONS */}
        {activeTab === 'export' && (
          <div className="p-5 space-y-3">
            <p className="text-xs text-slate-400 mb-2">
              Kerakli hisobot turini tanlang va haqiqiy formatlangan Excel (.xlsx) faylini yuklab oling:
            </p>

            <button
              onClick={() => handleExport('all')}
              className="w-full p-3.5 rounded-2xl bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/40 text-left transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white group-hover:text-emerald-300">
                    Barcha Maʻlumotlar (Toʻliq Backup)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Kassa, Otchyotlar, Naqd/Karta, 10 kunlik, Oylik — barcha varaqlar bilan
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-emerald-400" />
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleExport('today')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs text-amber-400 mb-1">
                  <span className="font-bold">Bugungi Hisobot</span>
                  <Download className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] text-slate-400">Faqat bugungi kun</span>
              </button>

              <button
                onClick={() => handleExport('kassa')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
                  <span className="font-bold">Kassa Varaqasi</span>
                  <Download className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] text-slate-400">Zanjir & xarajatlar</span>
              </button>

              <button
                onClick={() => handleExport('decade')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs text-blue-400 mb-1">
                  <span className="font-bold">10 Kunlik Hisobot</span>
                  <Download className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] text-slate-400">Dekada jamlamalari</span>
              </button>

              <button
                onClick={() => handleExport('monthly')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs text-purple-400 mb-1">
                  <span className="font-bold">Oylik Hisobot</span>
                  <Download className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] text-slate-400">Oylar arxivi</span>
              </button>

              <button
                onClick={() => handleExport('cashCard')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs text-emerald-300 mb-1">
                  <span className="font-bold">Naqd / Karta</span>
                  <Download className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] text-slate-400">Kunlik taqsimot</span>
              </button>

              <button
                onClick={() => handleExport('reports')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs text-amber-300 mb-1">
                  <span className="font-bold">Otchyotlar</span>
                  <Download className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] text-slate-400">ID va reyslar jadvali</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: IMPORT EXCEL */}
        {activeTab === 'import' && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-400">
              Mavjud Excel faylingizni (.xlsx yoki .xls) tanlang. Tizim avtomatik tarzda ustunlarni tahlil qilib,
              Kassa va Otchyotlar boʻlimiga qoʻshadi (mavjud maʻlumotlar yoʻqolmaydi).
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-3xl p-8 text-center cursor-pointer bg-slate-950/40 hover:bg-emerald-950/20 transition-all flex flex-col items-center justify-center gap-3"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Excel faylni tanlang</div>
                <p className="text-xs text-slate-500 mt-1">kassa.xlsx, hisobot.xlsx yoki .xls fayllar</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {isProcessing && (
              <div className="text-xs text-amber-400 text-center animate-pulse">
                Fayl tahlil qilinmoqda va hisoblanmoqda...
              </div>
            )}

            {importStatus && (
              <div
                className={`p-3.5 rounded-2xl border text-xs ${
                  importStatus.success
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  {importStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>{importStatus.message}</span>
                </div>
                {importStatus.details && (
                  <p className="text-[11px] text-slate-300">{importStatus.details}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TEMPLATE DOWNLOAD */}
        {activeTab === 'template' && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-400">
              Laylak Cargo uchun toʻgʻri formatdagi tayyor Excel shablonini yuklab oling. Unda Kassa va Otchyot
              varaqlari namunaviy formulalar bilan joylashgan:
            </p>

            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-750 space-y-2 text-xs text-slate-300">
              <div className="font-bold text-white text-sm">Shablon ustunlari:</div>
              <p>• <strong>Kassa:</strong> Sana, Bor boʻlgan summa, Tushgan, Ishlatilgan, Qolgan, Izoh</p>
              <p>• <strong>Otchyot:</strong> Sana, ID, Reyslar soni, Naqd, Karta, Yandex, Pochta, Umumiy kassa</p>
            </div>

            <button
              onClick={downloadTemplateExcel}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5 stroke-[2.5]" />
              <span>Namuna Shablonini Yuklab Olish (.xlsx)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
