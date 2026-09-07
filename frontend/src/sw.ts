/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { fetchNavigation, shouldHandleNavigation } from "./offline/pwaRoutes";
import { parsePushPayload, safeNotificationUrl } from "./webPush";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string }>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Daftarkan lebih dulu agar navigasi tidak diambil dari precache index lama.
registerRoute(
  ({ request, url }) =>
    shouldHandleNavigation(url.href, self.location.origin, request.mode),
  ({ request }) =>
    fetchNavigation(
      () => fetch(request),
      () => matchPrecache("/index.html"),
    ),
);

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  let value: unknown;
  try {
    value = event.data?.json();
  } catch {
    value = null;
  }
  const payload = parsePushPayload(value);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationData: unknown = event.notification.data;
  const url = safeNotificationUrl(
    typeof notificationData === "object" && notificationData !== null
      ? (notificationData as Record<string, unknown>).url
      : null,
  );

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.navigate(url);
        await existing.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
