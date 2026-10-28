// A bookmark the cashier keeps in the browser. Clicked on the admin panel's orders page, it takes the
// ticked orders (or, with none ticked, every page of the list) and opens the kassa with that list in the import dialog. The text travels in window.name
// (not the address), so it never reaches a server or the browser history.
export const BOOKMARK_PREFIX = 'laylak-orders:';

// Runs on the admin panel page, so it must not use anything from this module. With orders ticked,
// only their rows are taken; with none ticked, after a confirmation it turns the panel's pages itself
// (the panel shows 50 at a time) and takes every order on every page. The admin panel draws
// its own tick boxes, so a box counts as ticked by its attributes or, failing those, by a visible tick mark.
function grab(url: string, prefix: string) {
  const codes = (s: string) => (s.match(/[A-Z]{1,6}-?\d{3,}/gi) || []).length;
  const text = (el: Element) => (el as HTMLElement).innerText || '';
  // A row is the largest element that holds exactly one client code.
  const CODE = /[A-Z]{2,6}-\d{3,}/;
  const hasCode = (el: Element) => !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) && CODE.test(el.textContent || '');
  const pageRows = () => {
    const found: HTMLElement[] = [];
    // Start from the innermost elements that show a code; a code may be split over several text pieces.
    for (const leaf of Array.from(document.body.querySelectorAll('*'))) {
      if (leaf.closest('#lk-grab') || !hasCode(leaf) || Array.from(leaf.children).some(hasCode)) continue;
      let row: Element | null = leaf;
      while (row && row.parentElement && row.parentElement !== document.body && codes(text(row.parentElement)) === 1) row = row.parentElement;
      if (row instanceof HTMLElement && codes(text(row)) === 1 && !found.includes(row)) found.push(row);
    }
    return found;
  };
  const rows = pageRows();
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
  if (ticked.length) { window.open(url, prefix + ticked.map((r) => text(r.row)).join('\n')); return; }
  if (!codes(page)) { alert('Bu sahifada buyurtmalar topilmadi'); return; }
  if (!confirm('Hech qaysi buyurtma belgilanmagan. Hamma sahifalardagi buyurtmalarni olaymi? Sahifalarni oʻzim varaqlayman.')) return;
  // The kassa tab is opened now, while the click still counts, so the browser does not block it later.
  const kassa = window.open('about:blank');
  if (!kassa) { alert('Brauzer yangi oynani ochishga ruxsat bermadi. Bu sayt uchun qalqib chiquvchi oynalarga ruxsat bering.'); return; }
  const note = document.createElement('div');
  note.id = 'lk-grab';
  note.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;padding:12px 16px;border-radius:12px;background:#00204f;color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)';
  document.body.appendChild(note);
  const taken = new Map<string, string>();
  const sign = () => pageRows().map(text).join('\n');
  const usable = (el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true'
    && !/disabled/i.test(String(el.className)) && shown(el);
  // The control that shows the next part of the list: an arrow or "next" button, the next page number, or "load more".
  const nextControl = (): HTMLElement | undefined => {
    // Never a cell of an order row (its number of places reads like a page number).
    const inRows = pageRows();
    const all = Array.from(document.querySelectorAll<HTMLElement>('button,a,[role=button],li,span'))
      .filter((e) => !e.closest('#lk-grab') && !inRows.some((r) => r.contains(e)));
    const label = (e: HTMLElement) => `${e.getAttribute('aria-label') || ''} ${e.getAttribute('title') || ''} ${e.getAttribute('rel') || ''}`;
    const arrow = all.find((e) => usable(e) && (/^(›|»|>|→|keyingi|keyingisi|next|далее|следующая|вперед|вперёд)$/i.test(text(e).trim())
      || (!text(e).trim() || text(e).trim().length <= 2) && /next|keyingi|след|дал/i.test(label(e))));
    if (arrow) return arrow;
    const current = all.find((e) => /^\d+$/.test(text(e).trim()) && (e.getAttribute('aria-current') === 'page' || /\b(active|current|selected)\b/i.test(String(e.className))));
    if (current) {
      const n = String(Number(text(current).trim()) + 1);
      const numbered = all.find((e) => e !== current && text(e).trim() === n && usable(e));
      if (numbered) return numbered;
    }
    return all.find((e) => usable(e) && /^(yana|yana yuklash|koʻproq|ko'proq|load more|показать (ещё|еще)|ещё|еще)$/i.test(text(e).trim()));
  };
  const finish = () => {
    note.remove();
    const out = [...taken.values()].join('\n');
    if (!codes(out)) { kassa.close(); alert('Buyurtmalar topilmadi'); return; }
    kassa.name = prefix + out;
    kassa.location.href = url;
  };
  const step = (page: number) => {
    for (const row of pageRows()) taken.set(text(row), text(row));
    note.textContent = `Laylak kassa: ${page}-sahifa, ${taken.size} ta buyurtma olindi…`;
    const next = page < 400 ? nextControl() : undefined;
    if (!next) { finish(); return; }
    const before = sign();
    next.click();
    // Wait for the panel to show the next part; if nothing changes, the list has ended.
    let waited = 0;
    const timer = setInterval(() => {
      waited += 250;
      const now = sign();
      if (now && now !== before) { clearInterval(timer); setTimeout(() => step(page + 1), 300); }
      else if (waited >= 12000) { clearInterval(timer); finish(); }
    }, 250);
  };
  step(1);
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
