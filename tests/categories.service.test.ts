import { describe, expect, it } from "vitest";
import { CategoryConflictError, NotFoundError } from "../src/services/errors";
import {
  createCategory,
  listCategories,
  normalizeCategoryName,
  setCategoryActive,
  type CategoryRow,
} from "../src/services/categories";

type ResponseShape = {
  all?: Record<string, unknown>[];
  first?: Record<string, unknown> | null;
  changes?: number;
};

function createFakeDatabase(
  routes: Array<{ match: (sql: string) => boolean; response: ResponseShape }>,
) {
  const calls: Array<{ bind: unknown[]; sql: string }> = [];

  return {
    calls,
    prepare(sql: string) {
      const route = routes.find((item) => item.match(sql));
      const response = route?.response ?? { all: [], first: null, changes: 0 };

      return {
        bind(...parameters: unknown[]) {
          calls.push({ bind: parameters, sql });
          return {
            all: async () => ({ results: response.all ?? [] }),
            first: async () => response.first ?? null,
            run: async () => ({
              meta: { changes: response.changes ?? 0 },
              success: true,
            }),
          };
        },
      };
    },
  } as unknown as D1Database & {
    calls: Array<{ bind: unknown[]; sql: string }>;
  };
}

describe("normalizeCategoryName", () => {
  it("menormalkan spasi dan huruf besar", () => {
    expect(normalizeCategoryName("  Makanan   Sama   ")).toBe("makanan sama");
  });
});

describe("listCategories", () => {
  it("memakai filter aktif dan mengembalikan kategori user", async () => {
    const row: CategoryRow = {
      id: "income-default-1",
      owner_user_id: null,
      type: "income",
      name: "Gaji",
      is_default: 1,
      is_active: 1,
    };
    const database = createFakeDatabase([
      { match: () => true, response: { all: [row] } },
    ]);

    const result = await listCategories(database, { userId: "user-1" });

    expect(result).toEqual([row]);
    expect(database.calls[0]!.sql).toContain("(owner_user_id = ?1");
    expect(database.calls[0]!.sql).toContain("is_active");
  });
});

describe("createCategory", () => {
  it("menolak kategori yang sudah ada untuk pemilik", async () => {
    const database = createFakeDatabase([
      {
        match: (sql) => sql.includes("WHERE (owner_user_id = ?1"),
        response: { first: { id: "existing-1" } },
      },
    ]);

    await expect(
      createCategory(database, {
        ownerUserId: "user-1",
        type: "expense",
        name: "Transport",
      }),
    ).rejects.toBeInstanceOf(CategoryConflictError);
  });

  it("membuat kategori custom baru", async () => {
    const created: CategoryRow = {
      id: "custom-1",
      owner_user_id: "user-1",
      type: "expense",
      name: "Langganan",
      is_default: 0,
      is_active: 1,
    };
    const database = createFakeDatabase([
      {
        match: (sql) => sql.includes("WHERE (owner_user_id = ?1"),
        response: { first: null },
      },
      {
        match: (sql) => sql.includes("WHERE id = ?1"),
        response: { first: created },
      },
      { match: () => true, response: { changes: 1 } },
    ]);

    const result = await createCategory(database, {
      ownerUserId: "user-1",
      type: "expense",
      name: "  Langganan  ",
    });

    expect(result).toEqual(created);
    expect(database.calls[1]!.bind).toContain("user-1");
    expect(database.calls[1]!.bind).toContain("langganan");
  });
});

describe("setCategoryActive", () => {
  it("mengaktifkan atau menonaktifkan kategori custom", async () => {
    const row: CategoryRow = {
      id: "custom-1",
      owner_user_id: "user-1",
      type: "expense",
      name: "Langganan",
      is_default: 0,
      is_active: 0,
    };
    const database = createFakeDatabase([
      { match: () => true, response: { all: [row] } },
    ]);

    const result = await setCategoryActive(database, {
      categoryId: "custom-1",
      ownerUserId: "user-1",
      isActive: false,
    });

    expect(result.is_active).toBe(0);
    expect(database.calls[0]!.sql).toContain("is_default = 0");
    expect(database.calls[0]!.bind[0]).toBe(0);
  });

  it("mengembalikan 404 untuk kategori orang lain", async () => {
    const database = createFakeDatabase([
      { match: () => true, response: { all: [] } },
    ]);

    await expect(
      setCategoryActive(database, {
        categoryId: "custom-lain",
        ownerUserId: "user-1",
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
