import { ExpenseCategory } from '../types';

export function formatMoney(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return "0 so'm";
  }
  const num = Math.round(Number(amount));
  const isNegative = num < 0;
  const absFormatted = Math.abs(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${isNegative ? '-' : ''}${absFormatted} so'm`;
}

export function formatNumber(num: number | string | undefined | null): string {
  if (num === undefined || num === null || isNaN(Number(num))) {
    return '0';
  }
  return Number(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatDateUz(dateStr: string): string {
  if (!dateStr) return '';
  // handles YYYY-MM-DD or ISO
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}.${month}.${year}`;
  }
  return dateStr;
}

export function formatDateTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${mins}`;
  } catch {
    return isoStr;
  }
}

export function parseDateInput(dateStr: string): string {
  if (!dateStr) return getTodayDateString();
  if (dateStr.includes('.')) {
    const [day, month, year] = dateStr.split('.');
    if (day && month && year) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  return dateStr.split('T')[0];
}

export function getTodayDateString(): string {
  // Use current local time or September 2026 based on app context
  const d = new Date();
  // If year is before 2026, we can still use real date or sample default
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDecadeInfo(dateStr: string): {
  index: 1 | 2 | 3;
  label: string;
  decadeKey: string;
} {
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  const year = parts[0] || '2026';
  const month = parts[1] || '09';
  const day = parseInt(parts[2] || '1', 10);

  let index: 1 | 2 | 3 = 1;
  let label = '1 - 10 kunlik';

  if (day <= 10) {
    index = 1;
    label = '1 - 10 kun (1-dekada)';
  } else if (day <= 20) {
    index = 2;
    label = '11 - 20 kun (2-dekada)';
  } else {
    index = 3;
    label = '21 - 31 kun (3-dekada)';
  }

  const decadeKey = `${year}-${month}-D${index}`;
  return { index, label, decadeKey };
}

export function getMonthNameUz(monthKey: string): string {
  // monthKey: "2026-09"
  const [year, month] = monthKey.split('-');
  const months: Record<string, string> = {
    '01': 'Yanvar',
    '02': 'Fevral',
    '03': 'Mart',
    '04': 'Aprel',
    '05': 'May',
    '06': 'Iyun',
    '07': 'Iyul',
    '08': 'Avgust',
    '09': 'Sentabr',
    '10': 'Oktyabr',
    '11': 'Noyabr',
    '12': 'Dekabr',
  };
  return `${months[month] || month} ${year}`;
}

export const CATEGORY_LABELS: Record<
  ExpenseCategory,
  { label: string; icon: string; color: string }
> = {
  tovar: { label: 'Tovar', icon: '📦', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  paket: { label: 'Paket / Qadoq', icon: '🛍️', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  registrator: { label: 'Video registrator / Texnika', icon: '📱', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  otkazma: { label: 'Kartaga / Naqd berildi', icon: '💳', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  yoqilgi: { label: 'Yoqilgʻi / Transport', icon: '⛽', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  ijara: { label: 'Ijara / Kommunal', icon: '🏢', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  boshqa: { label: 'Boshqa xarajat', icon: '📝', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
};
