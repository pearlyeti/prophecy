# Roadmap

System of record for what's built, what's in flight, and what's next. Updated in the same change that adds or finishes scope.

### How to pick up a task card

Each entry under **Up next** is a self-contained card sized for a **single agent handoff** (~200–500 lines of changes including tests, one focused session). The structure lets a fresh agent context start cheaply: the card lists exactly what to build, which files to load, what's out of scope, and how to verify it's done.

Process:

1. Pick one unclaimed card from **Up next**. Move it to **In progress** with the date and your handle.
2. Read only the files under **Context to load** — the card has already pre-selected what matters. Don't grep the codebase for general "understanding"; the card is the contract.
3. Stay strictly inside **Scope**. If you find work that doesn't fit, surface it and propose a new card — don't bundle it in.
4. Run **Done when** checks before claiming completion: typecheck, tests, lint as listed.
5. Move the card from **In progress** to **Done** with today's date, a one-line summary, and the commit hash if you committed.
6. If a card's premise is wrong (missing dependency, design needs revisiting), stop and flag it. Don't push through and silently redefine scope.

Dependencies between cards are noted under **Depends on**. If a card lists one, finish the dependency first or pick a different card.

Cards are coded by area: `ENGINE-N` (game-engine), `WEB-N` (apps/web), `SERVER-N` (apps/game-server), `API-N` (apps/api + packages/db), `OPS-N` (infra, CI, deploy).

### In progress
- _(none — claim a card from Up next.)_

### Up next — task cards

#### ENGINE-5 — Modifier-with-parent enforcement in `resolve-dice`
**Why now.** Rules require: a `+N` modifier die can only resolve alongside a non-modifier die of the same symbol. Currently `resolve-dice` accepts modifier-only selections silently. Small, contained fix.

**Scope.**
- In `applyResolveDice`, after collecting the selected dice, reject the action (throw `IllegalActionError`) if the selection contains a modifier die whose symbol has no non-modifier counterpart also in the selection.
- This is per the rules: "A modifier die only contributes to a resolution that already includes a non-modifier of its symbol."
- Card-routed resolution (e.g. an ability that pulls in any die showing X) should not change here — leave that door open for a future ability-AST card.

**Context to load.**
- `packages/game-engine/src/actions/resolve-dice.ts`
- `packages/game-engine/src/__tests__/resolve-dice.test.ts`
- `docs/rules-reference.md` (Part 4: Modifiers)

**Out of scope.** New resolution paths. Card-routed resolution overrides. Just enforce the rule on the canonical action.

**Done when.** Typecheck clean. New tests: melee+1 modifier alone throws; melee+1 modifier alongside a melee non-modifier resolves combined value; pure non-modifier resolutions unchanged.

---

#### ENGINE-6 — Ability AST: schema, first effects, immediate-event dispatcher
**Why now.** Cards currently cost resources to play but have no effects. Before card content can land, we need a structured ability AST and a dispatcher that interprets it. The Zod schema in `@prophecy/protocol` is intentionally `.passthrough()` today (only `kind` required); this card replaces it with concrete shapes for the first wave of effects.

**Scope.**
- Tighten `abilityAstSchema` in `packages/protocol/src/schemas.ts` from passthrough to a discriminated union of concrete `kind` values (start with `immediate` for play-then-discard events).
- Define the `Effect` AST shape (discriminated on `op`) covering the first wave of effect ops — pick names that fit existing engine helpers (`actions/resolve-dice.ts`: `dealDamage`, `addShields`, `adjustResources`; `state/draw.ts`: `drawCards`). The dispatcher composes those helpers rather than re-implementing them.
- Create `packages/game-engine/src/abilities/` (new directory): `types.ts` mirroring the protocol types and `dispatch.ts` exposing `applyEffect(state, ctx, effect) → { state, events }`.
- Wire dispatcher invocation into `applyPlayCard` — when an event-type card resolves, run its `effect[]` array sequentially.
- Author ability ASTs on a few synthetic-set `EVT_*` fixtures (current `abilities: []` arrays are all empty) so an end-to-end "play event → damage lands" test can run.

