import { z } from "zod";

const MAX_AMOUNT = 1_000_000_000_000;

function parseAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded > 0 && rounded <= MAX_AMOUNT ? rounded : null;
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return null;
    const num = Number(digits);
    return num > 0 && num <= MAX_AMOUNT && Number.isFinite(num) ? num : null;
  }
  return null;
}

function parseDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const candidate = match[0];
  const [yearStr, monthStr, dayStr] = candidate.split("-").map(Number);
  const date = new Date(Date.UTC(yearStr!, monthStr! - 1, dayStr!));
  if (
    date.getUTCFullYear() !== yearStr ||
    date.getUTCMonth() !== monthStr! - 1 ||
    date.getUTCDate() !== dayStr
  ) {
    return null;
  }
  return candidate;
}

function parseNullableText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function parseConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isFinite(num)) return Math.min(1, Math.max(0, num));
  }
  return 0.5;
}

function parseWarnings(value: unknown): string[] {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((item) =>
      typeof item === "string" ? item.trim() : String(item ?? "").trim(),
    )
    .filter((item) => item.length > 0 && item.length <= 200)
    .slice(0, 10);
}

function normalizeReceiptDraft(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const draft = raw.draft;
  if (draft == null || typeof draft !== "object") return raw;
  const d = draft as Record<string, unknown>;
  d.amount = parseAmount(d.amount);
  d.date = parseDateString(d.date);
  d.merchant = parseNullableText(d.merchant, 200);
  d.description = parseNullableText(d.description, 500);
  d.category_key = parseNullableText(d.category_key, 64);
  d.confidence = parseConfidence(d.confidence);
  d.warnings = parseWarnings(d.warnings);
  return raw;
}

export const receiptAiDraftSchema = z
  .object({
    amount: z.number().int().positive().max(MAX_AMOUNT).nullable(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    merchant: z.string().min(1).max(200).nullable(),
    description: z.string().min(1).max(500).nullable(),
    category_key: z.string().min(1).max(64).nullable(),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().min(1).max(200)).max(10),
  })
  .passthrough();

export const receiptAiResponseSchema = z.preprocess(
  normalizeReceiptDraft,
  z
    .object({
      draft: receiptAiDraftSchema,
    })
    .passthrough(),
);

export type ReceiptAiResponse = z.infer<typeof receiptAiResponseSchema>;
