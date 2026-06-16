self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Service worker básico para cumplimiento de PWA installability.
  // Puede ser expandido para caching offline si es necesario.
});
