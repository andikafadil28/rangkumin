import { unzipSync } from "fflate";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/universal";
import { z } from "zod";
import type { ImportExportDomain } from "../schemas/import-export";
import { normalizeCategoryName } from "./categories";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;
const MAX_XLSX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

type Scalar = string | number | boolean | Date | null;
type SourceRow = Record<string, Scalar>;
export type CanonicalRow = Record<string, unknown> & {
  _id: string;
  _row_number: number;
  _fingerprint: string;
};

export class ImportRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 413 | 422 = 400,
  ) {
    super(message);
    this.name = "ImportRequestError";
  }
}

const text = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1).max(500),
);
const optionalText = z.preprocess(
  (value) => (value === "" || value == null ? null : String(value).trim()),
  z.string().max(500).nullable(),
);
const integer = z.preprocess(
  (value) =>
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value)
      : value,
  z.number().int().min(1).max(1_000_000_000_000),
);
const optionalInteger = z.preprocess(
  (value) =>
    value === "" || value == null
      ? null
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : value,
  z.number().int().min(1).max(1_000_000_000_000).nullable(),
);
const booleanValue = z.preprocess((value) => {
  if (value === true || value === 1 || value === "1" || value === "true")
    return true;
  if (value === false || value === 0 || value === "0" || value === "false")
    return false;
  return value;
}, z.boolean());
const dateValue = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.valueOf()) &&
        date.toISOString().slice(0, 10) === value
      );
    }),
);
const optionalDateTime = z.preprocess(
  (value) =>
    value === "" || value == null
      ? null
      : value instanceof Date
        ? value.toISOString()
        : value,
  z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value).toISOString())
    .nullable(),
);
const dateTime = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value).toISOString()),
);

const thresholdSchema = z.string().transform((value, context) => {
  const entries = value
    .split(";")
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(":");
      const percentage = Number(parts[0]);
      const web = parts[1] === "1";
      const telegram = parts[2] === "1";
      if (
        !Number.isInteger(percentage) ||
        percentage < 1 ||
        percentage > 100 ||
        (!web && !telegram)
      ) {
        context.addIssue({
          code: "custom",
          message: "Threshold harus memakai format percentage:web:telegram.",
        });
        return null;
      }
      return { percentage, notify_web: web, notify_telegram: telegram };
    });
  if (
    !entries.length ||
    entries.some((entry) => entry === null) ||
    new Set(entries.map((entry) => entry!.percentage)).size !== entries.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Threshold wajib unik dan tidak boleh kosong.",
    });
    return z.NEVER;
  }
  return entries;
});

const schemas: Record<
  ImportExportDomain,
  z.ZodType<Record<string, unknown>>
