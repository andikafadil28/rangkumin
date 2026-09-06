import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const configPath = new URL(
  "../config/web-push.production.local.json",
  import.meta.url,
);

function fail(message) {
  console.error(`Setup Web Push dihentikan: ${message}`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch {
  fail(
    "config/web-push.production.local.json tidak valid atau tidak tersedia.",
  );
}

const subject = config.WEB_PUSH_VAPID_SUBJECT?.trim();
const publicKey = config.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
const privateKey = config.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject ?? "")) {
  fail("WEB_PUSH_VAPID_SUBJECT wajib berupa URI mailto yang valid.");
}
if (!/^[A-Za-z0-9_-]{87,88}$/.test(publicKey ?? "")) {
  fail("WEB_PUSH_VAPID_PUBLIC_KEY tidak memiliki format P-256 yang valid.");
}
if (!/^[A-Za-z0-9_-]{43,44}$/.test(privateKey ?? "")) {
  fail("WEB_PUSH_VAPID_PRIVATE_KEY tidak memiliki format P-256 yang valid.");
}

if (!process.argv.includes("--apply")) {
  console.info(
    "Konfigurasi valid. Jalankan kembali dengan --apply untuk memuat secret Web Push ke production.",
  );
  process.exit(0);
}

const wranglerPath = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
for (const [key, value] of [
  ["WEB_PUSH_VAPID_SUBJECT", subject],
  ["WEB_PUSH_VAPID_PUBLIC_KEY", publicKey],
  ["WEB_PUSH_VAPID_PRIVATE_KEY", privateKey],
]) {
  const result = spawnSync(
    process.execPath,
    [wranglerPath, "secret", "put", key, "--env", "production"],
    { stdio: ["pipe", "inherit", "inherit"], input: value },
  );
  if (result.error || result.status !== 0) {
    fail(`Wrangler gagal menyimpan ${key} ke production.`);
  }
}

console.info("Tiga secret Web Push berhasil dipasang tanpa mencetak nilainya.");
