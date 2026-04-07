const CACHE_NAME = 'andrade-pro-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/main.js'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch Event (Offline Support)
self.addEventListener('fetch', (e) => {
  // Ignorar peticiones a Supabase para que no se queden cacheadas erróneamente en la base de datos local
  if (e.request.url.includes('supabase.co')) return;

  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    }).catch(() => {
      // Fallback si no hay conexión y no está en caché
      return caches.match('/index.html');
    })
  );
});

// Activate & Cleanup Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});
