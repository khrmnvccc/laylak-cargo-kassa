import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Initialize Telegram Mini App if launched inside Telegram
if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
  try {
    const tg = (window as any).Telegram.WebApp;
    tg.ready();
    tg.expand();
  } catch (err) {
    console.warn('Telegram WebApp init notice:', err);
  }
}

createRoot(document.getElementById('root')!).render(<App />);

