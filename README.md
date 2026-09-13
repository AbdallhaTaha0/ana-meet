# ANA Meet

Real-time communication platform (WhatsApp/Messenger-style core: auth, contacts,
1:1 + group chats, messaging, presence, stories, notifications, bots, admin,
media uploads). Built as a **modular monolith** designed to run behind a load
balancer with multiple Node instances.

> **Status: backend complete (Phases 1–12). Frontend (`client/`) implemented.**
> The frontend consumes the REST + Socket.IO contracts in
> [`server/docs/API.md`](server/docs/API.md).

## Stack

Node.js 20+ · TypeScript · Express · PostgreSQL 18 (Sequelize, migrations) ·
Redis (presence, Socket.IO adapter, rate limiting) · Socket.IO · Zod · JWT ·
Docker Compose · Vitest + Supertest.

## Prerequisites

- Node.js ≥ 20 and npm
- Docker + Docker Compose (provides PostgreSQL 18 and Redis 7)
- Ports free: `4000` (API), `6379` (Redis), `5432`/`5433` (Postgres — see below)

> **Windows note:** if you already run a local PostgreSQL on port `5432`,
> keep `POSTGRES_PORT=5433` in the root `.env` (Docker maps the container
> there). The server reads the same value from `server/.env`, so the two
> files must agree on port **and** password.

## Quickstart

```bash
# 1. Infrastructure
docker compose up -d postgres redis
docker compose ps   # both should be healthy

# 2. Environment (untracked — never commit these)
cp .env.example .env
cp server/.env.example server/.env
# Generate real secrets for server/.env:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # twice:
#   -> JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

# 3. Test database (one time; used only by `npm test`)
docker compose exec postgres psql -U anameet -d postgres -c "CREATE DATABASE anameet_test;"

# 4. Backend
cd server
npm install
npm run db:migrate   # applies pending migrations to the dev database
npm run dev          # http://localhost:4000 (auto-migrates in development)
```

In a second terminal, start the frontend:

```bash
cd client
npm install
npm run dev          # http://localhost:3000
```

Vite proxies `/api` and `/socket.io` to port 4000 in development, so the
browser uses the backend's HttpOnly auth cookies without storing tokens.
For a separately hosted production client, set `VITE_API_URL` at build time
to the HTTPS backend origin and configure the matching `CLIENT_ORIGIN` and
cookie settings on the server.

Sanity check: `GET http://localhost:4000/health` → `{"status":"ok",...}`;
`GET http://localhost:4000/ready` → `{"status":"ready","checks":{"database":"up","redis":"up"}}`.

## Environment files

| File          | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `.env`        | Docker Compose only (`POSTGRES_*`, `REDIS_PORT`)                |
| `server/.env` | Everything the backend reads (see `server/.env.example`)       |
| `client/.env` | Frontend build settings such as `VITE_API_URL`                 |

