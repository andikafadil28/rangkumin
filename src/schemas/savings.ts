import { z } from "zod";
import {
  amountSchema,
  dateStringSchema,
  descriptionSchema,
} from "./transaction";

export const savingsScopeSchema = z.enum(["personal", "shared"]);

const savingsNameSchema = z
  .string()
  .trim()
  .min(1, "Nama pos tabungan wajib diisi.")
  .max(100, "Nama pos tabungan maksimal 100 karakter.");

const targetAmountSchema = amountSchema.nullable();

export const createSavingsGoalSchema = z
  .object({
    ownership_scope: savingsScopeSchema,
    name: savingsNameSchema,
    target_amount: targetAmountSchema.optional(),
  })
  .strict();

export const updateSavingsGoalSchema = z
  .object({
    name: savingsNameSchema.optional(),
    target_amount: targetAmountSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.target_amount !== undefined,
    "Minimal satu field yang diperbarui wajib diisi.",
  );

export const archiveSavingsGoalSchema = z
  .object({ archived: z.boolean() })
  .strict();

export const listSavingsGoalsQuerySchema = z
  .object({
    scope: savingsScopeSchema.optional(),
    archived: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional()
      .default(false),
  })
  .strict();

export const savingsMutationSchema = z
  .object({
    amount: amountSchema,
    transaction_date: dateStringSchema,
    description: descriptionSchema,
  })
  .strict();

export const savingsTransferSchema = savingsMutationSchema
  .extend({
    source_goal_id: z.string().trim().min(1).max(128),
    destination_goal_id: z.string().trim().min(1).max(128),
  })
  .refine((value) => value.source_goal_id !== value.destination_goal_id, {
    message: "Pos sumber dan tujuan harus berbeda.",
    path: ["destination_goal_id"],
  });

export const savingsHistoryQuerySchema = z
  .object({
    goal: z.string().trim().min(1).max(128).optional(),
    owner: z.string().trim().min(1).max(128).optional(),
    type: z
      .enum(["saving_deposit", "saving_withdrawal", "saving_transfer"])
      .optional(),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Tanggal akhir tidak boleh sebelum tanggal awal.",
    path: ["to"],
  });
