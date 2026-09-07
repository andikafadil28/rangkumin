# Rangkumin

[English](README.en.md) | **Bahasa Indonesia**

Aplikasi keuangan pasangan berbasis web/PWA untuk mencatat pemasukan, pengeluaran, tabungan, anggaran, pengingat, dan portabilitas data. Berjalan secara serverless di Cloudflare Workers + Static Assets dengan D1 sebagai source of truth.

- Production resmi: <https://rangkumin.dikadevit.my.id> (akses privat untuk dua pengguna)
- Lisensi core: [MIT](LICENSE)
- Layanan setup/support: [Commercial Services](COMMERCIAL.md)
- Donasi: <https://buymeacoffee.com/dikadev>

## Fitur aktif

- **Transaksi dan kategori** — income, expense, mutasi tabungan, kategori default/custom, filter, pagination, Trash, dan ownership guard backend.
- **Scan Struk** — Workers AI membaca JPEG/PNG/WebP menjadi draft transaksi yang wajib dikonfirmasi; foto di-resize, EXIF dibuang, dan tidak disimpan.
- **Dashboard dan Web Push** — notifikasi transaksi pasangan, pengingat, serta ambang anggaran dengan VAPID dan delivery outbox.
- **Tabungan** — pos pribadi/bersama, target opsional, setor, tarik, dan transfer atomik tanpa saldo negatif.
- **Anggaran dan pengingat** — recurrence, recipient personal/bersama, threshold, complete, snooze, dan catat sebagai pengeluaran.
- **Import/Export** — CSV per domain dan Excel keseluruhan; import memakai preview, mapping, validasi, duplicate detection, serta commit atomik.
- **PWA dan offline** — installable, snapshot terakhir, offline transaction outbox, retry, serta idempotency key.
- **Tampilan responsive** — mode Bersama/Saya dan tema Bersama, Tenang, atau Minimal.

Google Sheets dan Telegram **belum tersedia** pada versi aktif. Keduanya hanya kandidat add-on/update opsional di masa depan.

## Dokumentasi setup

### Panduan pemula langkah demi langkah

| Bahasa    | Markdown                                                        | PDF                                                                              |
| --------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Indonesia | [Panduan instalasi pemula](docs/installation-beginner.id.md)    | [Unduh PDF pemula Indonesia](docs/pdf/rangkumin-installation-beginner-id.pdf)    |
| English   | [Beginner installation guide](docs/installation-beginner.en.md) | [Download English beginner PDF](docs/pdf/rangkumin-installation-beginner-en.pdf) |

Panduan pemula dimulai dari instalasi Node.js dan Git, menjalankan aplikasi lokal, konfigurasi Cloudflare klik per klik, sampai troubleshooting.

### Panduan teknis

| Bahasa    | Markdown                                     | PDF                                                     |
| --------- | -------------------------------------------- | ------------------------------------------------------- |
| Indonesia | [Setup lokal + Cloudflare](docs/setup.id.md) | [Unduh PDF Indonesia](docs/pdf/rangkumin-setup-id.pdf)  |
| English   | [Local + Cloudflare setup](docs/setup.en.md) | [Download English PDF](docs/pdf/rangkumin-setup-en.pdf) |

Panduan mencakup setup lokal, D1, Cloudflare Access, custom domain, VAPID Web Push, Workers AI, deployment, scheduler, dan smoke test production.

## Mulai lokal

Persyaratan: Node.js 22+, npm, dan Git.

```bash
git clone https://github.com/andikafadil28/rangkumin.git
cd rangkumin
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Pada terminal kedua:

```bash
npm run dev:frontend
```

Buka <http://localhost:5173>. Detail autentikasi development dan fitur opsional tersedia di [panduan setup Indonesia](docs/setup.id.md).

## Deploy Cloudflare

Deployment baru membutuhkan resource milik sendiri: Worker, dua D1 (development/production), custom domain, Cloudflare Access, Workers AI, serta pasangan VAPID. Jangan memakai ID database atau domain instalasi resmi.

Alur ringkas:

```bash
npx wrangler login
# Buat D1 dan ganti resource/domain di wrangler.jsonc
npm run db:migrate:production
npm run db:provision:production -- --apply
npm run build
npx wrangler deploy --env production
npm run access:secrets:production -- --apply
npm run webpush:secrets:production -- --apply
```

Ikuti [panduan deployment lengkap](docs/setup.id.md#4-setup-production-cloudflare). Environment development tidak boleh diekspos publik karena memakai header identitas dummy; production wajib dilindungi Cloudflare Access.

## Quality gate

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Snapshot terakhir yang terverifikasi: **106 Worker test + 43 frontend test = 149 test**.

PDF dapat diregenerasi dengan Chrome, Edge, atau Chromium:

```bash
npm run docs:pdf
```

## Struktur

```text
src/                  Worker routes, services, schemas, middleware
frontend/src/         React UI, PWA, offline, dan Web Push client
migrations/           Migration D1 forward-only
seeds/                Data dummy development
tests/                Worker tests
frontend-tests/       Frontend tests
docs/                 Panduan operasional dan setup bilingual
scripts/              Provisioning, secret setup, dan PDF generator
public/               Static build yang dilayani Worker
```

## Status dan roadmap

- Phase 1–9 dan Phase 11 selesai; Phase 10 Google Sheets ditunda.
- Phase 12 dokumentasi, open-source readiness, CI, dan audit security sudah selesai.
- Residual production: smoke test dua user, Web Push perangkat nyata, PWA/offline reload, accessibility mendalam, dan frontend E2E.
- Kandidat future update: Google Sheets reporting/mirror dan Telegram integration sebagai add-on opsional. Tidak ada timeline yang dijanjikan.

## Keamanan

Jangan membuat issue publik untuk kerentanan atau mengirim data finansial nyata. Ikuti [SECURITY.md](SECURITY.md) dan gunakan GitHub Security Advisories.

## Kontribusi dan lisensi

Baca [CONTRIBUTING.md](CONTRIBUTING.md) dan [Code of Conduct](CODE_OF_CONDUCT.md). Core Rangkumin tersedia di bawah [MIT License](LICENSE), termasuk penggunaan komersial. Setup, support, custom branding, managed service, dan add-on privat dapat ditawarkan terpisah tanpa mengurangi hak atas core MIT.
