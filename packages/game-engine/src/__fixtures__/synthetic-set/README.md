# synthetic-set fixtures

A 140+ card corpus of **original procedurally-generated fixtures** used to exercise the engine. Every entry is minted from abstract templates by [generate.ts](./generate.ts); no third-party card data is ingested at any step.

Loaded only by tests under `__tests__/`. Excluded from production bundles by `tsconfig.build.json` and the working-agreement rule in `CLAUDE.md`.

## What's in here

- [schema.ts](./schema.ts) — Zod schemas for `CardFixture` and the ability AST.
- [generate.ts](./generate.ts) — the generator. Seeded — reproducible output.
- [cards.json](./cards.json) — committed output. Regenerate with `pnpm --filter @prophecy/game-engine fixtures:generate`.

## What's allowed in this directory

- Procedurally-generated cards keyed on abstract templates.
- Mechanical structure: dice profiles, cost / health / points, type / faction / color / rarity, ability AST shape, keyword presence.
- Generic identifiers (`CHAR_001`, `UPG_001`, etc.).
- Abstract subtypes (`Alpha`, `Beta`, …).

## What's **not** allowed

- Third-party card titles, prose, or artwork.
- Any data derived 1:1 from an external dataset, even with substitutions.
- Imports from non-test paths.

See [Reference data & test fixtures](../../../../../README.md#reference-data--test-fixtures) and [Working agreement #5](../../../../../README.md#working-agreements).
