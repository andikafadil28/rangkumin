import { z } from "zod";
import { dateStringSchema } from "./transaction";

export const importExportDomains = [
  "categories",
  "transactions",
  "savings_goals",
  "savings_mutations",
  "budgets",
  "reminders",
] as const;

export type ImportExportDomain = (typeof importExportDomains)[number];

export const importExportDomainSchema = z.enum(importExportDomains);

export const exportQuerySchema = z
  .object({
    owner: z.string().trim().min(1).max(128).optional(),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    include_deleted: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional()
      .default(false),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Tanggal akhir tidak boleh sebelum tanggal awal.",
    path: ["to"],
  });

export const duplicatePolicySchema = z.enum(["skip", "reject"]);

export const importHeaderSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);

export const importMappingSchema = z.record(
  z.string().min(1).max(64),
  z.string().trim().min(1).max(128),
);
