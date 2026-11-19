// Service Worker de notificaciones push
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Notificación', body: event.data?.text() || '' };
  }

  const title = data.title || 'Torre Admin';
  const options = {
    body: data.body || '',
    icon: '/vite.svg', // ajusta si tienes un ícono propio
    badge: '/vite.svg',
    data: { link: data.link || '/' },
    tag: data.type || 'torre-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si hay una pestaña abierta del mismo origen, la enfocamos
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', link });
          return;
        }
      }
      // Si no, abrimos una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
    })
  );
});
