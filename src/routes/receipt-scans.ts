import { Hono, type Context } from "hono";
import { listCategories } from "../services/categories";
import {
  ReceiptScanError,
  scanReceipt,
  type ReceiptDraft,
} from "../services/receipt-scan";
import type { AppEnv } from "../types";

export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
export const MAX_RECEIPT_REQUEST_BYTES = MAX_RECEIPT_BYTES + 64 * 1024;

type ReceiptEnv = {
  Bindings: AppEnv["Bindings"] & { AI: Ai };
  Variables: AppEnv["Variables"];
};

type ReceiptScanDependencies = {
  categories: typeof listCategories;
  scan: (
    ai: Ai,
    image: Uint8Array,
    categories: Awaited<ReturnType<typeof listCategories>>,
  ) => Promise<ReceiptDraft>;
};

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function assertSameOrigin(requestUrl: string, origin?: string) {
  if (!origin) return;
  try {
    if (new URL(origin).origin === new URL(requestUrl).origin) return;
  } catch {
    // Invalid and opaque origins are rejected without exposing parser details.
  }
  throw new ReceiptScanError("Origin request tidak diizinkan.", 400);
}

function hasMatchingSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png")
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export async function readReceiptImage(context: Context<ReceiptEnv>) {
  const contentType = context.req.header("Content-Type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new ReceiptScanError("Content-Type harus multipart/form-data.", 400);
  }

  const rawLength = context.req.header("Content-Length");
  if (rawLength !== undefined) {
    const contentLength = Number(rawLength);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0)
      throw new ReceiptScanError("Content-Length tidak valid.", 400);
    if (contentLength > MAX_RECEIPT_REQUEST_BYTES)
      throw new ReceiptScanError("File struk terlalu besar.", 413);
  }

  let form: FormData;
  try {
    form = await context.req.raw.formData();
  } catch {
    throw new ReceiptScanError("Body multipart tidak valid.", 400);
  }

  const entries = [...form.entries()];
  const files = entries.filter(
    (entry): entry is [string, File] => entry[1] instanceof File,
  );
  if (files.length !== 1 || files[0]![0] !== "file") {
    throw new ReceiptScanError("Tepat satu field file wajib diisi.", 400);
  }

  const file = files[0]![1];
  const mime = file.type.toLowerCase();
  if (!supportedTypes.has(mime)) {
    throw new ReceiptScanError(
      "Hanya gambar JPEG, PNG, atau WebP yang didukung.",
      400,
    );
  }
  if (file.size === 0) throw new ReceiptScanError("File struk kosong.", 400);
  if (file.size > MAX_RECEIPT_BYTES)
    throw new ReceiptScanError("File struk terlalu besar.", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasMatchingSignature(bytes, mime)) {
    throw new ReceiptScanError(
      "Isi file tidak sesuai dengan tipe gambar.",
      422,
    );
  }
  return bytes;
}

function errorResponse(context: Context<ReceiptEnv>, error: unknown) {
  if (!(error instanceof ReceiptScanError)) throw error;
  const names = {
    400: "Bad Request",
    413: "Payload Too Large",
    422: "Unprocessable Entity",
    502: "Bad Gateway",
  } as const;
  return context.json(
    { error: names[error.status], message: error.message },
    error.status,
  );
}

export function createReceiptScanRoutes(
  dependencies: ReceiptScanDependencies = {
    categories: listCategories,
    scan: scanReceipt,
  },
) {
  const routes = new Hono<ReceiptEnv>();
  routes.post("/", async (context) => {
    try {
      const currentUser = context.get("currentUser");
      if (!currentUser)
        return context.json(
          { error: "Unauthorized", message: "Autentikasi diperlukan." },
          401,
        );

      assertSameOrigin(context.req.url, context.req.header("Origin"));
      const image = await readReceiptImage(context);
      const categories = await dependencies.categories(context.env.DB, {
        userId: currentUser.id,
        type: "expense",
      });
      const draft = await dependencies.scan(context.env.AI, image, categories);
      return context.json({ draft });
    } catch (error) {
      return errorResponse(context, error);
    }
  });
  return routes;
}

export const receiptScanRoutes = createReceiptScanRoutes();
