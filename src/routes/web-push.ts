import { Hono } from "hono";
import { z } from "zod";
import { respondWithError } from "../http/errors";
import {
  webPushDeviceIdSchema,
  webPushStatusQuerySchema,
  webPushSubscriptionSchema,
} from "../schemas/web-push";
import {
  deleteWebPushSubscription,
  getWebPushStatus,
  putWebPushSubscription,
} from "../services/web-push";
import type { AppBindings, AppEnv } from "../types";

type WebPushBindings = AppBindings & {
  WEB_PUSH_VAPID_PUBLIC_KEY?: string;
};

export const webPushRoutes = new Hono<AppEnv>();

webPushRoutes.get("/status", async (context) => {
  try {
    const query = webPushStatusQuerySchema.parse(context.req.query());
    const publicKey = (context.env as WebPushBindings)
      .WEB_PUSH_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return context.json({ error: "Service Unavailable" }, 503);
    }
    const status = await getWebPushStatus(
      context.env.DB,
      context.get("currentUser").id,
      query.device_id,
    );
    return context.json({ ...status, publicKey });
  } catch (error) {
    return respondWithError(context, error);
  }
});

webPushRoutes.put("/subscriptions/:deviceId", async (context) => {
  try {
    const deviceId = webPushDeviceIdSchema.parse(context.req.param("deviceId"));
    const subscription = webPushSubscriptionSchema.parse(
      await context.req.json(),
    );
    const status = await putWebPushSubscription(
      context.env.DB,
      context.get("currentUser").id,
      deviceId,
      subscription,
    );
    return context.json(status);
  } catch (error) {
    return respondWithError(context, error);
  }
});

webPushRoutes.delete("/subscriptions/:deviceId", async (context) => {
  try {
    const deviceId = webPushDeviceIdSchema.parse(context.req.param("deviceId"));
    await deleteWebPushSubscription(
      context.env.DB,
      context.get("currentUser").id,
      deviceId,
    );
    return context.body(null, 204);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return respondWithError(context, error);
    }
    throw error;
  }
});
