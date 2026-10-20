import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

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

createRoot(document.getElementById('root')!).render(<App />);