> = {
  categories: z
    .object({
      type: z.enum(["income", "expense", "saving"]),
      name: text.pipe(z.string().max(80)),
      is_active: booleanValue,
    })
    .strict(),
  transactions: z
    .object({
      type: z.enum(["income", "expense"]),
      category_name: text.pipe(z.string().max(80)),
      amount: integer,
      description: optionalText,
      transaction_date: dateValue,
      deleted_at: optionalDateTime,
    })
    .strict(),
  savings_goals: z
    .object({
      ownership_scope: z.enum(["personal", "shared"]),
      name: text.pipe(z.string().max(100)),
      target_amount: optionalInteger,
      archived_at: optionalDateTime,
    })
    .strict(),
  savings_mutations: z
    .object({
      type: z.enum(["saving_deposit", "saving_withdrawal", "saving_transfer"]),
      source_goal_name: optionalText.pipe(z.string().max(100).nullable()),
      destination_goal_name: optionalText.pipe(z.string().max(100).nullable()),
      amount: integer,
      description: optionalText,
      transaction_date: dateValue,
    })
    .strict()
    .superRefine((row, context) => {
      if (
        (row.type === "saving_withdrawal" || row.type === "saving_transfer") &&
        !row.source_goal_name
      )
        context.addIssue({
          code: "custom",
          path: ["source_goal_name"],
          message: "Pos sumber wajib diisi.",
        });
      if (
        (row.type === "saving_deposit" || row.type === "saving_transfer") &&
        !row.destination_goal_name
      )
        context.addIssue({
          code: "custom",
          path: ["destination_goal_name"],
          message: "Pos tujuan wajib diisi.",
        });
      if (
        row.type === "saving_transfer" &&
        row.source_goal_name === row.destination_goal_name
      )
        context.addIssue({
          code: "custom",
          path: ["destination_goal_name"],
          message: "Pos sumber dan tujuan harus berbeda.",
        });
    }),
  budgets: z
    .object({
      ownership_scope: z.enum(["personal", "shared"]),
      category_name: text.pipe(z.string().max(80)),
      monthly_limit: integer,
      starts_on: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
      is_active: booleanValue,
      thresholds: thresholdSchema,
    })
    .strict(),
  reminders: z
    .object({
      title: text.pipe(z.string().max(120)),
      description: optionalText,
      amount: optionalInteger,
      category_name: optionalText.pipe(z.string().max(80).nullable()),
      recurrence_type: z.enum(["once", "interval_days", "weekly", "monthly"]),
      interval_value: z.preprocess(
        (value) =>
          value === "" || value == null
            ? null
            : typeof value === "string"
              ? Number(value)
              : value,
        z.number().int().nullable(),
      ),
      next_run_at: dateTime,
      timezone: text.pipe(z.string().max(64)),
      is_active: booleanValue,
      notify_web: booleanValue,
      notify_telegram: booleanValue,
    })
    .strict()
    .superRefine((row, context) => {
      const valid =
        row.recurrence_type === "once"
          ? row.interval_value == null
          : row.recurrence_type === "interval_days"
            ? row.interval_value != null && row.interval_value > 0
            : row.recurrence_type === "weekly"
              ? row.interval_value != null &&
                row.interval_value >= 0 &&
                row.interval_value <= 6
              : row.interval_value != null &&
                row.interval_value >= 1 &&
                row.interval_value <= 31;
      if (!valid)
        context.addIssue({
          code: "custom",
          path: ["interval_value"],
          message: "Interval tidak sesuai recurrence_type.",
        });
      if (!row.notify_web && !row.notify_telegram)
        context.addIssue({
          code: "custom",
          message: "Minimal satu channel notifikasi wajib aktif.",
        });
    }),
};

const importColumns: Record<ImportExportDomain, readonly string[]> = {
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

function validateXlsxArchive(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new ImportRequestError("File XLSX tidak valid.");
  let declaredSize = 0;
  let centralEntries = 0;
  for (let offset = 0; offset + 46 <= bytes.length; offset++) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x01 ||
      bytes[offset + 3] !== 0x02
    )
      continue;
    centralEntries++;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    declaredSize += view.getUint32(24, true);
    if (declaredSize > MAX_XLSX_UNCOMPRESSED_BYTES)
      throw new ImportRequestError("Isi XLSX melebihi batas 20 MiB.", 413);
    offset +=
      45 +
      view.getUint16(28, true) +
      view.getUint16(30, true) +
      view.getUint16(32, true);
  }
  if (centralEntries === 0)
    throw new ImportRequestError("Struktur ZIP XLSX tidak valid.");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ImportRequestError("Arsip XLSX rusak atau tidak didukung.");
  }
  for (const [name, content] of Object.entries(entries)) {
    const lower = name.toLowerCase().replaceAll("\\", "/");
    if (content.byteLength > MAX_XLSX_UNCOMPRESSED_BYTES)
      throw new ImportRequestError("Isi XLSX melebihi batas 20 MiB.", 413);
    if (lower.includes("vbaproject.bin") || lower.includes("externallinks/"))
      throw new ImportRequestError(
        "XLSX dengan macro atau external link tidak diizinkan.",
      );
    if (
      lower.endsWith(".rels") &&
      /TargetMode\s*=\s*["']External["']/i.test(
        new TextDecoder().decode(content),
      )
    )
      throw new ImportRequestError(
        "XLSX dengan relasi eksternal tidak diizinkan.",
      );
  }
}

