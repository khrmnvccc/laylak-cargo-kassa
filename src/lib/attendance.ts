import { api } from './api';
import { dateOf, nowMs, todayTashkent } from './format';
import type { AttendanceRow } from './types';

/** The phone's location, asked for only when the office location is set. */
export function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Bu qurilmada joylashuvni aniqlab boʻlmaydi'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1
        ? 'Joylashuvga ruxsat berilmadi. Brauzer sozlamalarida shu sayt uchun joylashuvni yoqing'
        : 'Joylashuv aniqlanmadi. Qayta urinib koʻring')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export async function markAttendance(kind: 'check-in' | 'check-out', officeSet: boolean) {
  const body = officeSet ? await currentPosition() : {};
  return api(`/attendance/${kind}`, { method: 'POST', body });
}

/** "3 soat 20 daq" */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? `${h} soat ${m % 60} daq` : `${m} daq`;
}

export const minutesBetween = (from: string, to: string | number) =>
  ((typeof to === 'number' ? to : Date.parse(to)) - Date.parse(from)) / 60000;

/** Minutes of one arrival; an arrival still open today counts up to now, an older open one counts nothing. */
export function rowMinutes(r: AttendanceRow): number {
  if (r.check_out_at) return minutesBetween(r.check_in_at, r.check_out_at);
  return dateOf(r.check_in_at) === todayTashkent() ? minutesBetween(r.check_in_at, nowMs()) : 0;
}

export interface DayAttendance {
  day: string;
  userId: string;
  name: string;
  firstIn: string;
  lastOut: string | null;
  minutes: number;
  /** Still at work right now. */
  open: boolean;
  /** An earlier day where "Ketdim" was never pressed. */
  forgot: boolean;
  rows: AttendanceRow[];
}

export function groupByDay(rows: AttendanceRow[]): DayAttendance[] {
  const map = new Map<string, DayAttendance>();
  const today = todayTashkent();
  for (const r of [...rows].sort((a, b) => a.check_in_at.localeCompare(b.check_in_at))) {
    const key = `${r.user_id}|${r.day}`;
    let d = map.get(key);
    if (!d) {
      d = { day: r.day, userId: r.user_id, name: r.user_name, firstIn: r.check_in_at, lastOut: null, minutes: 0, open: false, forgot: false, rows: [] };
      map.set(key, d);
    }
    d.rows.push(r);
    d.minutes += rowMinutes(r);
    if (r.forgot_out) d.forgot = true;
    else if (r.check_out_at && (!d.lastOut || r.check_out_at > d.lastOut)) d.lastOut = r.check_out_at;
    if (!r.check_out_at) {
      if (r.day === today) d.open = true;
      else d.forgot = true;
    }
  }
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name));
}

/** Tashkent wall-clock "YYYY-MM-DDTHH:mm" for a datetime-local input, and back. */
export const toLocalInput = (iso: string) => new Date(Date.parse(iso) + 5 * 3600_000).toISOString().slice(0, 16);
export const fromLocalInput = (v: string) => new Date(`${v}:00+05:00`).toISOString();
