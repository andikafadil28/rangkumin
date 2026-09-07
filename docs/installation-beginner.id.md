# Panduan Instalasi Rangkumin untuk Pemula

Versi dokumen: 1.0 · 7 September 2026

Panduan ini dibuat untuk pengguna yang belum terbiasa dengan terminal, database, atau Cloudflare. Ikuti langkah secara berurutan dan jangan melewati bagian **Hasil yang diharapkan**.

> Jangan membagikan token, private key, email pengguna, foto struk, atau data keuangan nyata melalui chat, screenshot, issue GitHub, dan repository.

## 1. Pilih cara instalasi

Rangkumin dapat dijalankan dengan dua cara:

| Pilihan           | Cocok untuk                             | Hasil akhir                                             |
| ----------------- | --------------------------------------- | ------------------------------------------------------- |
| A. Komputer lokal | Belajar, mencoba fitur, dan development | Hanya dapat dibuka dari komputer sendiri                |
| B. Cloudflare     | Pemakaian production oleh pasangan      | Dapat dibuka online melalui domain dan dilindungi login |

Jika baru pertama mencoba, selesaikan **Pilihan A** lebih dahulu. Setelah aplikasi lokal berhasil, lanjutkan ke **Pilihan B**.

## 2. Istilah yang perlu diketahui

- **Terminal**: aplikasi untuk menjalankan perintah teks. Di Windows gunakan PowerShell; di macOS gunakan Terminal.
- **Repository/source code**: folder berisi seluruh kode Rangkumin.
- **D1**: database Cloudflare tempat data production disimpan.
- **Worker**: aplikasi backend yang berjalan di Cloudflare.
- **Cloudflare Access**: halaman login yang membatasi aplikasi hanya untuk dua email.
- **Secret**: konfigurasi rahasia yang tidak boleh dimasukkan ke Git.
- **VAPID key**: pasangan key untuk mengirim Web Push.
- **Migration**: file yang membuat atau memperbarui struktur database.

# Pilihan A: Instalasi di komputer lokal

## 3. Install Node.js

1. Buka <https://nodejs.org/>.
2. Unduh Node.js versi **22 LTS atau lebih baru**.
3. Jalankan installer.
4. Gunakan pilihan default sampai instalasi selesai.
5. Tutup lalu buka kembali PowerShell atau Terminal.
6. Jalankan:

```bash
node --version
npm --version
```

**Hasil yang diharapkan:** command pertama menampilkan versi `v22` atau lebih tinggi, dan command kedua menampilkan nomor versi npm.

Jika muncul pesan `node is not recognized` atau `command not found`, restart komputer lalu ulangi pemeriksaan.

## 4. Install Git

### Windows

1. Buka <https://git-scm.com/download/win>.
2. Jalankan installer Git.
3. Gunakan pilihan default.
4. Tutup lalu buka kembali PowerShell.

### macOS

1. Buka Terminal.
2. Jalankan `git --version`.
3. Jika macOS meminta instalasi Command Line Tools, pilih **Install**.

Verifikasi:

```bash
git --version
```

**Hasil yang diharapkan:** tampil nomor versi Git.

## 5. Ambil source code

### Cara yang disarankan: Git

1. Tentukan folder tempat proyek disimpan.
2. Buka PowerShell atau Terminal pada folder tersebut.
3. Jalankan:

```bash
git clone https://github.com/andikafadil28/rangkumin.git
cd rangkumin
```

### Alternatif tanpa Git clone

1. Buka <https://github.com/andikafadil28/rangkumin>.
2. Klik tombol **Code**.
3. Klik **Download ZIP**.
4. Extract ZIP.
5. Buka folder hasil extract.
6. Klik kanan area kosong dan pilih **Open in Terminal**, atau buka Terminal lalu masuk ke folder tersebut.

**Hasil yang diharapkan:** terminal sedang berada di folder yang memiliki file `package.json`, `README.md`, dan folder `src`.

## 6. Install dependency

Pastikan terminal berada di folder Rangkumin, lalu jalankan:

```bash
npm ci
```

Tunggu sampai selesai. Proses ini dapat memerlukan beberapa menit.