**Context to load.**
- `packages/protocol/src/schemas.ts` (`abilityAstSchema`, currently passthrough)
- `packages/db/src/schema/cards.ts` (`card_abilities` table uses `AbilityAst`)
- `packages/game-engine/src/actions/play-card.ts`
- `packages/game-engine/src/actions/resolve-dice.ts` (`dealDamage`, `addShields`, `adjustResources` helpers to compose)
- `packages/game-engine/src/state/draw.ts` (`drawCards`)
- `packages/game-engine/src/__fixtures__/synthetic-set/cards.json` (current ASTs are `[]`; fill in a handful)

**Out of scope.** The queue, triggered abilities (before / after), replacement effects ("instead"), targeting prompts that need a follow-up user interaction. Immediate, fully-resolved-on-play events only — that gates ENGINE-7's queue work cleanly.

**Depends on.** ENGINE-2.

**Done when.** Typecheck clean. New `dispatch.test.ts` covers each first-wave op against a synthesized state. New integration test: play an `EVT_*` fixture whose AST deals damage and assert the damage lands on the target. Protocol schema drift test passes (`packages/db` mirror still matches).

---

#### ENGINE-7 — The queue, after-triggers, before-triggers
**Why now.** "After" and "Before" triggers make the game interactive — events fire when other events resolve, characters react when activated, damage is interrupted by Guardian, etc. The queue is what orders all of this. The scaffolding (`packages/game-engine/src/queue/types.ts`) is in place but nothing reads or writes it yet.

