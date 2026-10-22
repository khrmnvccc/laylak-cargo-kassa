import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { Button, IconButton, cx } from './ui';

// "Install the app" banner. Android and desktop Chrome/Edge offer a real install button
// (beforeinstallprompt); iPhone Safari cannot, so it shows the two taps that add the icon.

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

const KEY = 'lk_install_dismissed';
const HIDE_DAYS = 7;

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const inTelegram = () => Boolean((window as any).Telegram?.WebApp?.initData);
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(KEY));
    return at > 0 && Date.now() - at < HIDE_DAYS * 86400_000;
  } catch {
    return false;
  }
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
  }
}

/** `top` on the sign-in page, so it never covers the Kirish button. */
export function InstallPrompt({ top = false }: { top?: boolean }) {
  const [, rerender] = useState(0);
  const [hidden, setHidden] = useState(() => standalone() || inTelegram() || dismissedRecently());
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const ios = isIos();
  if (hidden || (!deferred && !ios)) return null;

  const close = () => {
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ }
    setHidden(true);
  };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === 'accepted') setHidden(true);
    else close();
  };

  return (
    <div className={cx('no-print fixed inset-x-3 z-40 mx-auto max-w-md anim-rise lg:left-auto lg:right-6 lg:mx-0',
      top ? 'top-[calc(0.75rem+env(safe-area-inset-top))] lg:top-6' : 'bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-6')}>
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-[var(--bg)] p-3.5 shadow-pop">
        <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">Ilovani oʻrnating</div>
          {ios ? (
            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
              Pastdagi <Share className="inline size-4 -translate-y-px" /> “Ulashish” tugmasini bosing, keyin <SquarePlus className="inline size-4 -translate-y-px" /> “Bosh ekranga qoʻshish”ni tanlang.
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-2">Kassa telefoningiz yoki kompyuteringizda alohida ilova boʻlib ochiladi.</p>
              <Button variant="primary" size="sm" className="mt-2.5" icon={<Download className="size-4" />} onClick={install}>Oʻrnatish</Button>
            </>
          )}
        </div>
        <IconButton label="Yopish" className="-mr-1 -mt-1" onClick={close}><X className="size-4" /></IconButton>
      </div>
    </div>
  );
}
