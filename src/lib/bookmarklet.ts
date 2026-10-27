// A bookmark the cashier keeps in the browser. Clicked on the admin panel's orders page, it takes the
// ticked orders (or the whole page) and opens the kassa with that list in the import dialog. The text travels in window.name
// (not the address), so it never reaches a server or the browser history.
export const BOOKMARK_PREFIX = 'laylak-orders:';

// Runs on the admin panel page, so it must not use anything from this module. With orders ticked,
// only their rows are taken; with none ticked, the whole page after a confirmation.
function grab(url: string, prefix: string) {
  const codes = (s: string) => (s.match(/[A-Z]{1,6}-?\d{3,}/gi) || []).length;
  const rows: HTMLElement[] = [];
  const boxes = document.querySelectorAll<HTMLElement>('input[type=checkbox]:checked,[role=checkbox][aria-checked=true],[data-state=checked]');
  boxes.forEach((box) => {
    let row = box.parentElement;
    while (row && row !== document.body && !codes(row.innerText || '')) row = row.parentElement;
    // The "select all" box sits above many orders; a row holds exactly one.
    if (row && row !== document.body && codes(row.innerText) === 1 && !rows.includes(row)) rows.push(row);
  });
  const text = rows.length ? rows.map((r) => r.innerText).join('\n') : document.body.innerText;
  if (!codes(text)) { alert('Bu sahifada buyurtmalar topilmadi'); return; }
  if (!rows.length && !confirm('Hech qaysi buyurtma belgilanmagan. Sahifadagi hamma buyurtmalarni olaymi?')) return;
  window.open(url, prefix + text);
}

export function bookmarkletHref(origin = window.location.origin): string {
  const code = `(${grab.toString()})(${JSON.stringify(`${origin}/#/orders?import=1`)},${JSON.stringify(BOOKMARK_PREFIX)})`;
  return `javascript:${encodeURIComponent(code)}`;
}

let pending: string | null | undefined;

/** The list the bookmark brought into this tab; it stays until clearBookmarkText, even if the page re-mounts. */
export function bookmarkText(): string | null {
  if (pending === undefined) {
    pending = window.name.startsWith(BOOKMARK_PREFIX) ? window.name.slice(BOOKMARK_PREFIX.length) : null;
    if (pending !== null) window.name = '';
  }
  return pending;
}

export const clearBookmarkText = () => { pending = null; };
