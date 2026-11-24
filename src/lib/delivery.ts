// Yetkazish (delivery): the order to visit a few addresses in, and map links for them.
// Shared by the server (the Telegram bot) and the browser (the Yetkazish page), so both plan the same way.

export interface Point { lat: number; lng: number }
export interface Place extends Point { label?: string }

/** Tashkent and a wide ring around it; a point far outside is almost surely a typo (lat/lng swapped). */
export const inUzbekistan = (p: Point) => p.lat > 37 && p.lat < 46 && p.lng > 55 && p.lng < 74;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function point(lat: number, lng: number): Point | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const p = { lat: round6(lat), lng: round6(lng) };
  // People (and Yandex) write longitude first; in Uzbekistan the two never overlap, so swap a reversed pair.
  if (!inUzbekistan(p) && inUzbekistan({ lat: p.lng, lng: p.lat })) return { lat: p.lng, lng: p.lat };
  return p;
}

/**
 * Coordinates from what someone pasted: "41.311, 69.279", a Google Maps link (…@41.3,69.2…, ?q=41.3,69.2)
 * or a Yandex Maps link (ll=69.2,41.3 / pt=69.2,41.3 / whatshere[point]=69.2,41.3: longitude first).
 * Short links (maps.app.goo.gl, yandex.uz/maps/-/…) carry no numbers; the server opens them first.
 */
export function parsePlace(text: string): Point | null {
  const raw = text.trim();
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* keep as typed */ }
  // Inside a link any decimals do; a bare pair needs a few, so prices and dates are never taken for a place.
  const num = '(-?\\d{1,3}\\.\\d+)';
  const bare = '(-?\\d{1,3}\\.\\d{2,})';
  const pair = (re: RegExp, lngFirst = false) => {
    const m = s.match(re);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    return lngFirst ? point(b, a) : point(a, b);
  };
  if (/yandex|ya\.ru/i.test(s)) {
    return pair(new RegExp(`whatshere\\[point\\]=${num},${num}`), true)
      ?? pair(new RegExp(`[?&]pt=${num},${num}`), true)
      ?? pair(new RegExp(`[?&]ll=${num},${num}`), true)
      ?? pair(new RegExp(`${bare}\\s*,\\s*${bare}`));
  }
  return pair(new RegExp(`@${num},${num}`))
    ?? pair(new RegExp(`!3d${num}!4d${num}`))
    ?? pair(new RegExp(`[?&](?:q|query|ll|destination|daddr)=(?:loc:)?${num},\\s*${num}`))
    ?? pair(new RegExp(`${bare}\\s*[,;\\s]\\s*${bare}`));
}

/** A link that has to be opened to learn where it points (it has no coordinates of its own). */
export const isShortMapLink = (text: string) =>
  /https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|(www\.)?yandex\.(uz|ru|com)\/maps\/-\/|ya\.cc)\//i.test(text);

/** Straight-line distance in kilometres. */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Roads in a city wind about; straight-line km times this is a fair guess at the real drive. */
export const ROAD_FACTOR = 1.35;

function pathKm(start: Point | null, order: Point[]) {
  let km = 0;
  let prev = start;
  for (const p of order) {
    if (prev) km += distanceKm(prev, p);
    prev = p;
  }
  return km;
}

/**
 * The shortest order to visit every place once, starting at `start` (the office) and ending at the last stop.
 * Up to 9 stops every order is tried; more than that, nearest-first and then untangled (2-opt), which is
 * as good in practice for a city evening run.
 */
export function planRoute<T extends Point>(start: Point | null, places: T[]): { order: T[]; km: number } {
  const n = places.length;
  if (n <= 1) return { order: [...places], km: pathKm(start, places) };
  if (n <= 9) {
    let best: number[] = [];
    let bestKm = Infinity;
    const used = new Array(n).fill(false);
    const cur: number[] = [];
    const walk = (prev: Point | null, km: number) => {
      if (km >= bestKm) return;
      if (cur.length === n) { bestKm = km; best = [...cur]; return; }
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        used[i] = true; cur.push(i);
        walk(places[i], km + (prev ? distanceKm(prev, places[i]) : 0));
        cur.pop(); used[i] = false;
      }
    };
    walk(start, 0);
    return { order: best.map((i) => places[i]), km: bestKm };
  }
  // Nearest first.
  const left = [...places];
  const order: T[] = [];
  let at: Point | null = start;
  while (left.length) {
    let k = 0;
    if (at) for (let i = 1; i < left.length; i++) if (distanceKm(at, left[i]) < distanceKm(at, left[k])) k = i;
    at = left.splice(k, 1)[0];
    order.push(at as T);
  }
  // Untangle crossings until nothing improves.
  for (let improved = true, rounds = 0; improved && rounds < 50; rounds++) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const next = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (pathKm(start, next) + 1e-9 < pathKm(start, order)) { order.splice(0, n, ...next); improved = true; }
      }
    }
  }
  return { order, km: pathKm(start, order) };
}

const ll = (p: Point) => `${p.lat},${p.lng}`;

/** One place on Yandex Maps (opens the app on a phone). */
export const yandexPlaceUrl = (p: Point) => `https://yandex.uz/maps/?pt=${p.lng},${p.lat}&z=17&l=map`;
export const googlePlaceUrl = (p: Point) => `https://www.google.com/maps/search/?api=1&query=${ll(p)}`;

/** The whole run as one driving route, stops in order. */
export const yandexRouteUrl = (points: Point[]) => `https://yandex.uz/maps/?rtext=${points.map(ll).join('~')}&rtt=auto`;
export function googleRouteUrl(points: Point[]) {
  const [origin, ...rest] = points;
  const destination = rest.pop() ?? origin;
  const waypoints = rest.map(ll).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${ll(origin)}&destination=${ll(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=driving`;
}

/** "≈ 14 km" with the road guess, rounded so it does not pretend to be exact. */
export const roadKmLabel = (straightKm: number) => {
  const km = straightKm * ROAD_FACTOR;
  return km < 10 ? `≈ ${km.toFixed(1).replace('.', ',')} km` : `≈ ${Math.round(km)} km`;
};

export const MAX_STOPS = 25;
export const MAX_LABEL = 120;
export const MAX_FEE = 10_000_000;
