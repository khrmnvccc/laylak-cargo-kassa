import { useEffect, useRef } from 'react';

// A handheld scanner acts like a keyboard: it types the code very fast and presses Enter.
// Sticker codes are digits only ("77" + 8 digits), so they read the same in any keyboard layout.
// The sticker QR holds a link with the code in it; the code is picked out of whatever was typed.
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
    let leaked = ''; // keys of the current burst that reached the focused field
    let held = ''; // keys held back once the burst looked like a scanner
    let last = 0;
    let timer: number | undefined;
    // Keys held back from a fast human typist go into the field after all.
    const release = () => {
      window.clearTimeout(timer);
      if (held) document.execCommand('insertText', false, held);
      held = '';
    };
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      if (now - last > MAX_GAP_MS) { release(); buffer = ''; leaked = ''; }
      last = now;
      if (e.key === 'Enter' || e.key === 'Tab') {
        const scanned = buffer;
        const match = scanned.length >= 10 ? scanned.match(STICKER_RE) : null;
        buffer = '';
        if (!match) { release(); leaked = ''; return; }
        e.preventDefault();
        e.stopPropagation();
        window.clearTimeout(timer);
        held = '';
        removeTyped(leaked, /[/:.#]/.test(scanned));
        leaked = '';
        handler.current(match[0]);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer = (buffer + e.key).slice(-200);
        // A scanner types a whole link this fast; keeping it out of the field spares the page dozens of
        // re-renders (React stops with "Maximum update depth exceeded") and leaves nothing to clean up.
        if (buffer.length > HOLD_AFTER && isEditable(document.activeElement)) {
          e.preventDefault();
          held += e.key;
          window.clearTimeout(timer);
          timer = window.setTimeout(release, MAX_GAP_MS + 20);
        } else {
          leaked += e.key;
        }
      }
    };
    const onManual = (e: Event) => handler.current(String((e as CustomEvent).detail));
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('kassa:sticker', onManual);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('kassa:sticker', onManual);
    };
  }, []);
}

const HOLD_AFTER = 3;
const isEditable = (el: Element | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

/** The first keys of a scan reached the focused field before it was recognised; take them back out. */
function removeTyped(typed: string, link: boolean) {
  const el = document.activeElement;
  if (!typed || !isEditable(el)) return;
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  const value = input.value;
  // A field may change what is typed (capital letters), so the match ignores case.
  let from = value.toLowerCase().lastIndexOf(typed.toLowerCase());
  if (from < 0) return;
  // A link may have begun before the keys came fast enough to notice: its start goes too.
  if (link) while (from > 0 && !/\s/.test(value[from - 1])) from--;
  const next = value.slice(0, from) + value.slice(from + typed.length);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
