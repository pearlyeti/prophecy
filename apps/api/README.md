# apps/api

HTTP + tRPC API server. Hono host with tRPC mounted for typed web↔api calls and a thin REST surface for third parties (Stripe webhooks, OAuth callbacks). BullMQ workers run in-process.

## Running locally

```sh
# From repo root:
pnpm --filter @prophecy/api dev

# Or from this directory:
pnpm dev
```

Requires env vars (copy from `../../.env.example`). Key ones:
- `DATABASE_URL` — Postgres connection string
- `BETTER_AUTH_SECRET` — session signing key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — OAuth
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — payments

## File layout

```
src/
  index.ts      # Hono app, tRPC mount, route registration
  context.ts    # tRPC context (db, session, user)
  workers/
    index.ts    # BullMQ worker registrations
```

## What belongs here

- **Account and session management** — auth via `better-auth`, user profiles.
- **Collection and deck CRUD** — reading/writing player-owned data to Postgres via Drizzle.
- **Storefront** — Stripe checkout sessions, webhook handlers, entitlement fulfillment.
- **Season pass and currency ledger** — soft-currency transactions, reward claiming.
- **Ladder and tournament queries** — standings, match history, bracket reads.
- **Matchmaking queue workers** — extract to `apps/matchmaker` if load demands it.
- **Admin endpoints** — role-gated; surfaced through `apps/web` admin pages.

## What does not belong here

- **Game rules or action validation** — those live in `@prophecy/game-engine`.
- **Live game state** — that lives in `apps/game-server` (and Redis/Postgres via `apps/game-server`).
- **Real-time socket communication** — that's `apps/game-server`.

## Adding a tRPC procedure

1. Define the procedure in `src/index.ts` (or extract to a router file if the domain grows).
2. The router type is exported from `packages/protocol/src/router.ts` — update it so the web client gets type inference.
3. Add the procedure to the context in `src/context.ts` if it needs db/auth access.
