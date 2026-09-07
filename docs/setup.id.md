# Panduan Setup Rangkumin

Versi dokumen: 1.0 · 7 September 2026

Panduan ini menjelaskan dua cara menjalankan Rangkumin: **lokal untuk development** dan **self-hosted di Cloudflare untuk production**. Rangkumin dirancang untuk tepat dua pengguna dan menyimpan nominal sebagai integer dalam mata uang IDR.

> Jangan pernah memasukkan token, private key, email pengguna, foto struk, atau data transaksi nyata ke repository, issue, screenshot, dan log publik.

## 1. Arsitektur singkat

| Komponen         | Implementasi                                               |
| ---------------- | ---------------------------------------------------------- |
| Frontend         | React + Vite, output ke `public/`                          |
| API              | TypeScript + Hono di Cloudflare Workers                    |
| Database         | Cloudflare D1, binding `DB`                                |
| Login production | Cloudflare Access, JWT diverifikasi ulang oleh Worker      |
| Scan Struk       | Workers AI, binding `AI`                                   |
| Notifikasi       | Dashboard + Web Push menggunakan VAPID                     |
| PWA              | Service worker, snapshot dan offline outbox di IndexedDB   |
| Scheduler        | Cron reminder/budget/push setiap 15 menit dan purge harian |

Google Sheets dan Telegram tidak termasuk dalam versi aktif. Keduanya hanya kandidat add-on/update opsional di masa depan. D1 tetap menjadi source of truth.

## 2. Persyaratan

- Node.js 22 atau lebih baru.
- npm dan Git.
- Untuk production: akun Cloudflare dengan Workers, D1, Workers AI, Zero Trust/Access, dan domain aktif di Cloudflare.
- Dua alamat email pengguna yang berbeda.
- Chrome, Edge, atau Chromium jika ingin meregenerasi PDF dokumentasi.

Verifikasi alat lokal:

```bash
node --version
npm --version
git --version
```

## 3. Setup lokal

### 3.1 Ambil source dan dependency

```bash
git clone https://github.com/andikafadil28/rangkumin.git
cd rangkumin
npm ci
```

### 3.2 Siapkan database lokal

Wrangler menyimpan D1 lokal di `.wrangler/`. Tidak perlu membuat database Cloudflare untuk alur dasar lokal.

```bash
npm run db:migrations:list:local
npm run db:migrate:local
npm run db:seed:local
```

Seeder membuat dua akun dummy:

- `user1@example.invalid` — User Satu
- `user2@example.invalid` — User Dua

Jangan menjalankan `seeds/development.sql` di production. Migration yang sudah pernah diterapkan bersifat immutable; perubahan schema harus memakai migration forward-only baru.

### 3.3 Jalankan Worker dan frontend

Terminal pertama:

```bash
npm run dev
```

Terminal kedua:

```bash
npm run dev:frontend
```

Buka `http://localhost:5173`. Vite mem-proxy `/api` ke Worker di `http://localhost:8787` dan menyuntikkan identitas dummy User Satu.

> Environment development mempercayai header email untuk mempermudah testing. Jangan expose Worker development ke internet. Production hanya boleh memakai JWT Cloudflare Access yang tervalidasi.

Smoke test:

```bash
curl http://localhost:8787/api/health
curl -H "Cf-Access-Authenticated-User-Email: user1@example.invalid" \
  http://localhost:8787/api/me
```

PowerShell:

```powershell
curl.exe "http://localhost:8787/api/health"
curl.exe -H "Cf-Access-Authenticated-User-Email: user1@example.invalid" `
  "http://localhost:8787/api/me"
