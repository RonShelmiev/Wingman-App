// Wingman service worker: offline app shell + notification clicks.
const CACHE = 'wingman-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/icon.svg', '/icons/icon-192.png', '/manifest.webmanifest'])));
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
  // Alarms get Stop + Snooze; the labels follow the language the app was in when it scheduled them.
  const he = /[\u0590-\u05FF]/.test((data.title || '') + (data.body || ''));
  const actions = data.alarm
    ? [{ action: 'stop', title: he ? 'עצירה' : 'Stop' }, { action: 'snooze', title: he ? 'נודניק 10 דק׳' : 'Snooze 10 min' }]
    : [{ action: 'snooze', title: he ? 'להזכיר בעוד 10 דק׳' : 'Remind me in 10 min' }];
  event.waitUntil(
    self.registration.showNotification(data.title || 'Wingman', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
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
  if (event.action === 'stop' && data.deviceId && data.tag) {
    event.waitUntil(
      fetch('/api/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: data.deviceId, keys: [data.tag] }),
      }).catch(() => undefined)
    );
    return;
  }
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
  // The evening recap opens the "move to tomorrow" sheet.
  // Tapping an alarm opens straight into the ringing alarm screen.
  const tag = data.tag ? String(data.tag) : '';
  const url = tag.startsWith('recap@') ? '/?recap=1' : data.alarm && tag ? `/?alarm=${encodeURIComponent(tag)}` : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.length) {
        // Tell an open app directly; navigating would reload it.
        if (data.alarm && tag) { wins[0].postMessage({ type: 'alarm', key: tag }); return wins[0].focus(); }
        return (url === '/' ? Promise.resolve(wins[0]) : wins[0].navigate(url)).then((w) => (w || wins[0]).focus());
      }
      return self.clients.openWindow(url);
    })
  );
});
