// Wingman service worker: offline app shell + notification clicks.
const CACHE = 'wingman-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/icon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, fall back to cache, so updates show up as soon as you're online.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
  );
});

// Reminders sent by the server while the app is closed.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Wingman', body: event.data ? event.data.text() : '' };
  }
  const actions = [{ action: 'snooze', title: data.alarm ? 'Snooze 10 min' : 'Remind me in 10 min' }];
  event.waitUntil(
    self.registration.showNotification(data.title || 'Wingman', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon.svg',
      badge: '/icon.svg',
      requireInteraction: !!data.alarm,
      renotify: true,
      vibrate: data.alarm ? [400, 200, 400, 200, 400] : [200],
      data,
      actions,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (event.action === 'snooze' && data.deviceId && data.tag) {
    event.waitUntil(
      fetch('/api/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: data.deviceId, key: data.tag, minutes: 10 }),
      }).catch(() => undefined)
    );
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.length) return wins[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
