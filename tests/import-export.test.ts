import { Hono } from "hono";
import { zipSync } from "fflate";
import readXlsxFile from "read-excel-file/web-worker";
import { describe, expect, it } from "vitest";
import { importExportRoutes } from "../src/routes/import-export";
import type { ImportExportDomain } from "../src/schemas/import-export";
import {
  createCsv,
  createWorkbook,
  protectSpreadsheetValue,
} from "../src/services/export";
import {
  commitImport,
  ImportRequestError,
  MAX_IMPORT_BYTES,
  parseAndValidateImport,
  planImport,
  type CanonicalRow,
} from "../src/services/import";
import type { AppBindings, AppEnv } from "../src/types";

type QueryResponse = {
  all?: Record<string, unknown>[];
  first?: Record<string, unknown> | null;
  changes?: number;
};

function fakeDatabase(responses: QueryResponse[] = []) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const batches: D1PreparedStatement[][] = [];
  let responseIndex = 0;
  const database = {
    prepare(sql: string) {
      const captured = { sql, values: [] as unknown[] };
      statements.push(captured);
      const prepared = {
        bind(...values: unknown[]) {
          captured.values = values;
          return prepared;
        },
        async all() {
          const response = responses[responseIndex++] ?? {};
          return { results: response.all ?? [] };
        },
        async first() {
          const response = responses[responseIndex++] ?? {};
          return response.first ?? null;
        },
        async run() {
          const response = responses[responseIndex++] ?? {};
          return { meta: { changes: response.changes ?? 1 } };
        },
      };
      return prepared;
    },
    async batch(items: D1PreparedStatement[]) {
      batches.push(items);
      return [];
    },
  } as unknown as D1Database;
  return { batches, database, statements };
}

function csvFile(content: string, name = "import.csv") {
  return new File([content], name, { type: "text/csv" });
}

const validCsv: Record<ImportExportDomain, string> = {
  categories: "type,name,is_active\nexpense,Kebutuhan,1",
  transactions:
    "type,category_name,amount,description,transaction_date,deleted_at\nexpense,Makanan,10000,Makan,2026-09-01,",
  savings_goals:
    "ownership_scope,name,target_amount,archived_at\npersonal,Dana Darurat,1000000,",
  savings_mutations:
    "type,source_goal_name,destination_goal_name,amount,description,transaction_date\nsaving_deposit,,Dana Darurat,10000,Setor,2026-09-01",
  budgets:
    "ownership_scope,category_name,monthly_limit,starts_on,is_active,thresholds\npersonal,Makanan,500000,2026-09-01,1,50:1:0;90:1:1",
  reminders:
    "title,description,amount,category_name,recurrence_type,interval_value,next_run_at,timezone,is_active,notify_web,notify_telegram\nBayar listrik,,100000,Makanan,monthly,20,2026-09-20T01:00:00.000Z,Asia/Jakarta,1,1,0",
};

