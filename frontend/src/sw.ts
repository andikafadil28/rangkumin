/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { shouldHandleNavigation } from "./offline/pwaRoutes";
import { parsePushPayload, safeNotificationUrl } from "./webPush";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string }>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("fetch", (event) => {
  // API dan Cloudflare Access selalu melewati network dan tidak masuk cache.
  if (
    !shouldHandleNavigation(
      event.request.url,
      self.location.origin,
      event.request.mode,
    )
  )
    return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const shell = await matchPrecache("/index.html");
      return (
        shell ??
        new Response("Rangkumin belum pernah dibuka online di perangkat ini.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});

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
