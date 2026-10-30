import type { ReactElement } from 'react';

// Small animated scenes for the dashboard's rotating cards, drawn in the flat style of the Laylak bot.
// Every scene is 160×120 and moves only through the .art-* classes in index.css, so reduced motion stills it.

export type ArtKind = 'income' | 'ops' | 'balance' | 'expense' | 'orders' | 'team';

const GOLD = '#ffd34d';
const GOLD_DARK = '#e0a91c';

function Coin({ x, y, r = 7, className }: { x: number; y: number; r?: number; className?: string }) {
  return (
    <g className={className}>
      <ellipse cx={x} cy={y} rx={r} ry={r} fill={GOLD} stroke={GOLD_DARK} strokeWidth="1.5" />
      <ellipse cx={x} cy={y} rx={r * 0.55} ry={r * 0.55} fill="none" stroke={GOLD_DARK} strokeWidth="1.2" opacity="0.7" />
    </g>
  );
}

function Note({ x, y, className }: { x: number; y: number; className?: string }) {
  return (
    <g className={className}>
      <rect x={x} y={y} width="34" height="18" rx="3" fill="#9be7a9" stroke="#2f9e57" strokeWidth="1.5" />
      <circle cx={x + 17} cy={y + 9} r="4.5" fill="none" stroke="#2f9e57" strokeWidth="1.5" />
      <circle cx={x + 6} cy={y + 9} r="1.5" fill="#2f9e57" />
      <circle cx={x + 28} cy={y + 9} r="1.5" fill="#2f9e57" />
    </g>
  );
}

function Sparkle({ x, y, s = 1, className }: { x: number; y: number; s?: number; className?: string }) {
  return (
    // The animation moves the inner path, so the outer group keeps the placement.
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className={className} fill="#fff" d="M0 -7 C1 -2 2 -1 7 0 C2 1 1 2 0 7 C-1 2 -2 1 -7 0 C-2 -1 -1 -2 0 -7 Z" />
    </g>
  );
}

/** Bars grow, then a line of light draws from the arrow's foot to its tip and coins pop out of it. */
function Income() {
  return (
    <>
      <ellipse cx="80" cy="112" rx="70" ry="5" fill="#000" opacity="0.12" />
      {[[26, 76, 34], [54, 60, 50], [82, 44, 66]].map(([x, y, h], i) => (
        <rect key={x} className="art-bar" style={{ animationDelay: `${i * 0.15}s` }} x={x} y={y} width="20" height={h} rx="5" fill="#fff" opacity={0.28 + i * 0.1} />
      ))}
      <g className="art-glow">
        <polyline className="art-draw" pathLength={1} points="30,100 58,72 80,84 132,30" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <polyline className="art-head" points="112,28 134,28 134,50" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Coin className="art-pop" x={146} y={18} r={6} />
      <Coin className="art-pop art-d2" x={120} y={12} r={5} />
      <Sparkle className="art-twinkle" x={150} y={44} s={0.8} />
    </>
  );
}

