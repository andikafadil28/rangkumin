# SUMMARY

> Konteks dan TODO lengkap ada di `AGENTS.md`. Jaga file ini sebagai snapshot tipis agar context tidak boros.

# PROJECT

**Rangkumin** adalah aplikasi keuangan pasangan berbasis web/PWA. Core open-source (MIT), layanan setup/support komersial terpisah, berjalan serverless di Cloudflare Workers + Static Assets + D1.

- Production: `https://rangkumin.dikadevit.my.id`.
- Demo publik: `https://demo.rangkumin.dikadevit.my.id`.
- Repository: `https://github.com/andikafadil28/rangkumin`.
- Release terbaru: `v1.0.1` (`https://github.com/andikafadil28/rangkumin/releases/tag/v1.0.1`).
- Author: Andika Fadil (`@andikafadil28`).
- Donasi: `https://buymeacoffee.com/dikadev`.

# CURRENT

**Phase 1–9, 11, dan 12 selesai; Phase 10 Google Sheets ditunda.** Mode warna otomatis/terang/gelap, filter transaksi lanjutan, Dashboard Insights, dan **fitur Dompet (wallets)** sudah di-deploy ke production, remote development, dan demo (migration `0010_add_wallets.sql`, backend `src/routes|services|schemas/wallet`, `WalletsPage.tsx`, selector dompet di form transaksi, integrasi tabungan/ownership, adapter demo). **Telegram tetap non-aktif**: hanya kandidat add-on opsional (infrastruktur historis dipertahankan), tanpa implementasi baru. GitHub Release terbaru `v1.0.1` pada commit `e50494d`. Demo publik frontend-only tetap aktif sebagai Static Assets terpisah tanpa binding backend.

Sesi aktif: fitur saldo virtual **Tanpa dompet** dan allocation ledger dua arah selesai serta sudah di-deploy. `0012_add_wallet_balance_allocations.sql` menyimpan allocation immutable; saldo tersedia tetap canonical dari transaksi dan Tanpa dompet dihitung sebagai total tersedia dikurangi seluruh saldo wallet. UI menambah kartu virtual, dialog alokasi/reversal, histori, breakdown dashboard, selector wallet tabungan, dan grid wallet horizontal desktop. Commit fitur `906d66e`; migration diterapkan lokal/development/production; smoke production dan demo hijau.

Snapshot lokal terbaru: **142 Worker test + 71 frontend test = 213**; typecheck, lint file perubahan, format, build, smoke API allocation, dan query D1 lokal hijau. Production version `19794943-e7c4-4bf9-b0b6-c2e9aa9a578d`; development version `cba8d366-cd5e-4d31-9318-0d44d9515fa4`; demo version `2003552d-921d-41a3-9208-da4f4fa41c0e`. Production health 200 dan origin tetap diproteksi Access.

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
- **Dashboard Insights**: `/api/summary` menambahkan `comparison` (total bulan sebelumnya via satu query agregat `summarizeTransactionTotals` + `getPreviousMonthRange`; `null` jika hanya satu sisi tanggal yang dikirim). Panel insight menampilkan headline pengeluaran vs bulan lalu, kartu Pengeluaran/Pemasukan/Kategori terbesar, menghormati hide balance dan mode Bersama/Saya. Kategori terbesar hanya menghitung `expense` (koreksi dari sebelumnya yang ikut memasukkan income).
- **Wallet/Dompet**: kelola dompet cash/bank/e_wallet/other dengan saldo awal, grup, warna, dompet utama, dan arsip; transfer antar dompet (`wallet_transfer`) atomik; detail mutasi dengan filter status rekonsiliasi; selector dompet di form transaksi (opsional). Sudah di-deploy ke production/demo; belum di-smoke-test perangkat nyata.
- **Tanpa dompet**: bucket virtual per user; allocation dua arah tidak mengubah total saldo, saldo awal wallet baru menggunakan allocation, pasangan dapat melihat history read-only, dan setor/tarik tabungan dapat memilih wallet atau Tanpa dompet. Sudah di-deploy ke production/development/demo.

Smoke production terakhir: health 200 dan protected origin → 302 Access. Belum di-smoke-test: Dashboard Insights, mode warna/filter, dan Dompet secara visual di perangkat nyata, Web Push perangkat nyata, user kedua, installability/offline reload, E2E frontend, audit accessibility mendalam.

# DECISIONS

- D1 = source of truth; Google Sheets hanya kandidat future update opsional tanpa timeline.
- Login dua pengguna via Cloudflare Access; production hanya percaya JWT Access terverifikasi.
- **Telegram tetap non-aktif.** Runtime bot (routes/services/test/scripts) dihapus; migration history, kolom, dan channel `notify_telegram` dipertahankan sebagai kompatibilitas historis. Telegram hanya kandidat add-on opsional di future update; kanal aktif saat ini Dashboard + Web Push.
- Migration `0008_disable_telegram_channel.sql`, `0010_add_wallets.sql`, dan `0011_fix_wallet_color_check.sql` sudah diterapkan lokal, remote development, dan production. `0011` memperbaiki CHECK `color` di `wallets` (pattern GLOB `#[0-9A-Fa-f]…` x6 ditolak D1 sebagai "LIKE or GLOB pattern too complex" → create dompet berwarna selalu 500) dengan rebuild tabel dan predikat setara `length(color)=7 AND substr(color,1,1)='#' AND substr(color,2,6) NOT GLOB '*[^0-9A-Fa-f]*'`.
- Migration `0012_add_wallet_balance_allocations.sql` sudah diterapkan lokal, remote development, dan production.
- Scan Struk hasilnya draft (konfirmasi manual); foto tidak disimpan di storage mana pun; pricing/quota Workers AI wajib dicek dari dokumentasi resmi terbaru.
- Web Push delivery terpisah dari koneksi klien; fan-out reminder/budget memakai `Promise.allSettled` agar tidak memblok schedule.
- PWA: offline snapshot + outbox untuk create transaksi; edit/hapus/Trash/tabungan/rencana online-only.
- **Dompet (wallets)**: saldo per dompet = `initial_balance` + income/withdrawal/transfer-in − expense/deposit/transfer-out; transfer antar dompet atomik dengan cek saldo; mutasi tabungan dan transfer dompet immutable; status rekonsiliasi `unreconciled`/`reconciled`/`excluded`. Sudah di-deploy; belum di-smoke-test perangkat nyata.
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
