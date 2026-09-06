import { Hono } from "hono";
import { respondWithError } from "../http/errors";
import { reminderCreatorGuard } from "../middleware/ownership";
import {
  createReminderSchema,
  listRemindersQuerySchema,
  snoozeReminderSchema,
  updateReminderSchema,
} from "../schemas/reminder";
import { idempotencyKeySchema } from "../schemas/transaction";
import {
  completeOccurrence,
  createReminder,
  listReminders,
  recordOccurrenceExpense,
  snoozeOccurrence,
  updateReminder,
} from "../services/reminders";
import type { AppEnv } from "../types";

export const reminderRoutes = new Hono<AppEnv>();

reminderRoutes.get("/", async (context) => {
  try {
    const query = listRemindersQuerySchema.parse(context.req.query());
    const reminders = await listReminders(
      context.env.DB,
      context.get("currentUser").id,
      query.inactive,
    );
    return context.json({ reminders });
  } catch (error) {
    return respondWithError(context, error);
  }
});

reminderRoutes.post("/occurrences/:occurrenceId/expense", async (context) => {
  try {
    const key = idempotencyKeySchema.parse(
      context.req.header("Idempotency-Key"),
    );
    const result = await recordOccurrenceExpense(
      context.env.DB,
      context.req.param("occurrenceId"),
      context.get("currentUser").id,
      key,
    );
    if (result.replayed) context.header("Idempotency-Replayed", "true");
    return context.json(result, result.replayed ? 200 : 201);
  } catch (error) {
    return respondWithError(context, error);
  }
});

reminderRoutes.post("/", async (context) => {
  try {
    const body = createReminderSchema.parse(await context.req.json());
    const reminder = await createReminder(context.env.DB, {
      creatorUserId: context.get("currentUser").id,
      title: body.title,
      description: body.description ?? null,
      amount: body.amount ?? null,
      categoryId: body.category_id ?? null,
      recurrenceType: body.recurrence_type,
      intervalValue: body.interval_value ?? null,
      nextRunAt: body.next_run_at,
      recipientUserIds: body.recipient_user_ids,
      notifyWeb: true,
      notifyTelegram: false,
    });
    return context.json({ reminder }, 201);
  } catch (error) {
    return respondWithError(context, error);
  }
});

reminderRoutes.patch("/:reminderId", reminderCreatorGuard, async (context) => {
  try {
    const body = updateReminderSchema.parse(await context.req.json());
    const reminder = await updateReminder(
      context.env.DB,
      context.req.param("reminderId"),
      context.get("currentUser").id,
      {
        title: body.title,
        description: body.description,
        amount: body.amount,
        categoryId: body.category_id,
        recurrenceType: body.recurrence_type,
        intervalValue: body.interval_value,
        nextRunAt: body.next_run_at,
        recipientUserIds: body.recipient_user_ids,
        notifyWeb: true,
        notifyTelegram: false,
        isActive: body.is_active,
      },
    );
    return context.json({ reminder });
  } catch (error) {
    return respondWithError(context, error);
  }
});

reminderRoutes.post("/occurrences/:occurrenceId/complete", async (context) => {
  try {
    await completeOccurrence(
      context.env.DB,
      context.req.param("occurrenceId"),
      context.get("currentUser").id,
    );
    return context.json({ completed: true });
  } catch (error) {
    return respondWithError(context, error);
  }
});

reminderRoutes.post("/occurrences/:occurrenceId/snooze", async (context) => {
  try {
    const body = snoozeReminderSchema.parse(await context.req.json());
    await snoozeOccurrence(
      context.env.DB,
      context.req.param("occurrenceId"),
      context.get("currentUser").id,
      body.snoozed_until,
    );
    return context.json({ snoozed: true, until: body.snoozed_until });
  } catch (error) {
    return respondWithError(context, error);
  }
});
