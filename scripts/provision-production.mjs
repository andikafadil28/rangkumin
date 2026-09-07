import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const configPath = new URL(
  "../config/users.production.local.json",
  import.meta.url,
);
const expectedIds = new Set(["user-1", "user-2"]);

function fail(message) {
  console.error(`Provisioning dihentikan: ${message}`);
  process.exit(1);
}

function escapeSql(value) {
  return value.replaceAll("'", "''");
}

function readUsers() {
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    fail("config/users.production.local.json tidak valid atau tidak tersedia.");
  }

  if (!Array.isArray(parsed.users) || parsed.users.length !== 2) {
    fail("konfigurasi harus berisi tepat dua user.");
  }

  const emails = new Set();

  for (const user of parsed.users) {
    if (!expectedIds.has(user.id)) {
      fail("ID user hanya boleh user-1 dan user-2.");
    }

    if (
      typeof user.displayName !== "string" ||
      user.displayName.trim().length < 1 ||
      user.displayName.trim().length > 80
    ) {
      fail("displayName wajib memiliki panjang 1-80 karakter.");
    }

    if (
      typeof user.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
      user.email.toLowerCase().endsWith(".invalid")
    ) {
      fail("ganti seluruh email dummy dengan email Access yang valid.");
    }

    emails.add(user.email.toLowerCase());
  }

  if (emails.size !== 2) {
    fail("kedua user harus menggunakan email yang berbeda.");
  }

  return parsed.users;
}

function buildSql(users) {
  const values = users
    .map(
      (user) =>
        `('${escapeSql(user.id)}', '${escapeSql(user.email.toLowerCase())}', '${escapeSql(user.displayName.trim())}')`,
    )
    .join(", ");

  return `INSERT INTO users (id, email, display_name)
VALUES ${values}
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  display_name = excluded.display_name,
  is_active = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`;
}

const users = readUsers();

if (!process.argv.includes("--apply")) {
  console.info(
    "Konfigurasi valid. Jalankan kembali dengan --apply untuk provisioning D1 production.",
  );
  process.exit(0);
}

const wranglerPath = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "rangkumin-provision-"));
const sqlPath = join(temporaryDirectory, "users.sql");
let result;

try {
  writeFileSync(sqlPath, buildSql(users), { mode: 0o600 });
  result = spawnSync(
    process.execPath,
    [
      wranglerPath,
      "d1",
      "execute",
      "DB",
      "--remote",
      "--env",
      "production",
      "--file",
      sqlPath,
      "--yes",
    ],
    { stdio: "inherit" },
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (result.error || result.status !== 0) {
  fail("Wrangler gagal menyimpan user ke D1 production.");
}

console.info(
  "Dua user production berhasil diprovision tanpa mencetak identitas.",
);
