const CACHE = 'scan-cook-v1';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192x192.png', '/icon-512x512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch', e => {
  // Don't cache Groq API calls — always fetch live
  if (e.request.url.includes('api.groq.com')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