**Hasil yang diharapkan:** command selesai tanpa tulisan `npm ERR!`.

Peringatan dependency yang tidak menghentikan command biasanya tidak memblok instalasi. Jangan menjalankan `npm audit fix --force` tanpa memahami dampaknya.

## 7. Buat database lokal

Jalankan:

```bash
npm run db:migrate:local
```

Jika muncul pertanyaan untuk melanjutkan migration, jawab `y` atau `yes`.

**Hasil yang diharapkan:** seluruh migration memiliki status berhasil.

## 8. Isi data dummy

Jalankan:

```bash
npm run db:seed:local
```

Data dummy membuat dua pengguna latihan:

- User Satu: `user1@example.invalid`
- User Dua: `user2@example.invalid`

**Hasil yang diharapkan:** command selesai tanpa error database.

Data tersebut bukan akun email nyata. Jangan mengganti seed dengan data pribadi.

## 9. Jalankan backend

Konfigurasi aplikasi memiliki binding Workers AI remote. Pada pemakaian pertama, buat akun Cloudflare bila belum punya, lalu login:

```bash
npx wrangler login
```

Browser akan terbuka untuk meminta izin. Setelah berhasil, kembali ke terminal. Login ini tidak membuat data lokal menjadi production, tetapi Scan Struk tetap dapat memakai kuota Workers AI ketika digunakan.

Pada terminal pertama, jalankan:

```bash
npm run dev
```

Biarkan terminal ini tetap terbuka. Jangan menekan `Ctrl+C` selama aplikasi digunakan.

**Hasil yang diharapkan:** terminal menampilkan alamat Worker, biasanya `http://localhost:8787`.

## 10. Jalankan frontend

1. Buka terminal kedua pada folder Rangkumin yang sama.
2. Jalankan:

```bash
npm run dev:frontend
```

3. Biarkan terminal kedua tetap terbuka.

**Hasil yang diharapkan:** terminal menampilkan alamat `http://localhost:5173`.

## 11. Buka aplikasi lokal

1. Buka Chrome, Edge, atau browser modern lain.
2. Masukkan alamat <http://localhost:5173>.
3. Tunggu dashboard tampil.

Mode lokal otomatis memakai User Satu. Ini hanya mekanisme development dan tidak boleh digunakan untuk website publik.

Checklist lokal:

- Dashboard dapat dibuka.
- Transaksi dummy dapat dibuat.
- Halaman tabungan, anggaran, pengingat, dan pengaturan dapat dibuka.
- Reload halaman tidak menghasilkan layar kosong.

## 12. Hentikan aplikasi lokal

1. Kembali ke terminal frontend.
2. Tekan `Ctrl+C`.
3. Kembali ke terminal backend.
4. Tekan `Ctrl+C`.

Data lokal tetap tersimpan di folder `.wrangler/` dan tersedia saat aplikasi dijalankan kembali.

## 13. Menjalankan aplikasi lagi

Tidak perlu mengulangi instalasi dependency, migration, atau seed setiap kali.

1. Buka terminal pertama di folder Rangkumin dan jalankan `npm run dev`.
2. Buka terminal kedua di folder yang sama dan jalankan `npm run dev:frontend`.
3. Buka <http://localhost:5173>.

# Pilihan B: Instalasi online di Cloudflare

## 14. Siapkan kebutuhan Cloudflare

Sebelum mulai, siapkan:

- akun Cloudflare;
- domain yang DNS-nya dikelola Cloudflare;
- dua alamat email yang akan memakai Rangkumin;
- satu alamat email kontak untuk Web Push;
- metode pembayaran bila layanan Cloudflare yang dipakai melewati kuota gratis.

Workers AI untuk Scan Struk dapat menimbulkan biaya. Cek pricing terbaru di <https://developers.cloudflare.com/workers-ai/platform/pricing/>.

## 15. Login Cloudflare dari terminal

Pada folder Rangkumin, jalankan:

```bash
npx wrangler login
```

1. Browser akan terbuka.
2. Login ke Cloudflare.
3. Pilih **Allow/Authorize**.
4. Kembali ke terminal.
5. Verifikasi:

```bash
npx wrangler whoami
```

