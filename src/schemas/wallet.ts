import { z } from "zod";
import {
  amountSchema,
  dateStringSchema,
  descriptionSchema,
} from "./transaction";

export const walletTypeSchema = z.enum(["cash", "bank", "e_wallet", "other"]);

const walletNameSchema = z
  .string()
  .trim()
  .min(1, "Nama dompet wajib diisi.")
  .max(100, "Nama dompet maksimal 100 karakter.");

const walletDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Catatan dompet maksimal 500 karakter.")
  .nullable();

const walletIconSchema = z
  .string()
  .trim()
  .min(1, "Icon dompet tidak valid.")
  .max(50, "Icon dompet maksimal 50 karakter.")
  .nullable();

const walletColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Warna dompet harus berupa hex color.")
  .nullable();

const walletGroupSchema = z
  .string()
  .trim()
  .min(1, "Grup dompet wajib diisi.")
  .max(100, "Grup dompet maksimal 100 karakter.");

const walletIdSchema = z.string().trim().min(1).max(128);

export const createWalletSchema = z
  .object({
    type: walletTypeSchema,
    name: walletNameSchema,
    description: walletDescriptionSchema.optional(),
    icon: walletIconSchema.optional(),
    color: walletColorSchema.optional(),
    group_name: walletGroupSchema.optional(),
    initial_balance: z
      .number()
      .int("Saldo awal harus berupa bilangan bulat.")
      .min(0, "Saldo awal tidak boleh negatif.")
      .max(1_000_000_000_000, "Saldo awal melebihi batas yang diizinkan.")
      .optional(),
    default_wallet: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export const updateWalletSchema = z
  .object({
    type: walletTypeSchema.optional(),
    name: walletNameSchema.optional(),
    description: walletDescriptionSchema.optional(),
    icon: walletIconSchema.optional(),
    color: walletColorSchema.optional(),
    group_name: walletGroupSchema.optional(),
    sort_order: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Minimal satu field yang diperbarui wajib diisi.",
  });

export const listWalletsQuerySchema = z
  .object({
    owner: walletIdSchema.optional(),
    archived: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional()
      .default(false),
  })
  .strict();

export const walletTransferSchema = z
  .object({
    source_wallet_id: walletIdSchema,
    destination_wallet_id: walletIdSchema,
    amount: amountSchema,
    transaction_date: dateStringSchema,
    description: descriptionSchema,
  })
  .strict()
  .refine((value) => value.source_wallet_id !== value.destination_wallet_id, {
    message: "Dompet asal dan tujuan harus berbeda.",
    path: ["destination_wallet_id"],
  });