```

### 3.4 Web Push lokal (opsional)

Generate satu pasangan VAPID dan simpan secara rahasia:

```bash
npx --yes web-push generate-vapid-keys --json
```

Salin `.dev.vars.example` menjadi `.dev.vars`, lalu isi:

```dotenv
APP_ENV="development"
WEB_PUSH_VAPID_SUBJECT="mailto:contact@example.com"
WEB_PUSH_VAPID_PUBLIC_KEY="GANTI_DENGAN_PUBLIC_KEY"
WEB_PUSH_VAPID_PRIVATE_KEY="GANTI_DENGAN_PRIVATE_KEY"
```

Public key boleh dikirim ke browser. Private key hanya boleh ada di `.dev.vars` atau Cloudflare Secret. Mengganti key akan membuat perangkat perlu subscribe ulang. Web Push berjalan di `localhost`; pada iOS/iPadOS aplikasi harus dipasang ke Home Screen lebih dulu.

### 3.5 Scan Struk lokal (opsional)

Binding `AI` sudah ada di `wrangler.jsonc`, tetapi Workers AI tetap memakai resource remote saat `wrangler dev`. Login ke akun Cloudflare:

```bash
npx wrangler login
npx wrangler whoami
```

Model yang dipakai adalah `@cf/meta/llama-3.2-11b-vision-instruct`. Terima lisensi model melalui Workers AI dashboard pada akun target sebelum pemakaian pertama. Cek pricing dan free allocation terbaru di dokumentasi Cloudflare karena dapat berubah.

Foto diperkecil di browser, EXIF dibuang, dikirim ke AI, dan tidak disimpan ke D1, R2, KV, Cache, atau IndexedDB. Hasil scan hanya draft dan tetap memerlukan konfirmasi pengguna.

### 3.6 Quality gate

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## 4. Setup production Cloudflare

### 4.1 Login dan tentukan resource

```bash
npx wrangler login
npx wrangler whoami
```

Tentukan nama Worker development/production, nama D1 development/production, hostname aplikasi, dan dua email pengguna. Jangan memakai identifier instalasi resmi Rangkumin untuk instance buyer.

### 4.2 Buat D1

```bash
npx wrangler d1 create NAMA_DATABASE_DEVELOPMENT
npx wrangler d1 create NAMA_DATABASE_PRODUCTION
```

Masukkan `database_name` dan `database_id` hasil command ke `wrangler.jsonc`:

- binding top-level untuk development;
- `env.production.d1_databases` untuk production;
- pertahankan nama binding `DB`.

Ganti juga:

- `name` Worker top-level;
- `env.production.name`;
- hostname pada `env.production.routes`;
- domain fallback VAPID di `src/index.ts` dan `src/routes/transactions.ts` bila diperlukan.

Pastikan production tetap memakai `workers_dev: false` dan `preview_urls: false` agar tidak ada origin alternatif yang melewati Access.

### 4.3 Apply migration

```bash
npm run db:migrations:list:production
npm run db:migrate:production
npm run db:migrations:list:production
```

Script `db:provision:production` tidak membuat D1 dan tidak menjalankan migration. Database harus dibuat serta dimigrasikan lebih dahulu.

### 4.4 Provision dua pengguna

```bash
cp config/users.production.example.json config/users.production.local.json
```

PowerShell:

```powershell
Copy-Item "config/users.production.example.json" "config/users.production.local.json"
```

Isi tepat dua pengguna dengan ID `user-1` dan `user-2`, email Cloudflare Access yang berbeda, serta display name 1–80 karakter.

Validasi, lalu apply:

```bash
npm run db:provision:production
npm run db:provision:production -- --apply
```

### 4.5 Lindungi hostname dengan Cloudflare Access

Sebelum membuka hostname production:

1. Buka **Cloudflare Zero Trust → Access controls → Applications**.
2. Buat **Self-hosted application** untuk hostname aplikasi.
3. Buat policy `Allow` hanya untuk dua email production.
4. Pilih identity provider, misalnya One-time PIN atau Google.
5. Salin **Application Audience (AUD) Tag** dan team domain `https://namatim.cloudflareaccess.com`.

Salin config:

```bash
cp config/access.production.example.json config/access.production.local.json
```