**Hasil yang diharapkan:** terminal menampilkan akun Cloudflare aktif. Jangan screenshot output akun untuk dokumentasi publik.

## 16. Tentukan nama instalasi

Catat nilai berikut di catatan privat:

```text
Nama Worker development: contoh-rangkumin-development
Nama Worker production: contoh-rangkumin
Nama D1 development: contoh-rangkumin-development-db
Nama D1 production: contoh-rangkumin-production-db
Domain aplikasi: keuangan.example.com
Email User 1: ...
Email User 2: ...
```

Gunakan nama unik milik sendiri. Jangan memakai ID database atau domain dari instalasi resmi.

## 17. Buat database D1

Jalankan command pertama dengan nama database development:

```bash
npx wrangler d1 create contoh-rangkumin-development-db
```

Jalankan command kedua dengan nama database production:

```bash
npx wrangler d1 create contoh-rangkumin-production-db
```

Setiap command menampilkan `database_name` dan `database_id`.

1. Simpan kedua hasil di catatan privat.
2. Jangan menukar ID development dan production.
3. Jangan membagikan screenshot yang memuat metadata akun.

## 18. Edit konfigurasi Wrangler

1. Buka `wrangler.jsonc` memakai Visual Studio Code atau text editor.
2. Pada bagian paling atas, ganti `name` dengan nama Worker development.
3. Pada `d1_databases` paling atas, ganti `database_name` dan `database_id` development.
4. Cari bagian `env.production`.
5. Ganti `env.production.name` dengan nama Worker production.
6. Ganti `database_name` dan `database_id` production.
7. Ganti route `rangkumin.dikadevit.my.id` dengan domain aplikasi sendiri.
8. Pertahankan nama binding `DB`, `AI`, dan `ASSETS`.
9. Pertahankan `workers_dev: false` dan `preview_urls: false` untuk production.
10. Simpan file.

Periksa kembali agar ID development tidak dipasang pada bagian production.

## 19. Buat struktur database production

Jalankan:

```bash
npm run db:migrations:list:production
npm run db:migrate:production
npm run db:migrations:list:production
```

Jika diminta konfirmasi, jawab `yes`.

**Hasil yang diharapkan:** migration terbaru, termasuk `0008_disable_telegram_channel.sql`, berstatus berhasil.

Jangan menjalankan `npm run db:seed:local` atau seed development pada production.

## 20. Isi dua pengguna production

### Windows PowerShell

```powershell
Copy-Item "config/users.production.example.json" "config/users.production.local.json"
```

### macOS/Linux

```bash
cp config/users.production.example.json config/users.production.local.json
```

Buka `config/users.production.local.json`, lalu ubah hanya email dan display name:

```json
{
  "users": [
    {
      "id": "user-1",
      "email": "EMAIL_USER_1",
      "displayName": "NAMA_USER_1"
    },
    {
      "id": "user-2",
      "email": "EMAIL_USER_2",
      "displayName": "NAMA_USER_2"
    }
  ]
}
```

Ketentuan:

- gunakan tepat dua user;
- jangan mengubah ID `user-1` dan `user-2`;
- kedua email harus berbeda;
- gunakan email yang sama pada Cloudflare Access;
- file `.local.json` tidak boleh di-commit.

Validasi dan simpan ke D1:

```bash
npm run db:provision:production
npm run db:provision:production -- --apply
```

**Hasil yang diharapkan:** terminal menyatakan dua user production berhasil diprovision tanpa mencetak identitas.

## 21. Buat proteksi Cloudflare Access

1. Login ke <https://dash.cloudflare.com/>.
2. Buka **Zero Trust**.
3. Jika pertama kali, buat nama team Zero Trust.
4. Buka **Access controls → Applications**.
5. Klik **Add an application**.
6. Pilih **Self-hosted**.
7. Isi nama aplikasi, misalnya `Rangkumin`.
8. Tambahkan public hostname sesuai domain aplikasi, misalnya `keuangan.example.com`.
9. Buat policy dengan action **Allow**.
10. Pada rule, pilih selector **Emails**.
11. Masukkan hanya dua email production.
12. Pilih identity provider, misalnya **One-time PIN** atau Google.
13. Simpan application.
14. Buka detail application.
15. Salin **Application Audience (AUD) Tag**.
16. Catat team domain, misalnya `https://namatim.cloudflareaccess.com`.

