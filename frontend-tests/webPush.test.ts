import { describe, expect, it, vi } from "vitest";
import {
  enablePushSubscription,
  getPushDeviceId,
  parsePushPayload,
  reconcilePushSubscription,
  safeNotificationUrl,
} from "../frontend/src/webPush";

function subscription() {
  return {
    toJSON: vi.fn(() => ({ endpoint: "https://push.example.invalid/id" })),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

describe("Web Push", () => {
  it("mempertahankan UUID perangkat di localStorage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const randomUUID = vi.fn(() => "11111111-1111-4111-8111-111111111111");

    expect(getPushDeviceId(storage, randomUUID)).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(getPushDeviceId(storage, randomUUID)).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("mengganti device id lama yang bukan UUID", () => {
    const values = new Map([["rangkumin-push-device-id", "device-lama"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(
      getPushDeviceId(storage, () => "22222222-2222-4222-8222-222222222222"),
    ).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("merekonsiliasi subscription browser tanpa meminta permission", async () => {
    const current = subscription();
    const save = vi.fn().mockResolvedValue(undefined);
    const requestPermission = vi.fn();
    const enabled = await reconcilePushSubscription("device-1", {
      api: {
        getStatus: vi.fn().mockResolvedValue({ subscribed: false }),
        save,
        remove: vi.fn(),
      },
      registration: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(current) },
      }),
      permission: () => "default",
      requestPermission,
    });

    expect(enabled).toBe(true);
    expect(save).toHaveBeenCalledWith("device-1", current.toJSON());
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("hanya meminta permission saat aktivasi eksplisit", async () => {
    const created = subscription();
    const subscribe = vi.fn().mockResolvedValue(created);
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const save = vi.fn().mockResolvedValue(undefined);

    await enablePushSubscription("device-1", {
      api: {
        getStatus: vi.fn().mockResolvedValue({
          subscribed: false,
          applicationServerKey: "AQID",
        }),
        save,
        remove: vi.fn(),
      },
      registration: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe,
        },
      }),
      permission: () => "default",
      requestPermission,
    });

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(save).toHaveBeenCalledWith("device-1", created.toJSON());
  });

  it("memakai payload generik saat data push malformed", () => {
    expect(parsePushPayload(null)).toEqual({
      title: "Rangkumin",
      body: "Ada pembaruan baru di Rangkumin.",
      url: "/",
      tag: "rangkumin-update",
    });
    expect(
      parsePushPayload({ title: 12, body: [], url: "https://evil.invalid" }),
    ).toEqual({
      title: "Rangkumin",
      body: "Ada pembaruan baru di Rangkumin.",
      url: "/",
      tag: "rangkumin-update",
    });
  });

  it("hanya menerima URL relatif dari halaman yang diizinkan", () => {
    expect(safeNotificationUrl("/transactions?id=trx-1")).toBe(
      "/transactions?id=trx-1",
    );
    expect(safeNotificationUrl("https://evil.invalid/transactions")).toBe("/");
    expect(safeNotificationUrl("//evil.invalid/transactions")).toBe("/");
    expect(safeNotificationUrl("/api/transactions")).toBe("/");
  });
});
