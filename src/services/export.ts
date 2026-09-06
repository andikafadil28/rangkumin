import Papa from "papaparse";
import writeXlsxFile, {
  type CellObject,
  type Sheet,
  type SheetData,
} from "write-excel-file/universal";
import type { ImportExportDomain } from "../schemas/import-export";

export type ExportFilters = {
  owner?: string;
  from?: string;
  to?: string;
  includeDeleted: boolean;
};

type ExportRow = Record<string, string | number | null>;

const workbookPalette = {
  forest: "#24483A",
  forestSoft: "#3F6B58",
  cream: "#F7F1E8",
  paper: "#FFFCF7",
  sage: "#E4EEE7",
  gold: "#C99552",
  ink: "#25332D",
  muted: "#6B7771",
  white: "#FFFFFF",
};

const domainLabels: Record<ImportExportDomain, string> = {
  categories: "Kategori",
  transactions: "Transaksi",
  savings_goals: "Pos tabungan",
  savings_mutations: "Mutasi tabungan",
  budgets: "Anggaran",
  reminders: "Pengingat",
};

const moneyColumns = new Set(["amount", "target_amount", "monthly_limit"]);
const centeredColumns = new Set(["is_active", "notify_web", "notify_telegram"]);

const columnWidths: Record<string, number> = {
  type: 20,
  ownership_scope: 18,
  name: 30,
  category_name: 28,
  source_goal_name: 26,
  destination_goal_name: 26,
  amount: 19,
  target_amount: 19,
  monthly_limit: 19,
  description: 42,
  title: 34,
  transaction_date: 17,
  starts_on: 17,
  next_run_at: 24,
  deleted_at: 24,
  archived_at: 24,
  interval_value: 16,
  recurrence_type: 20,
  timezone: 20,
  thresholds: 28,
  owner_name: 22,
  actor_name: 22,
  creator_name: 22,
  recipient_names: 30,
  is_active: 14,
  notify_web: 16,
  notify_telegram: 20,
};

export const exportColumns: Record<ImportExportDomain, readonly string[]> = {
  categories: ["type", "name", "is_active", "owner_name"],
  transactions: [
    "type",
    "category_name",
    "amount",
    "description",
    "transaction_date",
    "owner_name",
    "deleted_at",
  ],
  savings_goals: [
    "ownership_scope",
    "name",
    "target_amount",
    "owner_name",
    "archived_at",
  ],
  savings_mutations: [
    "type",
    "source_goal_name",
    "destination_goal_name",
    "amount",
    "description",
    "transaction_date",
    "actor_name",
  ],
  budgets: [
    "ownership_scope",
    "category_name",
    "monthly_limit",
    "starts_on",
    "is_active",
    "thresholds",
    "owner_name",
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
    "recipient_names",
    "creator_name",
  ],
};

