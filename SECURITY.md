# Security Policy

## Supported versions

Security fixes are made on the `main` branch. Keep your installation up to date with
`sudo bash scripts/update.sh`.

## Reporting a vulnerability

**Please do not report security problems in public issues, discussions or pull
requests.**

Report them privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**. Include:

- the affected component (POS frontend, API endpoint, student ordering app, deploy scripts)
- steps to reproduce, or a proof of concept
- the impact you believe it has

You should receive an acknowledgement within a few days. Once the problem is confirmed,
a fix is prepared and released, and you are credited in the release notes unless you
prefer otherwise.

## Deployment security

Most installations are exposed to the internet, so check these on your own servers:

- Serve the POS only over HTTPS. Login cookies are Secure and will not work over HTTP.
- Keep `pos/.env` readable by root only (`chmod 600`), and never commit it.
- Keep ports 3001 (API), 5432 (PostgreSQL) and 6379 (Redis) closed to the internet.
  `deploy.sh` configures this with UFW or firewalld.
- Keep the nightly database backups, and copy them off the server.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full production checklist.
