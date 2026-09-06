import Papa from "papaparse";
import type { ViewMode } from "./viewMode";

export const transferDomains = [
  "categories",
  "transactions",
  "savings_goals",
  "savings_mutations",
  "budgets",
  "reminders",
] as const;

export type TransferDomain = (typeof transferDomains)[number];

export const domainLabels: Record<TransferDomain, string> = {
  categories: "Kategori",
  transactions: "Transaksi",
  savings_goals: "Pos tabungan",
  savings_mutations: "Mutasi tabungan",
  budgets: "Anggaran",
  reminders: "Pengingat",
};

export const canonicalColumns: Record<TransferDomain, readonly string[]> = {
  categories: ["type", "name", "is_active"],
  transactions: [
    "type",
    "category_name",
    "amount",
    "description",
    "transaction_date",
    "deleted_at",
  ],
  savings_goals: ["ownership_scope", "name", "target_amount", "archived_at"],
  savings_mutations: [
    "type",
    "source_goal_name",
    "destination_goal_name",
    "amount",
    "description",
    "transaction_date",
  ],
  budgets: [
    "ownership_scope",
    "category_name",
    "monthly_limit",
    "starts_on",
    "is_active",
    "thresholds",
  ],
  reminders: [
    "title",
    "description",
    "amount",
    "category_name",
    "recurrence_type",
    "interval_value",
    "next_run_at",
    "timezone",
    "is_active",
    "notify_web",
    "notify_telegram",
  ],
};

export type FileSample = {
  headers: string[];
  rows: Array<Record<string, string>>;
  totalRows: number;
};

export const MAX_TRANSFER_ROWS = 500;

export function parseCsvSample(text: string): FileSample {
  const heading = Papa.parse<string[]>(text, {
    preview: 1,
    skipEmptyLines: "greedy",
  });
  if (heading.errors.length)
    throw new Error("CSV malformed dan tidak dapat dibaca.");
  const headers = (heading.data[0] ?? []).map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header))
    throw new Error("CSV wajib memiliki heading yang tidak kosong.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Heading CSV tidak boleh duplikat.");

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length)
    throw new Error("CSV malformed dan tidak dapat dibaca.");
  if (!parsed.data.length) throw new Error("File tidak memiliki baris data.");
  if (parsed.data.length > MAX_TRANSFER_ROWS)
    throw new Error("Import dibatasi maksimal 500 baris.");
  return {
    headers,
    rows: parsed.data.slice(0, 5),
    totalRows: parsed.data.length,
  };
}

export function suggestedMapping(
  domain: TransferDomain,
  headers: readonly string[],
) {
  return Object.fromEntries(
    canonicalColumns[domain].map((column) => [
      column,
      headers.includes(column) ? column : "",
    ]),
  );
}

export function buildExportPath(
  format: "csv" | "xlsx",
  domain: TransferDomain,
  filters: {
    owner?: string;
    from?: string;
    to?: string;
    includeDeleted?: boolean;
  },
) {
  const query = new URLSearchParams();
  if (filters.owner) query.set("owner", filters.owner);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.includeDeleted) query.set("include_deleted", "true");
  const path =
    format === "xlsx" ? "/api/export/all.xlsx" : `/api/export/${domain}.csv`;
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function resolveExportOwner(
  viewMode: ViewMode,
  userId: string,
  selectedOwner: string,
) {
  return viewMode === "solo" ? userId : selectedOwner || undefined;
}
