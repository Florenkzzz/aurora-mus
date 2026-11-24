// Aurora Service Worker — офлайн-режим (кэширование)
const CACHE = 'aurora-v2';
const ASSETS = ['./', './index.html', './style.css', './app.js', './pwa.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // iTunes API и внешние ресурсы (картинки, музыка) — сначала сеть, потом кэш
  if (url.hostname.includes('itunes.apple.com') || url.hostname.includes('mzstatic.com') || url.hostname.includes('soundhelix.com')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Локальные файлы — сначала кэш, потом сеть
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((resp) => {
        // Кэшируем только успешные ответы с нашего же сервера
        if (resp.ok && url.origin === location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      });
    })
  );
});