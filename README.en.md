# Rangkumin

**English** | [Bahasa Indonesia](README.md)

A web/PWA finance application for couples to track income, expenses, savings, budgets, reminders, and data portability. It runs serverlessly on Cloudflare Workers + Static Assets, with D1 as the source of truth.

- Official production: <https://rangkumin.dikadevit.my.id> (private access for two users)
- Core license: [MIT](LICENSE)
- Setup/support services: [Commercial Services](COMMERCIAL.md)
- Donations: <https://buymeacoffee.com/dikadev>

## Active features

- **Transactions and categories** — income, expenses, savings mutations, default/custom categories, filters, pagination, Trash, and backend ownership guards.
- **Receipt Scan** — Workers AI turns JPEG/PNG/WebP images into drafts that require confirmation; images are resized, stripped of EXIF, and never persisted.
- **Dashboard and Web Push** — partner transaction, reminder, and budget-threshold notifications using VAPID and a delivery outbox.
- **Savings** — personal/shared goals, optional targets, deposits, withdrawals, and atomic transfers without negative balances.
- **Budgets and reminders** — recurrence, personal/shared recipients, thresholds, completion, snooze, and record-as-expense actions.
- **Import/Export** — per-domain CSV and full Excel exports; imports include preview, mapping, validation, duplicate detection, and atomic commit.
- **PWA and offline** — installable app, last-known snapshot, offline transaction outbox, retries, and idempotency keys.
- **Responsive interface** — Together/Me views and Together, Calm, or Minimal themes.

Google Sheets and Telegram are **not available** in the active release. They are only optional candidates for future add-ons or updates.

## Setup documentation

### Step-by-step beginner guides

| Language   | Markdown                                                        | PDF                                                                              |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| English    | [Beginner installation guide](docs/installation-beginner.en.md) | [Download English beginner PDF](docs/pdf/rangkumin-installation-beginner-en.pdf) |
| Indonesian | [Panduan instalasi pemula](docs/installation-beginner.id.md)    | [Unduh PDF pemula Indonesia](docs/pdf/rangkumin-installation-beginner-id.pdf)    |

The beginner guides start with installing Node.js and Git, continue through local usage and click-by-click Cloudflare configuration, and finish with troubleshooting.

### Technical guides

| Language   | Markdown                                     | PDF                                                     |
| ---------- | -------------------------------------------- | ------------------------------------------------------- |
| English    | [Local + Cloudflare setup](docs/setup.en.md) | [Download English PDF](docs/pdf/rangkumin-setup-en.pdf) |
| Indonesian | [Setup lokal + Cloudflare](docs/setup.id.md) | [Unduh PDF Indonesia](docs/pdf/rangkumin-setup-id.pdf)  |

The guides cover local setup, D1, Cloudflare Access, custom domains, VAPID Web Push, Workers AI, deployment, schedules, and production smoke testing.

## Local quick start

Requirements: Node.js 22+, npm, and Git.

```bash
git clone https://github.com/andikafadil28/rangkumin.git
cd rangkumin
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

In a second terminal:

```bash
npm run dev:frontend
```

Open <http://localhost:5173>. See the [English setup guide](docs/setup.en.md) for development authentication and optional features.

## Cloudflare deployment

A new deployment requires your own resources: a Worker, two D1 databases (development/production), a custom domain, Cloudflare Access, Workers AI, and a VAPID key pair. Do not reuse database IDs or domains from the official installation.

High-level flow:

```bash
npx wrangler login
# Create D1 and replace resources/domain in wrangler.jsonc
npm run db:migrate:production
npm run db:provision:production -- --apply
npm run build
npx wrangler deploy --env production
npm run access:secrets:production -- --apply
npm run webpush:secrets:production -- --apply
```

Follow the [complete deployment guide](docs/setup.en.md#4-cloudflare-production-setup). Never expose the development environment publicly because it uses a dummy identity header; production must be protected by Cloudflare Access.

## Quality gate

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Last verified snapshot: **106 Worker tests + 43 frontend tests = 149 tests**.

Regenerate PDFs using Chrome, Edge, or Chromium:

```bash
npm run docs:pdf
```

## Structure

```text
src/                  Worker routes, services, schemas, middleware
frontend/src/         React UI, PWA, offline, and Web Push client
migrations/           Forward-only D1 migrations
seeds/                Dummy development data
tests/                Worker tests
frontend-tests/       Frontend tests
docs/                 Bilingual setup and operations guides
scripts/              Provisioning, secret setup, and PDF generator
public/               Static build served by the Worker
```

## Status and roadmap

- Phases 1–9 and Phase 11 are complete; Phase 10 Google Sheets is deferred.
- Phase 12 documentation, open-source readiness, CI, and security auditing are complete.
- Production residuals: two-user smoke testing, physical-device Web Push, PWA/offline reload, in-depth accessibility, and frontend E2E.
- Future update candidates: Google Sheets reporting/mirror and Telegram integration as optional add-ons. No timeline is promised.

## Security

Do not open a public issue for a vulnerability or share real financial data. Follow [SECURITY.md](SECURITY.md) and use GitHub Security Advisories.

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). The Rangkumin core is available under the [MIT License](LICENSE), including commercial use. Setup, support, custom branding, managed services, and private add-ons may be offered separately without reducing MIT rights to the core.
