import { CategoryConflictError, NotFoundError } from "./errors";

export type CategoryRow = {
  id: string;
  owner_user_id: string | null;
  type: "income" | "expense" | "saving";
  name: string;
  is_default: number;
  is_active: number;
};

export type CategoryDetail = {
  id: string;
  type: "income" | "expense" | "saving";
  name: string;
  isDefault: boolean;
  isActive: boolean;
};

type CategoryFilters = {
  userId: string;
  type?: "income" | "expense" | "saving";
  includeInactive?: boolean;
};

type CreateCategoryInput = {
  ownerUserId: string;
  type: "income" | "expense";
  name: string;
};

type SetCategoryActiveInput = {
  categoryId: string;
  ownerUserId: string;
  isActive: boolean;
};

export function normalizeCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function serializeCategory(row: CategoryRow): CategoryDetail {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    isDefault: row.is_default === 1,
    isActive: row.is_active === 1,
  };
}

export async function listCategories(
  database: D1Database,
  filters: CategoryFilters,
): Promise<CategoryRow[]> {
  const conditions = ["(owner_user_id = ?1 OR is_default = 1)"];
  const parameters: Array<string | number> = [filters.userId];

  if (filters.type) {
    conditions.push("type = ?" + (parameters.length + 1));
    parameters.push(filters.type);
  }

  if (!filters.includeInactive) {
    conditions.push("is_active = ?" + (parameters.length + 1));
    parameters.push(1);
  }

  const { results } = await database
    .prepare(
      `SELECT id, owner_user_id, type, name, is_default, is_active
       FROM categories
       WHERE ${conditions.join(" AND ")}
       ORDER BY is_default DESC, name COLLATE NOCASE ASC`,
    )
    .bind(...parameters)
    .all<CategoryRow>();

  return results;
}

export async function createCategory(
  database: D1Database,
  input: CreateCategoryInput,
): Promise<CategoryRow> {
  const normalizedName = normalizeCategoryName(input.name);
  const id = crypto.randomUUID();

  const existing = await database
    .prepare(
      `SELECT id
       FROM categories
       WHERE (owner_user_id = ?1 OR is_default = 1)
         AND type = ?2
         AND normalized_name = ?3
       LIMIT 1`,
    )
    .bind(input.ownerUserId, input.type, normalizedName)
    .first<{ id: string }>();

  if (existing) {
    throw new CategoryConflictError(
      "Kategori dengan nama tersebut sudah tersedia untuk tipe ini.",
    );
  }

  const result = await database
    .prepare(
      `INSERT INTO categories (
         id, owner_user_id, type, name, normalized_name, is_default, is_active
       ) VALUES (?, ?, ?, ?, ?, 0, 1)
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      id,
      input.ownerUserId,
      input.type,
      input.name.trim().replace(/\s+/g, " "),
      normalizedName,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new CategoryConflictError(
      "Kategori dengan nama tersebut sudah tersedia untuk tipe ini.",
    );
  }

  const category = await getCategory(database, id);
  if (!category) {
    throw new NotFoundError("Kategori tidak ditemukan.");
  }

  return category;
}

export async function setCategoryActive(
  database: D1Database,
  input: SetCategoryActiveInput,
): Promise<CategoryRow> {
  const { results } = await database
    .prepare(
      `UPDATE categories
       SET is_active = ?1, updated_at = ?3
       WHERE id = ?2
         AND owner_user_id = ?4
         AND is_default = 0
       RETURNING id, owner_user_id, type, name, is_default, is_active`,
    )
    .bind(
      input.isActive ? 1 : 0,
      input.categoryId,
      new Date().toISOString(),
      input.ownerUserId,
    )
    .all<CategoryRow>();

  const category = results[0];

  if (!category) {
    throw new NotFoundError(
      "Kategori custom tidak ditemukan atau bukan milik Anda.",
    );
  }

  return category;
}

export async function getCategory(
  database: D1Database,
  categoryId: string,
): Promise<CategoryRow | null> {
  return database
    .prepare(
      `SELECT id, owner_user_id, type, name, is_default, is_active
       FROM categories
       WHERE id = ?1
       LIMIT 1`,
    )
    .bind(categoryId)
    .first<CategoryRow>();
}
