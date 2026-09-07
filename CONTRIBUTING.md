# Contributing / Berkontribusi

[Bahasa Indonesia](#bahasa-indonesia) | [English](#english)

## Bahasa Indonesia

### Sebelum mulai

- Gunakan Node.js 22 atau lebih baru.
- Baca [panduan setup lokal](docs/setup.id.md) dan [Security Policy](SECURITY.md).
- Gunakan data dummy. Jangan commit credential, identifier pribadi, foto struk, atau transaksi nyata.
- Buat issue terlebih dahulu untuk perubahan besar agar scope dan trade-off dapat disepakati.

### Workflow

```bash
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Sebelum membuka pull request:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Migration bersifat forward-only. Jangan mengedit migration yang sudah pernah diterapkan. Gunakan Conventional Commits seperti `feat:`, `fix:`, `docs:`, dan `test:`.

## English

### Before you start

- Use Node.js 22 or newer.
- Read the [local setup guide](docs/setup.en.md) and [Security Policy](SECURITY.md).
- Use dummy data. Never commit credentials, personal identifiers, receipt images, or real transactions.
- Open an issue before a large change so its scope and trade-offs can be agreed upon.

### Workflow

```bash
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Before opening a pull request:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Migrations are forward-only. Do not edit a migration that has already been applied. Use Conventional Commits such as `feat:`, `fix:`, `docs:`, and `test:`.
