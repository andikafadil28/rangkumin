# Database Operations

## Environment

| Target      | D1 database             | Command scope               |
| ----------- | ----------------------- | --------------------------- |
| Local       | Local Wrangler state    | `--local --env=""`          |
| Development | `rangkumin-development` | `--remote --env=""`         |
| Production  | `rangkumin-production`  | `--remote --env production` |

Jangan menjalankan seeder development pada production. Seeder memakai data dummy dan hanya disediakan untuk local serta remote development.

## Apply Migration

Periksa daftar migration sebelum apply:

```bash
npm run db:migrations:list:local
npm run db:migrations:list:development
npm run db:migrations:list:production
```

Apply berdasarkan target:

```bash
npm run db:migrate:local
npm run db:migrate:development
npm run db:migrate:production
```

Migration yang sudah pernah diterapkan tidak boleh diedit. Perubahan schema berikutnya harus dibuat sebagai migration baru yang bersifat forward-only.

## Rollback Strategy

D1 mengambil backup saat migration diterapkan. Jika migration gagal, D1 membatalkan migration tersebut dan mempertahankan migration sukses sebelumnya.

Untuk kesalahan aplikasi setelah migration berhasil:

1. Hentikan deployment atau route yang menulis data bermasalah.
2. Catat bookmark Time Travel sebelum melakukan tindakan pemulihan.
3. Perbaiki schema menggunakan forward migration jika data masih konsisten.
4. Gunakan Time Travel restore hanya untuk insiden yang membutuhkan pengembalian seluruh database.
5. Verifikasi foreign key, jumlah record, dan smoke test sebelum membuka akses kembali.

Lihat informasi Time Travel:

```bash
npx wrangler d1 time-travel info DB --env production
```

Restore bersifat destruktif dan hanya boleh dijalankan setelah persetujuan eksplisit serta pencatatan bookmark target:

```bash
npx wrangler d1 time-travel restore DB --env production --bookmark <BOOKMARK>
```

Jangan menyimpan output yang berisi identifier akun atau data pribadi ke repository.