**Scope.**
- Wire the existing `Queue` type into `GameState` (currently absent — `state/types.ts` has no queue field).
- Identify the canonical engine events that can trigger abilities — character activation, damage dealt, card played, etc. — and add `before` / `after` interception points in their handlers (`activate.ts`, `resolve-dice.ts`, `play-card.ts`). Each interception scans cards in play whose ability AST matches the trigger.
- After-abilities enter the queue at the tail; before-abilities resolve inline and interrupt; both share the same matching logic.
- Implement simultaneous-ability tiebreak per [README → Engine implementation notes](../README.md#engine-implementation-notes) and [rules-reference §Part 7 → Triggered abilities](../docs/rules-reference.md): if multiple triggers fire at the same instant, the player resolving orders their own; if multiple players have simultaneous triggers, the battlefield controller orders them.
- Sequencing: only run the queue between actions — within a single action, after-triggers buffer; once the action's effects finish, drain the queue.

**Context to load.**
- `packages/game-engine/src/queue/types.ts` (existing `Queue`, `QueueEntry`)
- `packages/game-engine/src/state/types.ts` (`GameState` — needs `queue` field)
- `packages/game-engine/src/actions/activate.ts`, `resolve-dice.ts`, `play-card.ts` (where interception lands)
- `docs/rules-reference.md` Part 7 → "The queue" (§p. 526) and "Triggered abilities" (§p. 598+)
- README → "Engine implementation notes" (queue / before / after / simultaneous tiebreak)

**Out of scope.** Replacement effects ("instead" / "would be") — those interceptors run *before the event commits at all* and are their own card. Additional-action handling (Ambush) — see ENGINE-4. AST shape for triggered abilities is assumed defined by ENGINE-6.

**Depends on.** ENGINE-6 (needs trigger / effect AST shape), ENGINE-4 (additional-actions outside the queue must already work).

**Done when.** Typecheck clean. Tests: (a) a before-trigger interrupts and modifies a damage event; (b) two after-triggers from the same player resolve in the order the player chose; (c) two after-triggers from different players resolve in the order the battlefield controller chose; (d) an after-trigger spawned mid-resolution still resolves at the queue's tail.

---

#### SERVER-1 — Reconnect window
**Why now.** Players drop connection (subway, app backgrounded). Without a rejoin window, every drop ends the game.

**Scope.**
- In `apps/game-server/src/rooms.ts` (or wherever the room registry lives): on disconnect, mark the player as "away" instead of removing them. Start a 60-second timer; if they don't rejoin, end the game with the still-connected player as winner.
- On rejoin (same `playerId` + `roomId` + `code`), send a full state snapshot + the recent event log so the client can resync.
- Persist `playerId` + `roomId` + `code` in localStorage already happens — verify and reuse.
- Cleanup: existing idle-room TTL still applies once the game has ended.

**Context to load.**
- `apps/game-server/src/rooms.ts`
- `apps/game-server/src/index.ts` (socket lifecycle hooks)
- `apps/web/src/socket.ts` and `apps/web/src/state/app.ts` (client rejoin)

**Out of scope.** Spectator reconnection. Cross-server room handoff (Redis-backed sticky ownership is its own card). Just same-server, same-process rejoin.

**Done when.** Typecheck clean. Manual smoke: in a live 2-device match, kill one device's network for 30 sec, restore, game continues. Kill it for >60 sec, the remaining player wins.

---

#### SERVER-2 — FIFO matchmaking queue (corpus-deck MVP)
**Why now.** Every match today requires one player to host a lobby and the other to type the invite code. To exercise the engine across more sessions per minute (and to validate the queue plumbing before MMR work lands), we want a "Find Match" button that pairs two players automatically.

**Scope.**
- In-memory FIFO queue inside `apps/game-server` (a `Map<playerId, { joinedAt, deckId }>`); Redis-backed durability is out of scope until multi-instance.
- Accept a `lobby.findMatch` socket event with `{ playerId, displayName, deckId }`. Two players in the queue → pop, create a room (re-use `createRoom` + `startRoom`), and emit `lobby.matchFound` to both.
- For now `deckId` is one of the corpus deck ids exposed by `corpus.ts` (`DECK_A` or `DECK_B`). The DB / `apps/api`-served deck path lands once API-1 unblocks and a real deck-fetch endpoint exists (separate card).
- A matching `lobby.leaveQueue` event (and a disconnect handler) for the impatient player.

**Context to load.**
- `apps/game-server/src/rooms.ts` (`createRoom`, `startRoom`, `newGameFromDecks` wiring already in place)
- `apps/game-server/src/corpus.ts` (`TESTING_DECKS` — the available `deckId` values)
- `apps/game-server/src/index.ts` (socket lifecycle hooks)
- `packages/protocol/src/events.ts` (add `lobby.findMatch` / `lobby.leaveQueue` / `lobby.matchFound` to the client↔server event types)

**Out of scope.** Elo / MMR. Deck fetch from DB or `apps/api`. Real-currency deck restrictions. Reconnect semantics for queued players (closing the tab pops them from the queue — see disconnect handler).

**Depends on.** None blocking (uses corpus decks, not the DB). The DB-backed deck path comes after API-1.

**Done when.** Typecheck clean. Manual smoke: two browser sessions both hit Find Match → both land in a single newly-generated room → game state is dealt. Closing one tab before pairing pops that player from the queue and the other keeps waiting.

---

#### WEB-3 — Find Match flow on the splash screen
**Why now.** SERVER-2 ships a matchmaking queue but no UI hits it. The existing `Lobby.tsx` is the invite-code flow and stays as-is; matchmaking is a parallel entry point on the splash screen.

**Scope.**
- Add a "Find Match" button to `apps/web/src/routes/Splash.tsx` alongside the existing Create / Join Lobby affordances. For v1, the button pairs the player using a default corpus deck (no deck-picker yet — that lands once a real deck source exists).
- On click, emit `lobby.findMatch` and transition to a `searching` state (spinner + Cancel button that emits `lobby.leaveQueue`).
- On `lobby.matchFound`, populate the local lobby + game state the same way the existing rejoin flow does and route to `Game.tsx`.
- Cache the queued state in the same `lobbyCache` slot that invite-code lobbies use, so a refresh during searching cancels the queue rather than dangling it.

**Context to load.**
- `apps/web/src/routes/Splash.tsx`, `Lobby.tsx` (existing invite-code flow — reference, do not modify)
- `apps/web/src/lib/socket.ts`, `lib/lobbyCache.ts`
- `apps/web/src/store.ts` (where lobby + game state lives)
- `apps/web/src/App.tsx` (rejoin hook for the matchFound shape)

**Out of scope.** Deck picker UI (no deck source to pick from yet). Full deckbuilder. Ranked / Casual / Tournament queue selection. Animations / spinners beyond a basic text-only "searching" state.

**Depends on.** SERVER-2.

**Done when.** Typecheck clean. Manual smoke: two browser sessions both hit Find Match on the splash → both transition to the game board with a real match. Hitting Cancel during searching returns to splash and the server-side queue is empty.

---

#### API-1 — Apply first DB migration against real Postgres
**Why now.** Schema is generated but never executed. Until the migration actually runs against a live Postgres, the `db:seed` path and any future API endpoints are blocked.

**Scope.**
- Run `docker compose -f infra/docker-compose.yml up -d postgres` and confirm it's healthy.
- Run `pnpm db:migrate`. Capture any drift or errors; resolve them.
- Smoke-check from psql (or via a tiny `apps/api` script) that the seven tables and five enums exist.
- Document any one-time setup steps (env vars, port mappings) in the README's Local Development section if anything was missing.

**Context to load.**
- `infra/docker-compose.yml`
- `packages/db/drizzle.config.ts`
- `packages/db/migrations/0000_*.sql`
- `README.md#local-development`

**Out of scope.** New schema. Seed data import. Just apply what's already generated and verify it lands cleanly.

**Done when.** Migration applies without errors. `psql` confirms tables exist. README's setup instructions are accurate (fix them if not).

---

### Backlog — engine (not yet sized)
- Replacement-effect interceptor framework.
- Queue + before/after triggers + additional-action handling.
- Battlefield controller tiebreak across simultaneous abilities.
- Keyword resolvers: Guardian (redirect damage), Modify (modifier-die routing), Redeploy (upgrades move on defeat).
- Special-ability registry with inherent-die semantics.
- `use-card-action` handler (Action / Power Action ability invocation).
- Ability AST resolver dispatch with full coverage of the type tag space.
- Replay reconstruction from seed + event log.
- "After setup" trigger pass.
- Plots / battlefield abilities (Claim).

### Backlog — services (not yet sized)
- Auth flow (better-auth + Google/Discord OAuth) — `apps/api` middleware, `apps/web` login.
- Deck builder API + validator (CRUD endpoints to save user decks to the database).
- Card ownership logic (`card_collections` integration, tracking opened packs).
- **Matchmaking logic:**
  - **Ranked:** Hidden MMR matching (Glicko-2) + visible trailing rank tiers.
  - **Casual:** Fast-expanding MMR bounds.
  - **Tournament:** Bracket-aware matching strictly based on current W/L record.
- Spectator mode read-only socket.
- Sticky room ownership coordinator (Redis-based) — only needed once we run multi-instance.
- Stripe integration: checkout, webhooks, entitlements, refunds.
- Season pass + currency ledger.
- Observability wiring (OpenTelemetry exporter, Sentry init).
- Anti-cheat heuristics workers (queue dodging, dice-roll bias, AFK).
- Cloudflare in front of api/game-server with rate-limit rules.
- Turnstile on signup and high-value actions.

### Backlog — client (not yet sized)
- Phone-portrait layout pass (360×640): opponent strip, table, hand, dice tray.
- Card detail modal (tap a card → full text + dice faces).
- Game over screen + rematch.
- Pixi board renderer with zones and dice physics.
- Combat-effect library (melee/ranged/indirect/special) keyed off engine events.
- Pack-opening choreography (Pixi sprite-sheet driven).
- Storefront UI (Stripe Elements, currency packs, bundles, season-pass page).
- Reduced-motion + color-blind modes.
- Audio: SFX, music, mixing buses, ducking during voice/emote.
- Spectator UI.
- PWA install + offline shell caching.
- i18n scaffold (Paraglide); ship English first.
- Screen-reader event narration in live match.

### Backlog — content & ops
- First original Prophecy set: ~140 cards across factions/colors with 5 keywords represented.
- Lore bible + naming conventions for original IP.
- Art pipeline (commissioning, approvals, atlas generation in CI).
- Tournament rules document.
- Player support runbook.
- Backup/restore drill runbook + quarterly exercise.

### Backlog — post-v1.0
Game modes beyond 1v1, plus other features deferred until v1 ships and stabilizes.

- **2v2 team play** — paired-team queue, shared-resource rules decisions, team-vs-team UI, team-aware ability targeting and "your team" semantics in the engine.
- **Free-for-all** (3–4 player) — matchmaking queue, FFA-specific UI (opponent panels around the board, target-disambiguation when multiple opponents are valid, elimination handling), balance review of the existing card pool, tournament formats with FFA pods.
- Other experimental modes (drafted decks, sealed events, gauntlets) once 1v1 is healthy.
- Capacitor-wrapped native shells (iOS / Android) once the PWA experience is solid.

### Backlog — future extractions
These are deferred service splits. Keep the boundaries clean now so the extractions are straightforward when scale justifies them.

- Extract `apps/admin` from `apps/web` admin pages once back-office workflows outgrow the player client.
- Extract `apps/matchmaker` from `apps/api` once queue throughput or pairing complexity warrants its own deploy/scale story.
- Extract `apps/jobs` from `apps/api` once worker load makes co-location risky.

### Done
- **2026-05-13 — ENGINE-4 — Ambush + extra-turn plumbing** (`8431bd2`). `GameState` gains `extraTurnsPending: Readonly<Record<string, number>>` and `ambushGrantedThisTurn: boolean` (both seeded by `newGame`). New `endTurn(state, fromPlayerId, events)` helper in `state/turn.ts`: if the leaving player has extras pending, decrement and keep them active (turnIndex bumps so seeded RNG forks stay distinct); otherwise delegate to `rotateAndCascade`. Either way, `ambushGrantedThisTurn` resets — fresh Ambush budget each turn. Round-start in `runUpkeepAndStartRound` also resets the flag. All six action handlers (`pass`, `activate`, `play-card`, `resolve-dice`, `reroll-dice`, `claim`) now route through `endTurn` instead of calling `rotateAndCascade` directly. New `grantExtraTurn(state, playerId)` helper exposes the seam for ability code (no callers yet — Ambush keyword wiring lands once the ability AST resolves). 116 engine tests green (7 new in `extra-turns.test.ts`).
- **2026-05-13 — ENGINE-3 — `applyRerollDice` + discard-first UI** (`ffce0f1`, `7ba508f`). New `applyRerollDice(state, playerId, discardCardId, dieInstanceIds)` handler: validates active player + card-in-hand + dice-in-pool, discards the card, rerolls each listed die via a per-action seeded RNG fork (`reroll:${turnIndex}:${discardCardId}`), emits `dice.rerolled`, resets `consecutivePasses`, rotates. Zero dice is legal (the player cycles a card without rerolling anything). 109 engine tests green (6 new in `reroll.test.ts`). UI: the Zustand `resolveMode` slice generalised to `selectionMode` (discriminated union of `resolve` / `reroll`); a new top-level "Discard to reroll" action button opens a hand-card picker → `enterRerollMode(cardId)` → dice tray becomes interactive with no symbol-lock → sticky action bar shows "Reroll selected dice" (zero or more allowed).
- **2026-05-13 — WEB-2 — Resolve mode: symbol-locked die selection** (`31a15d4`). Tap "Resolve dice" in the action panel → the panel hides, the player's own dice tiles in `DicePoolStrip` become tap targets, and a sticky bottom bar (cost / total / warnings / Cancel / Resolve) drives the dispatch. First die tap locks the symbol; subsequent taps enable only same-symbol dice (modifiers of the locked symbol included); tap a selected die to deselect. Resolve dispatches directly for resource / disrupt; opens a target overlay first for melee / ranged (opponent characters) and shield (own characters). New `resolveMode` slice on the Zustand store keeps the selection in one place. Resolve mode auto-exits when the turn rotates away or the phase changes.
- **2026-05-13 — Engine: ready exhausted characters at upkeep** (`fcf4920`). Plugs a placeholder in `runUpkeepAndStartRound` — exhausted characters now flip back to ready at start-of-round per rules-reference §Upkeep step 1. Without this, a new round started with no activatable characters and the game stalled. +1 test in `pass.test.ts`.
- **2026-05-13 — WEB-1 — ActionPanel: action → target two-step** (`1767a5d`). ActionPanel now drives every action through `getLegalActions`. Activate / Resolve / Play-card / Claim / Concede open a bottom-sheet (≤ sm) or centered modal (≥ sm) instead of relying on flat buttons; tap targets ≥ 44×44, disabled actions stay dimmed-but-visible, backdrop tap or Escape closes. Claim and Concede route through a dedicated `ConfirmOverlay` (no more `window.confirm`). Resolve is single-die-at-a-time for now — the symbol-locked multi-die UX is WEB-2. Added `@prophecy/game-engine` as a direct web dep so the client can call `getLegalActions` against live state. Manual smoke verified by user on desktop + phone-portrait viewport.
- **2026-05-13 — Server: wire `startRoom` to the committed test decks** (`0c49534`). Replaces the `CHAR_TEST_001` placeholder in `rooms.ts` with `newGameFromDecks` against the loaded corpus. DECK_A (Light: Spark of Hope) and DECK_B (Shadow: Iron Fist) are paired with the two players; pairing is randomized 50/50 by a `deck-assignment` RNG fork of the game seed so replays of the same seed always produce the same matchup.
- **2026-05-13 — Engine: collapse setup to a single roll-off-winner choice** (`d87e0d2`). Reverts the independent-choices split from 2026-05-12. The roll-off winner now makes one decision — who goes first — and the engine automatically assigns the non-first player as the shield recipient. The recipient still distributes 2 shields freely (1+1 or 2+0). `SetupStep` drops `choose-shield-recipient`; the `setup.choose-shield-recipient` action, its `setup.shield-recipient-chosen` event, and `canChooseShieldRecipient` are removed. Rules-reference, web SetupPanel, and test helpers (`newGameInActionPhase`) all updated. 102 engine tests green.
- **2026-05-13 — ENGINE-2 — `applyPlayCard` (vanilla cost-only)** (`33e349f`). New `actions/play-card.ts` handler: validates active player + action phase + card in hand + affordable, pays the resource cost, moves the instance from `hand` → `discard`, emits `card.played` event, resets `consecutivePasses` and rotates the turn via `rotateAndCascade`. Card abilities do not fire — that's the AST resolver's job in a later card. `GameState` gains `cardCosts: Readonly<Record<string, number>>` (missing entries default to cost 0); `NewGameInput` accepts an optional `cardCosts` to seed it. `legal-actions.canPlayCard` now requires at least one card in hand to satisfy `cost ≤ resources`. 105 engine tests green (8 new in `play-card.test.ts`).
- **2026-05-12 — ENGINE-1 — Per-card hand & deck tracking** (`8d4526f`). `PlayerState` now carries `hand: readonly string[]`, `deck: readonly string[]`, and `discard: readonly string[]` (renamed from `discardIds` for symmetry). `newGame` builds each player's 30-card deck as `${playerId}.deck.${index}` ids, Fisher-Yates-shuffles it with a per-player seeded RNG fork (`shuffle:${playerId}`), and deals the top 5 into hand. New `state/draw.ts` exposes `drawCards(state, playerId, n)`; wired into the upkeep transition so each player redraws up to `handSize`. `upkeep.player` event payload now reports `cardsDrawn`. `legal-actions.canReroll` / `canPlayCard` and the end-of-round loss check switched to `hand.length` / `deck.length`. 97 engine tests green (5 new: deterministic deal, different-seed shuffles differ, hand/deck disjoint, upkeep draws to handSize, upkeep doesn't draw past an empty deck).
- **2026-05-12 — Engine: split setup into independent first-player + shield-recipient choices** (`27b3667`). Diverges from SWD's single-choice setup: the roll-off winner now makes two separate decisions — who goes first (= battlefield controller) and who receives the 2 starting shields. The recipient distributes shields freely (1+1 or 2+0). `SetupStep` reworked, three new actions (`setup.choose-first-player`, `setup.choose-shield-recipient`, `setup.place-shield`), events renamed, legal-actions inspector and web SetupPanel rewired, rules-reference updated. 92 engine tests passing.
- **2026-05-12 — Engine: `resolve-dice` + character defeat** (`c186d6c`). Resolves melee / ranged / shield / resource / disrupt. Shields block damage 1-for-1 (capped at 3). Damage ≥ remaining health defeats the character: removed from `characterOrder`, dice removed from pool. Win condition: opponent has no characters → game ends. Optional `targetCharacterId` on the action shape for damage / shields; ignored for resource / disrupt.
- **2026-05-12 — Engine: `getLegalActions` inspector + `activate` rotates the turn** (`589fa62`). Pure read-only inspector returning the set of actions each player can take right now (driven by both the UI and tests). Surfaced a latent bug: `activate` wasn't rotating the turn — fixed. `RESOLVABLE_SYMBOLS_V1` excludes blank, special, focus, indirect until those land.
- **2026-05-11 — Server: lobby + game multiplayer wiring** (`b2b7c4e`, `79bb5b7`, `7ba3949`, `843c6a8`). `apps/game-server` instantiates an engine game per Socket.io room and broadcasts events back to clients. Lobby persistence with idle-room TTL; localStorage-backed rejoin on the web client. Corpus loader for the committed test decks landed (`apps/game-server/src/corpus.ts` reads `cards.json` + `decks.json`); rooms.ts kept a placeholder character — wired up properly on 2026-05-13. Cross-device LAN testing unblocked: CORS widening, Vite `envDir`, secure-context-aware `crypto.randomUUID` fallback, polling-then-upgrade Socket.io transport.
- **2026-05-11 — Engine: `activate` action with seeded dice rolling** (`98ce3a4`). Exhaust character, roll N dice into the player's pool (1 die per non-elite character, 2 for elite). Deterministic via per-action seeded fork (Mulberry32 + FNV-1a). `character.activated` event includes the rolled dice. Threw when the character was already exhausted or didn't belong to the player.
- **2026-05-11 — Fixtures: deck legality validator + test decks** (`0871bc4`, `83ccb33`). `validateDeck` enforces Part 4 rules: team points ≤ 30, faction match (Light/Shadow/Neutral compatibility), color gating, 30 cards total, max 2 of any card. Returns `{ valid, errors, stats: { teamPointTotal, deckCardTotal, costCurve, characterColors } }`. Two reference test decks (`DECK_A` Light, `DECK_B` Shadow) load at game-server startup.
- **2026-05-10 — Fixtures: third-party-derived reference set, mechanical-only** (`81f0594`). 173-card mechanical port under `packages/game-engine/__fixtures__/synthetic-set/` for engine-validation testing. No card text, no art, no titles — dice profiles, costs, points, types only. Strictly test-only; never bundled into production builds.
- **2026-05-10 — Monorepo skeleton bootstrapped.** pnpm workspaces + Turborepo + strict TS. Three apps (`web`, `api`, `game-server`) and three packages (`game-engine`, `protocol`, `db`) compile and run. Hono + tRPC v11 in `api`; Socket.io in `game-server`; React 19 + Vite 6 + Tailwind v4 + tRPC client in `web`. Drizzle + postgres.js in `db` with a starter `users` table. Seeded RNG and pure-reducer skeleton in `game-engine`. Docker Compose for Postgres / Redis / MinIO. Touch-first CSS defaults (44 × 44 hit targets, `touch-action: manipulation`, `prefers-reduced-motion` respected) and a Splash route that pings `/trpc` for liveness.
- **2026-05-10 — Card catalog and deck schema, first migration.** Shared enum value lists in `@prophecy/protocol` (Zod schemas) and a duplicated copy in `@prophecy/db` (drizzle-kit can't follow cross-package imports cleanly) guarded by a drift test. Tables: `cards`, `card_abilities`, `card_dice`, `decks`, `deck_characters`, `deck_cards`. Generated migration `0000_deep_stellaris.sql` — five Postgres enums plus seven tables with FK cascades and indexes. Migration validated by drizzle-kit's schema model; pending apply against a live Postgres (API-1).
- **2026-05-10 — Engine: first action slice.** `newGame` factory; pure-reducer `applyAction` dispatch. Three actions implemented: `pass` (consecutive-pass counting, rotation, upkeep transition with +2 resources and dice-pool clear), `claim-battlefield` (single-claim-per-round guard, control transfer, auto-pass cascade for the claimer's subsequent turns this round), and `concede` (1v1 opponent-wins). End-of-round loss check (hand=0 AND deck=0 → lose; battlefield controller wins ties). Typed `EngineEvent` discriminated union. Shared `guardCanAct` and `rotateAndCascade` helpers.