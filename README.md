# CafeFlow POS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

CafeFlow is a cafeteria point-of-sale and account management system for institutions
that run staff and student canteens across one or more branches. It has two apps:

- **POS** (`pos/`): the admin panel and cashier terminal, a React frontend served by nginx, backed by a
  Node.js/Express API with PostgreSQL, Redis and Socket.IO.
- **Student ordering** (`student-order/`): a small web app where students pre-order from
  today's menu and collect at the counter with an order ID.

## Features

- **POS checkout** charged to staff (monthly allowance) and consumer accounts, plus a
  **POS-N terminal** for direct sales to walk-in customers, with configurable payment methods.
- **Student pre-orders.** Orders placed in the student app are loaded into the POS-N cart
  by order ID (`YYYY-MM-DD-NNNN`), and a confirmation email goes to the student.
- **Accounts.** Staff and consumer management, bulk import, allowance resets, balance
  settlement, account statements (ledger) and emailed statements.
- **Menu** with categories, bulk import, a "today's menu" flag for student ordering,
  and optional AI category suggestions (Google Gemini).
- **Reports.** Dashboard, consumption reports, item sales report, transaction history
  and Excel exports.
- **Multi-branch** isolation: branch-scoped users and API keys only see their branch.
- **Users, roles and permissions**, with a full audit log.
- **Printing.** Direct TCP/IP (ESC/POS, port 9100) network printers per branch, or
  browser printing, with editable document templates (KOT, bill, receipt and others).
- **Email** through SMTP settings configured in the app, plus editable email templates.
- **Integration API** authenticated by API key for external systems (see [student-order/docs/API.md](student-order/docs/API.md)).

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS, Recharts, PWA (vite-plugin-pwa) |
| Backend | Node.js 20, Express 5, Socket.IO (Redis adapter for PM2 cluster mode) |
| Data | PostgreSQL 14+ (partitioned transaction/audit tables, materialized views), Redis 5+ |
| Ops | PM2 (cluster mode), nginx reverse proxy, `deploy.sh` installer |

## Quick start

### Production server

On a fresh Ubuntu/Debian/RHEL-family server, `deploy.sh` installs and configures
everything: Node.js 20, PostgreSQL, Redis, nginx, PM2, the firewall and daily backups.

```bash
git clone https://github.com/mk-manishkandel/cafeflow.git /opt/cafeflow
sudo bash /opt/cafeflow/deploy.sh
```

The installer asks for your domain and how HTTPS is provided: behind a proxy such as
Cloudflare, or a free Let's Encrypt certificate on the server. HTTPS is required,
because production login cookies are Secure. Then open the POS URL and create the
first admin account in the setup wizard. See [DEPLOYMENT.md](DEPLOYMENT.md) for manual
installation, updates, backups and troubleshooting.

### Local development

Requires Node.js 20, PostgreSQL 14+ and Redis.

```bash
git clone https://github.com/mk-manishkandel/cafeflow.git cafeflow && cd cafeflow

# Database: the full schema lives in one file
createdb cafeflow
psql -d cafeflow -f pos/server/schema.sql

# Configuration
cp pos/.env.example pos/.env        # set DB_*, secrets, TZ, CORS_ORIGIN=http://localhost:4000
                                    # and NODE_ENV=development for local HTTP

# POS: installs frontend + server (npm workspace)
cd pos && npm install
node server/index.cjs               # API on :3001
npm run dev                         # Vite dev server on :4000 (proxies /api to :3001)

# Student ordering app (optional)
cd ../student-order && npm install && npm run dev   # :5175, proxies /api to :3001
```

Useful scripts in `pos/`: `npm run build`, `npm run lint`, `npm run lint:fix`, `npm run format`.

## Repository layout

```
.
├── deploy.sh               # Server installer (fresh install / --rebuild)
├── ecosystem.config.cjs    # PM2 app definition (cafeflow-pos)
├── scripts/
│   ├── update.sh           # Zero-downtime update with automatic rollback
│   ├── setup-env.sh        # Interactive pos/.env generator
│   └── lib/common.sh       # Shared shell helpers
├── pos/                    # POS frontend (React/Vite) — builds to pos/dist
│   ├── .env.example        # Configuration template (server + Vite)
│   ├── components/ contexts/ hooks/ services/ constants/ utils/
│   └── server/             # Express API (npm workspace)
│       ├── index.cjs       # Entry point
│       ├── schema.sql      # Complete database schema
│       ├── routes/ controllers/ middleware/ jobs/ workers/ utils/
│       └── templates/      # Excel export templates, email templates
└── student-order/          # Student pre-ordering app (React/Vite)
    └── docs/API.md         # Integration API and student ordering API
```

## Documentation

| Document | Contents |
|----------|----------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Installation, configuration, TLS, updates, backups, production checklist, troubleshooting |
| [student-order/docs/API.md](student-order/docs/API.md) | Integration API (API key) and student ordering API |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and how to submit changes |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). To report
a security problem, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

[MIT](LICENSE) © 2026 Manish Kandel
