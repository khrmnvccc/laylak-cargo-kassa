import { useSyncExternalStore } from 'react';
import { cleanEntry, DEFAULT_ENTRY, type EntrySettings } from './entryConfig';

// The owner's payment-entry settings, kept on the device too so the form opens right away.
const KEY = 'lk_entry';
function read(): EntrySettings {
  try { return cleanEntry(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return DEFAULT_ENTRY; }
}
let current = read();
const listeners = new Set<() => void>();

export function setEntry(raw: unknown) {
  const next = cleanEntry(raw);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useEntrySettings = () => useSyncExternalStore(subscribe, () => current);
