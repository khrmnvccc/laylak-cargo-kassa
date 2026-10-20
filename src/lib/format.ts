import { LANG } from './i18n';

const L = {
  uz: {
    months: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
    monthsCap: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
    weekdays: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
    weekdaysShort: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
    currency: 'soʻm', scale: ['ming', 'mln', 'mlrd'], today: 'Bugun', yesterday: 'Kecha',
  },
  ru: {
    months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    monthsCap: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    weekdays: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
    weekdaysShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    currency: 'сум', scale: ['тыс.', 'млн', 'млрд'], today: 'Сегодня', yesterday: 'Вчера',
  },
  zh: {
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    monthsCap: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    weekdays: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    weekdaysShort: ['日', '一', '二', '三', '四', '五', '六'],
    currency: '苏姆', scale: ['千', '百万', '十亿'], today: '今天', yesterday: '昨天',
  },
}[LANG];
const NBSP = '\u00a0';

export function groupDigits(value: number): string {
  const sign = value < 0 ? '−' : '';
  return sign + Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function money(value: number | null | undefined): string {
  return `${groupDigits(Number(value) || 0)}${NBSP}${L.currency}`;
}

export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)} ${L.scale[2]}`;
  if (abs >= 1e6) return `${trim(value / 1e6)} ${L.scale[1]}`;
  if (abs >= 1e3) return `${trim(value / 1e3)} ${L.scale[0]}`;
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

/** '2026-10-20' -> '20-oktabr, 2026' (ru: '20 октября 2026', zh: '2026年10月20日') */
export function formatDate(date: string, withYear = true): string {
  const [y, m, d] = date.split('-').map(Number);
  if (LANG === 'zh') return `${withYear ? `${y}年` : ''}${m}月${d}日`;
  if (LANG === 'ru') return `${d} ${L.months[m - 1]}${withYear ? ` ${y}` : ''}`;
  return `${d}-${L.months[m - 1]}${withYear ? `, ${y}` : ''}`;
}

export function formatDateShort(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d}.${String(m).padStart(2, '0')}`;
}

export function weekday(date: string, short = false): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return short ? L.weekdaysShort[day] : L.weekdays[day];
}

export function monthLabel(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return LANG === 'zh' ? `${y}年${m}月` : `${L.monthsCap[m - 1]} ${y}`;
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
  if (d === today) return `${L.today}, ${timeOf(iso)}`;
  if (d === addDays(today, -1)) return `${L.yesterday}, ${timeOf(iso)}`;
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

export const METHODS = [
  { value: 'cash', label: 'Naqd', color: 'var(--cash)' },
  { value: 'card', label: 'Karta', color: 'var(--card)' },
  { value: 'yandex', label: 'Yandex', color: 'var(--yandex)' },
  { value: 'pochta', label: 'Pochta', color: 'var(--pochta)' },
] as const;

/** Card, Yandex and Pochta all land on the card account; the app shows them as one "Karta" total, opened up on demand. */
export const CARD_METHODS = METHODS.filter((m) => m.value !== 'cash');
export const cardTotal = (t?: { card?: number | string; yandex?: number | string; pochta?: number | string } | null) =>
  t ? Number(t.card || 0) + Number(t.yandex || 0) + Number(t.pochta || 0) : 0;
export const PAY_GROUPS = [
  { value: 'cash', label: 'Naqd', color: 'var(--cash)', sum: (t: { cash?: number | string }) => Number(t.cash || 0) },
  { value: 'card', label: 'Karta', color: 'var(--card)', sum: cardTotal },
] as const;
export const isCardMethod = (m: string) => m === 'card' || m === 'yandex' || m === 'pochta';

export const methodLabel = (m: string) => (m === 'yandex' || m === 'pochta' ? `Karta · ${METHODS.find((x) => x.value === m)!.label}` : METHODS.find((x) => x.value === m)?.label ?? m);
export const methodColor = (m: string) => METHODS.find((x) => x.value === m)?.color ?? 'var(--ink-3)';

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
