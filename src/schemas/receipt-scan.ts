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
    const normalized = value > 1 && value <= 100 ? value / 100 : value;
    return Math.min(1, Math.max(0, normalized));
  }
  if (typeof value === "string") {
    const num = Number(value.replace("%", "").trim());
    if (Number.isFinite(num)) {
      const normalized = num > 1 && num <= 100 ? num / 100 : num;
      return Math.min(1, Math.max(0, normalized));
    }
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const receiptFieldNames = new Set([
  "amount",
  "total",
  "total_amount",
  "grand_total",
  "date",
  "transaction_date",
  "receipt_date",
  "merchant",
  "merchant_name",
  "store",
  "store_name",
  "description",
  "summary",
  "purchase_summary",
  "category_key",
  "category",
  "category_alias",
]);

function findReceiptDraft(raw: Record<string, unknown>) {
  const wrappedDraft = asRecord(raw.draft);
  if (wrappedDraft) return wrappedDraft;

  for (const key of ["result", "receipt"] as const) {
    const wrapper = asRecord(raw[key]);
    if (!wrapper) continue;
    return asRecord(wrapper.draft) ?? wrapper;
  }

  return Object.keys(raw).some((key) => receiptFieldNames.has(key))
    ? raw
    : null;
}

function normalizeReceiptDraft(raw: unknown): unknown {
  const record = asRecord(raw);
  if (!record) return raw;
  const draft = findReceiptDraft(record);
  if (!draft) return raw;

  return {
    ...record,
    draft: {
      ...draft,
      amount: parseAmount(
        draft.amount ?? draft.total_amount ?? draft.total ?? draft.grand_total,
      ),
      date: parseDateString(
        draft.date ?? draft.transaction_date ?? draft.receipt_date,
      ),
      merchant: parseNullableText(
        draft.merchant ??
          draft.merchant_name ??
          draft.store ??
          draft.store_name,
        200,
      ),
      description: parseNullableText(
        draft.description ?? draft.summary ?? draft.purchase_summary,
        500,
      ),
      category_key: parseNullableText(
        draft.category_key ?? draft.category ?? draft.category_alias,
        64,
      ),
      confidence: parseConfidence(draft.confidence),
      warnings: parseWarnings(draft.warnings ?? draft.warning),
    },
  };
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
