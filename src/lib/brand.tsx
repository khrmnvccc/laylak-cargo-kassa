import { useSyncExternalStore } from 'react';
import { cleanBrand, DEFAULT_BRAND, textOn, type BrandSettings, type MenuGroup } from './brandConfig';
import { StorkMark } from '../components/Brand';

// The owner's name, colours and logo. Kept on the device too, so the page opens already looking right,
// then refreshed from the server.
const KEY = 'lk_brand';

function read(): BrandSettings {
  try {
    return cleanBrand(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return DEFAULT_BRAND;
  }
}

let current = read();
const listeners = new Set<() => void>();

const CORNERS: Record<BrandSettings['corners'], [string, string, string, string]> = {
  soft: ['0.625rem', '0.875rem', '1.25rem', '1.625rem'],
  sharp: ['0.25rem', '0.375rem', '0.5rem', '0.625rem'],
  round: ['0.875rem', '1.125rem', '1.625rem', '2rem'],
};

/** A very dark colour would vanish on the dark theme: there it is lifted towards white. */
function forDark(color: string) {
  const n = parseInt(color.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  if (light >= 0.35) return color;
  const mix = 0.55 - light;
  return `#${rgb.map((c) => Math.round(c + (255 - c) * mix).toString(16).padStart(2, '0')).join('')}`;
}

/** The page's look: main colour (and its dark-theme twin), text on it, and corner sizes. */
export function brandCss(b: BrandSettings) {
  const dark = forDark(b.color);
  const [md, lg, xl, xxl] = CORNERS[b.corners];
  // html:root / html.dark outweigh the stylesheet's :root / .dark, whichever loads last.
  return `html:root{--primary:${b.color};--primary-fg:${textOn(b.color)};--r-md:${md};--r-lg:${lg};--r-xl:${xl};--r-2xl:${xxl}}`
    + `html.dark{--primary:${dark};--primary-fg:${textOn(dark)}}`;
}

function apply(b: BrandSettings) {
  let tag = document.getElementById('lk-brand') as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'lk-brand';
    document.head.appendChild(tag);
  }
  tag.textContent = brandCss(b);
}

apply(current);

export function setBrand(raw: unknown) {
  const next = cleanBrand(raw);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  apply(next);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn());
}

/** A look being tried in the settings, before it is saved; null goes back to the saved one. */
export function previewBrand(b: BrandSettings | null) {
  apply(b ?? current);
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useBrand = () => useSyncExternalStore(subscribe, () => current);
export const brandNow = () => current;

/** A menu section's name, as the owner renamed it. */
export const groupLabel = (b: BrandSettings, g: string) => b.groups[g as MenuGroup] || g;

/** The owner's logo, or the stork. */
export function BrandMark({ brand, className }: { brand: BrandSettings; className?: string }) {
  if (brand.logo) return <img src={brand.logo} alt="" className={`${className ?? ''} object-contain`} />;
  return <StorkMark className={className} />;
}
