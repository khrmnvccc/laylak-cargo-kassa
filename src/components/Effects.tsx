import { useEffect, useRef } from 'react';
import type { BrandSettings, EffectName } from '../lib/brandConfig';
import { brandNow, useShownBrand } from '../lib/brand';

// The moving background the owner picks in Sozlamalar → Brend va dizayn.
// One canvas behind the page: it never takes clicks, draws at most 30 frames a second (stars only
// twinkle, so 15), stops while the tab is hidden, and stays off for people who asked their phone for
// less motion. Dots and glows are drawn once into small pictures and then only stamped each frame:
// drawing every dot from scratch kept a slow computer's processor 5 times busier than the site itself.

const AMOUNT = { low: 0.5, mid: 1, high: 1.8 } as const;
// Office computers and cheap phones with few cores get fewer bits and fewer frames.
const weak = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4;
const frameMs = (effect: EffectName) => 1000 / (effect === 'stars' || effect === 'glow' ? 15 : weak ? 20 : 30);

// A soft round dot (or a glow) of one colour, drawn once and stamped with drawImage after that.
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(color: string, kind: 'dot' | 'glow' | 'ring'): HTMLCanvasElement {
  const id = `${kind}${color}`;
  let c = sprites.get(id);
  if (c) return c;
  const size = kind === 'glow' ? 128 : 32;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  if (kind === 'glow') {
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, rgba(color, 1)); grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
  } else if (kind === 'ring') {
    g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.arc(r, r, r - 1.5, 0, 6.283); g.stroke();
  } else {
    g.fillStyle = color; g.beginPath(); g.arc(r, r, r, 0, 6.283); g.fill();
  }
  sprites.set(id, c);
  return c;
}

interface Bit { x: number; y: number; r: number; vx: number; vy: number; a: number; t: number; spin: number; c: string }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** How many bits for a screen this size: about one per 14 000 px², fewer on small phones. */
function countFor(effect: EffectName, w: number, h: number, amount: number) {
  const base = { none: 0, stars: 70, snow: 60, sparks: 45, bubbles: 22, confetti: 50, petals: 26, glow: 5 }[effect];
  if (effect === 'glow') return base;
  const n = Math.min(base * amount * ((w * h) / (1280 * 800)) ** 0.6, base * amount * 1.4);
  return Math.round(weak ? n * 0.6 : n);
}

function make(effect: EffectName, w: number, h: number, color: string, dark: boolean, fresh: boolean): Bit {
  const y = fresh ? rand(0, h) : 0;
  switch (effect) {
    case 'stars':
      return { x: rand(0, w), y: rand(0, h), r: rand(0.7, 2.2), vx: 0, vy: 0, a: rand(0.4, 1), t: rand(0, 6.28), spin: rand(0.6, 2), c: dark ? pick(['#ffffff', '#ffe9b0', '#cfe3ff']) : color };
    case 'snow':
      return { x: rand(0, w), y: fresh ? y : -10, r: rand(1.2, 3.6), vx: rand(-0.2, 0.2), vy: rand(0.35, 1.1), a: rand(0.5, 0.95), t: rand(0, 6.28), spin: rand(0.4, 1.2), c: dark ? '#ffffff' : '#9fb6d6' };
    case 'sparks':
      return { x: rand(0, w), y: fresh ? y : h + 10, r: rand(0.8, 2.4), vx: rand(-0.25, 0.25), vy: -rand(0.4, 1.3), a: rand(0.5, 1), t: rand(0, 6.28), spin: rand(2, 5), c: pick(['#ffb340', '#ff8a1f', '#ffd36b', '#ff6a3d']) };
    case 'bubbles':
      return { x: rand(0, w), y: fresh ? y : h + 40, r: rand(6, 22), vx: 0, vy: -rand(0.25, 0.7), a: rand(0.25, 0.55), t: rand(0, 6.28), spin: rand(0.5, 1.2), c: color };
    case 'confetti':
      return { x: rand(0, w), y: fresh ? y : -12, r: rand(3, 6), vx: rand(-0.4, 0.4), vy: rand(0.8, 1.8), a: 0.9, t: rand(0, 6.28), spin: rand(-0.12, 0.12), c: pick([color, '#ff3b30', '#ffcc00', '#34c759', '#af52de', '#5ac8fa']) };
    case 'petals':
      return { x: rand(0, w), y: fresh ? y : -14, r: rand(4, 8), vx: rand(0.1, 0.6), vy: rand(0.5, 1.1), a: rand(0.6, 0.9), t: rand(0, 6.28), spin: rand(-0.04, 0.04), c: pick(['#ffb7c5', '#ff9eb5', '#ffd1dc', '#f8a5c2']) };
    case 'glow':
      return { x: rand(0, w), y: rand(0, h), r: rand(0.25, 0.45) * Math.max(w, h), vx: rand(-0.25, 0.25), vy: rand(-0.2, 0.2), a: dark ? 0.16 : 0.1, t: 0, spin: 0, c: pick([color, color, '#af52de', '#5ac8fa']) };
    default:
      return { x: 0, y: 0, r: 0, vx: 0, vy: 0, a: 0, t: 0, spin: 0, c: color };
  }
}

