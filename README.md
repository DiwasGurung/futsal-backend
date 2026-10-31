# Futsal Tournament SaaS – Backend

Multi-tenant REST API (Node.js, Express, Prisma, Neon PostgreSQL, JWT, zod) for running futsal leagues and cups.
Built to be consumed by a Flutter app: an **admin/scorekeeper app** (authenticated) and a **fan app** (public endpoints).

## Quick start
```bash
npm install
# Configure DATABASE_URL, DIRECT_URL, and JWT_SECRET in .env (see below)
npm run prisma:generate
npm run migrate
npm run seed     # optional demo data
npm run dev      # http://localhost:5000/api/health
```
Or with Docker: `docker compose up --build` (set `DATABASE_URL` and `JWT_SECRET` in `.env`).

### Neon and Prisma
- Set `DATABASE_URL` to Neon's pooled connection string (hostname includes `-pooler`) for API traffic. The Prisma client enables PgBouncer compatibility and keeps the pool at 10 connections for this host.
- Set `DIRECT_URL` (or Neon's `DATABASE_URL_UNPOOLED`) to the matching unpooled/direct connection string for Prisma migrations. Use Neon Console's connection details and keep both URLs private.
- Run `npm run migrate` to apply checked-in Prisma migrations. `npm run migrate:dev` creates a migration during local schema development.
- `prisma/schema.prisma` is the Prisma model source. `src/db/schema.sql` remains available for the Neon SQL Editor and includes the standings view, constraints, and timestamp triggers. Its initial migration is idempotent, so `npm run migrate` also records the schema if it was first created in Neon Console.
- The API uses Prisma Client's parameterized raw-query and transaction APIs to preserve its existing SQL behavior, including the standings view and custom PostgreSQL queries.

Demo logins after seeding: `owner@demo.com` / `password123`, `scorer@demo.com` / `password123`

## Multi-tenancy
- `POST /api/auth/register` creates a new **organization** (tenant) + its owner.
- Every document carries `organization`; every authenticated query is scoped by `req.orgId` (see `utils/findOwned.js`).
- Roles: `owner` (everything) · `admin` (manage tournaments/teams/staff) · `scorekeeper` (run live matches only).
- Plans (`src/config/plans.js`): free / pro / enterprise limits on tournaments, teams per tournament, staff.
  Hook Stripe/Paddle webhooks to update `Organization.plan`.

## Endpoints (auth = `Authorization: Bearer <token>`)

### Auth & account
| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register | `{organizationName, name, email, password}` |
| POST | /api/auth/login | `{email, password}` → `{token, user, organization}` |
| GET | /api/auth/me | |
| PUT | /api/auth/password | `{currentPassword, newPassword}` |
| GET / PUT | /api/organization | profile, plan limits, usage (PUT: owner) |
| GET/POST/PUT/DELETE | /api/users | staff management (owner/admin) |

### Tournaments
| Method | Path | Notes |
|---|---|---|
| GET/POST | /api/tournaments | `format`: `league` \| `knockout` |
| GET/PUT/DELETE | /api/tournaments/:id | |
| POST | /api/tournaments/:id/fixtures | `{doubleRound?, startDate?, roundIntervalDays?, shuffle?, regenerate?}` |
| POST | /api/tournaments/:id/advance | knockout: build next round from winners |
| GET | /api/tournaments/:id/standings | league table |
| GET | /api/tournaments/:id/top-scorers | |

### Teams, players, matches
| Method | Path | Notes |
|---|---|---|
| GET/POST/PUT/DELETE | /api/teams (?tournament=) | teams locked once fixtures exist |
| GET/POST/PUT/DELETE | /api/players (?team=) | unique jersey number per team |
| GET | /api/matches | filters: tournament, team, status, round, from, to, page, limit |
| GET | /api/matches/:id | includes events |
| PUT | /api/matches/:id | schedule: `scheduledAt`, `court`, `status` |
| POST | /api/matches/:id/start | scorekeeper+ |
| POST | /api/matches/:id/events | `{type: goal\|own_goal\|yellow_card\|red_card, team, player, minute}` – score auto-updates |
| DELETE | /api/matches/:id/events/:eventId | |
| POST | /api/matches/:id/finish | knockout draws need `{penaltyHome, penaltyAway}` |
| POST | /api/matches/:id/reopen | admin: correct a finished match |

### Public (no auth – for the fan app)
```
GET /api/public/:orgSlug
GET /api/public/:orgSlug/tournaments
GET /api/public/:orgSlug/tournaments/:slug
GET /api/public/:orgSlug/tournaments/:slug/teams
GET /api/public/:orgSlug/tournaments/:slug/teams/:teamId
GET /api/public/:orgSlug/tournaments/:slug/standings
GET /api/public/:orgSlug/tournaments/:slug/matches
GET /api/public/:orgSlug/tournaments/:slug/matches/:matchId   (poll for live score)
GET /api/public/:orgSlug/tournaments/:slug/top-scorers
```
Draft tournaments are hidden from public endpoints.

## Typical flow
1. `register` → `POST /tournaments` → `POST /teams` (x N) → `POST /players`
2. `POST /tournaments/:id/fixtures` (league: all rounds; knockout: round 1 with auto byes)
3. Match day: `start` → `events` (goals/cards) → `finish`
4. Knockout: `POST /tournaments/:id/advance` after each round until the Final is finished.

## Responses
Success: `{ "success": true, "data": ..., "meta": {page, limit, total}? }`
Error: `{ "success": false, "message": "...", "details": [{field, message}]? }`

## Flutter notes
- Android emulator base URL `http://10.0.2.2:5000/api`; iOS simulator `http://localhost:5000/api`; real device `http://<PC-LAN-IP>:5000/api`.
- Android 9+ needs `android:usesCleartextTraffic="true"` for plain-HTTP dev, plus the `INTERNET` permission.
- Store the JWT with `flutter_secure_storage`; send it as `Authorization: Bearer <token>`.
- Use HTTPS in production.

## Next steps for a real SaaS
Stripe billing webhooks → `Organization.plan`; image uploads (S3/Cloudinary) for logos; WebSocket/SSE or FCM push for live scores; email invites/password reset; audit log; group-stage + knockout format.
