import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { webPushRoutes } from "../src/routes/web-push";
import { webPushSubscriptionSchema } from "../src/schemas/web-push";
import {
  deliverWebPushNotifications,
  putWebPushSubscription,
} from "../src/services/web-push";
import type { AppBindings, AppEnv } from "../src/types";

type SqlResponse = {
  changes?: number;
  first?: Record<string, unknown> | null;
  all?: Record<string, unknown>[];
};

function fakeDatabase(
  responder: (sql: string, parameters: unknown[]) => SqlResponse,
) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  return {
    calls,
    prepare(sql: string) {
      return {
        bind(...parameters: unknown[]) {
          calls.push({ sql, parameters });
          const response = responder(sql, parameters);
          return {
            first: async () => response.first ?? null,
            all: async () => ({ results: response.all ?? [] }),
            run: async () => ({
              success: true,
              meta: { changes: response.changes ?? 0 },
            }),
          };
        },
        run: async () => {
          calls.push({ sql, parameters: [] });
          const response = responder(sql, []);
          return {
            success: true,
            meta: { changes: response.changes ?? 0 },
          };
        },
      };
    },
  } as unknown as D1Database & {
    calls: Array<{ sql: string; parameters: unknown[] }>;
  };
}

const deviceId = "550e8400-e29b-41d4-a716-446655440000";
const p256dh = Buffer.alloc(65, 4).toString("base64url");
const auth = Buffer.alloc(16, 7).toString("base64url");
const subscription = {
  endpoint: "https://push.example.test/subscription/one",
  expirationTime: null,
  keys: { p256dh, auth },
};

function createRouteApp(database: D1Database, publicKey = "public-test-key") {
  const testApp = new Hono<AppEnv>();
  testApp.use("*", async (context, next) => {
    context.set("currentUser", { id: "user-1", displayName: "User Satu" });
    await next();
  });
  testApp.route("/push", webPushRoutes);
  return {
    testApp,
    bindings: {
      APP_ENV: "development",
      DB: database,
      WEB_PUSH_VAPID_PUBLIC_KEY: publicKey,
    } as unknown as AppBindings,
  };
}

describe("Web Push schema dan routes", () => {
  it("menolak endpoint berkredensial serta key dengan panjang salah", () => {
    expect(() =>
      webPushSubscriptionSchema.parse({
        ...subscription,
        endpoint: "https://user:secret@push.example.test/subscription#token",
      }),
    ).toThrow();
    expect(() =>
      webPushSubscriptionSchema.parse({
        ...subscription,
        keys: { p256dh: Buffer.alloc(64).toString("base64url"), auth },
      }),
    ).toThrow();
  });

  it("memvalidasi UUID status sebelum query database", async () => {
    const database = fakeDatabase(() => {
      throw new Error("Database tidak boleh dipanggil");
    });
    const { testApp, bindings } = createRouteApp(database);
    const response = await testApp.request(
      "/push/status?device_id=bukan-uuid",
      {},
      bindings,
    );

    expect(response.status).toBe(400);
    expect(database.calls).toHaveLength(0);
  });

  it("mengembalikan public key dan status milik currentUser", async () => {
    const database = fakeDatabase((sql) => {
      if (sql.includes("FROM web_push_subscriptions")) {
        return {
          first: {
            device_id: deviceId,
            expiration_time: null,
            created_at: "2026-09-07T00:00:00.000Z",
            updated_at: "2026-09-07T00:00:00.000Z",
          },
        };
      }
      return {};
    });
    const { testApp, bindings } = createRouteApp(database);
    const response = await testApp.request(
      `/push/status?device_id=${deviceId}`,
      {},
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      subscribed: true,
      deviceId,
      publicKey: "public-test-key",
    });
    expect(database.calls[0]?.parameters).toEqual([deviceId, "user-1"]);
  });
});

describe("Web Push subscription service", () => {
  it("mencegah endpoint takeover dari perangkat atau pengguna lain", async () => {
    const database = fakeDatabase((sql) =>
      sql.includes("SELECT device_id, user_id")
        ? {
            first: {
              device_id: "a55e8400-e29b-41d4-a716-446655440000",
              user_id: "user-2",
            },
          }
        : {},
    );

    await expect(
      putWebPushSubscription(database, "user-1", deviceId, subscription),
    ).rejects.toThrow("sudah terhubung");
    expect(
      database.calls.some((call) =>
        call.sql.includes("INSERT INTO web_push_subscriptions"),
      ),
    ).toBe(false);
  });

  it("menerapkan batas sepuluh subscription per pengguna", async () => {
    const database = fakeDatabase((sql) => {
      if (sql.includes("SELECT device_id, user_id")) return { first: null };
      if (sql.includes("COUNT(*)")) return { first: { count: 10 } };
      return {};
    });

    await expect(
      putWebPushSubscription(database, "user-1", deviceId, subscription),
    ).rejects.toThrow("Maksimal 10");
  });
});