Jangan membuat policy `Allow Everyone`. Rangkumin dirancang untuk dua pengguna.

## 22. Siapkan secret Cloudflare Access

Salin config example.

### Windows PowerShell

```powershell
Copy-Item "config/access.production.example.json" "config/access.production.local.json"
```

### macOS/Linux

```bash
cp config/access.production.example.json config/access.production.local.json
```

Buka file baru dan isi:

```json
{
  "ACCESS_TEAM_DOMAIN": "https://namatim.cloudflareaccess.com",
  "ACCESS_AUD": "AUD_DARI_ACCESS_APPLICATION"
}
```

Validasi tanpa mengirim secret:

```bash
npm run access:secrets:production
```

Jika validasi gagal, periksa domain harus memakai HTTPS dan AUD harus disalin lengkap tanpa spasi.

## 23. Buat Web Push key

Jalankan satu kali:

```bash
npx --yes web-push generate-vapid-keys --json
```

Command menampilkan public key dan private key. Jangan screenshot atau membagikan private key.

Salin config example.

### Windows PowerShell

```powershell
Copy-Item "config/web-push.production.example.json" "config/web-push.production.local.json"
```

### macOS/Linux

```bash
cp config/web-push.production.example.json config/web-push.production.local.json
```

Isi file baru:

```json
{
  "WEB_PUSH_VAPID_SUBJECT": "mailto:EMAIL_KONTAK",
  "WEB_PUSH_VAPID_PUBLIC_KEY": "PUBLIC_KEY_DARI_COMMAND",
  "WEB_PUSH_VAPID_PRIVATE_KEY": "PRIVATE_KEY_DARI_COMMAND"
}
```

Validasi:

```bash
npm run webpush:secrets:production
```

Simpan backup private key di password manager atau secret manager. Jika key hilang atau diganti, perangkat harus subscribe ulang.

## 24. Aktifkan model Scan Struk

1. Buka Cloudflare Dashboard.
2. Buka **Workers AI**.
3. Cari model `@cf/meta/llama-3.2-11b-vision-instruct`.
4. Buka model atau AI Playground.
5. Terima Meta license jika diminta.
6. Cek halaman pricing dan limit akun.

Tidak perlu menyimpan API token di source code. Binding `AI` dipasang saat Worker di-deploy.

## 25. Periksa aplikasi sebelum deploy

Jalankan satu per satu:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Jangan lanjut jika salah satu command gagal. Simpan pesan error yang sudah disanitasi jika memerlukan bantuan.

**Hasil yang diharapkan:** format, lint, typecheck, 153 test, dan build semuanya berhasil.

## 26. Deploy Worker

Jalankan:

```bash
npx wrangler deploy --env production
```

Tunggu sampai Wrangler menampilkan:

- Worker berhasil di-upload;
- custom domain aktif;
- cron `*/15 * * * *`;
- cron `15 17 * * *`;
- Version ID baru.

Jika domain sudah memiliki DNS record yang konflik, hapus atau perbaiki record tersebut melalui persetujuan pemilik domain, lalu ulangi deploy.

## 27. Kirim secret ke Cloudflare

Setelah Worker tersedia, jalankan:

```bash
npm run access:secrets:production -- --apply
npm run webpush:secrets:production -- --apply
```

Cek nama secret tanpa menampilkan nilainya:

```bash
npx wrangler secret list --env production
```

**Hasil yang diharapkan:** terdapat lima nama secret berikut:

- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `WEB_PUSH_VAPID_SUBJECT`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

## 28. Uji website production

1. Buka domain aplikasi pada jendela incognito/private.
2. Pastikan halaman Cloudflare Access muncul.
3. Login memakai email User 1.
4. Pastikan dashboard tampil dan nama pengguna benar.
5. Logout atau gunakan browser lain.
6. Login memakai email User 2.
7. Pastikan dashboard tampil dan nama pengguna benar.
8. Coba email lain yang tidak diizinkan; akses harus ditolak.

