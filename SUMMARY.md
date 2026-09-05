# SUMMARY

> Konteks dan TODO lengkap ada di `AGENTS.md`. Jaga file ini sebagai snapshot tipis agar context tidak boros.

# PROJECT

**Rangkumin** adalah aplikasi keuangan pasangan berbasis web, PWA, dan Telegram. Project akan dirilis open-source dengan MIT License.

- Production: `https://rangkumin.dikadevit.my.id`.
- Repository: `https://github.com/andikafadil28/rangkumin`.
- Author: Andika Fadil (`@andikafadil28`).
- Donasi: `https://buymeacoffee.com/dikadev`.

# CURRENT

**Phase 1 sampai Phase 5 - Savings selesai serta terverifikasi pada 5 September 2026.**

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
- Cloudflare Access dengan allowlist dua email, One-Time PIN, cookies aman, dan akses `workers.dev` production nonaktif.
- Identity middleware memetakan Cloudflare Access ke user D1 via prepared statement; pada production email dibaca dari `Cf-Access-Jwt-Assertion` yang diverifikasi signature/issuer/audience-nya memakai `jose` melawan JWKS team domain. Header email dummy hanya untuk local development.
- Ownership guard siap (404/403) untuk seluruh mutation transaksi.
- User production diprovision via `scripts/provision-production.mjs` tanpa mencetak identitas; secret Access (`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`) terpasang sebagai Cloudflare Secrets.
- Endpoint Telegram webhook mendapat bypass Cloudflare Access khusus path, tetap wajib divalidasi secret + allowlist di backend.
- CRUD income/expense, kategori default/custom, filter + offset pagination, ringkasan individu/gabungan, Trash/restore/purge, optimistic locking, dan idempotency offline tersedia melalui protected API.
- Seluruh mutation memakai ownership guard dan prepared statement; permanent purge hanya menerima transaksi yang sudah berada di Trash.
- Pos tabungan personal/shared, target dan progress, saldo tunai kedua user, deposit, withdrawal, transfer atomik, serta mutation history tersedia melalui protected API.
- Kedua user dapat membaca seluruh saldo; personal goal pasangan read-only, shared goal dapat dimutasi keduanya, dan metadata shared hanya dapat diubah creator.
- Deposit memerlukan saldo tunai actor yang cukup; withdrawal/transfer tidak dapat membuat saldo goal negatif; history savings immutable.
- Verifikasi final: lint, format, typecheck, 50 test, development/production build, dan smoke test mutation D1 lokal lintas dua user lulus.

Fokus berikutnya: **Phase 6 - Budgets dan Reminders**. Mulai dari service layer budget bulanan, threshold notifikasi, recurrence reminder, dan scheduled processing.

# DECISIONS

- Cloudflare D1 adalah source of truth; Google Sheets hanya laporan/mirror.
- Login dua pengguna memakai Cloudflare Access; di production Worker hanya memercayai JWT Access yang terverifikasi, bukan header email.
- Production menggunakan environment terpisah dengan `workers_dev` nonaktif dan custom domain.
- Kedua pengguna bisa melihat seluruh data dan saldo satu sama lain; data personal pasangan bersifat read-only.
- Pos tabungan bersama dapat dimutasi keduanya, tetapi metadata hanya dapat diubah oleh pembuatnya.
- Mendukung income, expense, tabungan pribadi/bersama, anggaran, pengingat, import/export, dan Telegram Bot.
- Tabungan memiliki beberapa pos, target opsional, setoran, penarikan, dan transfer.
- Anggaran berulang bulanan, reset tiap bulan, dengan custom warning threshold.
- PWA dapat melihat snapshot terakhir dan membuat transaksi saat offline, lalu sync otomatis.
- UI minimalis untuk pasangan, responsive, serta mendukung light/dark mode.
- Default currency IDR dan timezone Asia/Jakarta.
- Transaksi yang dihapus masuk Trash selama 30 hari.
- Telegram memakai webhook dengan secret, allowlist, dan idempotency.

# SECURITY

Jangan commit credential, token, private key, spreadsheet ID production, email/user ID pribadi, atau data transaksi nyata. Seluruh secret production wajib disimpan melalui Cloudflare Secrets; nilai `ACCESS_AUD` dan `ACCESS_TEAM_DOMAIN` tidak pernah masuk Git atau konfigurasi publik.

# BEHAVIOR

- Gunakan Bahasa Indonesia yang santai, sopan, teknis, dan to the point.
- Pahami codebase, cari root cause, dan ikuti konvensi sebelum mengubah kode.
- Fokus pada TODO aktif dan jangan memperluas scope tanpa persetujuan.
- Verifikasi lint, typecheck, test, build, dan security sebelum klaim selesai.
- Commit, push, deploy, dan operasi destruktif memerlukan permintaan eksplisit.