Isi `ACCESS_TEAM_DOMAIN` dan `ACCESS_AUD`, kemudian validasi:

```bash
npm run access:secrets:production
```

Application Access di edge dan mapping user di D1 harus memakai email yang sama. User yang lolos Access tetapi tidak ada sebagai user aktif di D1 akan mendapat `403`.

### 4.6 Siapkan VAPID production

```bash
npx --yes web-push generate-vapid-keys --json
cp config/web-push.production.example.json config/web-push.production.local.json
```

Isi subject `mailto:`, public key, dan private key. Validasi:

```bash
npm run webpush:secrets:production
```

Jangan commit `config/*.local.json`. Simpan backup private key di secret manager yang aman.

### 4.7 Terima lisensi Workers AI

Di Cloudflare Dashboard, buka Workers AI, pilih model `@cf/meta/llama-3.2-11b-vision-instruct`, lalu terima Meta license pada akun target. Hindari menulis API token literal di command history. Workers AI dapat menimbulkan biaya; selalu cek pricing resmi terbaru sebelum menjual paket deployment.

### 4.8 Build dan deploy awal

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx wrangler deploy --env production
```

Setelah Worker tersedia, apply secret:

```bash
npm run access:secrets:production -- --apply
npm run webpush:secrets:production -- --apply
```

Cek hanya nama secret, bukan nilainya:

```bash
npx wrangler secret list --env production
```

Secret yang diharapkan:

- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `WEB_PUSH_VAPID_SUBJECT`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

### 4.9 Verifikasi custom domain dan scheduler

Deploy memasang custom domain serta cron berikut:

- `*/15 * * * *` — reminder, budget, fan-out, dan Web Push delivery;
- `15 17 * * *` — proses reguler plus purge Trash harian (17:15 UTC / sekitar 00:15 WIB).

Periksa di **Workers & Pages → Worker → Triggers** dan pantau log:

```bash
npx wrangler tail --env production
```

## 5. Checklist smoke test production

- Hostname tanpa sesi mengarah ke login Cloudflare Access.
- Kedua user dapat login dan `GET /api/me` menampilkan identitas yang benar.
- Pasangan dapat membaca transaksi, tetapi tidak dapat mengubah transaksi personal milik user lain.
- Income/expense baru mengirim notifikasi dashboard dan Web Push ke pasangan.
- Scan Struk hanya mengisi draft dan tidak menyimpan transaksi sebelum konfirmasi.
- Reminder dan budget alert diproses cron tanpa membuat duplikat.
- CSV/Excel export dan import diuji memakai data dummy.
- PWA dapat dipasang, reload offline menampilkan snapshot, dan offline transaction tersinkron sekali setelah reconnect.
- Web Push diuji pada perangkat nyata; iOS diuji dari aplikasi Home Screen.
- Security headers, CSP `blob:` untuk preview, dan `camera=(self)` aktif.

## 6. Maintenance dan backup

```bash
npm run db:migrations:list:production
npx wrangler d1 time-travel info DB --env production
npm audit
```

Jangan menjalankan restore tanpa approval dan bookmark yang benar. Detail operasi database tersedia di `docs/database-operations.md`.

## 7. Dokumentasi PDF

Regenerasi PDF Indonesia dan English:

```bash
npm run docs:pdf
```

Output:

- `docs/pdf/rangkumin-setup-id.pdf`
- `docs/pdf/rangkumin-setup-en.pdf`

Set `CHROME_PATH` atau `EDGE_PATH` jika browser Chromium tidak ditemukan otomatis.

## 8. Lisensi dan layanan komersial

Core aplikasi menggunakan lisensi MIT. Setup, support, custom branding, managed service, atau add-on privat dapat ditawarkan secara komersial melalui perjanjian terpisah. Baca `LICENSE` dan `COMMERCIAL.md`; mintalah review legal sebelum memakai kontrak komersial final.
