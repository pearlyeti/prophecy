# @prophecy/protocol

Shared types, Zod schemas, and tRPC router definitions used by all three apps. The single source of truth for the wire format between client, API, and game-server.

## Running checks

```sh
pnpm --filter @prophecy/protocol typecheck
pnpm --filter @prophecy/protocol build   # must pass before dependent apps build
```

## File layout

```
src/
  catalog.ts   # Zod schemas for card/deck/ability/effect catalog (card author types)
  events.ts    # Socket.io ClientToServerEvents + ServerToClientEvents + payload types
  router.ts    # tRPC router type (shared between apps/api and apps/web)
  schemas.ts   # Shared Zod schemas (LobbyState, LobbyMember, GameState wire format, etc.)
  server.ts    # tRPC server helpers
  trpc.ts      # tRPC instance + procedure builder
  index.ts     # Re-exports everything
```

## What goes here

- **Types that cross a process boundary.** If `apps/web` and `apps/game-server` both need to agree on a shape, define it here.
- **Zod schemas for the card catalog.** Card authors fill in `Ability` and `Effect` shapes — those live in `catalog.ts`.
- **Socket.io event payloads.** Add to `ClientToServerEvents` / `ServerToClientEvents` in `events.ts`.
- **tRPC procedure types.** The router type is defined here so the web client gets full type inference without a circular dependency.

## What does not go here

- Game rules or action validation — those live in `packages/game-engine`.
- Database schema — that lives in `packages/db`.
- UI components or server I/O — those live in their respective apps.

## Schema drift test

`packages/db` duplicates some enum value lists that drizzle-kit can't follow across package boundaries. A drift test in `packages/db/src/schema/__tests__/` asserts they stay in sync. If you add or rename an enum value in `protocol`, run the db tests to catch drift immediately.
