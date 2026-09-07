import { z } from "zod";
import { amountSchema, categoryIdSchema } from "./transaction";

const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const recurrenceTypeSchema = z.enum([
  "once",
  "interval_days",
  "weekly",
  "monthly",
]);

const reminderFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  amount: amountSchema.nullable().optional(),
  category_id: categoryIdSchema.nullable().optional(),
  recurrence_type: recurrenceTypeSchema,
  interval_value: z.number().int().nullable().optional(),
  next_run_at: isoDateTimeSchema,
  recipient_user_ids: z
    .array(z.string().min(1).max(128))
    .min(1)
    .max(2)
    .refine(
      (items) => new Set(items).size === items.length,
      "Penerima reminder tidak boleh duplikat.",
    ),
  notify_web: z.literal(true).default(true),
  notify_telegram: z.literal(false).default(false),
};

function validRecurrence(value: {
  recurrence_type: z.infer<typeof recurrenceTypeSchema>;
  interval_value?: number | null;
}) {
  const interval = value.interval_value;
  if (value.recurrence_type === "once") return interval == null;
  if (value.recurrence_type === "interval_days")
    return Boolean(interval && interval > 0);
  if (value.recurrence_type === "weekly")
    return interval != null && interval >= 0 && interval <= 6;
  return interval != null && interval >= 1 && interval <= 31;
}

const reminderObjectSchema = z.object(reminderFields).strict();

export const createReminderSchema = reminderObjectSchema.refine(
  validRecurrence,
  {
    message: "interval_value tidak sesuai recurrence_type.",
    path: ["interval_value"],
  },
);

export const updateReminderSchema = z
  .object({
    title: reminderFields.title.optional(),
    description: reminderFields.description,
    amount: reminderFields.amount,
    category_id: reminderFields.category_id,
    recurrence_type: recurrenceTypeSchema.optional(),
    interval_value: reminderFields.interval_value,
    next_run_at: isoDateTimeSchema.optional(),
    recipient_user_ids: reminderFields.recipient_user_ids.optional(),
    notify_web: z.literal(true).optional(),
    notify_telegram: z.literal(false).optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Minimal satu field wajib diubah.",
  );

export const listRemindersQuerySchema = z
  .object({
    inactive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional()
      .default(false),
  })
  .strict();

export const snoozeReminderSchema = z
  .object({ snoozed_until: isoDateTimeSchema })
  .strict();
