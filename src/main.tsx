import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { LANG } from './lib/i18n';
import { registerServiceWorker } from './components/InstallPrompt';

registerServiceWorker();

// Initialize Telegram Mini App if launched inside Telegram.
const tg = (window as any).Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch {
    // Not inside Telegram.
  }
}

// The opening screen in index.html plays to the end (about 1.8 s from the start), then fades into the app.
function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, 1800 - performance.now());
  setTimeout(() => {
    el.classList.add('sp-out');
    setTimeout(() => el.remove(), 400);
  }, wait);
}

const render = () => {
  createRoot(document.getElementById('root')!).render(<App />);
  requestAnimationFrame(hideSplash);
};
// Russian / Chinese: start translating before the first render so Uzbek never flashes.
const lang = LANG;
if (lang === 'uz') render();
else import('./lib/i18n-dom').then((m) => m.startTranslator(lang)).finally(render);