async function fileDigest(bytes: Uint8Array) {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function parseSourceRows(
  file: File,
  domain: ImportExportDomain,
): Promise<{ digest: string; rows: SourceRow[] }> {
  if (file.size === 0) throw new ImportRequestError("File import kosong.");
  if (file.size > MAX_IMPORT_BYTES)
    throw new ImportRequestError("File import melebihi batas 2 MiB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await fileDigest(bytes);
  const isXlsx =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type.includes("spreadsheetml");
  if (isXlsx) {
    validateXlsxArchive(bytes);
    let sheets;
    try {
      sheets = await readXlsxFile(bytes.buffer);
    } catch {
      throw new ImportRequestError("File XLSX tidak dapat dibaca.");
    }
    const sheet =
      sheets.find((item) => item.sheet === domain) ??
      (sheets.length === 1 ? sheets[0] : undefined);
    if (!sheet?.data.length)
      throw new ImportRequestError(
        `Sheet ${domain} tidak ditemukan atau kosong.`,
      );
    const headers = sheet.data[0]!.map((value) => String(value ?? "").trim());
    if (
      headers.some((header) => !header) ||
      new Set(headers).size !== headers.length
    )
      throw new ImportRequestError(
        "Heading XLSX tidak boleh kosong atau duplikat.",
      );
    return {
      digest,
      rows: sheet.data
        .slice(1)
        .filter((row) => row.some((value) => value != null && value !== ""))
        .map(
          (row) =>
            Object.fromEntries(
              headers.map((header, index) => [header, row[index] ?? null]),
            ) as SourceRow,
        ),
    };
  }
  let csv: string;
  try {
    csv = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      bytes,
    );
  } catch {
    throw new ImportRequestError("CSV wajib memakai encoding UTF-8.");
  }
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length)
    throw new ImportRequestError("CSV malformed dan tidak dapat diproses.");
  return { digest, rows: parsed.data };
}

async function fingerprint(
  row: Record<string, unknown>,
  domain: ImportExportDomain,
) {
  const fingerprintRow =
    domain === "categories"
      ? { type: row.type, name: row.name }
      : domain === "savings_goals" && row.archived_at == null
        ? {
            ownership_scope: row.ownership_scope,
            name: row.name,
            archived_at: null,
          }
        : domain === "budgets" && row.is_active === true
          ? {
              ownership_scope: row.ownership_scope,
              category_name: row.category_name,
              is_active: true,
            }
          : row;
  const sorted = Object.fromEntries(
    Object.keys(fingerprintRow)
      .sort()
      .map((key) => [
        key,
        (key === "name" || key.endsWith("_name")) &&
        typeof fingerprintRow[key] === "string"
          ? normalizeCategoryName(fingerprintRow[key])
          : fingerprintRow[key],
      ]),
  );
  return fileDigest(new TextEncoder().encode(JSON.stringify(sorted)));
}

