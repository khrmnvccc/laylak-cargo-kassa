import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { LANG } from './lib/i18n';

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

const render = () => createRoot(document.getElementById('root')!).render(<App />);
// Russian / Chinese: start translating before the first render so Uzbek never flashes.
const lang = LANG;
if (lang === 'uz') render();
else import('./lib/i18n-dom').then((m) => m.startTranslator(lang)).finally(render);
