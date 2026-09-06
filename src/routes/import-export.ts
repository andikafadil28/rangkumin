import { Hono, type Context } from "hono";
import { ZodError } from "zod";
import {
  duplicatePolicySchema,
  exportQuerySchema,
  importExportDomainSchema,
  importExportDomains,
  importHeaderSchema,
  importMappingSchema,
  type ImportExportDomain,
} from "../schemas/import-export";
import {
  createCsv,
  createWorkbook,
  exportDomainRows,
} from "../services/export";
import {
  commitImport,
  ImportRequestError,
  importPlanDigest,
  MAX_IMPORT_BYTES,
  parseAndValidateImport,
  planImport,
} from "../services/import";
import type { AppEnv } from "../types";

type ImportJobRow = {
  id: string;
  actor_user_id: string;
  idempotency_key: string;
  domain: ImportExportDomain;
  file_digest: string;
  mapping_json: string;
  plan_digest: string;
  duplicate_policy: "skip" | "reject";
  total_rows: number;
  accepted_rows: number;
  duplicate_rows: number;
  status: "previewed" | "committed";
};

export const importExportRoutes = new Hono<AppEnv>();

function fixedFilename(domain: ImportExportDomain, extension: "csv" | "xlsx") {
  return extension === "xlsx"
    ? "rangkumin-export.xlsx"
    : `rangkumin-${domain}.csv`;
}

function assertSameOrigin(requestUrl: string, origin?: string) {
  if (!origin) return;
  try {
    if (new URL(origin).origin === new URL(requestUrl).origin) return;
  } catch {
    // Invalid origins are rejected below without exposing parser details.
  }
  throw new ImportRequestError("Origin request tidak diizinkan.");
}

function requestKey(value?: string) {
  try {
    return importHeaderSchema.parse(value);
  } catch {
    throw new ImportRequestError("X-Rangkumin-Import tidak valid.");
  }
}

