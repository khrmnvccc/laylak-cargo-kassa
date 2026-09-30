import * as XLSX from 'xlsx';
import { ReportRecord, CashRecord, DecadeSummary, MonthlySummary, ExpenseRecord } from '../types';
import { formatDateUz, parseDateInput, getDecadeInfo } from './formatters';

export function exportToExcel(
  type: 'all' | 'today' | 'decade' | 'monthly' | 'kassa' | 'reports' | 'cashCard',
  data: {
    reports: ReportRecord[];
    kassa: CashRecord[];
    expenses: ExpenseRecord[];
    decadeSummaries: DecadeSummary[];
    monthlySummaries: MonthlySummary[];
    todayDate: string;
  }
) {
  const wb = XLSX.utils.book_new();

  // 1. KASSA SHEET
  if (['all', 'kassa', 'today'].includes(type)) {
    let kassaRows = [...data.kassa];
    if (type === 'today') {
      kassaRows = kassaRows.filter((k) => k.date === data.todayDate);
    }
    const kassaExportData = kassaRows.map((k) => ({
      Sana: formatDateUz(k.date),
      "Bor bo'lgan summa (so'm)": k.startingBalance,
      "Tushgan summa (so'm)": k.income,
      "Ishlatilgan summa (so'm)": k.expense,
      "Qolgan summa (so'm)": k.balance,
      Izoh: k.note || '',
    }));
    const wsKassa = XLSX.utils.json_to_sheet(kassaExportData);
    XLSX.utils.book_append_sheet(wb, wsKassa, 'Laylak Cargo Kassa');
  }

  // 2. OTCHYOTLAR (REPORTS) SHEET
  if (['all', 'reports', 'today'].includes(type)) {
    let reportRows = [...data.reports];
    if (type === 'today') {
      reportRows = reportRows.filter((r) => r.date === data.todayDate);
    }
    const reportExportData = reportRows.map((r) => ({
      Sana: formatDateUz(r.date),
      ID: r.idNumber,
      'Reyslar soni': r.tripsCount,
      "Naqd (so'm)": r.cash,
      "Karta (so'm)": r.card,
      "Yandex (so'm)": r.yandex,
      "Pochta (so'm)": r.pochta,
      "Umumiy kassa (so'm)": r.total,
      '10 kunlik davr': r.period10Days || '',
      Izoh: r.note || '',
    }));
    const wsReports = XLSX.utils.json_to_sheet(reportExportData);
    XLSX.utils.book_append_sheet(wb, wsReports, 'Otchyotlar');
  }

  // 3. NAQD VA KARTA SHEET
  if (['all', 'cashCard'].includes(type)) {
    // Group reports by date for cash/card summary
    const dateMap = new Map<string, { cash: number; card: number; total: number; trips: number }>();
    data.reports.forEach((r) => {
      const prev = dateMap.get(r.date) || { cash: 0, card: 0, total: 0, trips: 0 };
      dateMap.set(r.date, {
        cash: prev.cash + r.cash,
        card: prev.card + r.card,
        total: prev.total + (r.cash + r.card),
        trips: prev.trips + r.tripsCount,
      });
    });

    const cashCardRows = Array.from(dateMap.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .map(([date, vals]) => ({
        Sana: formatDateUz(date),
        "Naqd tushum (so'm)": vals.cash,
        "Karta tushumi (so'm)": vals.card,
        "Umumiy tushum (so'm)": vals.total,
        'Reyslar soni': vals.trips,
      }));
    const wsCashCard = XLSX.utils.json_to_sheet(cashCardRows);
    XLSX.utils.book_append_sheet(wb, wsCashCard, 'Naqd va Karta');
  }

  // 4. 10 KUNLIK HISOBOT SHEET
  if (['all', 'decade'].includes(type)) {
    const decadeRows = data.decadeSummaries.map((d) => ({
      Davr: d.periodLabel,
      'Jami reyslar': d.tripsCount,
      "Jami naqd (so'm)": d.cash,
      "Jami karta (so'm)": d.card,
      "Jami Yandex (so'm)": d.yandex,
      "Jami pochta (so'm)": d.pochta,
      "Umumiy kassa (so'm)": d.total,
      'Yozuvlar soni': d.recordsCount,
    }));
    const wsDecade = XLSX.utils.json_to_sheet(decadeRows);
    XLSX.utils.book_append_sheet(wb, wsDecade, '10 Kunlik Hisobot');
  }

  // 5. OYLIK HISOBOT SHEET
  if (['all', 'monthly'].includes(type)) {
    const monthlyRows = data.monthlySummaries.map((m) => ({
      Oy: m.monthName,
      'Jami reyslar': m.tripsCount,
      "Jami naqd (so'm)": m.cash,
      "Jami karta (so'm)": m.card,
      "Jami Yandex (so'm)": m.yandex,
      "Jami pochta (so'm)": m.pochta,
      "Jami daromad (so'm)": m.totalRevenue,
      "Kassa tushumi (so'm)": m.kassaIncome,
      "Kassa xarajati (so'm)": m.kassaExpense,
      "Oy oxiridagi kassa (so'm)": m.kassaFinalBalance,
    }));
    const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'Oylik Hisobot');
  }

  // 6. XARAJATLAR SHEET
  if (['all', 'kassa'].includes(type) && data.expenses.length > 0) {
    const expenseRows = data.expenses.map((e) => ({
      Sana: formatDateUz(e.date),
      "Summa (so'm)": e.amount,
      Kategoriya: e.category,
      Izoh: e.note,
    }));
    const wsExp = XLSX.utils.json_to_sheet(expenseRows);
    XLSX.utils.book_append_sheet(wb, wsExp, 'Xarajatlar');
  }

  // Generate binary and trigger download
  const fileName = `LaylakCargo_${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// Generate template Excel file so users can see exact columns and structure
export function downloadTemplateExcel() {
  const wb = XLSX.utils.book_new();

  const sampleReports = [
    {
      Sana: '02.09.2026',
      ID: '101111',
      'Reyslar soni': 14,
      Naqd: 95000,
      Karta: 2590000,
      Yandex: 150000,
      Pochta: 50000,
      'Umumiy kassa': 2885000,
      Izoh: 'Markaziy zona',
    },
    {
      Sana: '02.09.2026',
      ID: '102222',
      'Reyslar soni': 8,
      Naqd: 120000,
      Karta: 850000,
      Yandex: 0,
      Pochta: 0,
      'Umumiy kassa': 970000,
      Izoh: 'Chilonzor',
    },
  ];

  const sampleKassa = [
    {
      Sana: '02.09.2026',
      "Bor bo'lgan summa": 0,
      'Tushgan summa': 149400,
      'Ishlatilgan summa': 210000,
      'Qolgan summa': -60600,
      Izoh: '210 000 tovarga',
    },
    {
      Sana: '03.09.2026',
      "Bor bo'lgan summa": -60600,
      'Tushgan summa': 174800,
      'Ishlatilgan summa': 0,
      'Qolgan summa': 114200,
      Izoh: 'Kunlik tushum',
    },
    {
      Sana: '04.09.2026',
      "Bor bo'lgan summa": 114200,
      'Tushgan summa': 108000,
      'Ishlatilgan summa': 200000,
      'Qolgan summa': 22200,
      Izoh: '200 000 tovar toʻlovi',
    },
  ];

  const wsRep = XLSX.utils.json_to_sheet(sampleReports);
  const wsKas = XLSX.utils.json_to_sheet(sampleKassa);

  XLSX.utils.book_append_sheet(wb, wsKas, 'Kassa');
  XLSX.utils.book_append_sheet(wb, wsRep, 'Otchyot');

  XLSX.writeFile(wb, 'Laylak_Cargo_namuna_kassa_va_otchyot.xlsx');
}

// Parse imported Excel file
export function parseExcelFile(file: File): Promise<{
  reports: ReportRecord[];
  kassa: CashRecord[];
  errors: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const parsedReports: ReportRecord[] = [];
        const parsedKassa: CashRecord[] = [];
        const errors: string[] = [];

        workbook.SheetNames.forEach((sheetName) => {
          const ws = workbook.Sheets[sheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(ws);
          if (!rows || rows.length === 0) return;

          // Detect columns
          const firstRow = rows[0];
          const keys = Object.keys(firstRow).map((k) => k.toLowerCase().trim());

          const isKassaSheet =
            keys.some((k) => k.includes('bor') || k.includes('qolgan') || k.includes('ishlatilgan') || k.includes('tushgan')) ||
            sheetName.toLowerCase().includes('kassa');

          const isReportSheet =
            keys.some((k) => k.includes('id') || k.includes('reys') || k.includes('yandex') || k.includes('pochta')) ||
            sheetName.toLowerCase().includes('otchyot') ||
            sheetName.toLowerCase().includes('hisobot') ||
            sheetName.toLowerCase().includes('report');

          if (isKassaSheet) {
            rows.forEach((row, i) => {
              try {
                // Find fields flexibly
                const rawDate = row['Sana'] || row['Date'] || row['sana'] || row['Kun'] || '';
                const dateStr = parseDateInput(String(rawDate));
                const startingBalance = Number(row["Bor bo'lgan summa"] || row["Bor bo'lgan"] || row['Boshlangich'] || row['Boshlangʻich'] || 0) || 0;
                const income = Number(row['Tushgan summa'] || row['Tushgan'] || row['Tushum'] || 0) || 0;
                const expense = Number(row['Ishlatilgan summa'] || row['Ishlatilgan'] || row['Xarajat'] || 0) || 0;
                const balance = Number(row['Qolgan summa'] || row['Qolgan'] || row['Qoldiq'] || (startingBalance + income - expense)) || 0;
                const note = String(row['Izoh'] || row['Izohlar'] || row['Note'] || '');

                if (dateStr) {
                  parsedKassa.push({
                    id: `import-kas-${Date.now()}-${i}`,
                    date: dateStr,
                    startingBalance,
                    income,
                    expense,
                    balance,
                    note,
                    createdAt: new Date().toISOString(),
                  });
                }
              } catch (rowErr) {
                errors.push(`Kassa varaqasi, qator #${i + 2}: xato`);
              }
            });
          } else if (isReportSheet) {
            rows.forEach((row, i) => {
              try {
                const rawDate = row['Sana'] || row['Date'] || row['sana'] || row['Kun'] || '';
                const dateStr = parseDateInput(String(rawDate));
                const idNumber = String(row['ID'] || row['Id'] || row['id'] || row['Foydalanuvchi ID'] || `ID-${i + 1}`);
                const tripsCount = Number(row['Reyslar soni'] || row['Reys'] || row['Reyslar'] || row['Buyurtmalar'] || 0) || 0;
                const cash = Number(row['Naqd'] || row['Naqd pul'] || 0) || 0;
                const card = Number(row['Karta'] || row['Plastik'] || 0) || 0;
                const yandex = Number(row['Yandex'] || row['Yandeks'] || 0) || 0;
                const pochta = Number(row['Pochta'] || row['Post'] || 0) || 0;
                const total = cash + card + yandex + pochta;
                const note = String(row['Izoh'] || row['Note'] || '');
                const decadeInfo = getDecadeInfo(dateStr);

                if (dateStr) {
                  parsedReports.push({
                    id: `import-rep-${Date.now()}-${i}`,
                    date: dateStr,
                    idNumber,
                    tripsCount,
                    cash,
                    card,
                    yandex,
                    pochta,
                    total,
                    period10Days: decadeInfo.label,
                    note,
                    createdAt: new Date().toISOString(),
                  });
                }
              } catch (rowErr) {
                errors.push(`Otchyot varaqasi, qator #${i + 2}: xato`);
              }
            });
          }
        });

        resolve({
          reports: parsedReports,
          kassa: parsedKassa,
          errors,
        });
      } catch (err: any) {
        reject(new Error(err.message || 'Excel faylni oʻqishda xatolik yuz berdi'));
      }
    };

    reader.onerror = () => reject(new Error('Faylni oʻqishda xatolik'));
    reader.readAsArrayBuffer(file);
  });
}
