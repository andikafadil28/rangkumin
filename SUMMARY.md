# SUMMARY

> Konteks dan TODO lengkap ada di `AGENTS.md`. Jaga file ini sebagai snapshot tipis agar context tidak boros.

# PROJECT

**Rangkumin** adalah aplikasi keuangan pasangan berbasis web, PWA, dan Telegram. Project akan dirilis open-source dengan MIT License.

- Production: `https://rangkumin.dikadevit.my.id`.
- Repository: `https://github.com/andikafadil28/rangkumin`.
- Author: Andika Fadil (`@andikafadil28`).
- Donasi: `https://buymeacoffee.com/dikadev`.

# CURRENT

**Phase 1 - Project Foundation dan Phase 2 - D1 Database selesai serta terverifikasi pada 5 September 2026.**

Yang sudah tersedia:

- Cloudflare Worker + Static Assets dengan TypeScript, Hono, dan Zod.
- Static shell responsive serta endpoint `/api/health`.
- ESLint, Prettier, generated Worker types, dan Vitest Cloudflare runtime.
- Script dev, lint, format, typecheck, test, types, dan dry-run build.
- D1 development dan production dengan binding environment terpisah.
- Migration awal berisi 11 tabel domain, foreign key, constraint, dan 19 custom index.
- Seeder idempotent berisi dua user dummy serta 13 kategori untuk local/remote development; production tidak memiliki data dummy.
- Scheduled Trash purge berjalan harian sekitar pukul 00:15 WIB.
- Strategi migration dan D1 Time Travel terdokumentasi di `docs/database-operations.md`.
- Verifikasi final: empty-database rehearsal, constraint check, remote migration, lint, format, typecheck, 4 test, development/production build, dan dependency audit lulus.

Fokus berikutnya: **Phase 3 - Authentication dan Authorization**. Setup Cloudflare Access dilakukan satu langkah per giliran, dilanjutkan identity middleware, mapping email ke user D1, ownership guard, route protection, dan security tests.

# DECISIONS

- Cloudflare D1 adalah source of truth; Google Sheets hanya laporan/mirror.
- Login dua pengguna memakai Cloudflare Access.
- Kedua pengguna bisa melihat seluruh data, tetapi hanya memodifikasi transaksi miliknya.
- Mendukung income, expense, tabungan pribadi/bersama, anggaran, pengingat, import/export, dan Telegram Bot.
- Tabungan memiliki beberapa pos, target opsional, setoran, penarikan, dan transfer.
- Anggaran berulang bulanan, reset tiap bulan, dengan custom warning threshold.
- PWA dapat melihat snapshot terakhir dan membuat transaksi saat offline, lalu sync otomatis.
- UI minimalis untuk pasangan, responsive, serta mendukung light/dark mode.
- Default currency IDR dan timezone Asia/Jakarta.
- Transaksi yang dihapus masuk Trash selama 30 hari.
- Telegram memakai webhook dengan secret, allowlist, dan idempotency.

# SECURITY

Jangan commit credential, token, private key, spreadsheet ID production, email/user ID pribadi, atau data transaksi nyata. Seluruh secret production wajib disimpan melalui Cloudflare Secrets.

# BEHAVIOR

- Gunakan Bahasa Indonesia yang santai, sopan, teknis, dan to the point.
- Pahami codebase, cari root cause, dan ikuti konvensi sebelum mengubah kode.
- Fokus pada TODO aktif dan jangan memperluas scope tanpa persetujuan.
- Verifikasi lint, typecheck, test, build, dan security sebelum klaim selesai.
- Commit, push, deploy, dan operasi destruktif memerlukan permintaan eksplisit.
