# SUMMARY

> Konteks dan TODO lengkap ada di `AGENTS.md`. Jaga file ini sebagai snapshot tipis agar context tidak boros.

# PROJECT

**Rangkumin** adalah aplikasi keuangan pasangan berbasis web, PWA, dan Telegram. Project akan dirilis open-source dengan MIT License.

- Production: `https://rangkumin.dikadevit.my.id`.
- Repository: `https://github.com/andikafadil28/rangkumin`.
- Author: Andika Fadil (`@andikafadil28`).
- Donasi: `https://buymeacoffee.com/dikadev`.

# CURRENT

**Phase 1 sampai Phase 8 implementasi selesai dan terverifikasi lokal (64 Worker test + 15 frontend test, lint/typecheck/format/build hijau). Production menjalankan versi logout dari Phase 7 (Worker version `255a9141-0f60-4bfb-bd09-0d74af3508f2`) setelah Google login tanpa OTP diaktifkan; Phase 8 PWA/offline belum di-deploy.**

Yang sudah tersedia di Phase 8 (working tree):

- Transport API baru `requestJson` (`credentials:"same-origin"`, `cache:"no-store"`, `redirect:"manual"`) dengan error class `NetworkError`/`AuthRequiredError`/`InvalidResponseError`/`ApiError(code)`; deteksi sesi Cloudflare Access (401/`opaqueredirect`/path `/cdn-cgi/access/`). Backend mematikan caching di `/api` & `/api/*` (middleware + `wrangler.jsonc` `run_worker_first`).
- IndexedDB `rangkumin-offline` (idb v8): snapshot per user (dashboard + daftar per halaman) dan transaction outbox dengan idempotency key. Snapshot hanya fallback saat `NetworkError` (stale read-only + info waktu sinkron terakhir); penulisan IndexedDB best-effort saat online.
- Create transaksi selalu outbox-first (offline & online) dengan `X-Rangkumin-Actor-Id`; server validasi actor → 409 `Actor Mismatch`; outbox milik akun lain tidak dikuras. Edit/hapus/Trash/tabungan/rencana online-only; banner sinkron + panel outbox di halaman Transaksi.
- Service worker vite-plugin-pwa injectManifest hanya men-cache app shell (bypass `/api` & `/cdn-cgi/access`); manifest PWA dan ikon PNG digenerate dari SVG via `scripts/generate-pwa-icons.mjs` (sharp `^0.35.2`); `registerSW({ immediate: true })` di `main.tsx`.
- Bootstrap tema dipindah ke `frontend/public/theme-bootstrap.js` (tanpa inline script); security headers/CSP via `_headers` (`script-src 'self'`, style inline untuk progress/chart, `no-referrer`, `nosniff`, `frame-ancestors 'none'`, Permissions-Policy minimal).
- Login Google tanpa OTP: IdP Google (project `Rangkumin Access`, PKCE ON) sebagai satu-satunya login method, Instant Auth aktif, policy Allow → Emails kedua user. Tombol logout di Pengaturan (`clearOfflineDataSafely()` lalu `/cdn-cgi/access/logout`).
- Test: Worker 64 (termasuk `no-store` dan actor mismatch) + frontend 15 (api, db, outbox, pwaRoutes, snapshots) memakai fake-indexeddb; typecheck/lint/format/build hijau; `npm audit` 0 vulnerability.

Fokus berikutnya: **smoke test dua pengguna di production** (User Dua pending), deploy Phase 8, lalu Phase 9 - Telegram.

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
- Budget personal/shared per kategori, periode bulanan tanpa carry-over, custom threshold, serta channel dashboard/Telegram tersedia melalui protected API.
- Reminder sekali, interval hari, mingguan, dan bulanan mendukung recipient terpilih, creator-only metadata mutation, complete, snooze, serta catat expense atomik dan idempotent.
- Scheduled processing membuat occurrence dan notification secara deduplicated; dashboard inbox dan mark-as-read tersedia, sedangkan delivery Telegram menunggu Phase 9.
- Verifikasi final: lint, format, typecheck, 62 test, fresh migration serta collision rehearsal, dan development/production dry-run build lulus.
- Migration Phase 6 sudah diterapkan ke D1 development dan production; Worker production version `9a04866c-5325-47bd-9b9a-4fe346492588` aktif dengan dua scheduled trigger.
- Smoke test publik lulus: health `200`, route aplikasi/protected API dijaga Cloudflare Access, dan tabel Phase 6 tersedia di D1 production.

