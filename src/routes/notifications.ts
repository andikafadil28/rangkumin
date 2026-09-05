import { Hono } from "hono";
import { respondWithError } from "../http/errors";
import {
  listNotifications,
  markNotificationRead,
} from "../services/notifications";
import type { AppEnv } from "../types";

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get("/", async (context) => {
  const notifications = await listNotifications(
    context.env.DB,
    context.get("currentUser").id,
  );
  return context.json({ notifications });
});

notificationRoutes.patch("/:notificationId/read", async (context) => {
  try {
    await markNotificationRead(
      context.env.DB,
      context.req.param("notificationId"),
      context.get("currentUser").id,
    );
    return context.json({ read: true });
  } catch (error) {
    return respondWithError(context, error);
  }
});
