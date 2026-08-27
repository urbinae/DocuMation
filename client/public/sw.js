self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        data: {
          url: data.url || '/'
        }
      };
      event.waitUntil(
        self.registration.showNotification(data.title || "Notificación de e-ABC DocuMation", options)
      );
    } catch (e) {
      console.error("[SW] Error al procesar datos push:", e);
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const targetUrl = event.notification.data ? event.notification.data.url : '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Intentar enfocar una pestaña existente
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.visibilityState === 'visible') {
          if ('focus' in client) return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
