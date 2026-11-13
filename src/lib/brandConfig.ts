// How the site looks and is named: the owner sets it in Sozlamalar → Brend va dizayn.
// Shared by the server (to keep it) and the browser (to draw it), so both read it the same way.

export interface BrandSettings {
  /** Shown next to the logo, in the browser tab and on the sign-in page. */
  name: string;
  /** The small line under the name. */
  tagline: string;
  /** Main colour of buttons, links and the active menu item (#rrggbb). */
  color: string;
  /** Own logo as a small PNG/JPEG/WebP data URL; null keeps the stork. */
  logo: string | null;
  /** Big line on the sign-in page. */
  headline: string;
  /** Corners: soft (default), sharp or round. */
  corners: 'soft' | 'sharp' | 'round';
  /** Menu section names, when renamed. */
  groups: Partial<Record<MenuGroup, string>>;
}

export const MENU_GROUPS = ['Asosiy', 'Hisobotlar', 'Boshqaruv'] as const;
export type MenuGroup = (typeof MENU_GROUPS)[number];

export const DEFAULT_BRAND: BrandSettings = {
  name: 'Laylak Cargo',
  tagline: 'Kassa tizimi',
  color: '#007aff',
  logo: null,
  headline: 'Kunlik kassa va hisobotlar — barcha xodimlar uchun yagona bazada.',
  corners: 'soft',
  groups: {},
};

export const COLOR_PRESETS: Array<{ value: string; label: string }> = [
  { value: '#007aff', label: 'Koʻk' },
  { value: '#5856d6', label: 'Binafsha' },
  { value: '#00204f', label: 'Toʻq koʻk' },
  { value: '#248a3d', label: 'Yashil' },
  { value: '#0f8b8d', label: 'Feruza' },
  { value: '#ea7612', label: 'Toʻq sariq' },
  { value: '#d70015', label: 'Qizil' },
  { value: '#1c1c1e', label: 'Qora' },
];

export const BRAND_LIMITS = { name: 30, tagline: 40, headline: 140, group: 20, logo: 200_000 };

const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Keeps only sensible values; anything missing or wrong falls back to the default. */
export function cleanBrand(raw: unknown): BrandSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const color = typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toLowerCase() : DEFAULT_BRAND.color;
  const logo = typeof r.logo === 'string' && r.logo.length <= BRAND_LIMITS.logo && LOGO_RE.test(r.logo) ? r.logo : null;
  const groups: BrandSettings['groups'] = {};
  for (const g of MENU_GROUPS) {
    const v = clip(r.groups?.[g], BRAND_LIMITS.group);
    if (v && v !== g) groups[g] = v;
  }
  return {
    name: clip(r.name, BRAND_LIMITS.name) || DEFAULT_BRAND.name,
    tagline: typeof r.tagline === 'string' ? clip(r.tagline, BRAND_LIMITS.tagline) : DEFAULT_BRAND.tagline,
    color,
    logo,
    headline: clip(r.headline, BRAND_LIMITS.headline) || DEFAULT_BRAND.headline,
    corners: r.corners === 'sharp' || r.corners === 'round' ? r.corners : 'soft',
    groups,
  };
}

/** Text on the main colour: white, or near-black on a light colour so it stays readable. */
export function textOn(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#1c1c1e' : '#ffffff';
}
