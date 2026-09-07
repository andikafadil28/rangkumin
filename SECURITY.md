# Security Policy / Kebijakan Keamanan

[Bahasa Indonesia](#bahasa-indonesia) | [English](#english)

## Bahasa Indonesia

### Versi yang didukung

Security fix diterapkan pada branch `main`. Repository ini belum memakai jadwal rilis atau dukungan versi lama formal.

### Melaporkan kerentanan

Jangan membuat issue publik untuk dugaan kerentanan. Gunakan **GitHub Security Advisories** melalui tab **Security → Advisories → Report a vulnerability** pada repository ini.

Sertakan langkah reproduksi, dampak, versi/commit, dan mitigasi sementara jika tersedia. Jangan menyertakan token, private key, email pengguna, foto struk, atau data finansial nyata.

Maintainer akan berusaha mengonfirmasi laporan awal dalam 7 hari dan memberikan pembaruan status dalam 14 hari. Waktu perbaikan bergantung pada severity dan kompleksitas.

### Scope utama

- bypass Cloudflare Access atau ownership guard;
- kebocoran data D1, cache, IndexedDB, atau export;
- penyalahgunaan Workers AI atau upload Scan Struk;
- Web Push spoofing, subscription takeover, atau kebocoran VAPID private key;
- SQL injection, XSS, CSRF, formula injection, dan supply-chain compromise.

## English

### Supported versions

Security fixes are applied to the `main` branch. This repository does not yet maintain a formal release or older-version support schedule.

### Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use **GitHub Security Advisories** through **Security → Advisories → Report a vulnerability** in this repository.

Include reproduction steps, impact, version/commit, and a temporary mitigation when available. Never include tokens, private keys, user email addresses, receipt images, or real financial data.

The maintainer will aim to acknowledge an initial report within 7 days and provide a status update within 14 days. Remediation time depends on severity and complexity.

### Primary scope

- Cloudflare Access or ownership-guard bypass;
- D1, cache, IndexedDB, or export data exposure;
- Workers AI or receipt-upload abuse;
- Web Push spoofing, subscription takeover, or VAPID private-key exposure;
- SQL injection, XSS, CSRF, formula injection, and supply-chain compromise.
