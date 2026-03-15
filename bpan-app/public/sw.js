self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'LabLynx',
      body: event.data ? event.data.text() : 'New notification',
    };
  }

  const resolveThreadId = (rawPayload) => {
    const explicit = typeof rawPayload.threadId === 'string' ? rawPayload.threadId.trim() : '';
    if (explicit) return explicit;
    const rawUrl = typeof rawPayload.url === 'string' ? rawPayload.url : '';
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl, self.location.origin);
      return (parsed.searchParams.get('thread_id') || '').trim();
    } catch {
      return '';
    }
  };

  const shouldSuppressChatNotification = async () => {
    const rawUrl = typeof payload.url === 'string' ? payload.url : '';
    if (!rawUrl.includes('/labs/chat')) return false;
    const threadId = resolveThreadId(payload);
    if (!threadId) return false;

    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.visibilityState !== 'visible') continue;
      try {
        const parsed = new URL(client.url);
        if (!parsed.pathname.includes('/labs/chat')) continue;
        const activeThreadId = (parsed.searchParams.get('thread_id') || '').trim();
        if (activeThreadId && activeThreadId === threadId) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  };

  const title = payload.title || 'LabLynx';
  const tag = payload.tag || `lablynk-notification-${Date.now()}`;
  const options = {
    body: payload.body || 'New notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag,
    renotify: true,
    timestamp: Date.now(),
    vibrate: [160, 80, 220],
    data: {
      url: payload.url || '/notifications',
    },
  };

  event.waitUntil((async () => {
    const suppress = await shouldSuppressChatNotification();
    if (suppress) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
