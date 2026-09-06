# Rangkumin

Aplikasi keuangan pasangan berbasis web untuk mencatat pemasukan, pengeluaran, saldo, tabungan, anggaran, dan pengingat. Dibangun di atas Cloudflare Workers + Static Assets dengan D1 sebagai database, tanpa hosting berbayar.

- Production: <https://rangkumin.dikadevit.my.id>
- Lisensi: MIT — Copyright (c) 2026 Andika Fadil
- Donasi: <https://buymeacoffee.com/dikadev>

## Fitur

- **Transaksi & kategori** — income, expense, dan mutasi tabungan (`saving_deposit`, `saving_withdrawal`, `saving_transfer`) dengan kategori default dan custom per pengguna, filter, pagination, dan Trash (restore/purge otomatis 30 hari).
- **Scan Struk (Workers AI)** — foto struk di-resize di browser lalu dibaca model vision (Llama 3.2), hasilnya menjadi **draft transaksi** yang dikonfirmasi manual sebelum disimpan; foto tidak pernah disimpan.
- **Notifikasi transaksi** — pasangan diberi tahu saat ada pemasukan/pengeluaran baru (jumlah + siapa yang mencatat) melalui dashboard dan Web Push.
- **Web Push** — notifikasi anggaran, pengingat, dan transaksi sampai ke perangkat; untuk pengingat tersedia aksi _Sudah Dibayar_, _Ingatkan Lagi_, dan _Catat sebagai Pengeluaran_.
- **Tabungan** — beberapa pos pribadi dan bersama, target opsional, setor/tarik/transfer antarpos secara atomik, saldo tidak boleh negatif, dan arsip pos.
- **Anggaran** — per kategori untuk pengguna tertentu atau bersama, berulang otomatis setiap bulan, ambang peringatan dan kanal notifikasi (dashboard/Web Push) yang bisa dikonfigurasi.
- **Pengingat** — sekali, interval, mingguan, atau bulanan; penerima personal/bersama; penyelesaian manual.
- **Import/Export** — export CSV per domain data dan Excel keseluruhan; import CSV/Excel dengan preview, mapping kolom, validasi, deteksi duplikat, dan commit atomik.
- **Dashboard** — dua ringkasan individu + kartu gabungan, grafik arus income vs expense, distribusi kategori, perkembangan tabungan, dan notifikasi.
- **Tiga suasana tampilan** — Bersama, Tenang, dan Minimal, dengan pilihan disimpan lokal di perangkat.
- **Realtime refresh** — polling ringan tiap 10 detik (dijeda saat tab tidak aktif, langsung segar saat kembali fokus) dan refresh senyap tanpa mengganggu tampilan.
- **PWA & offline** — app installable, snapshot data terakhir, dan offline outbox yang sinkron otomatis dengan idempotency key.

## Arsitektur

- **Frontend & API** di Cloudflare Workers + Static Assets pada origin yang sama (React + Vite, di-build ke `public/`).
- **Backend** TypeScript, Hono, dan Zod; semua query D1 memakai prepared statement.
- **Authentication & authorization** via Cloudflare Access (allowlist dua email) dengan ownership guard di backend — data pasangan read-only, mutation hanya untuk pemilik.
- **D1** menjadi source of truth; Google Sheets hanya laporan/mirror.
- **Notifikasi** via Dashboard + Web Push (VAPID RFC 8292); delivery Web Push memakai outbox terpisah dengan lease/retry.
- **PWA** menyimpan app shell, snapshot terakhir, dan offline outbox di IndexedDB.
- Timezone default `Asia/Jakarta`, currency `IDR`, semua nominal disimpan sebagai integer.

## Teknologi

Node.js · TypeScript · Hono · Zod · React 19 · Vite · Cloudflare Workers · D1 · Workers AI · Vitest · ESLint · Prettier

## Struktur

```
src/                  Worker: routes, services, schemas, middleware
migrations/           Skema D1 (SQL)
seeds/                Seeder development (data dummy)
tests/                Unit & integration tests (Vitest)
frontend/src/         UI React (halaman, komponen, api client)
public/               Hasil build Vite + index.html untuk Static Assets
docs/                 Catatan operasional database
scripts/              Skrip provision & access production
wrangler.jsonc        Konfigurasi Worker (env development & production)
```

## Menjalankan di lokal

Persyaratan: Node.js ≥ 22 dan `wrangler login`.

```bash
npm install
npm run db:migrate:local    # apply migration D1 lokal
npm run db:seed:local       # seed dua user dummy + kategori default
npm run dev                 # build frontend lalu jalankan Worker di :8787
npm run dev:frontend        # terminal kedua: Vite di :5173 (proxy /api -> :8787)
```

Buka <http://localhost:5173>. Vite proxy menyuntikkan identitas development (`user1@example.invalid`, nama tampilan sesuai seed) sehingga API lokal terautentikasi tanpa Cloudflare Access; production tetap mewajibkan JWT Access.

Catatan: Workers AI memanggil resource remote sehingga Scan Struk dapat memakai kuota saat development.

## Production

```bash
npm run db:provision:production   # buat D1 production lalu apply migration
npm run db:migrate:production     # apply migration terbaru
npm run access:secrets:production # set secret Cloudflare Access
npm run webpush:secrets:production # set secret VAPID Web Push
npm run build
npx wrangler deploy --env production
```

Sebelum provisioning production, buat config lokal dari example di `config/` (`users`, `access`, `web-push`) — seluruh `config/*.local.json` di-ignore Git. Jalankan script secret tanpa `--apply` untuk validasi, lalu ulangi dengan `--apply` setelah nilainya benar.

## Kualitas

```bash
npm run lint
npm run typecheck
npm test            # Worker + frontend tests
npm run build       # build frontend + Wrangler dry-run
npm run format      # prettier --write
npm run format:check
```

## Status

- Phase 1–11 selesai dan sudah di-deploy ke production (146 test, lint/typecheck/format/build hijau).
- Telegram Bot **dibatalkan**; kanal notifikasi diganti Dashboard + Web Push.
- Roadmap selanjutnya: Phase 10 Google Sheets, Phase 12 open source & CI, Phase 13 penuntasan production (smoke test dua pengguna, Web Push perangkat nyata, dll.).