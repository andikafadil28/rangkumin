import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export const dateStringSchema = z
  .string()
  .regex(datePattern, "Tanggal harus berformat YYYY-MM-DD.")
  .refine(isRealDate, "Tanggal tidak valid.");

export const transactionTypeSchema = z.enum([
  "income",
  "expense",
  "saving_deposit",
  "saving_withdrawal",
  "saving_transfer",
  "wallet_transfer",
]);

export const incomeExpenseTypeSchema = z.enum(["income", "expense"]);

export const idempotencyKeySchema = z
  .string()
  .min(8, "Idempotency key minimal 8 karakter.")
  .max(128, "Idempotency key maksimal 128 karakter.")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/, "Idempotency key tidak valid.");

export const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Deskripsi maksimal 500 karakter.")
  .nullable()
  .optional();

export const amountSchema = z
  .number()
  .int("Jumlah harus berupa bilangan bulat.")
  .min(1, "Jumlah harus lebih dari nol.")
  .max(1_000_000_000_000, "Jumlah melebihi batas yang diizinkan.");

export const categoryIdSchema = z
  .string()
  .trim()
  .min(1, "Kategori wajib diisi.")
  .max(128, "Kategori tidak valid.");

export const walletIdSchema = z
  .string()
  .trim()
  .min(1, "Dompet tidak valid.")
  .max(128, "Dompet tidak valid.");

export const reconciliationStatusSchema = z.enum([
  "unreconciled",
  "reconciled",
  "excluded",
]);

export const createTransactionSchema = z
  .object({
    type: incomeExpenseTypeSchema,
    amount: amountSchema,
    transaction_date: dateStringSchema,
    category_id: categoryIdSchema,
    wallet_id: walletIdSchema.nullable().optional(),
    description: descriptionSchema,
  })
  .strict();

export const updateTransactionSchema = z
  .object({
    version: z
      .number()
      .int()
      .positive("Version wajib berupa bilangan positif."),
    type: incomeExpenseTypeSchema.optional(),
    amount: amountSchema.optional(),
    transaction_date: dateStringSchema.optional(),
    category_id: categoryIdSchema.optional(),
    wallet_id: walletIdSchema.nullable().optional(),
    reconciliation_status: reconciliationStatusSchema.optional(),
    description: descriptionSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.type !== undefined ||
      value.amount !== undefined ||
      value.transaction_date !== undefined ||
      value.category_id !== undefined ||
      value.wallet_id !== undefined ||
      value.reconciliation_status !== undefined ||
      value.description !== undefined,
    "Minimal satu field yang diperbarui wajib diisi.",
  );

export const transactionStatusSchema = z.enum(["active", "trashed", "all"]);
export const transactionSortSchema = z.enum([
  "date_desc",
  "date_asc",
  "amount_desc",
  "amount_asc",
]);

export const listTransactionsQuerySchema = z
  .object({
    owner: z.string().trim().min(1).max(128).optional(),
    type: transactionTypeSchema.optional(),
    category: categoryIdSchema.optional(),
    wallet: walletIdSchema.optional(),
    reconciliation_status: reconciliationStatusSchema.optional(),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    search: z.string().trim().min(1).max(100).optional(),
    min_amount: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    max_amount: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    sort: transactionSortSchema.optional().default("date_desc"),
    status: transactionStatusSchema.optional().default("active"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Tanggal akhir tidak boleh sebelum tanggal awal.",
    path: ["to"],
  })
  .refine(
    (value) =>
      !value.min_amount ||
      !value.max_amount ||
      value.min_amount <= value.max_amount,
    {
      message: "Nominal maksimum tidak boleh lebih kecil dari nominal minimum.",
      path: ["max_amount"],
    },
  );

export const summaryQuerySchema = z
  .object({
    owner: z.string().trim().min(1).max(128).optional(),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Tanggal akhir tidak boleh sebelum tanggal awal.",
    path: ["to"],
  });
