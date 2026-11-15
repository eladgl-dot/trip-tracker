// App-shell cache. Bump VERSION whenever app files change so phones pick up the new build.
const VERSION = 'tt-v8';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './config.js', './css/app.css',
  './js/app.js', './js/logic.js', './js/ui.js', './js/charts.js', './js/store.js',
  './js/store-firebase.js', './js/store-demo.js', './js/pin.js', './js/rates.js', './js/geo.js', './js/photo.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
// Third-party files that are safe to keep (versioned URLs): Firebase SDK and Google Fonts.
const CACHE_CROSS = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  if (!sameOrigin && !CACHE_CROSS.test(req.url)) return; // Firestore, rates API etc. go straight to the network

  if (sameOrigin) {
    // Network first (fresh code when online), but give up after 3 s on a weak signal and use the cache.
    const fromCache = () => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'));
    const net = fetch(req, { cache: 'no-cache' }).then(res => { // always ask the server if the file changed
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    });
    const slow = new Promise(resolve => setTimeout(resolve, 3000)).then(fromCache).then(r => r || net);
    e.respondWith(Promise.race([net.catch(fromCache), slow]));
  } else {
    // Cache first for versioned third-party files.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
