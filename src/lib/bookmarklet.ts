// A bookmark the cashier keeps in the browser. Clicked on the admin panel's orders page, it takes the
// page text and opens the kassa with that list in the import dialog. The text travels in window.name
// (not the address), so it never reaches a server or the browser history.
export const BOOKMARK_PREFIX = 'laylak-orders:';

export function bookmarkletHref(origin = window.location.origin): string {
  const code = `(()=>{const t=document.body.innerText;if(!/[A-Z]{1,6}-?\\d{3,}/i.test(t)){alert('Bu sahifada buyurtmalar topilmadi');return;}window.open(${JSON.stringify(`${origin}/#/orders?import=1`)},${JSON.stringify(BOOKMARK_PREFIX)}+t);})()`;
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
