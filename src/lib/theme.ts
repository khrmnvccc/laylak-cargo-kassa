import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

function read(): ThemePref {
  try {
    const v = localStorage.getItem('lk_theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => {
    apply(pref);
    try {
      if (pref === 'system') localStorage.removeItem('lk_theme');
      else localStorage.setItem('lk_theme', pref);
    } catch {
      // Storage unavailable; theme still applies for this visit.
    }
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return { pref, setPref, isDark, toggle: () => setPref(document.documentElement.classList.contains('dark') ? 'light' : 'dark') };
}
