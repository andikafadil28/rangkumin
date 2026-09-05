import { Hono } from "hono";
import { respondWithError } from "../http/errors";
import { categoryOwnershipGuard } from "../middleware/ownership";
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  setCategoryActiveSchema,
} from "../schemas/category";
import {
  createCategory,
  listCategories,
  serializeCategory,
  setCategoryActive,
} from "../services/categories";
import type { AppEnv } from "../types";

export const categoryRoutes = new Hono<AppEnv>();

categoryRoutes.get("/", async (context) => {
  try {
    const query = listCategoriesQuerySchema.parse(context.req.query());
    const categories = await listCategories(context.env.DB, {
      userId: context.get("currentUser").id,
      type: query.type,
      includeInactive: query.inactive,
    });

    return context.json({ categories: categories.map(serializeCategory) });
  } catch (error) {
    return respondWithError(context, error);
  }
});

categoryRoutes.post("/", async (context) => {
  try {
    const body = createCategorySchema.parse(await context.req.json());
    const category = await createCategory(context.env.DB, {
      ownerUserId: context.get("currentUser").id,
      type: body.type,
      name: body.name,
    });

    return context.json({ category: serializeCategory(category) }, 201);
  } catch (error) {
    return respondWithError(context, error);
  }
});

categoryRoutes.patch(
  "/:categoryId",
  categoryOwnershipGuard,
  async (context) => {
    try {
      const body = setCategoryActiveSchema.parse(await context.req.json());
      const category = await setCategoryActive(context.env.DB, {
        categoryId: context.req.param("categoryId"),
        ownerUserId: context.get("currentUser").id,
        isActive: body.is_active,
      });

      return context.json({ category: serializeCategory(category) });
    } catch (error) {
      return respondWithError(context, error);
    }
  },
);
