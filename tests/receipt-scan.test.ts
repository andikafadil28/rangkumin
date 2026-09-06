import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createReceiptScanRoutes,
  MAX_RECEIPT_BYTES,
} from "../src/routes/receipt-scans";
import {
  parseReceiptAiResponse,
  RECEIPT_VISION_MODEL,
  scanReceipt,
} from "../src/services/receipt-scan";
import type { CategoryRow } from "../src/services/categories";
import type { AppEnv } from "../src/types";

const category: CategoryRow = {
  id: "expense-food",
  owner_user_id: null,
  type: "expense",
  name: "Makanan & Minuman",
  is_default: 1,
  is_active: 1,
};

function png(size = 12) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function formRequest(file: File, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", file);
  return { method: "POST", headers, body: form };
}

function app(authenticated = true) {
  const categories = vi.fn(async () => [category]);
  const scan = vi.fn(async () => ({
    type: "expense" as const,
    amount: 25_000,
    date: "2026-09-07",
    merchant: "Warung",
    description: "Makan siang",
    category_key: category.id,
    category_name: category.name,
    confidence: 0.95,
    warnings: [],
  }));
  const testApp = new Hono<{
    Bindings: AppEnv["Bindings"] & { AI: Ai };
    Variables: AppEnv["Variables"];
  }>();
  if (authenticated) {
    testApp.use("*", async (context, next) => {
      context.set("currentUser", { id: "user-1", displayName: "User Satu" });
      await next();
    });
  }
  testApp.route(
    "/receipt-scans",
    createReceiptScanRoutes({ categories, scan }),
  );
  return { categories, scan, testApp };
}

const environment = { DB: {}, AI: {} };

describe("receipt scan route", () => {
  it("memerlukan currentUser dari protected middleware", async () => {
    const response = await app(false).testApp.request(
      "/receipt-scans",
      formRequest(new File([png()], "receipt.png", { type: "image/png" })),
      environment,
    );
    expect(response.status).toBe(401);
  });

  it("menolak MIME yang tidak didukung", async () => {
    const response = await app().testApp.request(
      "/receipt-scans",
      formRequest(new File([png()], "receipt.gif", { type: "image/gif" })),
      environment,
    );
    expect(response.status).toBe(400);
  });

  it("menolak magic bytes yang tidak cocok", async () => {
    const response = await app().testApp.request(
      "/receipt-scans",
      formRequest(
        new File([new Uint8Array(12)], "receipt.png", { type: "image/png" }),
      ),
      environment,
    );
    expect(response.status).toBe(422);
  });

  it("menolak file di atas 2 MiB", async () => {
    const response = await app().testApp.request(
      "/receipt-scans",
      formRequest(
        new File([png(MAX_RECEIPT_BYTES + 1)], "receipt.png", {
          type: "image/png",
        }),
      ),
      environment,
    );
    expect(response.status).toBe(413);
  });

  it("menghasilkan draft tanpa menulis data", async () => {
    const { categories, scan, testApp } = app();
    const response = await testApp.request(
      "/receipt-scans",
      formRequest(new File([png()], "receipt.png", { type: "image/png" }), {
        Origin: "http://localhost",
      }),
      environment,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      draft: { type: "expense", amount: 25_000, category_key: category.id },
    });
    expect(categories).toHaveBeenCalledWith(environment.DB, {
      userId: "user-1",
      type: "expense",
    });
    expect(scan).toHaveBeenCalledOnce();
    expect(Object.keys(environment.DB)).toHaveLength(0);
  });
});

describe("receipt scan service", () => {
  it("mem-parsing fenced JSON dan memetakan alias kategori", async () => {
    const run = vi.fn(async () => ({
      response:
        '```json\n{"draft":{"amount":25000,"date":"2026-09-07","merchant":"Warung","description":"Makan siang","category_key":"category_1","confidence":0.95,"warnings":[]}}\n```',
    }));
    const result = await scanReceipt({ run } as unknown as Ai, png(), [
      category,
    ]);
    expect(result.category_key).toBe(category.id);
    expect(run).toHaveBeenCalledWith(
      RECEIPT_VISION_MODEL,
      expect.objectContaining({ image: expect.any(Array), temperature: 0 }),
    );
  });

  it("menolak respons AI malformed", () => {
    expect(() => parseReceiptAiResponse("```json\nnot-json\n```")).toThrow(
      "Respons pemindai struk tidak valid.",
    );
  });

  it("menolak category alias di luar daftar", async () => {
    const ai = {
      run: vi.fn(async () => ({
        response:
          '{"draft":{"amount":25000,"date":null,"merchant":null,"description":null,"category_key":"category_99","confidence":0.4,"warnings":[]}}',
      })),
    } as unknown as Ai;
    await expect(scanReceipt(ai, png(), [category])).rejects.toMatchObject({
      status: 422,
    });
  });

  it.each([
    ['"Rp 25.000"', 25_000],
    ['"25000"', 25_000],
    ["25000", 25_000],
  ])("menormalkan amount %s menjadi integer", async (amount, expected) => {
    const run = vi.fn(async () => ({
      response: `{"draft":{"amount":${amount},"date":"2026-09-07","merchant":"Warung","description":"Makan siang","category_key":"category_1","confidence":0.95,"warnings":[]}}`,
    }));
    const result = await scanReceipt({ run } as unknown as Ai, png(), [
      category,
    ]);
    expect(result.amount).toBe(expected);
  });
});