Sebelum Phase 8, smoke test publik lulus: health `200`, route aplikasi/protected API dijaga Cloudflare Access, dan tabel tersedia di D1 production; smoke test protected user pertama lulus, ownership lintas user menunggu session user kedua.

Yang diselesaikan di Phase 7:

- Frontend React 19 + Vite, build ke `public/` dan disajikan Static Assets tanpa server terpisah.
- Dashboard ringkasan dua pengguna + gabungan dengan grafik income vs expense, distribusi kategori, dan perkembangan tabungan (tanpa library chart).
- TransactionsPage dengan filter, pagination, edit, hapus, restore, dan akses Trash; defensive empty/loading/error/confirmation state.
- SavingsPage mendukung beberapa pos (setoran/penarikan/transfer) dan PlansPage untuk budget & reminder dengan CRUD + status aktif; validasi dan confirmation di semua form dialog.
- Tiga tema: Bersama (default), Tenang, Minimal via token CSS; pilihan disimpan di `localStorage` `rangkumin-theme`; privasi nominal (hide balances) tersimpan lokal. Indonesian dev proxy di `vite.config.ts` menyuntikkan `Cf-Access-Authenticated-User-Email: user1@example.invalid` ke `/api`; middleware identity & kontrak 401 tetap terjaga, production tetap JWT Access.
- Realtime refresh: `useAutoRefresh` polling 10 detik (jeda saat tab hidden) + refresh saat focus/visibilitychange + silent refresh; terpasang di dashboard, riwayat, tabungan, dan rencana. Data lama tetap tampil saat refresh menengah (bukan skeleton kosong).
- Nama tampilan: production `user-1`=Andika / `user-2`=User Dua di D1; lokal & `seeds/development.sql` memakai Andika/User Dua dengan email dummy. Asal nama bukan dari email (fallback demo `frontend/src/demo.ts` sempat berisi "Ari").
- Bug diperbaiki: `--rose-strong` tidak pernah terdefinisi padahal dipakai tombol danger/progress over; sudah diisi di ketiga tema.
- Bug production diperbaiki: tabel kategori kosong karena default categories sebelumnya hanya ada di development seed. Migration `0004_seed_default_categories.sql` mengisi 4 income, 8 expense, dan 1 saving secara idempotent; sudah diterapkan ke D1 local, remote development, dan production.
- `README.md` ditambahkan; LICENSE, SECURITY.md, CONTRIBUTING.md, dan CI masih menunggu (Phase 12).
- Verifikasi akhir: lint, typecheck, 62 test, build Vite + Wrangler dry-run lulus; repository di-push ke `origin/main` tanpa email asli/secret.

Deploy Phase 7 terverifikasi: tidak ada migration tertunda, gate lulus, `/api/health` merespons 200, serta root dan protected API tanpa sesi merespons 302 ke Cloudflare Access. Setelah login Google tanpa OTP aktif, deploy ulang versi logout (Worker `255a9141-0f60-4bfb-bd09-0d74af3508f2`) tetap lulus health dan arah ke Access.

Residual setelah Phase 8: smoke test dua user di production (User Dua belum), uji installability/offline reload di perangkat nyata, audit accessibility mendalam (focus trap keyboard, kontras) dan frontend E2E test.

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
- Offline mode: snapshot per user di IndexedDB `rangkumin-offline` hanya fallback saat `NetworkError`; create transaksi outbox-first dengan idempotency key + `X-Rangkumin-Actor-Id`; edit/hapus/Trash/tabungan/rencana online-only dan read-only saat stale.
- Transport API selalu `same-origin` + `no-store` + `manual redirect`; sesi Cloudflare Access yang kedaluwarsa dideteksi sebagai `AuthRequiredError`, bukan fallback snapshot.
- Login Google tanpa OTP (IdP Google, PKCE, Instant Auth) satu-satunya login method; logot via `/cdn-cgi/access/logout` setelah membersihkan data offline.
- UI minimalis untuk pasangan dan responsive; tema Bersama/Tenang/Minimal (token CSS) disimpan lokal di `rangkumin-theme`, default Bersama. Light/dark otomatis mengikuti perangkat belum diterapkan (keputusan terbuka).
- Realtime refresh memakai polling 10 detik + refresh saat focus/visibilitychange + silent refresh (data lama tetap tampil saat refresh).
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
