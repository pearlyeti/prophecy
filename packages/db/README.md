# @prophecy/db

Drizzle ORM schema, generated client, and migration tooling. Shared by `apps/api` and `apps/game-server`.

## Common commands

```sh
pnpm --filter @prophecy/db generate   # generate a new migration from schema changes
pnpm --filter @prophecy/db migrate    # apply pending migrations to the database
pnpm --filter @prophecy/db seed       # seed reference data (run after migrate)
pnpm --filter @prophecy/db studio     # open Drizzle Studio in the browser
pnpm --filter @prophecy/db typecheck
```

Migrations require a running Postgres. See `infra/docker-compose.yml` for the local dev stack.

## File layout

```
src/
  schema/
    enums.ts    # Postgres enum definitions (faction, color, card type, etc.)
    cards.ts    # cards, card_abilities, card_dice tables
    decks.ts    # decks, deck_characters, deck_cards tables
    users.ts    # users table
    index.ts    # re-exports all tables + enums
    __tests__/  # drift test: protocol enums == db enums
  index.ts      # exports the Drizzle db instance + all schema
  migrate.ts    # migration runner (called by `pnpm migrate`)
  seed.ts       # reference data seeder

migrations/
  0000_deep_stellaris.sql   # initial schema
  meta/                     # drizzle-kit metadata
```

## Adding a schema change

1. Edit the relevant file in `src/schema/`.
2. Run `pnpm --filter @prophecy/db generate` — drizzle-kit creates a new migration file.
3. Review the generated SQL before committing.
4. Update `README.md#database-schema-overview` in the top-level README in the same commit.
5. Run `pnpm --filter @prophecy/db migrate` against your local Postgres to verify it applies cleanly.

## Enum drift

Some enum values are duplicated in `packages/protocol/src/catalog.ts` (drizzle-kit cannot follow cross-package imports). The drift test in `src/schema/__tests__/` catches any mismatch. If you add or rename an enum value, update both files and confirm the test passes.

## Never import from non-app paths

`packages/db` exposes a database client that opens a real connection. Never import it from `packages/game-engine` (pure, no I/O) or `packages/protocol` (types only). Only `apps/api` and `apps/game-server` may import from this package.
