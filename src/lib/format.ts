const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const MONTHS_CAP = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const WEEKDAYS_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const NBSP = ' ';

export function groupDigits(value: number): string {
  const sign = value < 0 ? '−' : '';
  return sign + Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function money(value: number | null | undefined): string {
  return `${groupDigits(Number(value) || 0)}${NBSP}soʻm`;
}

export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)} mlrd`;
  if (abs >= 1e6) return `${trim(value / 1e6)} mln`;
  if (abs >= 1e3) return `${trim(value / 1e3)} ming`;
  return String(Math.round(value));
}
const trim = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

const tzParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` };
};

/** '2026-10-20' -> '20-oktabr, 2026' */
export function formatDate(date: string, withYear = true): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d}-${MONTHS[m - 1]}${withYear ? `, ${y}` : ''}`;
}

export function formatDateShort(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d}.${String(m).padStart(2, '0')}`;
}

export function weekday(date: string, short = false): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return short ? WEEKDAYS_SHORT[day] : WEEKDAYS[day];
}

export function monthLabel(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${MONTHS_CAP[m - 1]} ${y}`;
}

export function timeOf(iso: string): string {
  return tzParts(iso).time;
}

export function dateOf(iso: string): string {
  return tzParts(iso).date;
}

export function dateTime(iso: string): string {
  const { date, time } = tzParts(iso);
  return `${formatDate(date)}, ${time}`;
}

export function relativeDay(iso: string): string {
  const d = dateOf(iso);
  const today = todayTashkent();
  if (d === today) return `Bugun, ${timeOf(iso)}`;
  if (d === addDays(today, -1)) return `Kecha, ${timeOf(iso)}`;
  return dateTime(iso);
}

export function todayTashkent(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function startOfWeek(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function rangeLabel(from: string, to: string): string {
  if (from === to) return formatDate(from);
  if (from.slice(0, 4) === to.slice(0, 4)) return `${formatDate(from, false)} – ${formatDate(to)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export const methodLabel = (m: string) => (m === 'cash' ? 'Naqd' : 'Karta');

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(escape).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
