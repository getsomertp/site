# GETSOME (Vite + Express + Postgres)

Production-ready baseline for a single-port SPA + API deployment:
- **Client:** Vite + React
- **Server:** Express (sessions + Passport)
- **DB:** Postgres via Drizzle ORM (plus connect-pg-simple sessions)

## Requirements

- Node.js 20+ recommended
- Postgres 14+

## Environment

Copy `.env.example` → `.env` and set values.

Minimum required for a safe boot:

- `DATABASE_URL`
- `SESSION_SECRET` (min 16 chars)
- `ADMIN_SECRET` (recommended; required to use `/api/admin/login`)
- (Optional) Discord OAuth: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_CALLBACK_URL`

If your Postgres provider requires TLS, set:

- `DATABASE_SSL=true`

If you're on a small DB plan, reduce connections:

- `PG_POOL_MAX=5`

## Local development

### 1) Start Postgres
Use your own Postgres or run:

```bash
docker compose up -d db
```

### 2) Install deps

```bash
npm install
```

### 3) Create DB schema + seed (optional)

```bash
npm run db:bootstrap
npm run db:push
npm run db:seed
```

### 4) Run the server (API + SPA dev middleware)

```bash
npm run dev
```

Or run the client-only dev server:

```bash
npm run dev:client
```

## Production build

```bash
npm run build
npm run start
```

Notes:
- `npm run start` runs **db bootstrap + schema push** before starting the app.
  If you prefer migrations, replace `db:push` with a migration workflow.

## Health check

- `GET /api/health` → `{ ok: true, ... }`

## Docker

Build and run locally:

```bash
docker build -t getsome .
docker run --rm -p 5000:5000 --env-file .env getsome
```

## Security hardening checklist

Before going live:
- Set a strong `SESSION_SECRET` and `ADMIN_SECRET`
- Put the app behind HTTPS (cookies are `secure` in production)
- Consider adding a strict CSP once your asset sources are finalized
- Restrict admin access (allowlist IPs / VPN) if possible
- Configure backups and DB credentials rotation

## SEO checklist

Update these files for your real domain/brand:
- `client/index.html` (title/description)
- `client/public/robots.txt`
- `client/public/.well-known/security.txt`
- `client/public/opengraph.jpg`
