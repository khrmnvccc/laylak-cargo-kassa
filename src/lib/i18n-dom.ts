// Translates the rendered Uzbek interface into Russian or Chinese in place.
// Every text node and the placeholder / aria-label / title / alt attributes are looked up in
// the dictionary; numbers and amounts are swapped for {0}, {1}… so "16 ta operatsiya" and
// "3 ta operatsiya" share one entry. Text that is not in the dictionary (names, IDs, notes) stays as is.
import { ENTRIES } from './i18n-dict';

type Target = 'ru' | 'zh';

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
// A number, optionally grouped with spaces, with its currency or scale word when there is one.
const NUM = /[−-]?\d(?:[\d   .,:]*\d)?(?: ?(?:soʻm|сум|苏姆|mln|ming|mlrd|млн|тыс\.|млрд|万|百万|亿))?/g;

const normalize = (s: string) => s.replace(/[‘’'`ʼ]/g, 'ʻ').replace(/[\s  ]+/g, ' ').trim();

function template(s: string): { key: string; nums: string[] } {
  const nums: string[] = [];
  const key = normalize(s.replace(NUM, (m) => `{${nums.push(m) - 1}}`));
  return { key, nums };
}

let dict: Map<string, string> | null = null;

function build(lang: Target) {
  dict = new Map();
  for (const [uz, ru, zh] of ENTRIES) {
    // Keys are re-templated so "{0}" in the source and real numbers line up the same way.
    const { key } = template(uz.replace(/\{\d\}/g, '7'));
    dict.set(key, lang === 'ru' ? ru : zh);
  }
}

function lookup(core: string): string | null {
  if (!dict || !/[A-Za-zʻ]/.test(core)) return null;
  const { key, nums } = template(core);
  const hit = dict.get(key);
  if (hit !== undefined) return hit.replace(/\{(\d)\}/g, (_, i) => nums[Number(i)] ?? '');
  // "Kassa · Naqd · 16 ta" style labels: translate each part on its own.
  if (core.includes(' · ')) {
    const parts = core.split(' · ');
    const out = parts.map((p) => lookup(p) ?? p);
    if (out.some((p, i) => p !== parts[i])) return out.join(' · ');
  }
  return null;
}

export function translate(text: string): string | null {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!m || !m[2]) return null;
  const t = lookup(m[2]);
  return t === null ? null : m[1] + t + m[3];
}

function translateText(node: Text) {
  const v = node.nodeValue;
  if (!v) return;
  const t = translate(v);
  if (t !== null && t !== v) node.nodeValue = t;
}

function translateAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const t = translate(v);
    if (t !== null && t !== v) el.setAttribute(a, t);
  }
}

export function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateAttrs(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) {
      const tag = n.parentElement?.tagName;
      if (tag !== 'SCRIPT' && tag !== 'STYLE' && tag !== 'TEXTAREA') translateText(n as Text);
    } else translateAttrs(n as Element);
  }
}

export function startTranslator(lang: Target) {
  build(lang);
  document.documentElement.lang = lang === 'ru' ? 'ru' : 'zh-CN';
  translateTree(document.documentElement);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateText(r.target as Text);
      else if (r.type === 'attributes') translateAttrs(r.target as Element);
      else r.addedNodes.forEach((n) => translateTree(n));
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
