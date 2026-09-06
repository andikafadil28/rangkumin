# PROJECT

## Rangkumin

Rangkumin adalah aplikasi keuangan pasangan berbasis web untuk mencatat pemasukan, pengeluaran, saldo, tabungan, anggaran, dan pengingat. Aplikasi akan bersifat open-source dan berjalan secara serverless tanpa hosting berbayar.

Identitas proyek:

- Production: `https://rangkumin.dikadevit.my.id`.
- Repository: `https://github.com/andikafadil28/rangkumin`.
- Author: Andika Fadil (`@andikafadil28`).
- Lisensi: MIT, `Copyright (c) 2026 Andika Fadil`.
- Donasi: `https://buymeacoffee.com/dikadev`.
- Status: Phase 1–11 selesai; Telegram Bot **dibatalkan dan dihapus** digantikan **Scan Struk (Workers AI)** + **Web Push notifikasi**. Terverifikasi lokal: 103 Worker test + 43 frontend test (146), lint/typecheck/format/build hijau, dan sudah di-deploy ke production. Membawa Phase 11 Import/Export, Scan Struk, Web Push, notifikasi transaksi, dan penghapusan runtime Telegram.

# CURRENT

Sesi ini: **hapus runtime Telegram Bot**, implementasi **Scan Struk (Workers AI)**, **Web Push notifikasi**, dan **notifikasi transaksi income/expense**, lalu deploy. Import/Export Phase 11 juga selesai dan ikut di-deploy. Semua terverifikasi (146 test) dan dipakai di production.

Keputusan dan hal penting:

