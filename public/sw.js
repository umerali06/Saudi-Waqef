// Receives pushes while the site is closed. It caches nothing.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: "Saudi Waqef", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) client.postMessage({ type: "notification" });
      // An open, visible tab plays the sound and shows the message itself.
      const visible = clients.some((client) => client.visibilityState === "visible");
      await self.registration.showNotification(message.title || "Saudi Waqef", {
        body: message.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: message.tag || undefined,
        renotify: Boolean(message.tag),
        silent: visible,
        requireInteraction: Boolean(message.urgent) && !visible,
        vibrate: visible ? undefined : [200, 100, 200],
        data: { url: message.url || "/notifications" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url.href).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })()
  );
});

// Browsers rotate subscriptions; the page re-registers on its next visit.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: "window" })
      .then((clients) => clients.forEach((client) => client.postMessage({ type: "resubscribe" })))
  );
});
