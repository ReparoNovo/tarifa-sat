// Service worker: la app abre aunque no haya conexión (con la última tarifa descargada).
// Página y tarifa: primero red, si falla la copia guardada. Resto de archivos: copia guardada.
const VERSION = '202610281028';
const CACHE = 'tarifa-sat-' + VERSION;
const BASE = ['./', 'index.html', 'boot.css', 'boot.js', 'shim.js', 'envios.js', 'estado.js', 'consultor.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(BASE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tarifa-sat-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;               // datos en vivo: nunca desde caché
  const primeroRed = req.mode === 'navigate' || url.pathname.endsWith('/data.enc') || url.pathname.endsWith('/consultor.enc') || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (primeroRed) {
    // no-cache: pregunta siempre al servidor si hay versión nueva (si no, GitHub y el navegador la guardan hasta 10 min).
    // Con mala cobertura la red puede tardar mucho: si a los 6 s no ha contestado, se usa la copia guardada (si la hay).
    const guardada = () => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
    const red = fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; });
    e.respondWith(Promise.race([red.catch(() => null), new Promise(ok => setTimeout(() => ok(null), 6000))])
      .then(r => r || guardada().then(c => c || red))
      .catch(() => guardada()));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
    if (res.ok && (url.origin === location.origin || url.hostname.includes('jsdelivr') || url.hostname.includes('gstatic') || url.hostname.includes('googleapis'))) {
      const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp));
    }
    return res;
  })));
});
