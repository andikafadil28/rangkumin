import { Hono } from "hono";
import { purgeExpiredTransactions } from "./services/trash";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.get("/api/health", (context) => {
  return context.json({
    status: "ok",
    service: "rangkumin",
    environment: context.env.APP_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.notFound((context) => {
  return context.json(
    {
      error: "Not Found",
      message: "Endpoint API tidak ditemukan.",
    },
    404,
  );
});

app.onError((error, context) => {
  console.error("Unhandled worker error", error);

  return context.json(
    {
      error: "Internal Server Error",
      message: "Terjadi kesalahan pada layanan Rangkumin.",
    },
    500,
  );
});

export default {
  fetch: app.fetch,
  scheduled(_controller, environment, executionContext) {
    executionContext.waitUntil(
      purgeExpiredTransactions(environment.DB).then((deletedCount) => {
        console.info("Scheduled trash purge completed", { deletedCount });
      }),
    );
  },
} satisfies ExportedHandler<Cloudflare.Env>;
