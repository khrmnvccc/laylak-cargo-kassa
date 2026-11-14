// Yandex and Pochta: the owner turns each on or off for new payments and picks the pages
// where it is shown on its own. Where it is hidden, its money is shown inside "Karta".
// Shared by the server (to keep it and refuse switched-off methods) and the browser.

export const EXTRA_METHODS = ['yandex', 'pochta'] as const;
export type ExtraMethod = (typeof EXTRA_METHODS)[number];

export const METHOD_PLACES = [
  { value: 'entry', label: 'Toʻlov kiritish va stiker' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'operations', label: 'Operatsiyalar' },
  { value: 'reports', label: 'Kunlik, haftalik va oylik hisobot' },
  { value: 'balance', label: 'Kassa balansi' },
  { value: 'clients', label: 'Mijozlar' },
] as const;
export type MethodPlace = (typeof METHOD_PLACES)[number]['value'];

export interface MethodRule {
  /** New payments may use it. Old payments always stay counted. */
  active: boolean;
  /** Pages where it is folded into Karta instead of shown by name. */
  hidden: MethodPlace[];
}
export type MethodSettings = Record<ExtraMethod, MethodRule>;

export const DEFAULT_METHODS: MethodSettings = {
  yandex: { active: true, hidden: [] },
  pochta: { active: true, hidden: [] },
};

export function cleanMethods(raw: unknown): MethodSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out = {} as MethodSettings;
  for (const m of EXTRA_METHODS) {
    const v = r[m] && typeof r[m] === 'object' ? r[m] : {};
    const hidden = Array.isArray(v.hidden) ? v.hidden : [];
    out[m] = {
      active: v.active !== false,
      hidden: METHOD_PLACES.map((p) => p.value).filter((p) => hidden.includes(p)),
    };
  }
  return out;
}

/** The page of the site that counts as which place. */
export const PAGE_PLACE: Record<string, MethodPlace> = {
  kassa: 'entry', dashboard: 'dashboard', operations: 'operations', daily: 'reports', periods: 'reports', balance: 'balance', clients: 'clients',
};
