import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const configPath = new URL(
  "../config/access.production.local.json",
  import.meta.url,
);

function fail(message) {
  console.error(`Setup Access dihentikan: ${message}`);
  process.exit(1);
}

function readConfig() {
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    fail(
      "config/access.production.local.json tidak valid atau tidak tersedia.",
    );
  }

  if (
    typeof parsed.ACCESS_TEAM_DOMAIN !== "string" ||
    typeof parsed.ACCESS_AUD !== "string"
  ) {
    fail("konfigurasi wajib berisi ACCESS_TEAM_DOMAIN dan ACCESS_AUD.");
  }

  const teamDomain = parsed.ACCESS_TEAM_DOMAIN.trim();

  try {
    const url = new URL(teamDomain);

    if (
      url.protocol !== "https:" ||
      !url.hostname.toLowerCase().endsWith(".cloudflareaccess.com") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
  } catch {
    fail(
      "ACCESS_TEAM_DOMAIN harus berupa https://<team>.cloudflareaccess.com tanpa path.",
    );
  }

  const audience = parsed.ACCESS_AUD.trim();

  if (!/^[0-9a-f]{64}$/i.test(audience)) {
    fail("ACCESS_AUD harus berupa 64 karakter heksadesimal.");
  }

  return { teamDomain, audience };
}

const { teamDomain, audience } = readConfig();

if (!process.argv.includes("--apply")) {
  console.info(
    "Konfigurasi valid. Jalankan kembali dengan --apply untuk memuat secret Access ke production.",
  );
  process.exit(0);
}

const wranglerPath = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);

for (const [key, value] of [
  ["ACCESS_AUD", audience],
  ["ACCESS_TEAM_DOMAIN", teamDomain],
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

console.info(
  "Dua secret Cloudflare Access berhasil dipasang tanpa mencetak nilainya.",
);
