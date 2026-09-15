# SUMMARY

> Konteks dan TODO lengkap ada di `AGENTS.md`. Jaga file ini sebagai snapshot tipis agar context tidak boros.

# PROJECT

**Rangkumin** adalah aplikasi keuangan pasangan berbasis web/PWA. Core open-source (MIT), layanan setup/support komersial terpisah, berjalan serverless di Cloudflare Workers + Static Assets + D1.

- Production: `https://rangkumin.dikadevit.my.id`.
- Demo publik: `https://demo.rangkumin.dikadevit.my.id`.
- Repository: `https://github.com/andikafadil28/rangkumin`.
- Release terbaru: `v1.0.0` (`https://github.com/andikafadil28/rangkumin/releases/tag/v1.0.0`).
- Author: Andika Fadil (`@andikafadil28`).
- Donasi: `https://buymeacoffee.com/dikadev`.

# CURRENT

**Phase 1–9, 11, dan 12 selesai; Phase 10 Google Sheets ditunda.** Mode warna otomatis/terang/gelap dan filter transaksi lanjutan sudah selesai, terverifikasi, dan di-deploy ke production. GitHub Release terbaru tetap `v1.0.0` pada commit `fe79904`. Demo publik frontend-only tetap aktif sebagai Static Assets terpisah tanpa binding backend.

Snapshot lokal terbaru: **111 Worker test + 62 frontend test = 173**; typecheck, lint file perubahan, format, build, dan query D1 lokal hijau. Production version `5c47a6ce-9c1e-4e7b-bba1-7d98a9543583`; health 200 dan origin tetap diproteksi Access. Demo production tetap version `20bd2b77-1bdc-4770-a8df-ee9ef354f256`.

Dokumentasi mencakup README bilingual, setup guide teknis Indonesia/English, dan panduan instalasi pemula step-by-step Indonesia/English; masing-masing panduan tersedia sebagai PDF terpisah.

Fitur yang sudah ada di production:

- **Scan Struk** `POST /api/receipt-scans` (multipart; MIME/magic/size/origin divalidasi) memakai Workers AI `@cf/meta/llama-3.2-11b-vision-instruct`. Foto di-resize di browser (`receiptImage.ts`, max 1800px, JPEG ≤2 MiB, EXIF stripped), tidak disimpan. Hasil hanya **draft terkonfirmasi**. Parser menerima wrapper `draft`/`result`/`receipt`, direct draft, alias field umum, amount string, confidence persen, dan satu retry khusus respons malformed.
- **Web Push** opt-in per perangkat, VAPID RFC 8292 (`@block65/webcrypto-web-push`), max 10 device/user, outbox delivery (`web_push_deliveries`) dengan lease/retry/cleanup 404-410. Secrets production `WEB_PUSH_VAPID_*` terpasang.
- **Notifikasi transaksi**: saat income/expense dibuat, `notifyTransactionCreated` membuat notifikasi `kind='transaction'` untuk pasangan ("X mencatat pengeluaran / Rp50.000 — deskripsi", `dedupe_key transaction:{id}:{partnerId}`). Fan-out mencakup `kind IN ('reminder','budget_threshold','transaction')`; route POST `/api/transactions` memicu delivery langsung via `executionCtx.waitUntil`.
- **Detail riwayat transaksi**: tekan area utama row untuk dialog read-only berisi jenis, nominal, tanggal, pemilik, kategori, catatan lengkap, dan status Trash. Mendukung transaksi pasangan/mutasi tabungan, hide balance, Escape, dan bottom sheet mobile; tombol `•••` tetap khusus edit/hapus.
- **Kartu saldo dashboard**: judul memakai nama akun masing-masing dari API summary dan avatar memakai inisial nama, dengan label ownership tetap terlihat.
- **Web Push aksi** untuk reminder: Sudah Dibayar, Ingatkan Lagi, Catat sebagai Pengeluaran; deep link terkunci `/`.
- **Import/Export (Phase 11)**: export CSV per domain + Excel keseluruhan; import CSV/Excel ber-job (preview/mapping/validasi/duplicate detection/atomic) via `0006_import_jobs.sql`.
- **Dashboard & PWA**: ringkasan dua user + gabungan, grafik, snapshot last-known + offline outbox (idempotency key, `X-Rangkumin-Actor-Id`), view mode Bersama/Saya, tema Bersama/Tenang/Minimal.
- **Demo publik**: adapter in-memory dengan data dummy dan reset saat reload; Scan Struk, Web Push, Import/Export, service worker, serta IndexedDB dinonaktifkan. Build/deploy memakai `vite --mode demo` dan `wrangler.demo.jsonc` tanpa D1/AI/secret/cron.
- **Tabungan/anggaran/pengingat**: pos pribadi/bersama + transfer atomik; budget bulanan + custom threshold; reminder sekali/interval/harian/mingguan/bulanan dengan snooze & complete.
- Auth: Cloudflare Access (JWT diverifikasi) untuk dua pengguna; semua mutation guarded ownership.

