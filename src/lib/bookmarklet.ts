// A bookmark the cashier keeps in the browser. Clicked on the admin panel's orders page, it takes the
// ticked orders (or the whole page) and opens the kassa with that list in the import dialog. The text travels in window.name
// (not the address), so it never reaches a server or the browser history.
export const BOOKMARK_PREFIX = 'laylak-orders:';

// Runs on the admin panel page, so it must not use anything from this module. With orders ticked,
// only their rows are taken; with none ticked, the whole page after a confirmation. The admin panel draws
// its own tick boxes, so a box counts as ticked by its attributes or, failing those, by a visible tick mark.
function grab(url: string, prefix: string) {
  const codes = (s: string) => (s.match(/[A-Z]{1,6}-?\d{3,}/gi) || []).length;
  const text = (el: Element) => (el as HTMLElement).innerText || '';
  // A row is the largest element that holds exactly one client code.
  const rows: HTMLElement[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!/[A-Z]{2,6}-\d{3,}/.test(n.nodeValue || '')) continue;
    let row = n.parentElement;
    while (row && row.parentElement && row.parentElement !== document.body && codes(text(row.parentElement)) === 1) row = row.parentElement;
    if (row && codes(text(row)) === 1 && !rows.includes(row)) rows.push(row);
  }
  const shown = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // The tick box: a real checkbox, or the first small empty square in the row.
  const boxOf = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>('*')).find((el) => {
    if (el.matches('input[type=checkbox],[role=checkbox]')) return true;
    if (el instanceof SVGElement || text(el).trim()) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 10 && r.width <= 32 && Math.abs(r.width - r.height) <= 3;
  });
  const said = (el: Element, deep = true): boolean | null => {
    const all = deep ? [el, ...Array.from(el.querySelectorAll('*'))] : [el];
    for (const e of all) {
      if (e instanceof HTMLInputElement && e.type === 'checkbox') return e.checked;
      const a = e.getAttribute('aria-checked') || e.getAttribute('aria-selected') || e.getAttribute('data-state') || e.getAttribute('data-checked');
      if (a) return /^(true|checked|on|)$/i.test(a);
    }
    return null;
  };
  const marked = (box: HTMLElement) => Array.from(box.querySelectorAll('svg,path,polyline')).some(shown) || /[✓✔]/.test(box.textContent || '');
  const plain = (c: string) => /^(transparent|rgba\(.*,\s*0\)|rgb\(255, 255, 255\))$/.test(c);
  // The box may sit inside a small square cell, so its colour is the first one set inside it.
  const coloured = (box: HTMLElement) => [box, ...Array.from(box.querySelectorAll('*'))].some((e) => !(e instanceof SVGElement) && !plain(getComputedStyle(e).backgroundColor));
  const found = rows.map((row) => ({ row, box: boxOf(row) })).filter((r): r is { row: HTMLElement; box: HTMLElement } => Boolean(r.box));
  let ticked = found.filter((r) => said(r.box) ?? said(r.row, false) ?? marked(r.box));
  // When every box carries a mark, the mark tells nothing: a ticked box is the coloured one.
  if (found.length && ticked.length === found.length && found.every((r) => said(r.box) === null)) {
    ticked = found.filter((r) => coloured(r.box));
  }
  const page = text(document.body);
  const told = Number(page.match(/(\d+)\s*ta\s+buyurtma\s+tanlandi/i)?.[1] || 0);
  const report = () => prompt('Zakladka belgilangan buyurtmalarni toʻgʻri topa olmadi. Shu matnni nusxa olib kassa dasturchisiga yuboring:',
    found.slice(0, 2).map((r) => r.box.outerHTML.replace(/>[^<]+</g, '><').slice(0, 400)).join(' | ') || 'katak topilmadi');
  if (!ticked.length && told) { report(); return; }
  if (ticked.length && told && told !== ticked.length
    && !confirm(`Admin panelda ${told} ta belgilangan, zakladka ${ticked.length} tasini topdi. Shularni olaymi?`)) { report(); return; }
  const out = ticked.length ? ticked.map((r) => text(r.row)).join('\n') : page;
  if (!codes(out)) { alert('Bu sahifada buyurtmalar topilmadi'); return; }
  if (!ticked.length && !confirm('Hech qaysi buyurtma belgilanmagan. Sahifadagi hamma buyurtmalarni olaymi?')) return;
  window.open(url, prefix + out);
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