function run(canvas: HTMLCanvasElement, brand: BrandSettings) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const effect = brand.effect;
  const amount = AMOUNT[brand.effectAmount];
  let w = 0, h = 0, bits: Bit[] = [], meteor: Meteor | null = null, nextMeteor = performance.now() + rand(2000, 5000);
  let raf = 0, timer = 0, last = 0;
  const FRAME = frameMs(effect) - 2; // a little slack so a 60 Hz screen doesn't skip every other chance
  const BASE_MS = 1000 / 30; // movement speeds are per 1/30 s, whatever the frame rate
  const dark = () => document.documentElement.classList.contains('dark');

  const resize = () => {
    // Soft dots need no sharp pixels, and the number of pixels is what costs: a half-size canvas,
    // stretched over the screen, looks the same and is a quarter of the work.
    const dpr = effect === 'stars' || effect === 'snow' || effect === 'sparks' || effect === 'glow' ? 0.5 : 0.75;
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = countFor(effect, w, h, amount);
    bits = Array.from({ length: n }, () => make(effect, w, h, brand.color, dark(), true));
  };

  // The next frame is asked for only when it is due. Asking the browser for a frame 60 times a second
  // and skipping most of them still made it redraw the whole screen each time.
  const schedule = () => {
    // A passing meteor moves fast, so it gets the full 30 frames while it is on screen.
    timer = window.setTimeout(() => { raf = requestAnimationFrame(step); }, meteor ? BASE_MS - 2 : FRAME);
  };
  const stop = () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  const step = (now: number) => {
    schedule();
    const k = last ? Math.min((now - last) / BASE_MS, 6) : 1;
    last = now;
    const isDark = dark();
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < bits.length; i++) {
      const b = bits[i];
      b.t += 0.03 * b.spin * k;
      if (effect === 'stars') {
        const a = b.a * (0.45 + 0.55 * Math.sin(b.t));
        ctx.globalAlpha = isDark ? a : a * 0.45;
        ctx.drawImage(sprite(b.c, 'dot'), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        if (b.r > 1.6 && a > 0.7) { // a little cross of light on the brightest ones
          ctx.fillStyle = b.c;
          ctx.fillRect(b.x - b.r * 3, b.y - 0.4, b.r * 6, 0.8);
          ctx.fillRect(b.x - 0.4, b.y - b.r * 3, 0.8, b.r * 6);
        }
        continue;
      }
      b.x += (b.vx + (effect === 'snow' || effect === 'petals' ? Math.sin(b.t) * 0.4 : 0)) * k;
      b.y += b.vy * k;
      if (effect === 'glow') {
        if (b.x < -b.r / 2 || b.x > w + b.r / 2) b.vx *= -1;
        if (b.y < -b.r / 2 || b.y > h + b.r / 2) b.vy *= -1;
        ctx.globalAlpha = b.a;
        ctx.drawImage(sprite(b.c, 'glow'), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        continue;
      }
      const gone = b.vy > 0 ? b.y > h + 20 : b.y < -40;
      if (gone || b.x < -30 || b.x > w + 30) { bits[i] = make(effect, w, h, brand.color, isDark, false); continue; }
      if (effect === 'snow') {
        ctx.globalAlpha = b.a;
        ctx.drawImage(sprite(b.c, 'dot'), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      } else if (effect === 'sparks') {
        const a = Math.max(0, b.a * (0.55 + 0.45 * Math.sin(b.t)) * Math.min(1, b.y / (h * 0.25)));
        const dot = sprite(b.c, 'dot');
        ctx.globalAlpha = a * 0.25;
        ctx.drawImage(dot, b.x - b.r * 3, b.y - b.r * 3, b.r * 6, b.r * 6);
        ctx.globalAlpha = a;
        ctx.drawImage(dot, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      } else if (effect === 'bubbles') {
        const x = b.x + Math.sin(b.t) * 6;
        ctx.globalAlpha = b.a;
        ctx.drawImage(sprite(b.c, 'ring'), x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        ctx.globalAlpha = b.a * 0.8;
        const hr = b.r * 0.18;
        ctx.drawImage(sprite('#ffffff', 'dot'), x - b.r * 0.35 - hr, b.y - b.r * 0.35 - hr, hr * 2, hr * 2);
      } else {
        ctx.globalAlpha = 1;
        // confetti and petals: a turning flat piece
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.t * (effect === 'confetti' ? 3 : 1) + b.spin * 20);
        ctx.scale(1, Math.abs(Math.cos(b.t * 1.7)) * 0.8 + 0.2);
        ctx.fillStyle = rgba(b.c, b.a);
        if (effect === 'confetti') ctx.fillRect(-b.r, -b.r * 0.5, b.r * 2, b.r);
        else { ctx.beginPath(); ctx.ellipse(0, 0, b.r, b.r * 0.55, 0, 0, 6.283); ctx.fill(); }
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;
    // Stars: now and then a meteor crosses the screen, as on the sample video.
    if (effect === 'stars') {
      if (!meteor && now > nextMeteor) {
        const fromLeft = Math.random() < 0.5;
        const speed = rand(9, 14);
        meteor = { x: fromLeft ? rand(-50, w * 0.4) : rand(w * 0.6, w + 50), y: rand(-40, h * 0.3), vx: (fromLeft ? 1 : -1) * speed * 0.8, vy: speed * 0.6, life: 1 };
      }
      if (meteor) {
        const m = meteor;
        m.x += m.vx * k; m.y += m.vy * k; m.life -= 0.012 * k;
        const tail = 14;
        const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail);
        const head = isDark ? '#fff4d6' : brand.color;
        g.addColorStop(0, rgba(head, 0.95 * m.life)); g.addColorStop(0.3, rgba('#ffb340', 0.5 * m.life)); g.addColorStop(1, rgba('#ff8a1f', 0));
        ctx.strokeStyle = g; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail); ctx.stroke();
        ctx.fillStyle = rgba(head, 0.35 * m.life);
        ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, 6.283); ctx.fill();
        if (m.life <= 0 || m.y > h + 100 || m.x < -200 || m.x > w + 200) {
          meteor = null;
          nextMeteor = now + rand(5000, 11000) / amount;
        }
      }
    }
  };

  const onVisible = () => {
    stop();
    if (!document.hidden) { last = 0; raf = requestAnimationFrame(step); }
  };
  resize();
  raf = requestAnimationFrame(step);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stop();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

const lessMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The owner's moving background. `signedIn` decides whether a "sign-in page only" effect shows. */
export function Effects({ signedIn }: { signedIn: boolean }) {
  const brand = useShownBrand();
  const ref = useRef<HTMLCanvasElement>(null);
    // While the owner tries a look in the settings it shows here too, even a sign-in-page-only one.
  const trying = brand !== brandNow();
  const on = brand.effect !== 'none' && !(signedIn && brand.effectWhere === 'login' && !trying) && !lessMotion();
  const key = `${brand.effect}|${brand.effectAmount}|${brand.color}|${brand.effectLayer}`;

  useEffect(() => {
    if (!on || !ref.current) return;
    return run(ref.current, brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);

  if (!on) return null;
  // In front it sits over the menu and cards but under pop-ups (z-50), and never takes a tap.
  const layer = brand.effectLayer === 'front' ? 'z-[45]' : '-z-[1]';
  return <canvas ref={ref} aria-hidden="true" className={`no-print pointer-events-none fixed inset-0 h-full w-full ${layer}`} />;
}
