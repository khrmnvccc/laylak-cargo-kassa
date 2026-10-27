import { useEffect, useRef } from 'react';

// A handheld scanner acts like a keyboard: it types the code very fast and presses Enter.
// Sticker codes are digits only ("77" + 8 digits), so they read the same in any keyboard layout.
const STICKER_RE = /77\d{8}/;
const MAX_GAP_MS = 60;

/** Opens a sticker from anywhere, for example a code typed by hand. */
export const openSticker = (code: string) => window.dispatchEvent(new CustomEvent('kassa:sticker', { detail: code }));

/** Calls onScan with the sticker code whenever the scanner reads one, on any page. */
export function useStickerScanner(onScan: (code: string) => void) {
  const handler = useRef(onScan);
  handler.current = onScan;
  useEffect(() => {
    let buffer = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      if (now - last > MAX_GAP_MS) buffer = '';
      last = now;
      if (e.key === 'Enter' || e.key === 'Tab') {
        const match = buffer.length >= 10 ? buffer.match(STICKER_RE) : null;
        buffer = '';
        if (!match) return;
        e.preventDefault();
        e.stopPropagation();
        removeTyped(match[0]);
        handler.current(match[0]);
      } else if (e.key.length === 1) {
        buffer = (buffer + e.key).slice(-40);
      }
    };
    const onManual = (e: Event) => handler.current(String((e as CustomEvent).detail));
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('kassa:sticker', onManual);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('kassa:sticker', onManual);
    };
  }, []);
}

/** The scanner also typed the code into whatever field had focus; take it back out. */
function removeTyped(code: string) {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  const at = el.value.lastIndexOf(code);
  if (at < 0) return;
  const next = el.value.slice(0, at) + el.value.slice(at + code.length);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  setter?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
