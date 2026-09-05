import { z } from "zod";

export const categoryTypeSchema = z.enum(["income", "expense", "saving"]);

export const incomeExpenseCategoryTypeSchema = z.enum(["income", "expense"]);

export const createCategorySchema = z
  .object({
    type: incomeExpenseCategoryTypeSchema,
    name: z
      .string()
      .trim()
      .min(1, "Nama kategori minimal 1 karakter.")
      .max(80, "Nama kategori maksimal 80 karakter."),
  })
  .strict();

export const listCategoriesQuerySchema = z
  .object({
    type: categoryTypeSchema.optional(),
    inactive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional()
      .default(false),
  })
  .strict();

export const setCategoryActiveSchema = z
  .object({
    is_active: z.boolean(),
  })
  .strict();
