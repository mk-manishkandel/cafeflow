# Contributing to CafeFlow

Thanks for your interest in improving CafeFlow. Bug reports, fixes, documentation and
features are all welcome.

## Reporting bugs and asking for features

Open an issue with:

- what you did, what you expected, and what happened instead
- your setup (OS, Node.js and PostgreSQL versions, installed with `deploy.sh` or manually)
- relevant log lines from `pos/server/logs/` or `pm2 logs cafeflow-pos`, with passwords,
  tokens and personal data removed

**Security problems** go through [SECURITY.md](SECURITY.md), not public issues.

## Development setup

Follow [Local development](README.md#local-development) in the README. In short: Node.js 20,
PostgreSQL 14+ and Redis; apply `pos/server/schema.sql` to an empty database; copy
`pos/.env.example` to `pos/.env` with `NODE_ENV=development`; then run the API
(`node server/index.cjs`) and the Vite dev server (`npm run dev`) from `pos/`.

## Making changes

- **Database changes go in `pos/server/schema.sql`.** It is the single definition of the
  database, and every install and update re-applies it, so each statement must be safe
  to run again: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, or a `DO $$ ... $$` block that checks before changing
  something. Files placed anywhere else are not run.
- **Configuration.** New environment variables need a line and a short comment in
  `pos/.env.example`, and an entry in the configuration table in
  [DEPLOYMENT.md](DEPLOYMENT.md).
- **Deploy scripts** (`deploy.sh`, `scripts/`) must stay safe to re-run on an existing
  install: never regenerate passwords or secrets that are already in `pos/.env`.
- **Keep secrets out of the repository.** Never commit `pos/.env`, database dumps, API
  keys or real customer data. The repository is public.
- Match the style of the surrounding code.

## Before opening a pull request

From `pos/`:

```bash
npm run lint           # ESLint
npm run format:check   # Prettier
npm run build          # type-checks and builds the frontend
```

There is no automated test suite yet, so describe how you tested the change: the steps
you followed in the running app, and the database or API calls you checked.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep each pull request focused on one change.
3. Explain what changed and why. Link the issue it fixes, if any.
4. Note anything a server operator must do, for example a new `.env` variable.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
