// Makes the kassa installable as an app. It never caches API answers: money and reports always
// come fresh from the server. Built files (hashed names) are cached so the app opens quickly, and
// the start page is kept for when the network drops, so the app shows itself instead of an error.
const CACHE = 'laylak-kassa-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    // Pages: always the newest version from the network; the saved copy only when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === '/') caches.open(CACHE).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
  }
});

// ---------- notifications from the site (Yetkazish: "you have arrived, take the money") ----------

self.addEventListener('push', (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch { m = { title: 'Laylak Cargo', body: event.data ? event.data.text() : '' }; }
  const options = {
    body: m.body || '',
    tag: m.tag,
    renotify: true,
    requireInteraction: Boolean(m.collect),
    icon: '/icons/stork-192.png',
    badge: '/icons/stork-192.png',
    vibrate: [200, 100, 200, 100, 300],
    data: { url: m.url || '/', collect: m.collect || null },
    actions: m.collect ? [{ action: 'took', title: 'Oldim' }, { action: 'not', title: 'Olmadim' }] : [],
  };
  event.waitUntil(self.registration.showNotification(m.title || 'Laylak Cargo', options));
});

async function openSite(url) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of all) {
    if (new URL(c.url).origin === self.location.origin) {
      await c.focus().catch(() => undefined);
      return c.navigate(url).catch(() => undefined);
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const { url, collect } = n.data || {};
  n.close();
  if (collect && (event.action === 'took' || event.action === 'not')) {
    // Answered right on the notification: the money counts at once, without opening the site.
    const took = event.action === 'took';
    event.waitUntil(
      fetch(`/api/delivery/stops/${collect.stopId}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(took ? { collected: true } : { done: true, collected: false }),
      }).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        const sum = String(collect.fee).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return self.registration.showNotification(took ? `✅ ${sum} soʻm qoʻshildi` : 'Pul olinmadi', { body: 'Keyingi manzilga', tag: n.tag, icon: '/icons/stork-192.png' });
      }).catch(() => openSite(url || '/#/delivery')),
    );
    return;
  }
  event.waitUntil(openSite(url || '/'));
});
