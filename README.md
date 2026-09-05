# Rangkumin

Aplikasi keuangan pasangan berbasis web untuk mencatat pemasukan, pengeluaran, saldo, tabungan, anggaran, dan pengingat. Dibangun di atas Cloudflare Workers + Static Assets dengan D1 sebagai database, tanpa hosting berbayar.

- Production: <https://rangkumin.dikadevit.my.id>
- Lisensi: MIT — Copyright (c) 2026 Andika Fadil
- Donasi: <https://buymeacoffee.com/dikadev>

## Fitur

- **Transaksi & kategori** — income, expense, dan mutasi tabungan (`saving_deposit`, `saving_withdrawal`, `saving_transfer`) dengan kategori default dan custom per pengguna, filter, pagination, dan Trash (restore/purge otomatis 30 hari).
- **Tabungan** — beberapa pos pribadi dan bersama, target opsional, setor/tarik/transfer antarpos secara atomik, saldo tidak boleh negatif, dan arsip pos.
- **Anggaran** — per kategori untuk pengguna tertentu atau bersama, berulang otomatis setiap bulan, ambang peringatan dan kanal notifikasi (dashboard/Telegram) yang bisa dikonfigurasi.
- **Pengingat** — sekali, interval, mingguan, atau bulanan; penerima personal/bersama; aksi Telegram *Sudah Dibayar*, *Ingatkan Lagi*, dan *Catat sebagai Pengeluaran*.
- **Dashboard** — dua ringkasan individu + kartu gabungan, grafik arus income vs expense, distribusi kategori, perkembangan tabungan, dan notifikasi.
- **Tiga suasana tampilan** — Bersama, Tenang, dan Minimal, dengan pilihan disimpan lokal di perangkat.
- **Realtime refresh** — polling ringan tiap 10 detik (dijeda saat tab tidak aktif, langsung segar saat kembali fokus) dan refresh senyap tanpa mengganggu tampilan.

## Arsitektur

- **Frontend & API** di Cloudflare Workers + Static Assets pada origin yang sama (React + Vite, di-build ke `public/`).
- **Backend** TypeScript, Hono, dan Zod; semua query D1 memakai prepared statement.
- **Authentication & authorization** via Cloudflare Access (allowlist dua email) dengan ownership guard di backend — data pasangan read-only, mutation hanya untuk pemilik.
- **D1** menjadi source of truth; Google Sheets hanya laporan/mirror; Telegram memakai webhook (bukan long polling).
- **PWA** (roadmap) menyimpan app shell, snapshot terakhir, dan offline outbox di IndexedDB.
- Timezone default `Asia/Jakarta`, currency `IDR`, semua nominal disimpan sebagai integer.

## Teknologi

Node.js · TypeScript · Hono · Zod · React 19 · Vite · Cloudflare Workers · D1 · Vitest · ESLint · Prettier

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

## Production

```bash
npm run db:provision:production   # buat D1 production lalu apply migration
npm run db:migrate:production     # apply migration terbaru
npm run access:secrets:production # set secret Cloudflare Access
npm run build
npx wrangler deploy --env production
```

Sebelum deploy production, pastikan dua akun pengguna dengan email yang terdaftar di Cloudflare Access sudah ada di tabel `users` D1 production, lalu isi `display_name` masing-masing.

## Kualitas

```bash
npm run lint
npm run typecheck
npm test            # 62 test (unit + integration)
npm run build       # build frontend + Wrangler dry-run
npm run format      # prettier --write
npm run format:check
```

## Status

- Phase 1–6 (foundation, D1, auth/authorization, transaksi, tabungan, anggaran & pengingat) selesai dan sudah di-deploy.
- **Phase 7 (Frontend)** selesai: dashboard, transaksi + Trash, tabungan, anggaran & pengingat, grafik, pengaturan, notifications panel, tema Bersama/Tenang/Minimal, dan realtime refresh.
- Roadmap selanjutnya: Phase 8 PWA & offline, Phase 9 Telegram, Phase 10 Google Sheets, Phase 11 import/export, Phase 12 open source & CI, Phase 13 penuntasan production.