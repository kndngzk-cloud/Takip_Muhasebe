// Uygulama kabugunu onbellege alir: ikon ve dosyalar hizli acilir.
// Veriler (Supabase istekleri) asla onbellege alinmaz; her zaman canli gelir.
const CACHE = 'ssc-v57';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192-v4.png', 'icons/icon-512-v4.png', 'icons/apple-touch-icon-v4.png', 'icons/favicon-32-v4.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // veri istekleri dogrudan aga gider
  // Once ag (yeni surum hemen gelsin), ag yoksa onbellek
  e.respondWith(
    fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('index.html')))
  );
});

// Anlik bildirimler (yeni platform siparisi, urun eslestirme, iade)
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { metin: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.baslik || 'Sipariş • Stok • Cari', {
    body: d.metin || '', icon: 'icons/icon-192-v4.png', badge: 'icons/favicon-32-v4.png', tag: d.etiket || undefined, renotify: !!d.etiket, data: { url: d.url || '#/' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hedef = new URL((e.notification.data && e.notification.data.url) || '#/', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if (w.url.startsWith(self.registration.scope)) { w.navigate(hedef).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(hedef);
  }));
});
