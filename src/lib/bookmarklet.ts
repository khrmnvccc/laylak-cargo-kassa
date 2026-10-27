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
  // Start from the innermost elements that show a code; a code may be split over several text pieces.
  const CODE = /[A-Z]{2,6}-\d{3,}/;
  const hasCode = (el: Element) => !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) && CODE.test(el.textContent || '');
  for (const leaf of Array.from(document.body.querySelectorAll('*'))) {
    if (!hasCode(leaf) || Array.from(leaf.children).some(hasCode)) continue;
    let row: Element | null = leaf;
    while (row && row.parentElement && row.parentElement !== document.body && codes(text(row.parentElement)) === 1) row = row.parentElement;
    if (row instanceof HTMLElement && codes(text(row)) === 1 && !rows.includes(row)) rows.push(row);
  }
  const shown = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // The tick box: a real checkbox, else the first icon or small empty square in the row (the panel may draw
  // the box as a bare SVG icon). A bare icon is taken with its empty wrapper, where a colour or state may sit.
  const boxOf = (row: HTMLElement) => {
    // The LAYLAK admin panel uses a "… tanlash" toggle button with aria-pressed.
    const toggle = row.querySelector<HTMLElement>('input[type=checkbox],[role=checkbox],[aria-pressed],[class*=elector],[aria-label*=tanla]');
    if (toggle) return toggle;
    const el = Array.from(row.querySelectorAll<Element>('*')).find((e) => {
      if (e.matches('input[type=checkbox],[role=checkbox]')) return true;
      if (e instanceof SVGSVGElement) return shown(e);
      if (e instanceof SVGElement || text(e).trim()) return false;
      const r = e.getBoundingClientRect();
      return r.width >= 10 && r.width <= 32 && Math.abs(r.width - r.height) <= 3;
    });
    if (!el) return undefined;
    let box = el as HTMLElement;
    while (box.parentElement && box.parentElement !== row && !text(box.parentElement).trim() && box.parentElement.children.length === 1) box = box.parentElement;
    return box;
  };
  const said = (el: Element, deep = true): boolean | null => {
    const all = deep ? [el, ...Array.from(el.querySelectorAll('*'))] : [el];
    for (const e of all) {
      if (e instanceof HTMLInputElement && e.type === 'checkbox') return e.checked;
      const a = e.getAttribute('aria-checked') || e.getAttribute('aria-pressed') || e.getAttribute('aria-selected') || e.getAttribute('data-state') || e.getAttribute('data-checked');
      if (a) return /^(true|checked|on|)$/i.test(a);
    }
    return null;
  };
  const plain = (c: string) => /^(transparent|rgba\(.*,\s*0\)|rgb\(255, 255, 255\))$/.test(c);
  // The box may sit inside a small square cell, so its colour is the first one set inside it.
  const coloured = (box: HTMLElement) => [box, ...Array.from(box.querySelectorAll('*'))].some((e) => !(e instanceof SVGElement) && !plain(getComputedStyle(e).backgroundColor));
  const found = rows.map((row) => ({ row, box: boxOf(row) })).filter((r): r is { row: HTMLElement; box: HTMLElement } => Boolean(r.box));
  const page = text(document.body);
  const told = Number(page.match(/(\d+)\s*ta\s+buyurtma\s+tanlandi/i)?.[1] || 0);
  // What a box looks like, without its text: ticked and unticked boxes look different.
  const look = (box: HTMLElement) => `${coloured(box)}|${box.outerHTML.replace(/>[^<]*</g, '><').replace(/\s(title|alt|value)="[^"]*"/g, '')}`;
  const weight = (box: HTMLElement) => (coloured(box) ? 1000 : 0) + Array.from(box.querySelectorAll('path,polyline,line,rect,circle')).filter(shown).length;
  let ticked: typeof found;
  if (!found.length && told >= rows.length) {
    // No box to read, but the panel says at least as many are ticked as there are rows: all of them are.
    ticked = rows.map((row) => ({ row, box: row }));
  } else if (found.some((r) => said(r.box) !== null || said(r.row, false) !== null)) {
    ticked = found.filter((r) => said(r.box) ?? said(r.row, false) ?? false);
  } else {
    const groups = new Map<string, typeof found>();
    found.forEach((r) => groups.set(look(r.box), [...(groups.get(look(r.box)) || []), r]));
    if (groups.size > 1) {
      // The ticked look carries the fill or the extra tick stroke.
      const best = Math.max(...found.map((r) => weight(r.box)));
      ticked = found.filter((r) => weight(r.box) === best);
    } else {
      // One look for all: the panel's own "N ta buyurtma tanlandi" says whether that look is ticked.
      ticked = told || found.every((r) => coloured(r.box) || /[✓✔]/.test(r.box.textContent || '')) ? found : [];
    }
  }
  const report = () => prompt('Zakladka belgilangan buyurtmalarni toʻgʻri topa olmadi. Shu matnni nusxa olib kassa dasturchisiga yuboring:',
    `${rows.length} qator, ${found.length} katak: ${(found[0] ? found[0].box.outerHTML : rows[0]?.outerHTML || document.body.outerHTML.slice(0, 3000))
      .replace(/>[^<]*</g, '><').replace(/\s(title|alt|value|href|src)="[^"]*"/g, '').slice(0, 900)}`);
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
