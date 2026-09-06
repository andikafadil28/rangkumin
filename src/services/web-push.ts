import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { WebPushSubscriptionInput } from "../schemas/web-push";
import { ConflictError } from "./errors";

export const MAX_WEB_PUSH_SUBSCRIPTIONS = 10;
const MAX_DELIVERY_ATTEMPTS = 8;
const CLAIM_LEASE_MS = 5 * 60_000;

export type WebPushVapidConfig = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

type BuildPushPayload = typeof buildPushPayload;

type SubscriptionOwnerRow = {
  device_id: string;
  user_id: string;
};

type DeliveryRow = {
  id: string;
  notification_id: string;
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
  kind: "budget_threshold" | "reminder" | "transaction";
  title: string;
  body: string;
  attempt_count: number;
};

export async function getWebPushStatus(
  database: D1Database,
  userId: string,
  deviceId: string,
) {
  const subscription = await database
    .prepare(
      `SELECT device_id, expiration_time, created_at, updated_at
       FROM web_push_subscriptions
       WHERE device_id = ?1 AND user_id = ?2`,
    )
    .bind(deviceId, userId)
    .first<{
      device_id: string;
      expiration_time: number | null;
      created_at: string;
      updated_at: string;
    }>();

  return subscription
    ? {
        subscribed: true as const,
        deviceId: subscription.device_id,
        expirationTime: subscription.expiration_time,
        createdAt: subscription.created_at,
        updatedAt: subscription.updated_at,
      }
    : { subscribed: false as const, deviceId };
}

export async function putWebPushSubscription(
  database: D1Database,
  userId: string,
  deviceId: string,
  subscription: WebPushSubscriptionInput,
  now = new Date(),
) {
  const owner = await database
    .prepare(
      `SELECT device_id, user_id FROM web_push_subscriptions
       WHERE device_id = ?1 OR endpoint = ?2 LIMIT 1`,
    )
    .bind(deviceId, subscription.endpoint)
    .first<SubscriptionOwnerRow>();
  if (owner && (owner.user_id !== userId || owner.device_id !== deviceId)) {
    throw new ConflictError("Subscription sudah terhubung ke perangkat lain.");
  }

  if (!owner) {
    const count = await database
      .prepare(
        `SELECT COUNT(*) AS count FROM web_push_subscriptions WHERE user_id = ?1`,
      )
      .bind(userId)
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= MAX_WEB_PUSH_SUBSCRIPTIONS) {
      throw new ConflictError(
        `Maksimal ${MAX_WEB_PUSH_SUBSCRIPTIONS} subscription per pengguna.`,
      );
    }
  }

  const timestamp = now.toISOString();
  await database
    .prepare(
      `INSERT INTO web_push_subscriptions (
         device_id, user_id, endpoint, p256dh, auth, expiration_time,
         created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT(device_id) DO UPDATE SET
         endpoint = excluded.endpoint,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         expiration_time = excluded.expiration_time,
         updated_at = excluded.updated_at
       WHERE web_push_subscriptions.user_id = excluded.user_id`,
    )
    .bind(
      deviceId,
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      subscription.expirationTime,
      timestamp,
    )
    .run();

  return getWebPushStatus(database, userId, deviceId);
}

export async function deleteWebPushSubscription(
  database: D1Database,
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const result = await database
    .prepare(
      `DELETE FROM web_push_subscriptions WHERE device_id = ?1 AND user_id = ?2`,
    )
    .bind(deviceId, userId)
    .run();
  return result.meta.changes === 1;
}

export async function fanOutWebPushDeliveries(
  database: D1Database,
): Promise<number> {
  const result = await database
    .prepare(
      `INSERT INTO web_push_deliveries (
         id, subscription_device_id, notification_id
       )
       SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) ||
         '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' ||
         substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
         subscription.device_id, notification.id
       FROM notifications AS notification
       JOIN web_push_subscriptions AS subscription
         ON subscription.user_id = notification.recipient_user_id
        AND notification.created_at >= subscription.created_at
       WHERE notification.channel = 'dashboard'
         AND notification.kind IN ('reminder', 'budget_threshold', 'transaction')
         AND NOT EXISTS (
           SELECT 1 FROM web_push_deliveries AS delivery
           WHERE delivery.subscription_device_id = subscription.device_id
             AND delivery.notification_id = notification.id
         )
       ON CONFLICT(subscription_device_id, notification_id) DO NOTHING`,
    )
    .run();
  return result.meta.changes ?? 0;
}

function notificationUrl(): string {
  return "/";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1000)
    : "Web Push delivery gagal.";
}

