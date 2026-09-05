import type { Context } from "hono";
import { ZodError } from "zod";
import {
  ConflictError,
  InvalidCategoryError,
  NotFoundError,
} from "../services/errors";
import type { AppEnv } from "../types";

export function respondWithError(context: Context<AppEnv>, error: unknown) {
  if (error instanceof ZodError) {
    return context.json(
      {
        error: "Bad Request",
        message: "Input tidak valid.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  if (error instanceof SyntaxError) {
    return context.json(
      { error: "Bad Request", message: "Body JSON tidak valid." },
      400,
    );
  }

  if (error instanceof NotFoundError) {
    return context.json({ error: "Not Found", message: error.message }, 404);
  }

  if (error instanceof ConflictError) {
    return context.json({ error: "Conflict", message: error.message }, 409);
  }

  if (error instanceof InvalidCategoryError) {
    return context.json({ error: "Bad Request", message: error.message }, 400);
  }

  throw error;
}