export async function parseAndValidateImport(
  file: File,
  domain: ImportExportDomain,
  mapping: Record<string, string>,
) {
  const parsed = await parseSourceRows(file, domain);
  if (!parsed.rows.length)
    throw new ImportRequestError("File tidak memiliki baris data.");
  if (parsed.rows.length > MAX_IMPORT_ROWS)
    throw new ImportRequestError("Import dibatasi maksimal 500 baris.", 413);
  const columns = importColumns[domain];
  const unknown = Object.keys(mapping).filter((key) => !columns.includes(key));
  if (unknown.length)
    throw new ImportRequestError(
      "Mapping memuat field canonical yang tidak dikenal.",
    );
  const effectiveMapping = Object.fromEntries(
    columns.map((column) => [column, mapping[column] ?? column]),
  );
  if (new Set(Object.values(effectiveMapping)).size !== columns.length)
    throw new ImportRequestError(
      "Satu kolom sumber tidak boleh dipetakan ke beberapa field.",
    );
  const headers = new Set(Object.keys(parsed.rows[0]!));
  const missing = Object.values(effectiveMapping).filter(
    (header) => !headers.has(header),
  );
  if (missing.length)
    throw new ImportRequestError(
      "Kolom hasil mapping tidak ditemukan pada file.",
    );
  const errors: Array<{ row: number; field: string; message: string }> = [];
  const rows: CanonicalRow[] = [];
  for (const [index, source] of parsed.rows.entries()) {
    const candidate = Object.fromEntries(
      columns.map((column) => [
        column,
        source[effectiveMapping[column]!] ?? null,
      ]),
    );
    const result = schemas[domain].safeParse(candidate);
    if (!result.success) {
      errors.push(
        ...result.error.issues.map((issue) => ({
          row: index + 2,
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
      continue;
    }
    rows.push({
      ...result.data,
      ...((domain === "categories" || domain === "savings_goals") &&
      typeof result.data.name === "string"
        ? { _normalized_name: normalizeCategoryName(result.data.name) }
        : {}),
      _id: crypto.randomUUID(),
      _row_number: index + 2,
      _fingerprint: await fingerprint(result.data, domain),
    });
  }
  return {
    digest: parsed.digest,
    mapping: effectiveMapping,
    totalRows: parsed.rows.length,
    rows,
    errors,
  };
}

type ReferenceRow = {
  id: string;
  name: string;
  type?: string;
  ownership_scope?: string;
  owner_user_id?: string | null;
};
const normalize = normalizeCategoryName;

async function resolveReferences(
  database: D1Database,
  actorUserId: string,
  domain: ImportExportDomain,
  rows: CanonicalRow[],
) {
  if (["transactions", "budgets", "reminders"].includes(domain)) {
    const categories = (
      await database
        .prepare(
          `SELECT id, name, type, owner_user_id FROM categories WHERE is_active = 1 AND (is_default = 1 OR owner_user_id = ?1)`,
        )
        .bind(actorUserId)
        .all<ReferenceRow>()
    ).results;
    for (const row of rows) {
      const name = row.category_name as string | null;
      if (!name) {
        row._category_id = null;
        continue;
      }
      const matches = categories.filter(
        (item) =>
          normalize(item.name) === normalize(name) &&
          item.type === (domain === "transactions" ? row.type : "expense"),
      );
      if (matches.length !== 1)
        throw new ImportRequestError(
          `Referensi kategori pada baris ${row._row_number} tidak ditemukan atau ambigu.`,
        );
      row._category_id = matches[0]!.id;
    }
  }
  if (domain === "savings_mutations") {
    const goals = (
      await database
        .prepare(
          `SELECT id, name, ownership_scope, owner_user_id FROM savings_goals WHERE archived_at IS NULL AND (ownership_scope = 'shared' OR owner_user_id = ?1)`,
        )
        .bind(actorUserId)
        .all<ReferenceRow>()
    ).results;
    const findGoal = (name: unknown, rowNumber: number) => {
      if (!name) return null;
      const matches = goals.filter(
        (goal) => normalize(goal.name) === normalize(String(name)),
      );
      if (matches.length !== 1)
        throw new ImportRequestError(
          `Referensi pos tabungan pada baris ${rowNumber} tidak ditemukan atau ambigu.`,
        );
      return matches[0]!.id;
    };
    for (const row of rows) {
      row._source_goal_id = findGoal(row.source_goal_name, row._row_number);
      row._destination_goal_id = findGoal(
        row.destination_goal_name,
        row._row_number,
      );
    }
  }
}

async function validateSavingsBalances(
  database: D1Database,
  actorUserId: string,
  rows: CanonicalRow[],
) {
  const cash = await database
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount WHEN type = 'saving_deposit' THEN -amount WHEN type = 'saving_withdrawal' THEN amount ELSE 0 END), 0) AS balance FROM transactions WHERE owner_user_id = ?1 AND deleted_at IS NULL`,
    )
    .bind(actorUserId)
    .first<{ balance: number }>();
  const balances = new Map(
    (
      await database
        .prepare(
          `SELECT g.id, COALESCE(SUM(CASE WHEN t.destination_savings_goal_id = g.id THEN t.amount WHEN t.source_savings_goal_id = g.id THEN -t.amount ELSE 0 END), 0) AS balance FROM savings_goals g LEFT JOIN transactions t ON t.deleted_at IS NULL AND (t.source_savings_goal_id = g.id OR t.destination_savings_goal_id = g.id) WHERE g.archived_at IS NULL AND (g.ownership_scope = 'shared' OR g.owner_user_id = ?1) GROUP BY g.id`,
        )
        .bind(actorUserId)
        .all<{ id: string; balance: number }>()
    ).results.map((item) => [item.id, item.balance]),
  );
  let cashBalance = cash?.balance ?? 0;
  for (const row of rows) {
    const amount = row.amount as number;
    const source = row._source_goal_id as string | null;
    const destination = row._destination_goal_id as string | null;
    if (row.type === "saving_deposit") {
      if (cashBalance < amount)
        throw new ImportRequestError(
          `Saldo tunai tidak cukup pada baris ${row._row_number}.`,
        );
      cashBalance -= amount;
    }
    if (source) {
      if ((balances.get(source) ?? 0) < amount)
        throw new ImportRequestError(
          `Saldo pos tidak cukup pada baris ${row._row_number}.`,
        );
      balances.set(source, (balances.get(source) ?? 0) - amount);
    }
    if (row.type === "saving_withdrawal") cashBalance += amount;
    if (destination)
      balances.set(destination, (balances.get(destination) ?? 0) + amount);
  }
}

const duplicateSql: Record<ImportExportDomain, string> = {
  categories: `SELECT CAST(i.key AS INTEGER) AS item_index FROM json_each(?1) i WHERE EXISTS (SELECT 1 FROM categories c WHERE c.owner_user_id = ?2 AND c.type = json_extract(i.value,'$.type') AND c.normalized_name = json_extract(i.value,'$._normalized_name'))`,
  transactions: `SELECT CAST(i.key AS INTEGER) AS item_index FROM json_each(?1) i WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.owner_user_id = ?2 AND t.type = json_extract(i.value,'$.type') AND t.category_id = json_extract(i.value,'$._category_id') AND t.amount = json_extract(i.value,'$.amount') AND COALESCE(t.description,'') = COALESCE(json_extract(i.value,'$.description'),'') AND t.transaction_date = json_extract(i.value,'$.transaction_date') AND COALESCE(t.deleted_at,'') = COALESCE(json_extract(i.value,'$.deleted_at'),''))`,
  savings_goals: `SELECT CAST(i.key AS INTEGER) AS item_index FROM json_each(?1) i WHERE EXISTS (SELECT 1 FROM savings_goals g WHERE (g.ownership_scope = 'shared' OR g.created_by_user_id = ?2) AND g.ownership_scope = json_extract(i.value,'$.ownership_scope') AND g.normalized_name = json_extract(i.value,'$._normalized_name') AND COALESCE(g.archived_at,'') = COALESCE(json_extract(i.value,'$.archived_at'),'') AND (json_extract(i.value,'$.archived_at') IS NULL OR COALESCE(g.target_amount, 0) = COALESCE(json_extract(i.value,'$.target_amount'), 0)))`,
  savings_mutations: `SELECT CAST(i.key AS INTEGER) AS item_index FROM json_each(?1) i WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.owner_user_id = ?2 AND t.type = json_extract(i.value,'$.type') AND COALESCE(t.source_savings_goal_id,'') = COALESCE(json_extract(i.value,'$._source_goal_id'),'') AND COALESCE(t.destination_savings_goal_id,'') = COALESCE(json_extract(i.value,'$._destination_goal_id'),'') AND t.amount = json_extract(i.value,'$.amount') AND COALESCE(t.description,'') = COALESCE(json_extract(i.value,'$.description'),'') AND t.transaction_date = json_extract(i.value,'$.transaction_date'))`,
  budgets: `SELECT CAST(i.key AS INTEGER) AS item_index FROM json_each(?1) i WHERE EXISTS (SELECT 1 FROM budgets b WHERE (b.ownership_scope = 'shared' OR b.created_by_user_id = ?2) AND b.ownership_scope = json_extract(i.value,'$.ownership_scope') AND b.category_id = json_extract(i.value,'$._category_id') AND b.starts_on = json_extract(i.value,'$.starts_on') AND b.is_active = json_extract(i.value,'$.is_active') AND (json_extract(i.value,'$.is_active') = 1 OR b.monthly_limit = json_extract(i.value,'$.monthly_limit')))`,
  reminders: `SELECT CAST(i.key AS INTEGER) AS item_index FROM json_each(?1) i WHERE EXISTS (SELECT 1 FROM reminders r WHERE r.creator_user_id = ?2 AND r.title = json_extract(i.value,'$.title') AND r.next_run_at = json_extract(i.value,'$.next_run_at'))`,
};

export async function planImport(
  database: D1Database,
  actorUserId: string,
  domain: ImportExportDomain,
  rows: CanonicalRow[],
  policy: "skip" | "reject",
) {
  await resolveReferences(database, actorUserId, domain, rows);
  const duplicateIndexes = new Set<number>();
  const fingerprints = new Set<string>();
  rows.forEach((row, index) => {
    if (fingerprints.has(row._fingerprint)) duplicateIndexes.add(index);
    else fingerprints.add(row._fingerprint);
  });
  const dbDuplicates = await database
    .prepare(duplicateSql[domain])
    .bind(JSON.stringify(rows), actorUserId)
    .all<{ item_index: number }>();
  dbDuplicates.results.forEach((item) => duplicateIndexes.add(item.item_index));
  const imported = await database
    .prepare(
      `SELECT CAST(i.key AS INTEGER) AS item_index FROM json_each(?1) i JOIN import_records ir ON ir.actor_user_id = ?2 AND ir.domain = ?3 AND ir.fingerprint = json_extract(i.value, '$._fingerprint')`,
    )
    .bind(JSON.stringify(rows), actorUserId, domain)
    .all<{ item_index: number }>();
  imported.results.forEach((item) => duplicateIndexes.add(item.item_index));
  if (policy === "reject" && duplicateIndexes.size)
    throw new ImportRequestError(
      "Import mengandung duplikat di file atau database.",
      409,
    );
  const acceptedRows = rows.filter((_, index) => !duplicateIndexes.has(index));
  if (domain === "savings_mutations")
    await validateSavingsBalances(database, actorUserId, acceptedRows);
  return {
    acceptedRows,
    duplicateRows: duplicateIndexes.size,
  };
}

export function importPlanDigest(rows: CanonicalRow[]) {
  return fileDigest(
    new TextEncoder().encode(rows.map((row) => row._fingerprint).join("\n")),
  );
}

function domainStatements(
  database: D1Database,
  actorUserId: string,
  jobId: string,
  domain: ImportExportDomain,
  rows: CanonicalRow[],
) {
  const json = JSON.stringify(rows);
  const statements: D1PreparedStatement[] = [];
  const sql: Record<ImportExportDomain, string> = {
    categories: `INSERT INTO categories (id, owner_user_id, type, name, normalized_name, is_default, is_active) SELECT json_extract(value,'$._id'), ?2, json_extract(value,'$.type'), json_extract(value,'$.name'), json_extract(value,'$._normalized_name'), 0, json_extract(value,'$.is_active') FROM json_each(?1)`,
    transactions: `INSERT INTO transactions (id, owner_user_id, type, category_id, amount, description, transaction_date, source, idempotency_key, deleted_at, purge_after) SELECT json_extract(value,'$._id'), ?2, json_extract(value,'$.type'), json_extract(value,'$._category_id'), json_extract(value,'$.amount'), json_extract(value,'$.description'), json_extract(value,'$.transaction_date'), 'import', 'import:' || ?3 || ':' || json_extract(value,'$._row_number'), json_extract(value,'$.deleted_at'), CASE WHEN json_extract(value,'$.deleted_at') IS NULL THEN NULL ELSE datetime(json_extract(value,'$.deleted_at'), '+30 days') END FROM json_each(?1)`,
    savings_goals: `INSERT INTO savings_goals (id, created_by_user_id, ownership_scope, owner_user_id, name, normalized_name, target_amount, archived_at) SELECT json_extract(value,'$._id'), ?2, json_extract(value,'$.ownership_scope'), CASE WHEN json_extract(value,'$.ownership_scope') = 'personal' THEN ?2 ELSE NULL END, json_extract(value,'$.name'), json_extract(value,'$._normalized_name'), json_extract(value,'$.target_amount'), json_extract(value,'$.archived_at') FROM json_each(?1)`,
    savings_mutations: `INSERT INTO transactions (id, owner_user_id, type, source_savings_goal_id, destination_savings_goal_id, amount, description, transaction_date, source, idempotency_key) SELECT json_extract(value,'$._id'), ?2, json_extract(value,'$.type'), json_extract(value,'$._source_goal_id'), json_extract(value,'$._destination_goal_id'), json_extract(value,'$.amount'), json_extract(value,'$.description'), json_extract(value,'$.transaction_date'), 'import', 'import:' || ?3 || ':' || json_extract(value,'$._row_number') FROM json_each(?1)`,
    budgets: `INSERT INTO budgets (id, created_by_user_id, ownership_scope, owner_user_id, category_id, monthly_limit, starts_on, is_active) SELECT json_extract(value,'$._id'), ?2, json_extract(value,'$.ownership_scope'), CASE WHEN json_extract(value,'$.ownership_scope') = 'personal' THEN ?2 ELSE NULL END, json_extract(value,'$._category_id'), json_extract(value,'$.monthly_limit'), json_extract(value,'$.starts_on'), json_extract(value,'$.is_active') FROM json_each(?1)`,
    reminders: `INSERT INTO reminders (id, creator_user_id, title, description, amount, category_id, recurrence_type, interval_value, next_run_at, timezone, is_active, notify_web, notify_telegram) SELECT json_extract(value,'$._id'), ?2, json_extract(value,'$.title'), json_extract(value,'$.description'), json_extract(value,'$.amount'), json_extract(value,'$._category_id'), json_extract(value,'$.recurrence_type'), json_extract(value,'$.interval_value'), json_extract(value,'$.next_run_at'), json_extract(value,'$.timezone'), json_extract(value,'$.is_active'), json_extract(value,'$.notify_web'), json_extract(value,'$.notify_telegram') FROM json_each(?1)`,
  };
  statements.push(database.prepare(sql[domain]).bind(json, actorUserId, jobId));
  if (domain === "budgets") {
    const thresholds = rows.flatMap((row) =>
      (row.thresholds as Array<Record<string, unknown>>).map((threshold) => ({
        ...threshold,
        budget_id: row._id,
        id: crypto.randomUUID(),
      })),
    );
    statements.push(
      database
        .prepare(
          `INSERT INTO budget_thresholds (id, budget_id, percentage, notify_web, notify_telegram) SELECT json_extract(value,'$.id'), json_extract(value,'$.budget_id'), json_extract(value,'$.percentage'), json_extract(value,'$.notify_web'), json_extract(value,'$.notify_telegram') FROM json_each(?1)`,
        )
        .bind(JSON.stringify(thresholds)),
    );
  }
  if (domain === "reminders")
    statements.push(
      database
        .prepare(
          `INSERT INTO reminder_recipients (reminder_id, user_id) SELECT json_extract(value,'$._id'), ?2 FROM json_each(?1)`,
        )
        .bind(json, actorUserId),
    );
  return statements;
}

export async function commitImport(
  database: D1Database,
  actorUserId: string,
  jobId: string,
  domain: ImportExportDomain,
  rows: CanonicalRow[],
) {
  const now = new Date().toISOString();
  const records = rows.map((row) => ({
    row_number: row._row_number,
    fingerprint: row._fingerprint,
    created_record_id: row._id,
  }));
  const statements = [
    ...domainStatements(database, actorUserId, jobId, domain, rows),
    database
      .prepare(
        `INSERT INTO import_records (import_job_id, actor_user_id, domain, row_number, fingerprint, created_record_id) SELECT ?2, ?3, ?4, json_extract(value,'$.row_number'), json_extract(value,'$.fingerprint'), json_extract(value,'$.created_record_id') FROM json_each(?1)`,
      )
      .bind(JSON.stringify(records), jobId, actorUserId, domain),
    database
      .prepare(
        `UPDATE import_jobs SET status = 'committed', committed_at = ?1 WHERE id = ?2 AND actor_user_id = ?3 AND status = 'previewed'`,
      )
      .bind(now, jobId, actorUserId),
  ];
  await database.batch(statements);
}

export function canonicalColumns(domain: ImportExportDomain) {
  return importColumns[domain];
}