export async function deliverWebPushNotifications(
  database: D1Database,
  vapid: WebPushVapidConfig,
  dependencies: {
    fetcher?: typeof fetch;
    buildPayload?: BuildPushPayload;
  } = {},
  now = new Date(),
): Promise<number> {
  await fanOutWebPushDeliveries(database);
  const timestamp = now.toISOString();
  const { results } = await database
    .prepare(
      `SELECT delivery.id, delivery.notification_id,
          subscription.device_id, subscription.endpoint, subscription.p256dh,
          subscription.auth, subscription.expiration_time,
          notification.kind, notification.title, notification.body,
          delivery.attempt_count
       FROM web_push_deliveries AS delivery
       JOIN web_push_subscriptions AS subscription
         ON subscription.device_id = delivery.subscription_device_id
       JOIN notifications AS notification ON notification.id = delivery.notification_id
       WHERE delivery.attempt_count < ?1
         AND (
           (delivery.status IN ('pending', 'failed')
             AND (delivery.next_attempt_at IS NULL OR delivery.next_attempt_at <= ?2))
           OR (delivery.status = 'processing' AND delivery.lease_until <= ?2)
         )
       ORDER BY delivery.created_at, delivery.id LIMIT 100`,
    )
    .bind(MAX_DELIVERY_ATTEMPTS, timestamp)
    .all<DeliveryRow>();

  const fetcher = dependencies.fetcher ?? fetch;
  const payloadBuilder = dependencies.buildPayload ?? buildPushPayload;
  let sent = 0;

  for (const delivery of results) {
    const claimToken = crypto.randomUUID();
    const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS).toISOString();
    const claimed = await database
      .prepare(
        `UPDATE web_push_deliveries
         SET status = 'processing', lease_until = ?1, claim_token = ?2,
             error_message = NULL, updated_at = ?3
         WHERE id = ?4 AND attempt_count < ?5 AND (
           (status IN ('pending', 'failed')
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?3))
           OR (status = 'processing' AND lease_until <= ?3)
         )`,
      )
      .bind(
        leaseUntil,
        claimToken,
        timestamp,
        delivery.id,
        MAX_DELIVERY_ATTEMPTS,
      )
      .run();
    if (claimed.meta.changes !== 1) continue;

    try {
      const tag = `rangkumin:${delivery.kind}:${delivery.notification_id}`;
      const request = await payloadBuilder(
        {
          data: {
            title: delivery.title,
            body: delivery.body,
            notificationId: delivery.notification_id,
            tag,
            url: notificationUrl(),
          },
          options: { ttl: 24 * 60 * 60, urgency: "normal" },
        },
        {
          endpoint: delivery.endpoint,
          expirationTime: delivery.expiration_time,
          keys: { p256dh: delivery.p256dh, auth: delivery.auth },
        },
        vapid,
      );
      const response = await fetcher(delivery.endpoint, request);
      if (response.status === 404 || response.status === 410) {
        await database
          .prepare(
            `DELETE FROM web_push_subscriptions
             WHERE device_id = ?1 AND endpoint = ?2`,
          )
          .bind(delivery.device_id, delivery.endpoint)
          .run();
        continue;
      }
      if (!response.ok) {
        throw new Error(`Push service merespons HTTP ${response.status}.`);
      }
      await database
        .prepare(
          `UPDATE web_push_deliveries
           SET status = 'sent', attempt_count = attempt_count + 1,
               response_status = ?1, delivered_at = ?2, next_attempt_at = NULL,
               lease_until = NULL, claim_token = NULL, updated_at = ?2
           WHERE id = ?3 AND status = 'processing' AND claim_token = ?4`,
        )
        .bind(response.status, timestamp, delivery.id, claimToken)
        .run();
      sent += 1;
    } catch (error) {
      const attempts = delivery.attempt_count + 1;
      const delayMinutes = Math.min(2 ** attempts, 360);
      const nextAttempt = new Date(
        now.getTime() + delayMinutes * 60_000,
      ).toISOString();
      await database
        .prepare(
          `UPDATE web_push_deliveries
           SET status = 'failed', attempt_count = attempt_count + 1,
               error_message = ?1, next_attempt_at = ?2,
               lease_until = NULL, claim_token = NULL, updated_at = ?3
           WHERE id = ?4 AND status = 'processing' AND claim_token = ?5`,
        )
        .bind(
          errorMessage(error),
          nextAttempt,
          timestamp,
          delivery.id,
          claimToken,
        )
        .run();
    }
  }
  return sent;
}
