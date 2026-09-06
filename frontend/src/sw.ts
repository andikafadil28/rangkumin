/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { shouldHandleNavigation } from "./offline/pwaRoutes";

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