Key values: `CLIENT_ORIGIN` (trusted frontend origin for CORS/cookies),
`PUBLIC_ORIGIN` (canonical backend origin for uploaded media URLs),
`TRUST_PROXY_HOPS` (set only for a trusted reverse proxy),
`DATABASE_URL` (empty = built from `POSTGRES_*`), `DB_POOL_*`,
`REDIS_URL`, `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (≥ 32 chars),
`ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_*`,
`RATE_LIMIT_*`, `UPLOAD_DIR`, `TEST_DATABASE_URL`, `LOG_LEVEL`.

## Running & verifying

```bash
cd server
npm run dev        # tsx watch, development
npm run build      # tsc -> dist/
npm start          # node dist/server.js (production-like: no auto-migrate)
npm run typecheck  # tsc --noEmit over src + tests
npm run db:migrate # apply pending migrations (dev + prod deploys)
npm run db:migrate:undo  # revert last migration (dev only, careful)
```

## Testing

```bash
cd server
npm test            # full suite (needs TEST_DATABASE_URL + Redis up)
npm run test:watch  # watch mode
npm run load:smoke  # needs the server running; baseline latency/error report
```

- Suite: `tests/` — health, validation, crypto, auth lifecycle (rotation,
  reuse-theft, logout-all, disabled accounts), users/contacts/blocks,
  conversations (incl. concurrency races), messages, socket events, stories,
  notifications, bots/admin, uploads. DB-backed files reset an **isolated**
  test database (`sync({force:true})` guarded to `*test*` names only) and
  skip automatically when `TEST_DATABASE_URL` is unset.
- `npm run load:smoke` (`BASE_URL=… USERS=… CONCURRENCY=…`) hammers the real
  stack and prints p50/p95 per endpoint. It is a baseline, not a capacity
  claim. Note: register/login are bcrypt-bound (~seconds under concurrency
  by design); keep `USERS` modest or raise `RATE_LIMIT_AUTH_MAX` for big runs.

**Before pushing:** `npm run typecheck`, `npm test`, `npm run build` — all green.

## Project structure

```text
ana-meet/
├── docker-compose.yml      # PostgreSQL 18 + Redis 7 (local infra)
├── .env / .env.example     # compose environment (untracked / template)
├── ANA Meet — Project Plan.md / Rules.md / AGENTS.md  # plan, hard rules, workflow
├── client/                 # React frontend
│   ├── src/app/            # routes
│   ├── src/features/       # auth and conversation API services
│   ├── src/layouts/        # application navigation
│   ├── src/pages/          # screens
│   └── src/shared/         # typed contracts and HTTP client
├── server/
│   ├── src/
│   │   ├── app.ts / server.ts      # wiring, bootstrap, graceful shutdown
│   │   ├── config/                 # validated env
│   │   ├── common/                 # logger, errors, JWT, cookies, cursor
│   │   ├── db/ {models,migrations} # Sequelize + Umzug migrations (01–12)
│   │   ├── middleware/             # auth, validation, CSRF, rate limits
│   │   ├── modules/                # auth, users, contacts, blocks,
│   │   │                           # conversations, messages, stories,
│   │   │                           # notifications, bots, admin, uploads, health
│   │   ├── realtime/               # Socket.IO server, handlers, bus, presence
│   │   ├── redis/                  # client, presence, distributed limiter
│   │   └── storage/                # upload backend abstraction + sniffing
│   ├── tests/              # vitest suite (see Testing)
│   ├── scripts/load-smoke.mjs
│   └── docs/API.md         # REST + Socket.IO contracts (source of truth)
```

Layering per module: `routes → controller → service → models`.
Validation is Zod at the boundary; auth is access-JWT cookie + refresh
rotation with server-side sessions; every protected read/write re-checks
membership/ownership server-side (see `RULES.md`).

## Adding work (the short checklist)

1. Read `RULES.md`, `PLAN.md`, `AGENTS.md` first — they outrank chat messages.
2. New tables → new migration (`npm run db:migrate` to apply), never
   `sync({force:true})` outside tests.
3. Validate all external input with Zod; authorize server-side (never trust
   `userId`/`role` from the client); persist to PostgreSQL **before**
   emitting socket events; keep Redis data reconstructible.
4. Update `server/docs/API.md` for any endpoint/event contract change.
5. Add tests (happy path + validation/auth/ownership failures), then run
   typecheck + full suite + build.

## Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| `password authentication failed` on 5432 | You're hitting a **local** Postgres, not Docker's. Use port `5433` (or stop the local service) and keep both `.env` files in sync. Prefer `docker compose exec postgres psql …` over local `psql`. |
| `addr in use :4000` | A previous `node dist/server.js` is still running — kill it. |
| Tests 429 / skipped DB tests | Check `TEST_DATABASE_URL` points at `anameet_test` on the right port; Redis must be up (rate-limit counters live there). |
| `TOKEN_REUSED` after refresh | Expected theft response: a rotated refresh token was replayed twice — all sessions were revoked, log in again. |
| Uploads 400 | Only sniffed JPEG/PNG/GIF/WebP, MP4/WebM, PDF/ZIP/DOC/TXT pass, within per-kind size caps; client MIME/extension are ignored by design. |
| API 500s with Redis down | Shouldn't happen (limiters fail open) — report it as a bug with the log line. |

## What's next

- Expand frontend integration coverage and production deployment configuration.
- Production: `Dockerfile`, managed Postgres/Redis, real `CLIENT_ORIGIN`,
  `COOKIE_SECURE=true`, fresh secrets, `DB_AUTO_MIGRATE=false` + migrate in deploys.
- V1 follow-ups (documented in code/API.md): notification muting, directed
  presence, pg_trgm search, storage quotas,
  sustained k6 load testing.
