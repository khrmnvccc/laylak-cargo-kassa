// Interface language. Uzbek is the source language of every label in the code; Russian and
// Chinese are applied on top by translating the rendered text (see i18n-dom.ts), so components
// stay written in Uzbek. Dates and money are formatted per language in format.ts.
export type Lang = 'uz' | 'ru' | 'zh';

export const LANGS: Array<{ value: Lang; label: string; short: string }> = [
  { value: 'uz', label: 'Oʻzbekcha', short: 'UZ' },
  { value: 'ru', label: 'Русский', short: 'RU' },
  { value: 'zh', label: '中文', short: '中文' },
];

function read(): Lang {
  try {
    const v = localStorage.getItem('lk_lang');
    return v === 'ru' || v === 'zh' ? v : 'uz';
  } catch {
    return 'uz';
  }
}

export const LANG: Lang = read();

/** Switching reloads the page so every label is rendered fresh in the new language. */
export function setLang(lang: Lang) {
  if (lang === LANG) return;
  try {
    if (lang === 'uz') localStorage.removeItem('lk_lang');
    else localStorage.setItem('lk_lang', lang);
  } catch {
    return;
  }
  location.reload();
}
