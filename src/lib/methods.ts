import { useSyncExternalStore } from 'react';
import { cleanMethods, DEFAULT_METHODS, EXTRA_METHODS, PAGE_PLACE, type ExtraMethod, type MethodPlace, type MethodSettings } from './methodsConfig';
import { useRoute } from './router';
import { CARD_METHODS } from './format';

// The owner's Yandex / Pochta switches, kept on the device too so pages open right away.
const KEY = 'lk_methods';
function read(): MethodSettings {
  try { return cleanMethods(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return DEFAULT_METHODS; }
}
let current = read();
const listeners = new Set<() => void>();

export function setMethods(raw: unknown) {
  const next = cleanMethods(raw);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useMethodSettings = () => useSyncExternalStore(subscribe, () => current);

/** Whether a method is shown by name at this place. Naqd and plain Karta always are. */
export function shownAt(s: MethodSettings, method: string, place: MethodPlace | undefined) {
  if (!(EXTRA_METHODS as readonly string[]).includes(method)) return true;
  if (!place) return true;
  return !s[method as ExtraMethod].hidden.includes(place);
}

/** The place the current page counts as, or the one given. */
export function usePlace(place?: MethodPlace): MethodPlace | undefined {
  const route = useRoute();
  return place ?? PAGE_PLACE[route.page];
}

/** Returns a function that moves hidden methods' money into plain card for the current page. */
export function useFold(place?: MethodPlace) {
  const s = useMethodSettings();
  const at = usePlace(place);
  return <T extends { card?: number | string; yandex?: number | string; pochta?: number | string }>(row: T | null | undefined): T | null | undefined => {
    if (!row) return row;
    let out = row;
    for (const m of EXTRA_METHODS) {
      if (shownAt(s, m, at) || !Number(row[m] || 0)) continue;
      out = { ...out, card: Number(out.card || 0) + Number(out[m] || 0), [m]: 0 };
    }
    return out;
  };
}

/** A payment's method as this page shows it: a hidden Yandex/Pochta reads as plain card. */
export function useShownMethod(place?: MethodPlace) {
  const s = useMethodSettings();
  const at = usePlace(place);
  return (method: string) => (shownAt(s, method, at) ? method : 'card');
}

/** Karta's parts shown by name on this page: plain card plus the Yandex/Pochta not hidden here. */
export function useCardMethods(place?: MethodPlace) {
  const s = useMethodSettings();
  const at = usePlace(place);
  return CARD_METHODS.filter((m) => shownAt(s, m.value, at));
}

/** Card methods a new payment may use: switched on and not hidden from payment entry. */
export function useEntryMethods() {
  const s = useMethodSettings();
  return CARD_METHODS.filter((m) => shownAt(s, m.value, 'entry') && (m.value === 'card' || s[m.value as ExtraMethod].active));
}