describe("Web Push delivery service", () => {
  function deliveryDatabase(responseStatus: number) {
    return fakeDatabase((sql) => {
      if (sql.includes("INSERT INTO web_push_deliveries")) {
        return { changes: 1 };
      }
      if (sql.includes("FROM web_push_deliveries AS delivery")) {
        return {
          all: [
            {
              id: "delivery-1",
              notification_id: "notification-1",
              device_id: deviceId,
              endpoint: subscription.endpoint,
              p256dh,
              auth,
              expiration_time: null,
              kind: "reminder",
              title: "Pengingat",
              body: "Bayar tagihan",
              attempt_count: 0,
            },
          ],
        };
      }
      if (sql.includes("SET status = 'processing'")) return { changes: 1 };
      if (sql.includes("SET status = 'sent'")) return { changes: 1 };
      if (sql.includes("SET status = 'failed'")) return { changes: 1 };
      if (sql.includes("DELETE FROM web_push_subscriptions")) {
        return {
          changes: responseStatus === 404 || responseStatus === 410 ? 1 : 0,
        };
      }
      return {};
    });
  }

  it("fan-out hanya event dashboard baru lalu mengirim payload stabil", async () => {
    const database = deliveryDatabase(201);
    let message: unknown;
    const buildPayload = vi.fn(async (input: unknown) => {
      message = input;
      return {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array([1]),
      };
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 201 }));

    await expect(
      deliverWebPushNotifications(
        database,
        {
          subject: "mailto:test@example.invalid",
          publicKey: "public-key",
          privateKey: "private-key",
        },
        { fetcher, buildPayload: buildPayload as never },
        new Date("2026-09-07T12:00:00.000Z"),
      ),
    ).resolves.toBe(1);

    expect(message).toMatchObject({
      data: {
        notificationId: "notification-1",
        tag: "rangkumin:reminder:notification-1",
        url: "/",
      },
    });
    const fanOut = database.calls.find((call) =>
      call.sql.includes("INSERT INTO web_push_deliveries"),
    );
    expect(fanOut?.sql).toContain(
      "notification.created_at >= subscription.created_at",
    );
    expect(fanOut?.sql).toContain("notification.channel = 'dashboard'");
    expect(fanOut?.sql).toContain(
      "notification.kind IN ('reminder', 'budget_threshold', 'transaction')",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([404, 410])(
    "menghapus subscription permanen untuk HTTP %s",
    async (status) => {
      const database = deliveryDatabase(status);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      const buildPayload = vi.fn(async () => ({
        method: "POST",
        headers: {},
        body: new Uint8Array([1]),
      }));

      await expect(
        deliverWebPushNotifications(
          database,
          {
            subject: "mailto:test@example.invalid",
            publicKey: "public-key",
            privateKey: "private-key",
          },
          { fetcher, buildPayload: buildPayload as never },
        ),
      ).resolves.toBe(0);
      expect(
        database.calls.some((call) =>
          call.sql.includes("DELETE FROM web_push_subscriptions"),
        ),
      ).toBe(true);
    },
  );

  it("melepas lease dan menjadwalkan retry untuk kegagalan sementara", async () => {
    const database = deliveryDatabase(503);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const buildPayload = vi.fn(async () => ({
      method: "POST",
      headers: {},
      body: new Uint8Array([1]),
    }));

    await deliverWebPushNotifications(
      database,
      {
        subject: "mailto:test@example.invalid",
        publicKey: "public-key",
        privateKey: "private-key",
      },
      { fetcher, buildPayload: buildPayload as never },
      new Date("2026-09-07T12:00:00.000Z"),
    );
    const failed = database.calls.find((call) =>
      call.sql.includes("SET status = 'failed'"),
    );
    expect(failed?.sql).toContain("lease_until = NULL");
    expect(failed?.parameters[1]).toBe("2026-09-07T12:02:00.000Z");
  });
});