/** A card terminal prints a receipt, then a green tick pops on it. */
function Ops() {
  return (
    <>
      <ellipse cx="88" cy="113" rx="58" ry="5" fill="#000" opacity="0.12" />
      <defs>
        <clipPath id="art-slot"><rect x="0" y="0" width="160" height="72" /></clipPath>
      </defs>
      <g clipPath="url(#art-slot)">
        <g className="art-print">
          <path d="M60 18 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 V80 H60 Z" fill="#fff" />
          <rect x="68" y="28" width="30" height="4" rx="2" fill="#93b4f0" />
          <rect x="68" y="38" width="38" height="4" rx="2" fill="#c7d6f5" />
          <rect x="68" y="48" width="24" height="4" rx="2" fill="#c7d6f5" />
          <rect x="68" y="58" width="34" height="4" rx="2" fill="#93b4f0" />
        </g>
      </g>
      <rect x="40" y="68" width="96" height="42" rx="12" fill="#eaf1ff" />
      <rect x="40" y="68" width="96" height="12" rx="6" fill="#c9d9fb" />
      <rect x="54" y="70" width="68" height="5" rx="2.5" fill="#1e3a8a" opacity="0.5" />
      <rect x="52" y="86" width="30" height="16" rx="4" fill="#1e40af" />
      <rect x="56" y="90" width="12" height="3" rx="1.5" fill="#7dd3fc" />
      {[0, 1, 2].map((i) => <circle key={i} cx={96 + i * 11} cy="94" r="3.5" fill="#93b4f0" />)}
      <g className="art-check">
        <circle cx="118" cy="26" r="11" fill="#22c55e" stroke="#fff" strokeWidth="2.5" />
        <path d="M112.5 26 l4 4 l7 -8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

/** Coins drop one by one into a full wallet. */
function Balance() {
  return (
    <>
      <ellipse cx="88" cy="113" rx="60" ry="5" fill="#000" opacity="0.14" />
      <Coin className="art-drop" x={96} y={30} />
      <Coin className="art-drop art-d2" x={84} y={30} r={6} />
      <Coin className="art-drop art-d3" x={108} y={30} r={6} />
      <rect x="40" y="52" width="100" height="58" rx="14" fill="#7a4a24" />
      <rect x="46" y="44" width="80" height="14" rx="4" fill="#9be7a9" stroke="#2f9e57" strokeWidth="1.5" />
      <rect x="40" y="58" width="100" height="52" rx="14" fill="#a8683a" />
      <path d="M140 70 H114 a10 10 0 0 0 0 20 H140 Z" fill="#7a4a24" />
      <circle cx="116" cy="80" r="4.5" fill={GOLD} stroke={GOLD_DARK} strokeWidth="1.5" />
      <path d="M50 66 H100" stroke="#c98a55" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
      <Sparkle className="art-twinkle" x={148} y={40} s={0.8} />
    </>
  );
}

/** Banknotes fly out of an open wallet and drift away. */
function Expense() {
  return (
    <>
      <ellipse cx="70" cy="113" rx="54" ry="5" fill="#000" opacity="0.14" />
      <Note className="art-fly" x={52} y={58} />
      <Note className="art-fly art-d2" x={52} y={58} />
      <Note className="art-fly art-d3" x={52} y={58} />
      <rect x="26" y="66" width="92" height="44" rx="12" fill="#5b2a3c" />
      <rect x="26" y="74" width="92" height="36" rx="12" fill="#8a3b55" />
      <path d="M118 80 H96 a9 9 0 0 0 0 18 H118 Z" fill="#5b2a3c" />
      <circle cx="98" cy="89" r="4" fill={GOLD} stroke={GOLD_DARK} strokeWidth="1.5" />
      <Coin className="art-fall" x={128} y={92} r={6} />
    </>
  );
}

/** Boxes stacked in the warehouse; the top one opens and a toy bear peeks out. */
function Orders() {
  const box = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="3" fill="#e8b36a" />
      <rect x={x + w - 10} y={y} width="10" height={h} rx="3" fill="#c98d45" />
      <rect x={x + w / 2 - 6} y={y} width="12" height={h} fill="#f6dba6" opacity="0.9" />
    </g>
  );
  return (
    <>
      <ellipse cx="94" cy="113" rx="62" ry="5" fill="#000" opacity="0.14" />
      {box(44, 78, 48, 34)}
      {box(96, 78, 48, 34)}
      <text x="56" y="100" fontSize="7" fontWeight="800" fill="#7a4a1a" opacity="0.8">LAYLAK</text>
      <g className="art-bear">
        <circle cx="94" cy="44" r="13" fill="#b07a4f" />
        <circle cx="84" cy="34" r="5" fill="#b07a4f" />
        <circle cx="104" cy="34" r="5" fill="#b07a4f" />
        <circle cx="84" cy="34" r="2.5" fill="#e3b58b" />
        <circle cx="104" cy="34" r="2.5" fill="#e3b58b" />
        <ellipse cx="94" cy="49" rx="6" ry="4.5" fill="#e3b58b" />
        <circle cx="89" cy="42" r="1.8" fill="#2b1a10" />
        <circle cx="99" cy="42" r="1.8" fill="#2b1a10" />
        <ellipse cx="94" cy="47.5" rx="2" ry="1.4" fill="#2b1a10" />
      </g>
      {box(70, 48, 50, 32)}
      <path className="art-flap-l" d="M70 48 L95 48 L88 38 L64 40 Z" fill="#d79f55" />
      <path className="art-flap-r" d="M95 48 L120 48 L126 40 L102 38 Z" fill="#d79f55" />
      <Sparkle className="art-twinkle" x={130} y={30} s={0.8} />
      <Sparkle className="art-twinkle art-d2" x={58} y={30} s={0.6} />
    </>
  );
}

/** A smiling worker waves hello, with little sparkles around. */
function Team() {
  return (
    <>
      <ellipse cx="96" cy="114" rx="34" ry="5" fill="#000" opacity="0.14" />
      <g className="art-bounce">
        <rect x="84" y="92" width="9" height="20" rx="4" fill="#24324d" />
        <rect x="99" y="92" width="9" height="20" rx="4" fill="#24324d" />
        <path d="M78 96 Q78 66 96 66 Q114 66 114 96 Z" fill="#22a05a" />
        <rect x="91" y="70" width="10" height="26" fill="#1b8048" opacity="0.6" />
        <path d="M80 78 Q70 84 72 94" fill="none" stroke="#22a05a" strokeWidth="8" strokeLinecap="round" />
        <circle cx="72" cy="95" r="4.5" fill="#f2c19d" />
        <g className="art-wave">
          <path d="M112 76 Q124 66 126 52" fill="none" stroke="#22a05a" strokeWidth="8" strokeLinecap="round" />
          <circle cx="126" cy="49" r="5" fill="#f2c19d" />
        </g>
        <circle cx="96" cy="50" r="16" fill="#f2c19d" />
        <path d="M80 47 Q80 30 96 30 Q112 30 112 47 Z" fill="#ff8a3d" />
        <rect x="104" y="43" width="14" height="5" rx="2.5" fill="#e56f20" />
        <circle cx="90" cy="52" r="2" fill="#2b1a10" />
        <circle cx="102" cy="52" r="2" fill="#2b1a10" />
        <path d="M89 58 Q96 64 103 58" fill="none" stroke="#2b1a10" strokeWidth="2" strokeLinecap="round" />
        <circle cx="85" cy="58" r="3" fill="#ff8fa3" opacity="0.7" />
        <circle cx="107" cy="58" r="3" fill="#ff8fa3" opacity="0.7" />
      </g>
      <Sparkle className="art-twinkle" x={140} y={36} />
      <Sparkle className="art-twinkle art-d2" x={58} y={44} s={0.7} />
      <path className="art-twinkle art-d3" d="M146 70 c-3 -5 -10 -2 -7 3 l7 7 l7 -7 c3 -5 -4 -8 -7 -3 Z" fill="#ff8fa3" />
    </>
  );
}

const SCENES: Record<ArtKind, () => ReactElement> = { income: Income, ops: Ops, balance: Balance, expense: Expense, orders: Orders, team: Team };

/** play: only the front card moves, and each new card starts its scene from the beginning. */
export function CardArt({ kind, play }: { kind: ArtKind; play: boolean }) {
  const Scene = SCENES[kind];
  return (
    <svg viewBox="0 0 160 120" className={`card-art pointer-events-none absolute bottom-0 right-1 h-[118px] w-[157px] ${play ? 'is-playing' : ''}`} aria-hidden>
      <Scene />
    </svg>
  );
}