async function multipart(context: Context<AppEnv>) {
  const contentLength = Number(context.req.header("Content-Length") ?? 0);
  if (contentLength > MAX_IMPORT_BYTES + 64 * 1024)
    throw new ImportRequestError("Request import terlalu besar.", 413);
  let form: FormData;
  try {
    form = await context.req.raw.formData();
  } catch {
    throw new ImportRequestError("Body multipart tidak valid.");
  }
  const file = form.get("file");
  if (!(file instanceof File))
    throw new ImportRequestError("Field file wajib diisi.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "xlsx")
    throw new ImportRequestError("Hanya file CSV atau XLSX yang didukung.");
  return { file, form };
}

function responseError(context: Context<AppEnv>, error: unknown) {
  if (error instanceof ImportRequestError)
    return context.json(
      {
        error:
          error.status === 409
            ? "Conflict"
            : error.status === 413
              ? "Payload Too Large"
              : error.status === 422
                ? "Unprocessable Entity"
                : "Bad Request",
        message: error.message,
      },
      error.status,
    );
  if (error instanceof ZodError)
    return context.json(
      { error: "Bad Request", message: "Parameter import/export tidak valid." },
      400,
    );
  throw error;
}

importExportRoutes.get("/export/:filename{.+\\.csv}", async (context) => {
  try {
    const filename = context.req.param("filename");
    if (!filename.endsWith(".csv"))
      throw new ImportRequestError("Format export tidak didukung.");
    const domain = importExportDomainSchema.parse(filename.slice(0, -4));
    const query = exportQuerySchema.parse(context.req.query());
    const rows = await exportDomainRows(context.env.DB, domain, {
      owner: query.owner,
      from: query.from,
      to: query.to,
      includeDeleted: query.include_deleted,
    });
    const csv = createCsv(domain, rows);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fixedFilename(domain, "csv")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return responseError(context, error);
  }
});

importExportRoutes.get("/export/all.xlsx", async (context) => {
  try {
    const query = exportQuerySchema.parse(context.req.query());
    const filters = {
      owner: query.owner,
      from: query.from,
      to: query.to,
      includeDeleted: query.include_deleted,
    };
    const entries = await Promise.all(
      importExportDomains.map(
        async (domain) =>
          [
            domain,
            await exportDomainRows(context.env.DB, domain, filters),
          ] as const,
      ),
    );
    const workbook = await createWorkbook(
      Object.fromEntries(entries) as Record<
        ImportExportDomain,
        Record<string, string | number | null>[]
      >,
    );
    return new Response(workbook, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fixedFilename("categories", "xlsx")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return responseError(context, error);
  }
});

importExportRoutes.post("/import/preview", async (context) => {
  try {
    assertSameOrigin(context.req.url, context.req.header("Origin"));
    const key = requestKey(context.req.header("X-Rangkumin-Import"));
    const actor = context.get("currentUser");
    const { file, form } = await multipart(context);
    const domain = importExportDomainSchema.parse(form.get("domain"));
    const policy = duplicatePolicySchema.parse(
      form.get("duplicate_policy") ?? "reject",
    );
    let mapping: Record<string, string> = {};
    try {
      const mappingJson = String(form.get("mapping") ?? "{}");
      if (mappingJson.length > 16 * 1024)
        throw new ImportRequestError("Mapping import terlalu besar.", 413);
      mapping = importMappingSchema.parse(JSON.parse(mappingJson));
    } catch (error) {
      if (error instanceof ImportRequestError) throw error;
      throw new ImportRequestError(
        "Mapping wajib berupa object JSON yang valid.",
      );
    }
    const parsed = await parseAndValidateImport(file, domain, mapping);
    if (parsed.errors.length)
      return context.json(
        {
          error: "Unprocessable Entity",
          message: "File memiliki baris tidak valid.",
          total_rows: parsed.totalRows,
          issues: parsed.errors.slice(0, 100),
        },
        422,
      );
    const existing = await context.env.DB.prepare(
      `SELECT * FROM import_jobs WHERE actor_user_id = ?1 AND idempotency_key = ?2 LIMIT 1`,
    )
      .bind(actor.id, key)
      .first<ImportJobRow>();
    if (existing) {
      if (
        existing.file_digest !== parsed.digest ||
        existing.domain !== domain ||
        existing.mapping_json !== JSON.stringify(parsed.mapping) ||
        existing.duplicate_policy !== policy
      )
        throw new ImportRequestError(
          "X-Rangkumin-Import sudah digunakan dengan payload berbeda.",
          409,
        );
      context.header("Idempotency-Replayed", "true");
      return context.json({
        job_id: existing.id,
        domain,
        status: existing.status,
        total_rows: existing.total_rows,
        accepted_rows: existing.accepted_rows,
        duplicate_rows: existing.duplicate_rows,
      });
    }
    const plan = await planImport(
      context.env.DB,
      actor.id,
      domain,
      parsed.rows,
      policy,
    );
    const planDigest = await importPlanDigest(plan.acceptedRows);
    const jobId = crypto.randomUUID();
    try {
      await context.env.DB.prepare(
        `INSERT INTO import_jobs (id, actor_user_id, idempotency_key, domain, file_digest, mapping_json, plan_digest, duplicate_policy, total_rows, accepted_rows, duplicate_rows) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      )
        .bind(
          jobId,
          actor.id,
          key,
          domain,
          parsed.digest,
          JSON.stringify(parsed.mapping),
          planDigest,
          policy,
          parsed.totalRows,
          plan.acceptedRows.length,
          plan.duplicateRows,
        )
        .run();
    } catch (error) {
      const raced = await context.env.DB.prepare(
        `SELECT * FROM import_jobs WHERE actor_user_id = ?1 AND idempotency_key = ?2 LIMIT 1`,
      )
        .bind(actor.id, key)
        .first<ImportJobRow>();
      if (
        !raced ||
        raced.file_digest !== parsed.digest ||
        raced.domain !== domain ||
        raced.mapping_json !== JSON.stringify(parsed.mapping) ||
        raced.plan_digest !== planDigest ||
        raced.duplicate_policy !== policy
      ) {
        if (!raced) throw error;
        throw new ImportRequestError(
          "X-Rangkumin-Import sudah digunakan dengan payload berbeda.",
          409,
        );
      }
      context.header("Idempotency-Replayed", "true");
      return context.json({
        job_id: raced.id,
        domain,
        status: raced.status,
        total_rows: raced.total_rows,
        accepted_rows: raced.accepted_rows,
        duplicate_rows: raced.duplicate_rows,
      });
    }
    return context.json(
      {
        job_id: jobId,
        domain,
        status: "previewed",
        total_rows: parsed.totalRows,
        accepted_rows: plan.acceptedRows.length,
        duplicate_rows: plan.duplicateRows,
      },
      201,
    );
  } catch (error) {
    return responseError(context, error);
  }
});

importExportRoutes.post("/import/:jobId/commit", async (context) => {
  try {
    assertSameOrigin(context.req.url, context.req.header("Origin"));
    const key = requestKey(context.req.header("X-Rangkumin-Import"));
    const actor = context.get("currentUser");
    const job = await context.env.DB.prepare(
      `SELECT * FROM import_jobs WHERE id = ?1 AND actor_user_id = ?2 LIMIT 1`,
    )
      .bind(context.req.param("jobId"), actor.id)
      .first<ImportJobRow>();
    if (!job) throw new ImportRequestError("Job import tidak ditemukan.", 409);
    if (job.idempotency_key !== key)
      throw new ImportRequestError(
        "X-Rangkumin-Import tidak cocok dengan job.",
        409,
      );
    const { file } = await multipart(context);
    const mapping = importMappingSchema.parse(JSON.parse(job.mapping_json));
    const parsed = await parseAndValidateImport(file, job.domain, mapping);
    if (parsed.digest !== job.file_digest)
      throw new ImportRequestError(
        "File commit berbeda dari file preview.",
        409,
      );
    if (parsed.errors.length)
      throw new ImportRequestError("File commit tidak lagi valid.", 409);
    if (job.status === "committed") {
      context.header("Idempotency-Replayed", "true");
      return context.json({
        job_id: job.id,
        status: "committed",
        imported_rows: job.accepted_rows,
        duplicate_rows: job.duplicate_rows,
      });
    }
    const plan = await planImport(
      context.env.DB,
      actor.id,
      job.domain,
      parsed.rows,
      job.duplicate_policy,
    );
    if (
      (await importPlanDigest(plan.acceptedRows)) !== job.plan_digest ||
      plan.acceptedRows.length !== job.accepted_rows ||
      plan.duplicateRows !== job.duplicate_rows
    )
      throw new ImportRequestError(
        "Data berubah setelah preview; buat preview baru.",
        409,
      );
    for (const row of plan.acceptedRows)
      row._id = `import-${job.id}-${row._row_number}`;
    try {
      await commitImport(
        context.env.DB,
        actor.id,
        job.id,
        job.domain,
        plan.acceptedRows,
      );
    } catch (error) {
      const raced = await context.env.DB.prepare(
        `SELECT status FROM import_jobs WHERE id = ?1 AND actor_user_id = ?2`,
      )
        .bind(job.id, actor.id)
        .first<{ status: string }>();
      if (raced?.status !== "committed") throw error;
      context.header("Idempotency-Replayed", "true");
    }
    return context.json({
      job_id: job.id,
      status: "committed",
      imported_rows: plan.acceptedRows.length,
      duplicate_rows: plan.duplicateRows,
    });
  } catch (error) {
    return responseError(context, error);
  }
});
