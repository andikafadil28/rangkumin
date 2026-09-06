import type { PushStatus } from "./api";

const DEVICE_ID_KEY = "rangkumin-push-device-id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_NOTIFICATION = {
  title: "Rangkumin",
  body: "Ada pembaruan baru di Rangkumin.",
  url: "/",
  tag: "rangkumin-update",
};
const ALLOWED_NOTIFICATION_PATHS = new Set([
  "/",
  "/transactions",
  "/savings",
  "/plans",
  "/settings",
]);

export type PushAvailability =
  { supported: true } | { supported: false; message: string };

export type PushNotificationPayload = typeof DEFAULT_NOTIFICATION;

type PushApi = {
  getStatus: (deviceId: string) => Promise<PushStatus>;
  save: (
    deviceId: string,
    subscription: PushSubscriptionJSON,
  ) => Promise<unknown>;
  remove: (deviceId: string) => Promise<unknown>;
};

type PushRegistration = {
  pushManager: Pick<PushManager, "getSubscription" | "subscribe">;
};

export type PushDependencies = {
  api: PushApi;
  registration: () => Promise<PushRegistration>;
  permission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function statusSubscribed(status: PushStatus) {
  const value = (status as Record<string, unknown>).subscribed;
  return value === true;
}

function applicationServerKey(status: PushStatus) {
  return readString(status as Record<string, unknown>, [
    "applicationServerKey",
    "application_server_key",
    "publicKey",
    "public_key",
    "vapidPublicKey",
  ]);
}

export function getPushAvailability(
  navigatorValue: Navigator = navigator,
  windowValue: Window = window,
): PushAvailability {
  const userAgent = navigatorValue.userAgent;
  const isiOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigatorValue.platform === "MacIntel" &&
      navigatorValue.maxTouchPoints > 1);
  const standalone =
    (navigatorValue as Navigator & { standalone?: boolean }).standalone ===
      true || windowValue.matchMedia?.("(display-mode: standalone)").matches;

  if (isiOS && !standalone) {
    return {
      supported: false,
      message:
        "Di iPhone atau iPad, tambahkan Rangkumin ke Layar Utama lalu buka dari ikon aplikasi untuk mengaktifkan notifikasi.",
    };
  }
  if (
    !windowValue.isSecureContext ||
    !("serviceWorker" in navigatorValue) ||
    !("PushManager" in windowValue) ||
    !("Notification" in windowValue)
  ) {
    return {
      supported: false,
      message: "Notifikasi push belum didukung oleh browser atau koneksi ini.",
    };
  }
  return { supported: true };
}

export function getPushDeviceId(
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
  randomUUID: () => string = () => crypto.randomUUID(),
) {
  const existing = storage.getItem(DEVICE_ID_KEY);
  if (existing && UUID_PATTERN.test(existing)) return existing;
  const deviceId = randomUUID();
  if (!UUID_PATTERN.test(deviceId)) {
    throw new Error(
      "Browser tidak dapat membuat identitas perangkat yang aman.",
    );
  }
  storage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function applicationServerKeyToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function createBrowserPushDependencies(api: PushApi): PushDependencies {
  return {
    api,
    registration: async () => navigator.serviceWorker.ready,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
  };
}

export async function reconcilePushSubscription(
  deviceId: string,
  dependencies: PushDependencies,
) {
  const [status, registration] = await Promise.all([
    dependencies.api.getStatus(deviceId),
    dependencies.registration(),
  ]);
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await dependencies.api.save(deviceId, subscription.toJSON());
    return true;
  }
  if (statusSubscribed(status)) await dependencies.api.remove(deviceId);
  return false;
}

export async function enablePushSubscription(
  deviceId: string,
  dependencies: PushDependencies,
) {
  const [status, registration] = await Promise.all([
    dependencies.api.getStatus(deviceId),
    dependencies.registration(),
  ]);
  const key = applicationServerKey(status);
  if (!key) {
    throw new Error("Web Push belum dikonfigurasi di server.");
  }

  const currentPermission = dependencies.permission();
  if (currentPermission === "denied") {
    throw new Error(
      "Izin notifikasi diblokir. Aktifkan kembali melalui pengaturan browser.",
    );
  }
  const permission =
    currentPermission === "granted"
      ? currentPermission
      : await dependencies.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Izin notifikasi diblokir. Aktifkan kembali melalui pengaturan browser."
        : "Izin notifikasi belum diberikan.",
    );
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKeyToBytes(key),
    }));
  try {
    await dependencies.api.save(deviceId, subscription.toJSON());
  } catch (error) {
    if (!existing) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}

export async function disablePushSubscription(
  deviceId: string,
  dependencies: PushDependencies,
) {
  const results = await Promise.allSettled([
    dependencies.registration().then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }),
    dependencies.api.remove(deviceId),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Notifikasi belum berhasil dinonaktifkan sepenuhnya.");
  }
}

export async function unsubscribePushBestEffort(
  dependencies: PushDependencies,
) {
  try {
    await disablePushSubscription(getPushDeviceId(), dependencies);
  } catch {
    // Logout tetap dilanjutkan agar data lokal dan sesi tidak tertinggal.
  }
}

export function safeNotificationUrl(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return DEFAULT_NOTIFICATION.url;
  }
  try {
    const parsed = new URL(value, "https://rangkumin.invalid");
    if (!ALLOWED_NOTIFICATION_PATHS.has(parsed.pathname)) {
      return DEFAULT_NOTIFICATION.url;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_NOTIFICATION.url;
  }
}

export function parsePushPayload(value: unknown): PushNotificationPayload {
  if (!isRecord(value)) return { ...DEFAULT_NOTIFICATION };
  const title = readString(value, ["title"]);
  const body = readString(value, ["body"]);
  const tag = readString(value, ["tag"]);
  return {
    title: title?.slice(0, 120) ?? DEFAULT_NOTIFICATION.title,
    body: body?.slice(0, 300) ?? DEFAULT_NOTIFICATION.body,
    url: safeNotificationUrl(value.url),
    tag:
      tag && /^[A-Za-z0-9:_-]{1,100}$/.test(tag)
        ? tag
        : DEFAULT_NOTIFICATION.tag,
  };
}