## 29. Uji fitur utama

Gunakan data dummy, lalu lakukan checklist berikut:

1. User 1 membuat pemasukan.
2. User 1 membuat pengeluaran.
3. User 2 dapat melihat transaksi User 1.
4. User 2 tidak dapat mengedit atau menghapus transaksi User 1.
5. Aktifkan Web Push pada kedua perangkat.
6. Buat transaksi dan pastikan pasangan menerima notifikasi.
7. Scan struk dan pastikan hasil hanya draft sebelum dikonfirmasi.
8. Buat pos tabungan, setor, tarik, dan transfer.
9. Buat anggaran dan pengingat.
10. Export CSV serta Excel.
11. Import data dummy dan periksa preview sebelum commit.
12. Install PWA, buka sekali saat online, lalu uji reload offline.

Pada iPhone/iPad, tambahkan aplikasi ke Home Screen dan buka dari ikon tersebut sebelum mengaktifkan Web Push.

## 30. Periksa scheduler

1. Buka Cloudflare Dashboard.
2. Masuk ke **Workers & Pages**.
3. Pilih Worker production.
4. Buka **Triggers**.
5. Pastikan terdapat dua cron schedule.

Cron setiap 15 menit memproses reminder, budget, dan Web Push. Cron harian melakukan proses reguler dan purge Trash.

## 31. Update aplikasi di kemudian hari

Sebelum update, baca release note dan backup data. Alur umum:

```bash
git pull
npm ci
npm run db:migrations:list:production
npm run db:migrate:production
npm test
npm run build
npx wrangler deploy --env production
```

Jangan mengedit migration lama dan jangan menjalankan migration production tanpa membaca daftar migration baru.

## 32. Troubleshooting umum

### `node` atau `npm` tidak ditemukan

Install Node.js 22+, restart terminal atau komputer, lalu periksa `node --version`.

### `wrangler login` tidak membuka browser

Salin URL login yang muncul di terminal ke browser. Pastikan popup dan firewall tidak memblokir.

### Migration mengatakan database tidak ditemukan

Periksa `database_id` dan `database_name` pada bagian environment yang benar di `wrangler.jsonc`.

### Login Access berhasil tetapi aplikasi menampilkan 403

Email Cloudflare Access tidak sama dengan email user di D1. Perbaiki `users.production.local.json`, lalu jalankan provisioning `--apply` lagi.

### Web Push tidak masuk

- pastikan permission browser diizinkan;
- pastikan lima secret tersedia;
- disable lalu enable notifikasi dari Settings;
- pada iOS, buka aplikasi dari Home Screen;
- periksa Worker logs dengan `npx wrangler tail --env production`.

### Scan Struk menampilkan error 502

- pastikan Meta license sudah diterima;
- periksa Workers AI quota dan billing;
- gunakan JPEG/PNG/WebP yang jelas;
- periksa Worker logs tanpa membagikan foto struk.

### Website tidak terbuka setelah deploy

Periksa custom domain, DNS conflict, Cloudflare Access hostname, dan status deploy terakhir.

### `npm test` tidak selesai cepat

Tunggu proses Worker test selesai. Test memakai config hermetic dan tidak membutuhkan Cloudflare API token.

## 33. File yang wajib dirahasiakan

Jangan commit atau kirim file berikut:

```text
.dev.vars
config/users.production.local.json
config/access.production.local.json
config/web-push.production.local.json
```

Jangan simpan export transaksi nyata di repository. `.gitignore` sudah membantu, tetapi pengguna tetap wajib memeriksa `git status` sebelum commit.

## 34. Mendapatkan bantuan

- Bug umum: buat GitHub Issue menggunakan data dummy.
- Kerentanan: gunakan GitHub Security Advisories, jangan issue publik.
- Setup, support, custom branding, atau managed service: lihat `COMMERCIAL.md`.
- Dokumentasi teknis: lihat `docs/setup.id.md`.

Core Rangkumin menggunakan lisensi MIT. Paket instalasi, dukungan, customisasi, dan add-on privat dapat ditawarkan melalui perjanjian komersial terpisah.