describe("import parser", () => {
  it("memvalidasi canonical contract keenam domain", async () => {
    for (const [domain, csv] of Object.entries(validCsv)) {
      const result = await parseAndValidateImport(
        csvFile(csv),
        domain as ImportExportDomain,
        {},
      );
      expect(result.errors, domain).toEqual([]);
      expect(result.rows, domain).toHaveLength(1);
      expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("menerapkan mapping canonical ke heading sumber", async () => {
    const result = await parseAndValidateImport(
      csvFile("Jenis,Nama,Aktif\nexpense,Makan,1"),
      "categories",
      { type: "Jenis", name: "Nama", is_active: "Aktif" },
    );
    expect(result.rows[0]).toMatchObject({
      type: "expense",
      name: "Makan",
      is_active: true,
    });
  });

  it("memigrasikan channel Telegram historis ke Web Push", async () => {
    const budget = await parseAndValidateImport(
      csvFile(
        "ownership_scope,category_name,monthly_limit,starts_on,is_active,thresholds\npersonal,Makanan,500000,2026-09-01,1,80:0:1",
      ),
      "budgets",
      {},
    );
    expect(budget.rows[0]).toMatchObject({
      thresholds: [
        { percentage: 80, notify_web: true, notify_telegram: false },
      ],
    });

    const reminder = await parseAndValidateImport(
      csvFile(
        "title,description,amount,category_name,recurrence_type,interval_value,next_run_at,timezone,is_active,notify_web,notify_telegram\nBayar listrik,,100000,Makanan,monthly,20,2026-09-20T01:00:00.000Z,Asia/Jakarta,1,0,1",
      ),
      "reminders",
      {},
    );
    expect(reminder.rows[0]).toMatchObject({
      notify_web: true,
      notify_telegram: false,
    });
  });

  it("menolak CSV malformed, oversized, dan lebih dari 500 baris", async () => {
    await expect(
      parseAndValidateImport(
        csvFile('type,name,is_active\nexpense,"tidak selesai'),
        "categories",
        {},
      ),
    ).rejects.toBeInstanceOf(ImportRequestError);
    await expect(
      parseAndValidateImport(
        new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], "large.csv"),
        "categories",
        {},
      ),
    ).rejects.toMatchObject({ status: 413 });
    const rows = Array.from(
      { length: 501 },
      (_, index) => `expense,Kategori ${index},1`,
    ).join("\n");
    await expect(
      parseAndValidateImport(
        csvFile(`type,name,is_active\n${rows}`),
        "categories",
        {},
      ),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("menolak XLSX dengan macro pada ZIP preflight", async () => {
    const archive = zipSync({ "xl/vbaProject.bin": new Uint8Array([1, 2, 3]) });
    await expect(
      parseAndValidateImport(
        new File([archive], "macro.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "categories",
        {},
      ),
    ).rejects.toThrow("macro atau external link");
  });

  it("membaca sheet domain dari XLSX hasil export", async () => {
    const workbook = await createWorkbook({
      categories: [
        {
          type: "expense",
          name: "Makan",
          is_active: 1,
          owner_name: "User Satu",
        },
      ],
      transactions: [],
      savings_goals: [],
      savings_mutations: [],
      budgets: [],
      reminders: [],
    });
    const result = await parseAndValidateImport(
      new File([workbook], "rangkumin.xlsx"),
      "categories",
      {},
    );
    expect(result.rows[0]).toMatchObject({ name: "Makan", is_active: true });
  });
});

describe("export", () => {
  it("melindungi semua prefix formula injection di CSV", () => {
    for (const value of [
      "=SUM(A1:A2)",
      "+cmd",
      "-2+3",
      "@call",
      "  =SUM(A1:A2)",
      "\tformula",
      "\rformula",
    ])
      expect(protectSpreadsheetValue(value)).toBe(`'${value}`);
    const csv = createCsv("categories", [
      {
        type: "expense",
        name: '=WEBSERVICE("https://invalid")',
        is_active: 1,
        owner_name: "+owner",
      },
    ]);
    expect(csv).toContain("'=WEBSERVICE");
    expect(csv).toContain("'+owner");
  });

  it("membuat workbook enam sheet tanpa field internal", async () => {
    const empty = {
      categories: [],
      transactions: [],
      savings_goals: [],
      savings_mutations: [],
      budgets: [],
      reminders: [],
    };
    const blob = await createWorkbook(empty);
    const sheets = await readXlsxFile(await blob.arrayBuffer());
    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      "Ringkasan",
      ...Object.keys(empty),
    ]);
    expect(sheets[0]?.data[0]?.[0]).toBe("RANGKUMIN");
    expect(sheets[0]?.data[4]?.[1]).toBe(0);
    const headers = sheets.slice(1).flatMap((sheet) => sheet.data[0]);
    expect(headers).not.toContain("email");
    expect(headers).not.toContain("telegram_user_id");
    expect(headers).not.toContain("idempotency_key");
  });
});

describe("import planning dan commit", () => {
  const row = (fingerprint: string, rowNumber = 2): CanonicalRow => ({
    type: "expense",
    name: "Makan",
    is_active: true,
    _id: `row-${rowNumber}`,
    _row_number: rowNumber,
    _fingerprint: fingerprint.padEnd(64, "0"),
  });

  it("skip duplikat in-file dan reject membatalkan planning", async () => {
    const duplicateRows = [row("a", 2), row("a", 3)];
    const skipped = await planImport(
      fakeDatabase([{ all: [] }, { all: [] }]).database,
      "user-1",
      "categories",
      duplicateRows,
      "skip",
    );
    expect(skipped.acceptedRows).toHaveLength(1);
    expect(skipped.duplicateRows).toBe(1);
    await expect(
      planImport(
        fakeDatabase([{ all: [] }, { all: [] }]).database,
        "user-1",
        "categories",
        duplicateRows,
        "reject",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("mendeteksi duplikat database dalam satu query JSON", async () => {
    const result = await planImport(
      fakeDatabase([{ all: [{ item_index: 0 }] }, { all: [] }]).database,
      "user-1",
      "categories",
      [row("b")],
      "skip",
    );
    expect(result).toMatchObject({ acceptedRows: [], duplicateRows: 1 });
  });

  it("mengirim seluruh rencana budget dalam satu D1 batch atomik", async () => {
    const fake = fakeDatabase();
    await commitImport(fake.database, "user-1", "job-1", "budgets", [
      {
        ownership_scope: "personal",
        category_name: "Makan",
        monthly_limit: 100000,
        starts_on: "2026-09-01",
        is_active: true,
        thresholds: [
          { percentage: 80, notify_web: true, notify_telegram: false },
        ],
        _category_id: "category-1",
        _id: "import-job-1-2",
        _row_number: 2,
        _fingerprint: "c".repeat(64),
      },
    ]);
    expect(fake.batches).toHaveLength(1);
    expect(fake.batches[0]).toHaveLength(4);
    expect(fake.statements.some((item) => item.sql.includes("json_each"))).toBe(
      true,
    );
    expect(fake.statements.at(-1)?.sql).toContain("status = 'committed'");
  });

  it("menandai transaksi sebagai source import dalam batch yang sama", async () => {
    const fake = fakeDatabase();
    await commitImport(fake.database, "user-1", "job-2", "transactions", [
      {
        type: "expense",
        category_name: "Makan",
        amount: 10000,
        description: null,
        transaction_date: "2026-09-01",
        deleted_at: null,
        _category_id: "category-1",
        _id: "import-job-2-2",
        _row_number: 2,
        _fingerprint: "d".repeat(64),
      },
    ]);
    expect(fake.batches).toHaveLength(1);
    expect(fake.statements[0]?.sql).toContain("'import'");
    expect(fake.statements[0]?.sql).toContain("?2");
  });
});

describe("import route security", () => {
  function appWith(database: D1Database) {
    const app = new Hono<AppEnv>();
    app.use("*", async (context, next) => {
      context.set("currentUser", { id: "user-1", displayName: "User Satu" });
      await next();
    });
    app.route("/", importExportRoutes);
    return {
      app,
      env: { DB: database, APP_ENV: "test" } as unknown as AppBindings,
    };
  }

  it("mewajibkan custom header dan menolak Origin lintas origin", async () => {
    const { app, env } = appWith(fakeDatabase().database);
    const form = new FormData();
    form.set("domain", "categories");
    form.set("file", csvFile(validCsv.categories));
    const noHeader = await app.request(
      "http://app.test/import/preview",
      { method: "POST", body: form },
      env,
    );
    expect(noHeader.status).toBe(400);
    const crossOrigin = await app.request(
      "http://app.test/import/preview",
      {
        method: "POST",
        headers: {
          Origin: "https://evil.invalid",
          "X-Rangkumin-Import": "import-key-0001",
        },
        body: form,
      },
      env,
    );
    expect(crossOrigin.status).toBe(400);
  });

  it("melayani path CSV dengan filename tetap dan formula aman", async () => {
    const fake = fakeDatabase([
      {
        all: [
          {
            type: "expense",
            name: "=formula",
            is_active: 1,
            owner_name: "User Satu",
          },
        ],
      },
    ]);
    const { app, env } = appWith(fake.database);
    const response = await app.request("/export/categories.csv", {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="rangkumin-categories.csv"',
    );
    expect(await response.text()).toContain("'=formula");
  });

  it("memprioritaskan path XLSX penuh dari route filename dinamis", async () => {
    const { app, env } = appWith(
      fakeDatabase(Array.from({ length: 6 }, () => ({ all: [] }))).database,
    );
    const response = await app.request("/export/all.xlsx", {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="rangkumin-export.xlsx"',
    );
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 2)).toEqual(
      new Uint8Array([0x50, 0x4b]),
    );
  });

  it("membuat preview valid tanpa menerima owner dari file", async () => {
    const fake = fakeDatabase([
      { first: null },
      { all: [] },
      { all: [] },
      { changes: 1 },
    ]);
    const { app, env } = appWith(fake.database);
    const form = new FormData();
    form.set("domain", "categories");
    form.set("duplicate_policy", "skip");
    form.set("file", csvFile(validCsv.categories));
    const response = await app.request(
      "http://app.test/import/preview",
      {
        method: "POST",
        headers: {
          Origin: "http://app.test",
          "X-Rangkumin-Import": "import-key-0002",
        },
        body: form,
      },
      env,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      status: "previewed",
      accepted_rows: 1,
    });
    const insert = fake.statements.find((item) =>
      item.sql.includes("INSERT INTO import_jobs"),
    );
    expect(insert?.values[1]).toBe("user-1");
  });

  it("menolak commit ketika digest file reupload berbeda", async () => {
    const fake = fakeDatabase([
      {
        first: {
          id: "job-1",
          actor_user_id: "user-1",
          idempotency_key: "import-key-0003",
          domain: "categories",
          file_digest: "0".repeat(64),
          mapping_json: JSON.stringify({
            type: "type",
            name: "name",
            is_active: "is_active",
          }),
          plan_digest: "1".repeat(64),
          duplicate_policy: "skip",
          total_rows: 1,
          accepted_rows: 1,
          duplicate_rows: 0,
          status: "previewed",
        },
      },
    ]);
    const { app, env } = appWith(fake.database);
    const form = new FormData();
    form.set("file", csvFile(validCsv.categories));
    const response = await app.request(
      "http://app.test/import/job-1/commit",
      {
        method: "POST",
        headers: {
          Origin: "http://app.test",
          "X-Rangkumin-Import": "import-key-0003",
        },
        body: form,
      },
      env,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      message: "File commit berbeda dari file preview.",
    });
  });
});