Fitur terbaru di production:

- **Mode warna**: pilihan System/Terang/Gelap terpisah dari tema Bersama/Tenang/Minimal, bootstrap anti-flash, listener `prefers-color-scheme`, dan palette dark per tema.
- **Filter transaksi lanjutan**: pencarian catatan, rentang tanggal dan nominal, sorting tanggal/nominal, reset filter, validasi client/server, dukungan Trash serta demo. Query search memakai bind parameter dan escaping wildcard LIKE.

Smoke production terakhir: health 200 dan protected origin → 302 Access. Belum di-smoke-test: mode warna/filter baru secara visual di perangkat nyata, Web Push perangkat nyata, user kedua, installability/offline reload, E2E frontend, audit accessibility mendalam.

# DECISIONS

- D1 = source of truth; Google Sheets hanya kandidat future update opsional tanpa timeline.
- Login dua pengguna via Cloudflare Access; production hanya percaya JWT Access terverifikasi.
- **Telegram tidak aktif**: kanal aktif Dashboard + Web Push; channel `notify_telegram` dan migration history dipertahankan sebagai kompatibilitas, sedangkan integrasi baru hanya roadmap opsional.
- Migration `0008_disable_telegram_channel.sql` menormalkan preference Telegram historis ke Web Push dan mencegah notification dead record; sudah diterapkan lokal, remote development, dan production.
- Scan Struk hasilnya draft (konfirmasi manual); foto tidak disimpan di storage mana pun; pricing/quota Workers AI wajib dicek dari dokumentasi resmi terbaru.
- Web Push delivery terpisah dari koneksi klien; fan-out reminder/budget memakai `Promise.allSettled` agar tidak memblok schedule.
- PWA: offline snapshot + outbox untuk create transaksi; edit/hapus/Trash/tabungan/rencana online-only.
- Default currency IDR (integer), timezone Asia/Jakarta; Trash purged otomatis 30 hari.
- Budget dan reminder menormalisasi `notify_web=1` (migration `0007`).

# SECURITY

Jangan commit credential, token, private key, spreadsheet ID production, email/user ID pribadi, atau data transaksi nyata. Seluruh secret production via Cloudflare Secrets (`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `WEB_PUSH_VAPID_*`); config lokal di `config/*.local.json` di-ignore Git. Foto struk tidak pernah disimpan. Service Worker tidak menyimpan credential.

# BEHAVIOR

- Gunakan Bahasa Indonesia yang santai, sopan, teknis, dan to the point.
- Pahami codebase, cari root cause, dan ikuti konvensi sebelum mengubah kode.
- Fokus pada TODO aktif dan jangan memperluas scope tanpa persetujuan.
- Verifikasi lint, typecheck, test, build, dan security sebelum klaim selesai.
- Commit, push, deploy, dan operasi destruktif memerlukan permintaan eksplisit.