- **Telegram dibatalkan.** Runtime bot (routes/services/test/scripts) dihapus total; migration history, kolom, dan channel `notify_telegram` dipertahankan sebagai kompatibilitas historis. Kanal notifikasi aktif: Dashboard + Web Push. Tidak pernah ada secret Telegram di production.
- **Scan Struk**: `POST /api/receipt-scans` (multipart, Cek MIME/magic/size/origin) memakai Workers AI `@cf/meta/llama-3.2-11b-vision-instruct`. Foto di-resize browser (`receiptImage.ts`, max 1800px, JPEG ≤2 MiB, EXIF ter-strip) dan tidak disimpan ke D1/R2/KV/Cache/IndexedDB. Hasil hanya **draft terkonfirmasi** (tidak auto-submit). Model berbayar unit-based ($0.049/M input, $0.68/M output) — sistem neurons sudah dicabut sesuai docs 2026. Meta license di-accept via request `{"prompt":"agree"}`.
- **Web Push**: opt-in per perangkat (device UUID di localStorage), `PUT/DELETE /api/push/subscriptions/:deviceId` + `GET /api/push/status`, VAPID RFC 8292 via `@block65/webcrypto-web-push` (`^2.0.0`), max 10 device per user, outbox delivery terpisah (`web_push_deliveries`) dengan lease/retry/cleanup 404-410. Scheduled fan-out reminder & budget memakai `Promise.allSettled` agar tidak memblok schedule.
- **Notifikasi transaksi**: `notifyTransactionCreated` (`src/services/transactions.ts`) membuat notifikasi `kind='transaction'` untuk pasangan saat income/expense dibuat (title: "X mencatat pengeluaran", body: "Rp50.000 — deskripsi"), dengan `dedupe_key transaction:{id}:{partnerId}`. Fan-out Web Push mencakup `kind IN ('reminder', 'budget_threshold', 'transaction')` dan route POST `/api/transactions` langsung memicu `deliverWebPushNotifications` via `executionCtx.waitUntil` sehingga push sampai tanpa menunggu schedule 15 menit.
- Service worker: handler `push` + `notificationclick`; deep link dikunci ke `/` karena SPA fallback (`not_found_handling: single-page-application`) belum diaktifkan.
- VAPID secrets production: `WEB_PUSH_VAPID_SUBJECT`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` via `scripts/set-web-push-secrets.mjs` (`npm run webpush:secrets:production`); config `config/web-push.production.local.json` di-ignore Git. `.dev.vars.example` hanya placeholder.
- Migration `0005_telegram_delivery.sql`, `0006_import_jobs.sql`, dan `0007_web_push.sql` sudah diterapkan ke local, remote development, dan production. `0007` menormalkan `notify_web=1` untuk reminder/budget yang sebelumnya `notify_telegram`.
- CSP/`_headers`: `img-src` + `blob:` untuk preview object URL struk; `Permissions-Policy: camera=(self)` untuk input kamera.
- Phase 11 Import/Export: `src/routes/import-export.ts` + `src/services/{import,export}.ts`; export CSV per domain + Excel (papaparse, read-excel-file, write-excel-file, fflate); import CSV/Excel ber-job với preview/mapping/validasi/duplicate detection/atomic (`0006_import_jobs.sql`); UI `DataTransferPage.tsx` + `frontend/src/importExport.ts`.
- Test: 103 Worker + 43 frontend = 146 (termasuk receipt-scan, web-push, receiptImage, webPush, import/export, notifikasi transaksi); lint/typecheck/format/build hijau. Smoke: health 200, endpoint diproteksi Access; Scan Struk sukses di production (preview sempat tidak tampil → fix CSS jadi full-width; respons invalid → schema jadi toleran via `normalizeReceiptDraft` + `.passthrough()`). Web Push belum di-smoke-test perangkat nyata; import/export belum diuji penuh dua arah di production.
- Residual: smoke test dua pengguna (User Dua pending), smoke Web Push di perangkat nyata, uji installability/offline reload, audit accessibility mendalam, frontend E2E test.

Jangan memasukkan email atau identifier pribadi ke Git.

# ARCHITECTURE

- Frontend dan API memakai Cloudflare Workers + Static Assets pada origin yang sama.
- Backend memakai TypeScript, Hono, dan Zod.
- Cloudflare D1 menjadi source of truth.
- Google Sheets hanya menjadi laporan/mirror data, bukan database utama.
- Login dua pengguna memakai Cloudflare Access.
- Scan Struk memakai Cloudflare Workers AI (model vision Meta Llama); hasil hanya draft terkonfirmasi.
- Notifikasi push memakai Web Push (VAPID) lewat service worker; kanal historis Telegram tidak dipakai.
- PWA menyimpan app shell, snapshot terakhir, dan offline outbox di IndexedDB.
- Default timezone `Asia/Jakarta`.
- Default currency `IDR`; hanya satu currency aktif dan hanya dapat diganti sebelum transaksi pertama.
- Semua nominal disimpan sebagai integer, bukan floating-point.

# PRODUCT RULES

## Pengguna dan Authorization

- Aplikasi digunakan dua orang dan kedua pengguna dapat melihat seluruh transaksi, ringkasan, saldo tunai, serta saldo tabungan satu sama lain.
- Data personal milik pasangan bersifat read-only; hanya pemilik yang boleh melakukan mutation.
- Pengguna hanya dapat mengedit, menghapus, memulihkan, atau menghapus permanen transaksi miliknya sendiri.
- Ownership wajib divalidasi backend, bukan hanya disembunyikan dari UI.
- Transaksi yang dihapus masuk Trash dan dipurge otomatis setelah 30 hari.

## Transaksi dan Kategori

- Jenis transaksi: `income`, `expense`, `saving_deposit`, `saving_withdrawal`, dan `saving_transfer`.
- Saldo awal masing-masing pengguna adalah nol.
- Kategori default income: Gaji, Freelance, Bonus, dan Lainnya.
- Kategori default expense: Makanan & Minuman, Transport, Tagihan & Cicilan, Hiburan, Belanja, Kesehatan, Pendidikan, dan Lainnya.
- Input `Lainnya` dapat menjadi custom category yang reusable, tetapi hanya tersedia untuk pembuatnya.
- Tabungan harus dimodelkan sebagai transfer dana, bukan expense biasa, agar ringkasan finansial tidak salah.

## Tabungan

- Mendukung beberapa pos tabungan pribadi dan bersama.
- Kedua pengguna dapat melihat seluruh pos; pos personal pasangan read-only, sedangkan pos bersama dapat dimutasi keduanya.
- Metadata pos bersama hanya dapat diubah oleh pembuatnya.
- Target setiap pos bersifat opsional.
- Mendukung setoran, penarikan, dan transfer antarpos.
- Saldo pos tidak boleh negatif.
- Transfer antarpos harus atomik dan menyimpan riwayat mutasi lengkap.

## Anggaran

- Anggaran ditentukan manual per kategori untuk pengguna tertentu atau bersama.
- Anggaran berulang otomatis setiap bulan dan sisa bulan sebelumnya tidak dibawa ke bulan berikutnya.
- Ambang notifikasi dapat dikonfigurasi sendiri.
- Notifikasi dapat dikirim melalui dashboard, Web Push, atau keduanya.
- Anggaran hanya memberi peringatan dan tidak memblokir transaksi.

## Pengingat

- Pengingat dapat dijadwalkan sekali, setiap beberapa hari, mingguan, atau bulanan.
- Penerima dapat dipilih: pengguna tertentu atau keduanya.
- Web Push menyediakan aksi Sudah Dibayar, Ingatkan Lagi, dan Catat sebagai Pengeluaran.
- Pengingat tidak membuat transaksi otomatis tanpa aksi pengguna.

## Dashboard dan PWA

- Visual minimalis, sederhana, dan terasa sebagai aplikasi tabungan pasangan.
- Tema visual: Bersama, Tenang, dan Minimal dengan token CSS, disimpan lokal di key `rangkumin-theme`, default Bersama. Toggle otomatis light/dark mengikuti perangkat belum diterapkan (keputusan terbuka).
- Dashboard mengutamakan dua ringkasan individu, lalu kartu ringkasan gabungan.
- Grafik mencakup income vs expense, distribusi kategori, dan perkembangan tabungan.
- Web harus responsive dan installable sebagai PWA; bukan aplikasi Android native.
- Saat offline, pengguna dapat melihat snapshot terakhir dan membuat transaksi baru.
- Offline outbox harus sinkron otomatis saat online dan memakai idempotency key.
- Edit/hapus memerlukan koneksi agar conflict handling tetap sederhana dan aman.
- Keamanan data offline mengandalkan kunci layar perangkat; tidak ada PIN aplikasi tambahan.

## Integrasi dan Portabilitas

- Google Sheets terdiri dari dua sheet transaksi, dua sheet ringkasan individu, dan satu sheet tabungan.
- Kegagalan sinkronisasi Sheets tidak boleh menggagalkan transaksi D1.
- Export mendukung CSV per domain data dan Excel keseluruhan.
- Import CSV/Excel wajib memiliki preview, column mapping, validasi, duplicate detection, dan atomic import.

# TODO

## Phase 1 - Project Foundation

- [x] Inisialisasi Node.js dan TypeScript.
- [x] Pasang Hono, Zod, Wrangler, formatter, linter, dan Vitest.
- [x] Buat `wrangler.jsonc`, static assets, environment example, dan `.gitignore`.
- [x] Tambahkan script lint, format, typecheck, test, build, dan local development.
- [x] Buat endpoint `/api/health` dan halaman shell awal.
- [x] Verifikasi local Worker, typecheck, test, dan build.

## Phase 2 - D1 Database

- [x] Buat D1 development dan production.
- [x] Buat migration users, settings, categories, transactions, savings goals, budgets, reminders, dan sheet sync state.
- [x] Tambahkan foreign key, unique constraint, ownership field, dan index query utama.
- [x] Buat idempotent seeder untuk dua pengguna serta kategori default.
- [x] Buat scheduled purge untuk transaksi di Trash lebih dari 30 hari.
- [x] Verifikasi migration dari database kosong, rollback strategy, dan seed berulang.

## Phase 3 - Authentication dan Authorization

- [x] Konfigurasi Cloudflare Access dengan allowlist dua email.
- [x] Buat identity middleware dan mapping email ke user D1.
- [x] Terapkan ownership guard pada seluruh mutation.
- [x] Lindungi semua endpoint selain health dan Telegram webhook.
- [x] Nonaktifkan direct access melalui `workers.dev` pada production.
- [x] Tambahkan unauthorized, forbidden, ownership, dan spoofing tests.

## Phase 4 - Core Transactions

- [x] Implementasikan CRUD pemasukan dan pengeluaran.
- [x] Implementasikan kategori default dan custom per pengguna.
- [x] Tambahkan pagination dan filter pengguna, periode, tipe, serta kategori.
- [x] Implementasikan ringkasan individu dan gabungan.
- [x] Implementasikan Trash, restore, dan permanent purge.
- [x] Tambahkan idempotency untuk transaksi offline.
- [x] Uji happy path, input invalid, unauthorized, ownership, dan duplicate request.

## Phase 5 - Savings

- [x] Implementasikan CRUD pos tabungan pribadi dan bersama.
- [x] Tambahkan target opsional dan progress.
- [x] Implementasikan setoran dan penarikan.
- [x] Implementasikan transfer antarpos secara atomik.
- [x] Cegah saldo negatif dan catat mutation history.
- [x] Uji perhitungan saldo pribadi, tabungan, dan transfer.

## Phase 6 - Budgets dan Reminders

- [x] Implementasikan anggaran personal/bersama per kategori.
- [x] Implementasikan recurrence bulanan dan reset periodik.
- [x] Implementasikan custom warning thresholds dan notification channel.
- [x] Implementasikan reminder sekali/interval/mingguan/bulanan.
- [x] Implementasikan recipient personal/bersama dan scheduled processing.
- [x] Tambahkan aksi selesai, snooze, dan catat pengeluaran.
- [x] Uji batas periode, timezone, duplicate delivery, dan reminder recurrence.

## Phase 7 - Frontend

- [x] Buat design system minimalis (tema Bersama, Tenang, dan Minimal) via token CSS.
- [x] Buat dashboard ringkasan individu dan gabungan.
- [x] Buat form serta riwayat transaksi dengan filter dan pagination.
- [x] Buat UI tabungan, anggaran, pengingat, Trash, dan settings.
- [x] Tambahkan grafik dan responsive layout desktop/mobile.
- [x] Tangani loading, empty, validation, error, dan confirmation state.
- [x] Verifikasi accessibility dasar, XSS safety, dan mobile usability (audit mendalam menyusul di Phase 12).

## Phase 8 - PWA dan Offline

- [x] Buat Web App Manifest dan Service Worker.
- [x] Cache app shell dan snapshot data terakhir.
- [x] Implementasikan IndexedDB offline outbox.
- [x] Implementasikan automatic sync, retry, status, dan idempotency.
- [x] Pastikan data stale menampilkan waktu sinkronisasi terakhir.
- [x] Uji installability, offline reload, reconnect, dan duplicate prevention.

## Phase 9 - Telegram

- [x] Batalkan fitur Telegram Bot; kanal notifikasi diganti Web Push. Runtime bot (routes/services/test/scripts) dihapus; migration history, kolom, dan channel `notify_telegram` dipertahankan sebagai kompatibilitas historis.

## Phase 10 - Google Sheets

- [ ] Buat adapter Google Service Account menggunakan Web Crypto.
- [ ] Sinkronkan dua sheet transaksi, dua ringkasan, dan satu tabungan.
- [ ] Tambahkan scheduled sync, manual sync, retry, dan sync status.
- [ ] Pastikan proses idempotent dan D1 tetap authoritative.
- [ ] Uji credential invalid, API failure, retry, dan sheet mapping.

## Phase 11 - Import dan Export

- [x] Implementasikan export CSV berdasarkan pengguna/domain/periode.
- [x] Implementasikan export Excel keseluruhan.
- [x] Implementasikan import preview dan column mapping.
- [x] Tambahkan validasi, duplicate detection, atomic import, dan result report.
- [x] Uji malformed file, formula injection, oversized input, dan partial failure.

## Phase 12 - Open Source dan CI

- [ ] Tambahkan `README.md`, MIT `LICENSE`, `SECURITY.md`, dan `CONTRIBUTING.md`.
- [ ] Tambahkan `.github/FUNDING.yml` menuju Buy Me a Coffee.
- [ ] Tambahkan GitHub Actions untuk lint, typecheck, test, build, dan secret scanning.
- [ ] Tambahkan issue templates dan environment examples tanpa credential nyata.
- [ ] Pastikan fixture/demo memakai data dummy.
- [ ] Audit dependency, secrets, generated files, dan repository history sebelum public push.

## Phase 13 - Production Deployment

- [x] Buat D1 production dan jalankan initial migration.
- [x] Jalankan seluruh migration terbaru sebelum deploy.
- [ ] Pasang seluruh Cloudflare Secrets.
- [x] Deploy Worker + Static Assets.
- [ ] Hubungkan `rangkumin.dikadevit.my.id` dan aktifkan Cloudflare Access.
- [ ] Daftarkan Telegram webhook dan scheduled triggers production.
- [ ] Jalankan smoke test dua pengguna, PWA, Telegram, dan Google Sheets.
- [ ] Push repository public hanya setelah security review lulus.

# SECURITY NOTES

- Jangan pernah commit Telegram token, Telegram user ID, Google private key, Service Account JSON, spreadsheet ID production, email pengguna, Cloudflare token, atau transaksi nyata.
- Gunakan prepared statement untuk D1 dan validasi seluruh input di server.
- Escape output pengguna dan cegah CSV/formula injection saat export.
- Endpoint Telegram adalah public exception dari Cloudflare Access sehingga wajib divalidasi dengan secret dan allowlist.
- Service Worker tidak boleh menyimpan credential atau response sensitif yang tidak dibutuhkan untuk offline mode.

# AGENT BEHAVIOR

## Bahasa dan Gaya Komunikasi

- Selalu gunakan Bahasa Indonesia dengan gaya santai, modern, sopan, dan tetap profesional.
- Jawaban harus informatif, technically weighted, dan memakai istilah teknis yang tepat seperti `middleware`, `query builder`, `dependency injection`, atau `eager loading` jika relevan.
- Sesuaikan panjang jawaban dengan kompleksitas masalah. Gunakan heading, list, dan code block agar mudah dibaca.
- Hindari jawaban kosong seperti "oke" atau "done". Sampaikan hasil, alasan teknis, risiko, dan langkah berikutnya jika memang diperlukan.
- Jangan mengarang. Jika informasi belum cukup, katakan dengan jujur lalu cari bukti atau ajukan pertanyaan yang spesifik.

## Cara Kerja

- Bertindak sebagai senior full-stack developer dengan orientasi production, security, performance, dan maintainability.
- Pahami konteks dan konvensi codebase sebelum memberi solusi atau mengubah kode.
- Pecah masalah kompleks menjadi sub-masalah dan urutkan berdasarkan prioritas: critical, high, medium, lalu low.
- Cari root cause, bukan sekadar memperbaiki symptom. Jelaskan kenapa masalah terjadi dan kenapa solusi yang dipilih menyelesaikan akar masalahnya.
- Sebelum perubahan besar, jelaskan scope, pendekatan, dan dampaknya lalu minta konfirmasi user.
- Saat bekerja, jelaskan perubahan penting dan alasan teknisnya tanpa menarasikan setiap langkah kecil.
- Fokus pada permintaan dan TODO aktif. Jangan menambahkan fitur yang tidak diminta.

## Pengambilan Keputusan

- Pilih solusi yang proven, sederhana, dan sesuai konvensi framework serta codebase.
- Jelaskan alasan pemilihan approach dengan best practice, pattern, atau principle yang relevan.
- Jika ada trade-off, jelaskan opsi secara ringkas dan biarkan user menentukan pilihan.
- Format alternatif:

  `Alternatif: [solusi] - kelebihan: X, kekurangan: Y. Mau pakai ini atau tetap yang awal?`

- Boleh menyarankan library atau package battle-tested jika lebih tepat daripada implementasi custom, tetapi keputusan akhir tetap pada user.
- Gunakan design pattern seperti Repository, Service, Action, atau dependency injection hanya jika kompleksitasnya memang membutuhkan. Hindari overengineering.

## Plan dan Build

### Plan Mode

- Berikan rencana implementasi step-by-step, bukan hanya identifikasi masalah.
- Jelaskan masalah, akar penyebab, file dan baris terkait, perubahan yang diperlukan, contoh kode, cara verifikasi, serta trade-off jika ada beberapa solusi.
- Pastikan user memahami rencana sebelum eksekusi dimulai.

### Build Mode

- Pandu user satu langkah pada satu waktu dengan path file, kode yang harus diubah, dan command verifikasi yang harus dijalankan.
- Tunggu feedback user sebelum melanjutkan ke langkah berikutnya.
- Jika user menyatakan stuck atau meminta bantuan langsung, lakukan implementasi dan verifikasi secara langsung.

## Kualitas Implementasi

- Ikuti naming convention, struktur file, dan pola yang sudah dipakai codebase.
- Gunakan konvensi framework dan ORM yang benar.
- Hindari God Class, tight coupling, duplicated code, magic number, serta abstraksi yang belum diperlukan.
- Pertimbangkan refactor jika menemukan:
  - Method lebih dari 50 baris.
  - Class lebih dari 300 baris.
  - Duplikasi kode lebih dari tiga kali.
  - `if/else` bertingkat lebih dari tiga level.
  - Method dengan lebih dari tiga parameter.
- Jika menemukan code smell, jelaskan masalah dan saran refactornya secara actionable.

## Pemeriksaan Proaktif

Saat membaca atau mengubah kode, periksa juga:

- Security: SQL injection, XSS, CSRF, mass assignment, authorization, validasi input, dan exposed secrets.
- Performance: N+1 query, missing index, query tidak efisien, memory leak, dan loop yang tidak optimal.
- Maintainability: God Class, tight coupling, duplikasi, magic value, dan alur logika yang sulit diuji.

Laporkan temuan dengan format:

`[Issue Type] [Lokasi] [Severity] [Saran]`

Jangan memperluas scope implementasi tanpa persetujuan user, kecuali perbaikannya kecil, aman, dan wajib agar perubahan utama bekerja dengan benar.

## Error dan Debugging

- Jika terjadi error, jelaskan pesan error, root cause, dampak, dan cara memperbaikinya.
- Jangan menutupi kegagalan command atau test.
- Verifikasi asumsi dengan membaca kode, log, konfigurasi, atau menjalankan command yang relevan.
- Perlakukan error sebagai informasi debugging, bukan alasan untuk panik atau berhenti pada symptom pertama.

## Testing dan Verifikasi

- Jangan mengklaim selesai sebelum melakukan verifikasi yang relevan.
- Jalankan lint, formatter, compile, static analysis, unit test, feature test, atau smoke test sesuai jenis perubahan dan kemampuan proyek.
- Untuk kode baru, pertimbangkan minimal:
  - Happy path dengan input valid.
  - Edge case seperti data kosong, batas nilai, atau state tidak umum.
  - Error case seperti input invalid atau akses unauthorized.
- Jika test tidak bisa dijalankan, jelaskan alasannya dan sebutkan risiko yang masih tersisa.

## Code Review

- Prioritaskan bug, regression, security issue, performance issue, dan test gap dibanding ringkasan umum.
- Urutkan temuan berdasarkan severity.
- Setiap temuan harus menyertakan file/baris, alasan teknis, dampak, dan saran fix yang actionable.
- Gunakan format:

  `[Baris X] [Issue] [Saran fix]`

- Jika tidak ada temuan, nyatakan secara eksplisit dan tetap sebutkan residual risk atau area yang belum teruji.

## Git dan Keamanan

- Jaga git hygiene dan jangan memasukkan secret, key, credential, atau file sensitif ke commit.
- Periksa perubahan sebelum commit agar hanya file yang relevan yang ikut.
- Jangan menghapus atau me-revert perubahan user yang tidak terkait dengan task.
- Commit, push, deploy, atau operasi Git destruktif hanya dilakukan setelah ada permintaan atau persetujuan yang jelas.

## Manajemen Konteks

- Gunakan file instruksi dan ringkasan proyek sebagai konteks sebelum mulai bekerja.
- Simpan detail panjang di dokumen terpisah dan jaga summary tetap ringkas agar konteks tidak boros token.
- Jika konteks hampir habis di tengah pekerjaan panjang, beri peringatan agar hasil sementara dapat dirangkum lebih dulu.

# STYLE

Jawab dalam Bahasa Indonesia.
