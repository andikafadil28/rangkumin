import { z } from "zod";
import { amountSchema, categoryIdSchema } from "./transaction";

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode harus berformat YYYY-MM.");

const thresholdSchema = z
  .object({
    percentage: z.number().int().min(1).max(100),
    notify_web: z.boolean().default(true),
    notify_telegram: z.boolean().default(false),
  })
  .strict()
  .refine((value) => value.notify_web || value.notify_telegram, {
    message: "Minimal satu notification channel wajib aktif.",
  });

const budgetFields = {
  ownership_scope: z.enum(["personal", "shared"]),
  category_id: categoryIdSchema,
  monthly_limit: amountSchema,
  starts_on: z
    .string()
    .regex(
      /^\d{4}-(0[1-9]|1[0-2])-01$/,
      "starts_on harus tanggal pertama bulan.",
    ),
  thresholds: z
    .array(thresholdSchema)
    .min(1)
    .max(10)
    .refine(
      (items) =>
        new Set(items.map((item) => item.percentage)).size === items.length,
      "Persentase threshold tidak boleh duplikat.",
    ),
};

export const createBudgetSchema = z.object(budgetFields).strict();

export const updateBudgetSchema = z
  .object({
    monthly_limit: amountSchema.optional(),
    thresholds: budgetFields.thresholds.optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.monthly_limit !== undefined ||
      value.thresholds !== undefined ||
      value.is_active !== undefined,
    "Minimal satu field wajib diubah.",
  );

export const listBudgetsQuerySchema = z
  .object({
    period: monthSchema.optional(),
    scope: z.enum(["personal", "shared"]).optional(),
    inactive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional()
      .default(false),
  })
  .strict();