export function protectSpreadsheetValue(value: string): string {
  return /^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function conditions(
  filters: ExportFilters,
  alias: string,
  dateColumn?: string,
) {
  const clauses: string[] = [];
  const values: string[] = [];
  const add = (sql: string, value: string) => {
    values.push(value);
    clauses.push(`${sql} ?${values.length}`);
  };
  if (filters.owner) add(`${alias}.owner_user_id =`, filters.owner);
  if (dateColumn && filters.from) add(`${dateColumn} >=`, filters.from);
  if (dateColumn && filters.to) add(`${dateColumn} <=`, filters.to);
  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", values };
}

export async function exportDomainRows(
  database: D1Database,
  domain: ImportExportDomain,
  filters: ExportFilters,
): Promise<ExportRow[]> {
  const transactionFilter = conditions(filters, "t", "t.transaction_date");
  const queries: Record<
    ImportExportDomain,
    { sql: string; values: Array<string | null> }
  > = {
    categories: {
      sql: `SELECT c.type, c.name, c.is_active, u.display_name AS owner_name
        FROM categories c LEFT JOIN users u ON u.id = c.owner_user_id
        WHERE (c.owner_user_id IS NULL OR ?1 IS NULL OR c.owner_user_id = ?1)
        ORDER BY c.type, c.name COLLATE NOCASE`,
      values: [filters.owner ?? null],
    },
    transactions: {
      sql: `SELECT t.type, c.name AS category_name, t.amount, t.description,
          t.transaction_date, u.display_name AS owner_name, t.deleted_at
        FROM transactions t JOIN users u ON u.id = t.owner_user_id
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.type IN ('income', 'expense')
          ${filters.includeDeleted ? "" : "AND t.deleted_at IS NULL"}${transactionFilter.sql}
        ORDER BY t.transaction_date, t.created_at`,
      values: transactionFilter.values,
    },
    savings_goals: {
      sql: `SELECT g.ownership_scope, g.name, g.target_amount,
          u.display_name AS owner_name, g.archived_at
        FROM savings_goals g LEFT JOIN users u ON u.id = g.owner_user_id
        WHERE (?1 IS NULL OR g.owner_user_id = ?1 OR g.ownership_scope = 'shared')
        ORDER BY g.created_at`,
      values: [filters.owner ?? null],
    },
    savings_mutations: {
      sql: `SELECT t.type, sg.name AS source_goal_name, dg.name AS destination_goal_name,
          t.amount, t.description, t.transaction_date, u.display_name AS actor_name
        FROM transactions t JOIN users u ON u.id = t.owner_user_id
        LEFT JOIN savings_goals sg ON sg.id = t.source_savings_goal_id
        LEFT JOIN savings_goals dg ON dg.id = t.destination_savings_goal_id
        WHERE t.type IN ('saving_deposit', 'saving_withdrawal', 'saving_transfer')
          AND t.deleted_at IS NULL${transactionFilter.sql}
        ORDER BY t.transaction_date, t.created_at`,
      values: transactionFilter.values,
    },
    budgets: {
      sql: `SELECT b.ownership_scope, c.name AS category_name, b.monthly_limit,
          b.starts_on, b.is_active,
          (SELECT group_concat(bt.percentage || ':' || bt.notify_web || ':' || bt.notify_telegram, ';')
            FROM budget_thresholds bt WHERE bt.budget_id = b.id ORDER BY bt.percentage) AS thresholds,
          u.display_name AS owner_name
        FROM budgets b JOIN categories c ON c.id = b.category_id
        LEFT JOIN users u ON u.id = b.owner_user_id
        WHERE (?1 IS NULL OR b.owner_user_id = ?1 OR b.ownership_scope = 'shared')
        ORDER BY b.starts_on, c.name COLLATE NOCASE`,
      values: [filters.owner ?? null],
    },
    reminders: {
      sql: `SELECT r.title, r.description, r.amount, c.name AS category_name,
          r.recurrence_type, r.interval_value, r.next_run_at, r.timezone,
          r.is_active, r.notify_web, r.notify_telegram,
          (SELECT group_concat(recipient.display_name, ', ')
            FROM reminder_recipients rr JOIN users recipient ON recipient.id = rr.user_id
            WHERE rr.reminder_id = r.id ORDER BY recipient.display_name) AS recipient_names,
          u.display_name AS creator_name
        FROM reminders r JOIN users u ON u.id = r.creator_user_id
        LEFT JOIN categories c ON c.id = r.category_id
        WHERE (?1 IS NULL OR r.creator_user_id = ?1 OR EXISTS (
          SELECT 1 FROM reminder_recipients rr WHERE rr.reminder_id = r.id AND rr.user_id = ?1
        ))
        ORDER BY r.next_run_at`,
      values: [filters.owner ?? null],
    },
  };
  const query = queries[domain];
  const { results } = await database
    .prepare(query.sql)
    .bind(...query.values)
    .all<ExportRow>();
  return results;
}

function safeRows(domain: ImportExportDomain, rows: ExportRow[]) {
  return rows.map((row) =>
    Object.fromEntries(
      exportColumns[domain].map((column) => {
        const value = row[column] ?? "";
        return [
          column,
          typeof value === "string" ? protectSpreadsheetValue(value) : value,
        ];
      }),
    ),
  );
}

export function createCsv(
  domain: ImportExportDomain,
  rows: ExportRow[],
): string {
  return Papa.unparse(safeRows(domain, rows), {
    columns: [...exportColumns[domain]],
    newline: "\r\n",
  });
}

export async function createWorkbook(
  rowsByDomain: Record<ImportExportDomain, ExportRow[]>,
): Promise<Blob> {
  const exportedAt = new Date();
  const totalRows = Object.values(rowsByDomain).reduce(
    (total, rows) => total + rows.length,
    0,
  );
  const summaryData: SheetData = [
    [
      {
        value: "RANGKUMIN",
        columnSpan: 3,
        fontSize: 22,
        fontWeight: "bold",
        textColor: workbookPalette.white,
        backgroundColor: workbookPalette.forest,
        height: 38,
        alignVertical: "center",
      },
    ],
    [
      {
        value: "Laporan keuangan kalian",
        columnSpan: 3,
        fontSize: 14,
        fontWeight: "bold",
        textColor: workbookPalette.forest,
        backgroundColor: workbookPalette.cream,
        height: 28,
        alignVertical: "center",
      },
    ],
    [],
    [
      {
        value: "Diekspor",
        fontWeight: "bold",
        textColor: workbookPalette.muted,
      },
      { value: exportedAt, type: Date, format: "dd mmmm yyyy, hh:mm" },
    ],
    [
      {
        value: "Total baris",
        fontWeight: "bold",
        textColor: workbookPalette.muted,
      },
      { value: totalRows, type: Number, format: "#,##0" },
    ],
    [],
    [
      {
        value: "ISI WORKBOOK",
        fontWeight: "bold",
        textColor: workbookPalette.white,
        backgroundColor: workbookPalette.forestSoft,
        bottomBorderColor: workbookPalette.gold,
        bottomBorderStyle: "medium",
      },
      {
        value: "BARIS",
        fontWeight: "bold",
        textColor: workbookPalette.white,
        backgroundColor: workbookPalette.forestSoft,
        bottomBorderColor: workbookPalette.gold,
        bottomBorderStyle: "medium",
        align: "right",
      },
    ],
    ...Object.entries(rowsByDomain).map(([domain, rows], index) => [
      {
        value: domainLabels[domain as ImportExportDomain],
        backgroundColor:
          index % 2 ? workbookPalette.paper : workbookPalette.sage,
        textColor: workbookPalette.ink,
        height: 24,
        alignVertical: "center" as const,
      },
      {
        value: rows.length,
        type: Number,
        format: "#,##0",
        align: "right" as const,
        backgroundColor:
          index % 2 ? workbookPalette.paper : workbookPalette.sage,
        textColor: workbookPalette.ink,
      },
    ]),
    [],
    [
      {
        value:
          "Data sensitif seperti email, Telegram ID, token, dan state internal tidak disertakan.",
        columnSpan: 3,
        fontStyle: "italic",
        textColor: workbookPalette.muted,
        wrap: true,
      },
    ],
  ];
  const summarySheet: Sheet<Blob> = {
    sheet: "Ringkasan",
    data: summaryData,
    columns: [{ width: 30 }, { width: 22 }, { width: 18 }],
    showGridLines: false,
    zoomScale: 95,
  };

  const domainSheets: Sheet<Blob>[] = Object.entries(rowsByDomain).map(
    ([domainValue, rows]) => {
      const domain = domainValue as ImportExportDomain;
      const header = exportColumns[domain].map((value) => ({
        value,
        fontWeight: "bold" as const,
        textColor: workbookPalette.white,
        backgroundColor: workbookPalette.forest,
        bottomBorderColor: workbookPalette.gold,
        bottomBorderStyle: "medium" as const,
        align: centeredColumns.has(value)
          ? ("center" as const)
          : ("left" as const),
        alignVertical: "center" as const,
        height: 30,
        wrap: true,
      }));
      const data: SheetData = [
        header,
        ...safeRows(domain, rows).map((row, rowIndex) =>
          exportColumns[domain].map((column): CellObject => {
            const value = row[column] ?? undefined;
            return {
              value,
              ...(moneyColumns.has(column) && typeof value === "number"
                ? { type: Number, format: '"Rp" #,##0', align: "right" }
                : centeredColumns.has(column)
                  ? { align: "center" }
                  : {}),
              backgroundColor:
                rowIndex % 2 ? workbookPalette.paper : workbookPalette.sage,
              textColor: workbookPalette.ink,
              alignVertical: "top",
              height: 24,
              wrap: true,
              bottomBorderColor: "#D7E0DA",
              bottomBorderStyle: "hair",
            };
          }),
        ),
      ];
      return {
        sheet: domain,
        data,
        columns: exportColumns[domain].map((column) => ({
          width: columnWidths[column] ?? 20,
        })),
        stickyRowsCount: 1,
        showGridLines: false,
        zoomScale: 90,
        orientation: "landscape",
      };
    },
  );
  return writeXlsxFile([summarySheet, ...domainSheets], {
    fontFamily: "Aptos",
    fontSize: 11,
  }).toBlob();
}
