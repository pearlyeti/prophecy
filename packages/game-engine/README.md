# @prophecy/game-engine

Pure, deterministic rules engine. No I/O, no network, no wall-clock reads. Given the same seed and the same sequence of actions, it always produces the same result.

## Running tests

```sh
pnpm --filter @prophecy/game-engine test        # run once
pnpm --filter @prophecy/game-engine test --watch # watch mode
pnpm --filter @prophecy/game-engine typecheck
```

All 175+ tests must be green before merging any engine change.

## File layout

```
src/
  actions/       # One file per action type. Each exports an apply* function.
  abilities/
    types.ts     # Ability / Effect TypeScript type system (all kinds + ops)
    dispatch.ts  # applyEffect / applyEffects dispatcher
  queue/
    scan.ts      # Maps engine events → triggered ability matches
    drain.ts     # FIFO queue drain loop
    types.ts     # QueueEntry and related types
  reducers/
    apply-action.ts  # Top-level applyAction dispatcher — routes to actions/*
  state/
    types.ts     # GameState, PlayerState, DieInPool, Action union — load this first
    new-game.ts  # newGame / newGameFromDecks factories
    legal-actions.ts  # getLegalActions — pure read-only inspector
    combat.ts    # Shared damage / shield helpers
    draw.ts      # drawCards helper
    turn.ts      # endTurn / rotateAndCascade
  rng/
    seeded-rng.ts  # Mulberry32 + FNV-1a seeded RNG
  events.ts      # EngineEvent discriminated union
  index.ts       # Public API surface

  __tests__/     # Vitest test files — one per action/feature
  __fixtures__/  # Test-only data (never imported from non-test paths)
    synthetic-set/   # Original test fixtures
    reference-set/   # Third-party-derived mechanical data (see IP rules)
```

## Adding a new action

1. Create `src/actions/your-action.ts` — export `applyYourAction(state, ...): ApplyResult`.
2. Add the action shape to the `Action` union in `src/actions/types.ts`.
3. Wire it into the `switch` in `src/reducers/apply-action.ts`.
4. Update `getLegalActions` in `src/state/legal-actions.ts` if the action has legality conditions.
5. Add tests in `src/__tests__/your-action.test.ts`.

## Adding a new ability op

1. Add the op type to `src/abilities/types.ts` (Effect union).
2. Add a matching Zod schema in `packages/protocol/src/catalog.ts`.
3. Implement the dispatch case in `src/abilities/dispatch.ts`.
4. Update `apps/web/src/routes/designer/AbilityBuilder.tsx` in the same commit (non-negotiable — see CLAUDE.md).
5. Check the op off in `ROADMAP.md` → Ability op status.

## Determinism rules

- **No `Math.random()`** — use the seeded RNG (`createRng`, fork per action via a stable key).
- **No `Date.now()` or `performance.now()`** — wall-clock reads break replay.
- **No iteration over unordered structures** — always iterate `playerOrder`, `characterOrder`, or explicitly sorted arrays; never raw `Map`/`Set` iteration where order affects outcome.
- **No network or filesystem access** — the engine is a pure function.

Breaking any of these makes the game unreplayable from its seed + event log. Surface it to the user if you think you need to.

## Fixture rules

Files under `__fixtures__/` are test-only. Never import them from `src/` outside of `__tests__/` paths. Never bundle them into production builds. See CLAUDE.md § Reference data & test fixtures for the full IP policy.
