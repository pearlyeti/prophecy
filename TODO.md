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

Cards are coded by area: `ENGINE-N` (game-engine), `WEB-N` (apps/web), `SERVER-N` (apps/game-server), `API-N` (apps/api + packages/db), `AUTH-N` (auth + accounts), `ADMIN-N` (admin tooling spanning game-server + web), `OPS-N` (infra, CI, deploy), `TEST-N` (test scaffolds and harnesses).

### v1.0.0 launch criteria

Explicit gates for what must ship before declaring 1.0. Cards in Up Next and Backlog should be traceable to one of these criteria; if a piece of work isn't, the default answer is to move it to [Backlog — post-v1.0](#backlog--post-v10).

**Engine**
- All v1 ability kinds dispatched: `immediate` ✅, `triggered` ✅, `action` ✅, `powerAction` ✅, `special`, `claim`. (`passive` may defer.)
- Replacement-effect framework + simultaneous-ability tiebreak.
- All v1 keywords resolved end-to-end: Ambush, Guardian, Modify, Redeploy.
- Plot and battlefield (Claim) abilities.
- Multi-target resolve (ENGINE-8).
- Support card state + Stability (ENGINE-S1).
- Replay reconstruction from seed + event log.

**Persistence (apps/api + packages/db)**
- Migrations applied to a live Postgres (API-1).
- Auth + sessions live (AUTH-1).
- Decks persisted to Postgres (CRUD via tRPC).
- Card collection persisted; soft-currency pack opening.
- Game results + event log persisted (API-2 minimum; API-3 for in-flight durability).
- Stripe checkout + idempotent entitlements fulfillment.

**Real-time (apps/game-server)**
- Reconnect window (SERVER-1).
- Graceful shutdown / in-flight drain on deploy (OPS-3).
- Incremental event-log writes for in-flight durability (API-3).

**Client (apps/web)**
- Full turn UX for all action types ✅ (mostly).
- Activity log readable in plain English (WEB-7).
- Game-over screen + rematch.
- Deckbuilder + collection browser.
- Storefront UI (currency packs, season pass, cosmetic bundles).
- Reduced-motion + color-blind modes.
- PWA install + offline shell.

**Ranked & tournaments**
- Glicko-2 ranked queue + casual queue + private lobby ✅.
- Season boundary + soft reset; rank tiers Bronze → Champion.
- Tournament formats: Swiss, Single Elim, Double Elim + TO dashboard.

**Content**
- First original Prophecy set (~140 cards) covering all 5 keywords with faction/color balance.
- Lore bible + naming conventions.

**Ops & safety**
- Sentry across all services (OPS-2).
- Cloudflare in front of api / game-server with rate limits.
- Turnstile on signup and high-value actions.
- Replay-analysis worker (dice-roll bias, queue-dodge).
- Backup/restore drill exercised at least once.

**Test**
- Playwright E2E covering a 1v1 match queue → game-end (TEST-1).
- Engine unit suite green (168+ tests today).

### In progress
- _(none — claim a card from Up next.)_

### Up next — task cards

---
> **Multi-target resolution — ENGINE-8 + WEB-19.**
> One action can resolve multiple dice of the same symbol against different targets. ENGINE-8 adds engine support; WEB-19 updates the UI to match.
---

#### ENGINE-8 — Multi-target resolve-dice action
**Why now.** The rules allow resolving multiple melee/ranged/shield dice in one action where each die targets a different character. The current `resolve-dice` action only accepts a single `targetCharacterId`, forcing all dice to one target. This blocks correct gameplay.

**Scope.**
- Change `resolve-dice` action shape in `packages/game-engine/src/actions/resolve-dice.ts` and its protocol type: replace the flat `targetCharacterId?: string` with `targets: readonly { dieInstanceIds: readonly string[]; targetCharacterId?: string }[]`. Each entry is a group of dice resolved against one target.
- For backward compat during transition, also accept the old flat shape and normalize it internally to the new shape.
- The resolution loop iterates over `targets` in order, applying damage/shields to each `targetCharacterId` for the dice in that group.
- Indirect damage (`targetCharacterId` omitted): opponent distributes the total value across their characters as before.
- Resource/disrupt/discard: `targets` has a single entry with no `targetCharacterId`.
- Update all existing tests that construct `resolve-dice` actions to use the new shape.
- Mirror shape change in `@prophecy/protocol`.

**Context to load.**
- `packages/game-engine/src/actions/resolve-dice.ts`
- `packages/game-engine/src/state/types.ts` (Action union)
- `packages/protocol/src/events.ts`
- `packages/game-engine/src/__tests__/resolve-dice.test.ts`

**Out of scope.** UI changes (WEB-19). Focus / special resolution (separate cards).

**Done when.** Typecheck clean. Engine tests green. New tests: (a) 2 melee dice each targeting a different character — both take damage; (b) shield dice split across two characters; (c) flat single-target shape still works (backward compat).

---

#### WEB-19 — Multi-target damage and shield resolution UI
**Why now.** WEB-16 wires single-target resolution. The rules allow each die in a resolve action to target a different character. This card updates the UI flow to support that.

**Scope.**
- Extend `ActiveFlow.resolve` in `store.ts`: replace `targetCharacterId: string | null` with `pendingTargets: readonly { dieInstanceIds: readonly string[]; targetCharacterId: string }[]` (committed die groups) and keep `selectedDieIds` for the currently-being-assigned group.
- **Resolution loop UX:** Select one or more dice of the same symbol (existing green highlight). Tap an opponent/own character to assign those dice to that target — this commits the group into `pendingTargets` and clears `selectedDieIds`, ready for the next group. Repeat until no dice remain in the pool or player is done.
- **Commit button:** enabled when `pendingTargets.length > 0` and `selectedDieIds.length === 0` (all selected dice have been assigned). Label: "Deal damage" / "Gain shields" as before.
- **Visual feedback:** dice already assigned (in `pendingTargets`) appear dimmed in the pool — they've been "spent" into a group. A small counter on the target character card shows pending damage/shields incoming (e.g., `−3` in red, `+2` in blue). Tapping an already-assigned character while building a new group replaces that group.
- **Dispatch:** send `resolve-dice` with the full `targets` array from `pendingTargets` plus any unassigned `selectedDieIds` (assigned to the most recently tapped character).
- Resource/disrupt/discard: unchanged single-dispatch path.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (BattlefieldRow, DiceStack, ActionBar, activeFlow wiring)
- `apps/web/src/store.ts` (ActiveFlow.resolve shape)
- `packages/game-engine/src/actions/resolve-dice.ts` (new targets shape from ENGINE-8)

**Depends on.** ENGINE-8.

**Done when.** Typecheck clean. Manual smoke: select 2 melee dice, tap opponent character A — dice dim, counter shows −X on A. Select 1 more melee die, tap opponent character B — counter shows −Y on B. Commit dispatches one resolve-dice with two target groups. Both characters take the correct damage.

#### ENGINE-6b — Event-owned dice + cross-card die roll mechanic
**Why now.** Some events should roll a die into the pool — either the event's own die (events can carry `dieFaces`, a mechanic not possible in the physical game) or a specific card's die by catalog reference (e.g. "Howl at the Moon" rolls a Werewolf die even if Werewolf isn't in the active player's deck). Neither case is handled by the existing pool machinery.

**Scope.**
- Add `transient: boolean` to `DieInPool` in `packages/game-engine/src/state/types.ts` and mirror in `@prophecy/protocol`. Transient dice are removed from the pool immediately after being resolved or removed (they do not persist like character/upgrade dice). Pipe this flag through the resolve-dice and remove-die paths.
- Implement `rollEventDie` op in the dispatcher: the event card has `dieFaces` populated in the catalog; roll the event's own die into the active player's pool using the seeded RNG fork `event-die:${turnIndex}:${cardInstanceId}`, with `transient: true` and `cardId` set to the event's instance id.
- Implement `rollCardDie` op: `{ op: 'rollCardDie', cardId: string }` — look up the referenced card's die faces from the catalog (thread a `catalog: CardCatalog` into the dispatcher context), roll it into the active player's pool, `transient: true`, `cardId` set to the referenced catalog id. If the card doesn't exist in catalog, throw a descriptive error.
- `DispatchContext` (in `abilities/dispatch.ts`) gains a `catalog: CardCatalog` field. Tests pass a minimal inline catalog; the game-server passes the loaded corpus.
- Author at least one seed event with `rollEventDie` (with `dieFaces`) and one with `rollCardDie` referencing another seed card.

**Context to load.**
- `packages/game-engine/src/state/types.ts` (`DieInPool`)
- `packages/protocol/src/schemas.ts`
- `packages/game-engine/src/abilities/dispatch.ts` (after ENGINE-6)
- `packages/game-engine/src/actions/resolve-dice.ts` (transient removal path)
- `apps/game-server/src/corpus.ts` (catalog shape to thread in)
- `packages/db/seed/cards.json`

**Out of scope.** Dice that persist across rounds (support dice). Die faces on plots or battlefields. UI for distinguishing transient dice in the pool — they look and act like any other die from the player's perspective.

**Depends on.** ENGINE-6.

**Done when.** Typecheck clean. Tests: (a) play an event with `rollEventDie` — die appears in pool with correct faces; after resolution it is removed; (b) play an event with `rollCardDie` — correct faces from catalog, `transient: true`, removed after resolution; (c) `rollCardDie` with an unknown `cardId` throws a descriptive error.

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

#### WEB-9 — Drag-to-play (Pass 2: character targeting)
**Why now.** Once the engine supports targeted `play-card` (upgrades attaching to characters, events targeting opponent characters), the drag gesture should route to the correct target rather than a generic play zone.

**Scope.**
- Add `data-droptarget="character:{instanceId}"` attributes to each character tile in `PlayerSummaries` and the activate overlay.
- On drag-over a character tile: highlight it with a ring color-coded by legality (emerald = valid, red = invalid). Valid targets depend on card type: upgrades → own characters, damage events → opponent characters, shield events → own characters.
- On drop over a valid character target: dispatch `play-card` with `targetCharacterId` (once the engine action accepts it — coordinate with the ENGINE card that wires targeted play).
- Remove or deprioritize the generic `data-droptarget="play"` zone for cards that require a character target; keep it for cards with no target (resources, supports, events with no target spec).

**Context to load.**
- `apps/web/src/routes/Game.tsx` (drag system from WEB-8, PlayerSummaries, character tile rendering)
- `packages/game-engine/src/actions/play-card.ts` (targeted play-card action shape)
- `packages/protocol/src/events.ts` (PlayCardAction)

**Out of scope.** Multi-target events. AoE effects. Drag to reroll-discard.

**Depends on.** WEB-8. Engine card that adds `targetCharacterId` to `play-card` action and validates it.

**Done when.** Typecheck clean. Manual smoke: drag an upgrade card onto an eligible character — it attaches. Drag a damage event onto an opponent character — damage is dealt. Drag a card onto an ineligible target — drag cancels with red feedback.

---

#### WEB-7 — Human-readable activity log
**Why now.** The current event log renders raw JSON next to event type names — unreadable in play. Testers can't follow what happened or why a game state changed without decoding engine internals.

**Scope.**
- Write a `formatEvent` function (or grouped formatter) that maps each `EngineEvent` type to a human-readable string. Target strings:
  - `character.activated` → "**{PlayerName}** activates **{CharacterName}** — rolls [Melee 3] [Shield 1]" (die chips from `rolledDice` in payload)
  - `dice.resolved` + its following `damage.dealt` → "**{PlayerName}** resolves [5 Melee] against **{CharacterName}** — deals 4 damage (1 blocked)" — group these two by folding `damage.dealt` into the preceding `dice.resolved` entry since they always co-occur
  - `dice.resolved` without `damage.dealt` (resource/disrupt/shield) → "**{PlayerName}** resolves [3 Resource] — gains 3 resources" / "disrupts" / "places 2 shields on **{CharacterName}**"
  - `shields.placed` standalone (setup) → "**{PlayerName}** places a shield on **{CharacterName}**"
  - `card.played` → "**{PlayerName}** plays **{CardName}** (cost {N})"
  - `dice.rerolled` → "**{PlayerName}** rerolls {N} dice (discards **{CardName}**)" — show new faces if N > 0
  - `character.defeated` → "**{CharacterName}** is defeated"
  - `battlefield.claimed` → "**{PlayerName}** claims the battlefield"
  - `round.begin` → "— Round {N} —" (rendered as a divider, not a bullet)
  - `game.ended` → "**{WinnerName}** wins ({reason})" where reason is "concession" / "all characters defeated" / "deck exhausted"
  - `player.passed` with `automatic: true` → skip (these are noise)
  - `player.passed` explicit → "**{PlayerName}** passes"
  - `upkeep.player` → "**{PlayerName}** draws {N} and gains {R} resources" (only if N > 0 or R > 0)
  - All other events (trigger lifecycle, setup roll-off, `turn.advanced`, `upkeep.begin/end`) → skip silently
- **Die chip component:** a small inline badge `[Symbol Value]` — e.g. `[Melee 3]`, `[Shield 1]`, `[+Modifier 2]` (modifier flag prepends `+`). Chips are color-coded by symbol (melee = red, ranged = orange, shield = blue, resource = green, disrupt = purple, modifier = neutral).
- **Event grouping:** walk the event array building a `FormattedEntry[]` list. When a `dice.resolved` is immediately followed by `damage.dealt` (or `shields.placed` / `resources.gained` / `shields.removed`), merge them into one entry. The merging pass runs over `recentEvents` and produces the display list.
- **Updated EventLog component:** replace the current `<pre>`-style list with a styled `<ol>` where each entry is a single line with bold player/character names, inline die chips, and `round.begin` rendered as a centered divider. Show up to 30 entries, scrollable. Keep the section collapsed by default on mobile (a disclosure triangle) so it doesn't dominate the screen.
- **Name resolution:** look up display names from lobby for player IDs. Look up character and card names via `game.cardCatalogIds` + the fetched catalog (available after WEB-4). If catalog isn't loaded yet, fall back to the instance-ID suffix (e.g. `deck.0`).

**Context to load.**
- `apps/web/src/routes/Game.tsx` (EventLog component, full event rendering context)
- `packages/game-engine/src/events.ts` (all event types and payload shapes — read carefully before writing the formatter)
- `apps/web/src/store.ts` (`recentEvents` shape)

**Out of scope.** Animated event feed. Sound effects keyed off events. Filtering by player. Exporting the log. Trigger-ordering events (show as "Resolving triggered abilities" at most).

**Depends on.** Can ship without WEB-4 (character/card names fall back to ID suffixes). Upgrade names automatically once WEB-4 lands and the catalog is available.

**Done when.** Typecheck clean. Manual smoke: play a full turn (activate → resolve → pass) and confirm the log reads naturally in plain English with die chips; damage events are merged with their resolve; round dividers appear; automatic passes and upkeep noise are hidden; log is scrollable past 10 entries.

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

#### API-2 — Persist completed games on game-end
**Why now.** The engine emits a full event log per game but nothing is ever written to Postgres. Without this the README's "rebuild any completed game from its seed + events" claim isn't true and the schema is dormant. Smallest possible end-to-end exercise of the persistence layer.

**Scope.**
- On `game.ended`, write one row to `game_sessions` (players, winner, duration, seed, summary) and one row per emitted `EngineEvent` to `game_events` (`session_id`, `sequence_number`, `event_type`, `payload jsonb`, `occurred_at`).
- New `apps/game-server/src/persistence.ts` exposes a `GameWriter` that subscribes to a room's event stream and flushes at game-end in a single Drizzle transaction.
- Index `game_events(session_id, sequence_number)` for replay reads.
- Add `apps/game-server` as a Drizzle consumer if it isn't already; reuse `packages/db`.
- One end-to-end test: spin up Postgres via the existing compose stack, play a deterministic concede game, assert both rows land.

**Context to load.**
- `apps/game-server/src/rooms.ts` (engine event stream)
- `packages/db/src/schema.ts` (`game_sessions`, `game_events`)
- `packages/game-engine/src/events.ts` (EngineEvent union)

**Out of scope.** Incremental writes during the game (API-3). Replay UI. Anti-cheat post-processing.

**Depends on.** API-1.

**Done when.** Typecheck clean. Concede a game; `select count(*) from game_events where session_id = ?` returns the expected event count; `game_sessions` row has winner, duration, seed.

---

#### API-3 — Incremental event-log writes for in-flight durability
**Why now.** If a game-server process crashes mid-match, the only durable copy of the event log is Redis (snapshot). README claims Postgres event-log replay can rebuild — that's only true if events are written incrementally, not just at game-end. This card closes that gap.

**Scope.**
- Replace the buffer-until-game-end approach from API-2 with a streaming write: after each engine event is broadcast to clients, append a `game_events` row.
- Open `game_sessions` at game-start with `status='active'`, seed, and players; update `status='completed'` (or `abandoned`) on `game.ended`.
- Per-room background write queue (in-process initially; switch to BullMQ if it becomes a bottleneck) so the broadcast path isn't blocked on the DB.
- On game-server boot, scan `game_sessions where status = 'active'`: if the room is still alive in Redis, leave it; if not, mark `abandoned`.

**Context to load.**
- `apps/game-server/src/rooms.ts`
- `apps/game-server/src/persistence.ts` (from API-2)
- `packages/db/src/schema.ts`

**Out of scope.** Cross-server resume (sticky-room coordinator). Live snapshots to Redis (already happen — this is the Postgres durability layer underneath).

**Depends on.** API-2.

**Done when.** Typecheck clean. Kill the game-server mid-match and restart; `game_events` for that session contains every event up to the crash; the session is marked `abandoned` on the next boot.

---

#### AUTH-1 — Sessions + Google/Discord OAuth via better-auth
**Why now.** Nothing persistent works without identity: collection, ladder, deck saves, storefront, ranked all need it. Today the only "player" is a transient lobby UUID in localStorage. This is the foundation card for accounts.

**Scope.**
- Wire `better-auth` in `apps/api` with the Drizzle adapter pointed at our Postgres.
- Add a `sessions` table to `packages/db/src/schema.ts` if not already present; confirm `users.oauth_provider`, `users.oauth_subject` columns match the README schema overview.
- Configure Google + Discord OAuth providers (env-var driven: `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET`).
- Expose `auth.session` on the tRPC router (returns `{ user, session } | null`) plus REST `/auth/*` for the OAuth callbacks.
- `apps/web`: SessionProvider reads from tRPC on boot. Splash gains "Sign in with Google / Discord" buttons; the anonymous lobby flow is gated behind a session.
- `apps/game-server`: socket handshake reads the session cookie via better-auth's `verifyRequest`; reject connections without a session. Replace transient client UUIDs with `userId` everywhere downstream (rooms, matchmaking).
- Document the new env vars in `README.md` Local Development.

**Context to load.**
- `apps/api/src/*` (current Hono + tRPC setup)
- `packages/db/src/schema.ts`
- `apps/web/src/App.tsx`, `apps/web/src/splash.tsx`
- `apps/game-server/src/index.ts` (socket handshake)
- `packages/protocol/src/*`

**Out of scope.** 2FA, email/password sign-up, account merge, profile editing, role-assignment UI, email verification.

**Depends on.** API-1.

**Done when.** Typecheck clean. Sign in with Google, sign in with Discord, refresh → still signed in, sign out → splash gates. Game-server socket rejects connections without a session.

---

#### OPS-2 — Sentry + OpenTelemetry exporter wiring
**Why now.** We're past the toy-project stage but flying blind. Sentry alone is a half-day task and lets us see every error in test/prod. OTel exporters add tracing across the api ↔ game-server ↔ engine boundary. Cheap to land now, expensive to retrofit when something is on fire.

**Scope.**
- `apps/api`, `apps/game-server`, `apps/web`: init `@sentry/node` (services) / `@sentry/react` (web) keyed by `SENTRY_DSN`. Tag releases with the commit SHA from CI.
- Configure source-maps upload in the web CI build so prod stack traces deminify.
- Top-level React error boundary in `apps/web` that reports to Sentry and renders a "something went wrong" screen.
- OTel SDK in each service (`@opentelemetry/sdk-node`), HTTP + tRPC + Socket.io instrumentation, OTLP exporter pointed at `OTEL_EXPORTER_OTLP_ENDPOINT` (no-op when unset).
- Document required env vars in README Local Development.

**Context to load.**
- `apps/api/src/index.ts`, `apps/game-server/src/index.ts`, `apps/web/src/main.tsx`
- `.env.example`
- `infra/docker-compose.yml` (optional dev collector)

**Out of scope.** Backend collector setup (Honeycomb/Tempo) — exporter is enough; the receiver is ops. Real-user monitoring (RUM). Performance budgets / alerting rules.

**Done when.** Typecheck clean. Manually throw an error in each service; it surfaces in Sentry. Local dev with a stub collector: spans emitted for one Find Match → game-end round-trip.

---

#### OPS-3 — Game-server graceful shutdown on deploy
**Why now.** Every deploy currently kills active matches. Pairs with SERVER-1 (reconnect) to give players a transparent experience across deploys. Pre-launch requirement.

**Scope.**
- On `SIGTERM`: stop accepting new connections and refuse new room creation.
- Existing rooms keep running; the server waits up to a configurable drain timeout (default 5 min) for natural game-end.
- Broadcast a "server will restart, your game is safe" event so the client can show a banner.
- After timeout (or all rooms ended), exit cleanly. Fly / Railway routes new connections to the fresh instance.
- The fresh instance picks up nothing — active games stay on the draining instance until SERVER-1's reconnect window handles drops. Cross-instance handoff is a separate (future) card.

**Context to load.**
- `apps/game-server/src/index.ts`
- `apps/game-server/src/rooms.ts`

**Out of scope.** Sticky-room ownership coordinator (Redis lock — separate card). Cross-region failover.

**Depends on.** SERVER-1.

**Done when.** Typecheck clean. `kill -TERM` on a running game-server: new connections refused, an in-flight match plays to completion, then the process exits within the drain window.

---

#### TEST-1 — Playwright E2E scaffold + 1v1 happy-path smoke
**Why now.** The engine has 168+ unit tests but no automated coverage of the full Socket.io + web + game-server path. Multiplayer regressions are hard to catch in isolation. A scaffold + one happy-path test now means future flows can be added cheaply.

**Scope.**
- `apps/web/e2e/` directory with Playwright config.
- `pnpm test:e2e` script: bring up Postgres + Redis via the existing compose stack, start `apps/api` + `apps/game-server` + `apps/web` in dev mode, run Playwright.
- One test: launch two browser contexts, both press Find Match, wait for `lobby.matchFound`, play one deterministic concede game (player A concedes turn 1), assert both clients receive `game.ended` with player B as the winner.
- GitHub Actions job that runs the suite on every PR to main, gated by a `skip-e2e` label for fast iteration.

**Context to load.**
- `apps/web/src/App.tsx` (SocketBridge, matchFound handling)
- `infra/docker-compose.yml`
- `apps/web/package.json` (scripts)
- existing Vitest config(s)

**Out of scope.** Visual regression. Mobile-viewport E2E. Anything beyond a single happy-path test — adding more is cheap once the scaffold exists.

**Done when.** `pnpm test:e2e` passes locally with the dev stack up. CI runs it on PRs and blocks merge on failure (unless `skip-e2e` is set).

---

### Backlog — engine (not yet sized)
- Replacement-effect interceptor framework — "instead" / "would be" effects that fire before the original event, prevent it being considered to have happened, and disqualify any abilities that would have triggered off it. Encode as event interceptors that run before commit. See README §Engine implementation notes. Likely 2–3 cards once sized.
- Battlefield controller tiebreak across simultaneous abilities.
- Keyword resolvers wiring through the trigger queue: Ambush (caller for the existing extra-turn plumbing), Guardian (redirect damage), Modify (modifier-die routing), Redeploy (upgrades move on defeat).
- Special-ability registry with inherent-die semantics (S face).
- Ability AST resolver dispatch with full coverage of the type tag space (track via Ability op status below).
- Replay reconstruction from seed + event log.
- "After setup" trigger pass.
- Plots / battlefield abilities (Claim).

### Backlog — services (not yet sized)
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
- Anti-cheat heuristics workers (queue dodging, dice-roll bias, AFK).
- Cloudflare in front of api/game-server with rate-limit rules.
- Turnstile on signup and high-value actions.

### Backlog — supports & stability (deferred until after WEB-10)

These cards are blocked on WEB-10 landing first and the engine support work being scoped.

#### ENGINE-S1 — Support card state + Stability mechanic
Add `SupportState` to `PlayerState` (mirrors `CharacterState` but with `stability`/`maxStability` instead of `health`/`damage`). Stability can only be reduced by Disrupt or Discard dice sides. When Stability reaches 0 the support is discarded and its dice (including upgrade dice) are removed from the pool. Supports can be activated (exhaust + roll their die if they have one). `DieInPool.ownerInstanceId` must also cover support instance ids. Update `getLegalActions`, `applyResolveDice`, `applyActivate`, `newGameFromDecks`. Full rules in `docs/rules-reference.md § Stability`.

#### WEB-S1 — Support cards in the battle zone
Render support cards in play inside `BattleZone` below their owning player's characters (or in a separate support row). Supports have a Stability badge instead of a health badge. Supports can be activated (tap → activate action, same flow as characters). Upgrade badges appear on supports the same way as on characters. Clicking opens detail overlay with Stability, ability text, subtypes.

### Backlog — client (not yet sized)
- Phone-portrait layout pass (360×640): opponent strip, table, hand, dice tray.
- Game over screen + rematch.
- Combat-effect library (melee/ranged/indirect/special) keyed off engine events.
- Pack-opening choreography (Pixi sprite-sheet driven).
- Storefront UI (Stripe Elements, currency packs, bundles, season-pass page).
- Reduced-motion + color-blind modes.
- Audio: SFX, music, mixing buses, ducking during voice/emote.
- Spectator UI.
- PWA install + offline shell caching.
- i18n scaffold (Paraglide); ship English first.
- Screen-reader event narration in live match.
- **Roll cam (revamp)** — the physics-based full-screen dice roll overlay was removed (2026-05-15) because the feel was too janky. Bring it back when there's time to do it right: proper die geometry with six individually-textured faces, physics that feels weighty and satisfying, and a clean camera-cut back to the board. The board dice (WEB-3D-1) and the face-correct quaternion table (`FACE_CORRECT_Q` in `DicePool3D`) are good foundations to build on.

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

### Ability op status

Which `Effect` ops and `Ability` kinds have live dispatcher support. Schema stubs exist for all of these once ENGINE-6 lands; a checked box means the dispatcher handles it and tests cover it. Card authors: if an op isn't checked, author the AST shape but expect a `NotImplementedError` at runtime until the box is ticked.

#### Ability kinds
- [x] `immediate` — event plays, effects fire, card is discarded/set aside · _ENGINE-6_
- [x] `triggered` — before/after a game event fires this automatically · _ENGINE-7_
- [ ] `action` — player activates (exhaust/remove-die/spend cost) · _future_
- [ ] `powerAction` — same, once per round · _future_
- [ ] `special` — fires when this card's special die face is resolved · _future_
- [ ] `passive` — always-on predicate read by other engine paths; no dispatcher · _future_
- [ ] `claim` — fires when this battlefield is claimed · _future_

#### Effect ops
**First-wave (ENGINE-6)**
- [x] `dealDamage` — deal melee / ranged / indirect / unblockable damage to a target · _ENGINE-6_
- [x] `addShields` — give a target N shields · _ENGINE-6_
- [x] `removeShields` — remove N or all shields from a target · _ENGINE-6_
- [x] `drawCards` — draw N cards, or draw up to hand size · _ENGINE-6_
- [x] `gainResources` — active player gains N resources · _ENGINE-6_
- [x] `loseResources` — target player loses N (or all) resources · _ENGINE-6_
- [x] `healDamage` — remove N damage from a target character · _ENGINE-6_

**Dice ops (ENGINE-6b)**
- [ ] `rollEventDie` — roll the event card's own die into the active player's pool (transient)
- [ ] `rollCardDie` — roll a named card's die into the active player's pool (transient; catalog lookup)

**Dice manipulation — not yet assigned**
- [ ] `removeDie` — remove a die matching a filter from a pool
- [ ] `rerollDice` — reroll N dice matching a filter
- [ ] `turnDie` — turn a die to a specific side or symbol
- [ ] `resolveDie` — resolve a die (optionally as a different symbol / increased value)
- [ ] `resolveWithoutRemoving` — resolve a die but leave it in the pool
- [ ] `rollDie` — roll an existing character's die (already in team) into the pool
- [ ] `setAsideDie` — remove a die from the pool and set it aside (not discarded, usable later)
- [ ] `modifyDieValue` — increase or decrease a die's current value by N

**Card plays — not yet assigned**
- [ ] `playCard` — play a card from hand or discard with optional cost modifier
- [ ] `returnToHand` — return a card or upgrade from play to its owner's hand
- [ ] `searchDeck` — search a deck for a card matching a filter, reveal, add to hand
- [ ] `discardCards` — force a player to choose and discard N cards from hand
- [ ] `discardFromDeck` — discard N cards from the top of a deck
- [ ] `lookAtCards` — look at the top N cards of a deck or random cards from a hand
- [ ] `revealTopCard` — reveal the top card of a deck and optionally act on its cost/type
- [ ] `returnDefeatedCharacter` — return a defeated character to play (with optional damage state)

**Character / card state — not yet assigned**
- [ ] `activateCharacter` — activate a character (roll its dice into the pool)
- [ ] `exhaustCard` — exhaust a character, support, or upgrade
- [ ] `readyCard` — ready an exhausted character, support, or upgrade
- [ ] `moveDamage` — move N damage from one card to another (ignores shields unless specified)
- [ ] `moveShields` — move N shields from one character to another
- [ ] `placeDamageOnCard` — place N damage counters on a support (not dealt as combat damage)
- [ ] `placeResourceOnCard` — place N resources on a support; or take all resources from it
- [ ] `grantKeyword` — give a card a keyword for the rest of the game or current round
- [ ] `forceActivate` — force an opponent to activate a character as their next action
- [ ] `takeBattlefieldControl` — take control of the battlefield without claiming it
- [ ] `claimBattlefield` — claim the battlefield (triggers claim ability)
- [ ] `endActionPhase` — end the action phase immediately
- [ ] `takeAdditionalActions` — grant the active player N additional actions

**Branching — not yet assigned**
- [ ] `choice` — present two effect branches; active player or opponent picks one

---

### Done
- **2026-05-15 — ENGINE-8 — Multi-target resolve-dice action.** `resolve-dice` action gains `targets: readonly { dieInstanceIds; targetCharacterId? }[]`; resolution loop applies per-group damage/shields; backward-compat flat shape normalised in apply-action.ts; 3 new tests (2-melee split, shield split, legacy compat); all existing tests migrated to new shape; 171 engine tests green, typecheck clean.
- **2026-05-15 — WEB-3D-3 — Die face picker (focus flow).** (`95c55e3`) Engine: focus path in `applyResolveDice` — focuser dice removed from pool, target dice stay with updated faces, self-targeting blocked, 6 new tests. `focus` added to `RESOLVABLE_SYMBOLS_V1`. `FacePickEvent` union + `face-pick` ActiveFlow in store. UI: tapping a focus die → resolve flow → commit transitions to face-pick; tapping target die opens `FacePickerPanel` (6 face tiles, current face highlighted); picking a face records a flip event and decrements budget; focus-face tap chains die as new focuser; Undo backs out one flip/chain at a time; End focus dispatches resolve-dice with ordered focusFlips. DicePool3D shows focuser as dimmed, open-picker die highlighted, flipped dice amber. Typecheck + 168 engine tests green.
- **2026-05-15 — WEB-3D-2 — Dice Results Cam.** (`7582337`) Full-screen Three.js roll cam (r3f + useFrame physics). Each die has 6 real Prophecy face textures; physics rolls freely showing all faces; slerps to correct Euler orientation on settle so server-determined face lands on top. Thrown from upper-left with walls, dt-based damping, 3s hard cap. Replaced `@3d-dice/dice-box` entirely. Face texture code extracted to `src/lib/dieFaceTexture.ts` (shared with board dice).
- **2026-05-15 — WEB-3D-1 — Three.js board dice layer.** (`f845703`) `DicePool3D.tsx` lazy-loaded via React.lazy/Suspense — replaces flat DiceStack in BattlefieldRow for both player and opponent zones. Each die is a `RoundedBoxGeometry` (chamfered edges) with a canvas-texture face showing value + abbreviated symbol on the card's color. Ambient + directional lighting from above-right gives chamfer depth. Pre-roll Mario Party tumble fires on the activating character's dice when `activeFlow.kind === 'activate'`. All DiceStack interaction states (resolve symbol-lock, reroll pick, eligible highlight) mapped to emissive tint. Flat DiceStack used as Suspense fallback. Adaptive orthographic zoom shrinks to fit N dice. Typecheck + 161 engine tests green.
- **2026-05-15 — WEB-18 — Card ability badges on in-play characters.** `action`/`powerAction` abilities render circular badges (A/PA) on bottom-left of CharacterCard. Green ring when eligible; power action badges grey out after use and clear on round change. `cardAction` flow added to `ActiveFlow`; `usedPowerActionKeys` tracked in Zustand; Commit dispatches `use-card-action`. Shield Maiden seeded with test action + powerAction abilities. CLAUDE.md updated with correct AbilityBuilder path. Typecheck + 152 engine tests green. (`897a7a1`)
- **2026-05-14 — WEB-17 — Discard-to-reroll + claim (already in WEB-15).** Reroll flow: pick-card (amber hand), pick-dice (amber tiles), Undo walks back steps. Focus deferred pending engine support. (`3f8f48c`)
- **2026-05-14 — WEB-16 — Dice resolution flows.** Tap-to-resolve with symbol locking; red/blue targeting rings on chars; resolve-dice dispatch with target; Commit disabled until target chosen for damage/shields. (`8cdb871`)
- **2026-05-14 — WEB-15 — Activation flow.** Roll Dice dispatches activate action; claim-battlefield wired; pendingExhaust tilt on card while flow is active. (`c15773c`)
- **2026-05-14 — WEB-14 — Green highlight system + turn state machine.** ActiveFlow in store; green rings on activatable chars, resolvable dice, claimable battlefield; Undo button; Commit label changes by flow; clears on turn rotation. (`5b5d0e0`)
- **2026-05-14 — WEB-13 — Avatar bar.** Resources, deck, discard, battlefield card name + controller arrow, opponent hand/deck/resources. Typecheck clean. (`21eee6d`)
- **2026-05-14 — WEB-12 — Dynamic battlefield columns.** Character cards and dice render in OpponentZone and PlayerZone. 92px fixed card columns, hard cap of 3 per row (MAX_CHARS_PER_ROW), greedy front-fill distribution (4 chars → [3,1]). HP/shield overlay on card top-left. Dice area reserves min-h so cards don't shift when pool fills. White center divider separates the two sides. Typecheck clean. (`002104c` + polish through `c0dccd2`)
- **2026-05-14 — WEB-11 — Mobile-first layout shell.** New 5-region top-to-bottom BattleZone: AvatarBar (names, resources, deck counts, ⚡), OpponentZone + PlayerZone placeholders, InlineHandStrip (always-visible compact strip, tap-to-expand ability text, eligible card green border), ActionBar (Pass with confirm dialog). Old fixed-position HandStrip and SelectionActionBar removed. Typecheck clean. (`4a88eb7`)
- **2026-05-14 — WEB-10 — Battle zone: four-column board layout with CCG card ratio**. `ownerInstanceId?: string` added to `DieInPool` (engine types + activate.ts + reroll-dice.ts). New `BattleZone` component replaces `PlayerSummaries` + `DicePoolStrip` in `Game.tsx`: four-column grid `[player cards][player dice][opp dice][opp cards]` using two 2-column grids per side (9fr:7fr and 7fr:9fr). `CharacterCard` renders CCG-ratio (63/88) tiles with art gradient, health badge, and name scrim; exhausted characters rotate 90° via `transform`. Upgrade badges are 40×40 circular buttons outside the card button (no nested-button violation). `DiceStack` shows vertical die tiles per character, aligned top-edge with the card; tapping a die on your turn enters resolve mode and selects it. `CardDetailOverlay` and `UpgradeDetailOverlay` show full card details. 152 engine tests green; typecheck clean. (`6970602`)
- **2026-05-14 — WEB-8 — Drag-to-play Pass 1** (`78c03ce`). `useDragToPlay` hook handles touch and mouse globally on document — avoids iOS's "events fire on originating element" limitation. Drag starts after 8px movement or 120ms hold. Affordable cards in hand strip gain `onTouchStart`/`onMouseDown` handlers; others stay tap-only. Floating `DragArtifact` portal follows the finger imperatively via ref (no per-frame setState). Game board (`<main data-droptarget="play">`) glows emerald when card is dragged over it. Release over board plays the card; release elsewhere cancels. Taps still open the expanded overlay. Typecheck clean.
- **2026-05-14 — WEB-4 — Hand strip, expanded view, play-card integration** (`10d2fc2`). `cardCatalogIds` added to `GameState` (instance-id → catalog-card-id); `newGameFromDecks` populates it for characters + deck cards and now correctly wires `cardCosts` from the catalog. Persistent `HandStrip` at bottom shows compact card tiles with type color band, cost badge, and affordability highlight. Tapping a tile or the Play card / Discard to reroll buttons opens `HandOverlay` — bottom-sheet with scrollable card row and focused-card detail panel (name, type, faction, cost, ability text, die face chips). Long-press / right-click focuses a card for reading. `ActionPanel`'s old inline play-card and reroll target grids removed. 152 engine tests green; workspace typecheck clean.
- **2026-05-14 — OPS-1 — External hosting: Vercel (web) + Railway (game-server)**. Vercel frontend deployed and Railway socket server deployed. Dynamic `PORT` fallback added to game-server, `WEB_PUBLIC_URL` configured for CORS, and `VITE_GAME_SERVER_URL` configured in Vite. `package.json` entry points mapped to `dist/index.js` and `prebuild` hooks added for workspace dependencies to resolve production builds. Real-time multiplayer verified across devices.
- **2026-05-13 — SERVER-2 + WEB-3 — FIFO matchmaking queue + Find Match UI** (`c3ea317`). In-memory FIFO queue in `apps/game-server/src/index.ts` (`lobby.findMatch` / `lobby.leaveQueue` socket events, disconnect handler clears the queue). Match fires `lobby.matchFound` unicast to both players with full lobby + game state. New protocol types: `LobbyFindMatchReq`, `LobbyLeaveQueueReq`, `MatchFoundPayload`. `SocketBridge` in `App.tsx` handles `matchFound` identically to rejoin. Splash rewritten: Find Match is the primary CTA, searching state shows spinner + Cancel, invite-code flow demoted to secondary. Typecheck clean.
- **2026-05-13 — ENGINE-7 — The queue, after-triggers, before-triggers** (`e6e86a7`). `GameState` gains `queue`, `pendingTriggers`, `nextQueueEntryId`. `QueueEntry` fully typed. Trigger scanner (`queue/scan.ts`) maps engine events to `TriggeredAbility` matches; `collectAfterTriggers` + `collectBeforeTriggers` + `commitTriggers` + `applyOrderTriggers`. Queue drain (`queue/drain.ts`) FIFO loop with tail-append for drain-spawned triggers. Before-triggers wired inline in `activate.ts` and `resolve-dice.ts` (beforeActivate, beforeTakeDamage). After-triggers wired in `activate.ts`, `resolve-dice.ts`, `play-card.ts` via `commitTriggers` + drain. Simultaneous trigger ordering via new `order-triggers` action and `PendingTriggers` state machine. `LegalActions` gains `canOrderTriggers`. 152 tests green; workspace typecheck clean.
- **2026-05-13 — ENGINE-6 — Ability AST framework + first-wave event dispatcher** (`2676a51`). Full `Ability`/`Effect` TypeScript type system in `game-engine/src/abilities/types.ts` (6 ability kinds, 7 first-wave ops + 28 stubs). Matching Zod schemas in `@prophecy/protocol/src/catalog.ts`. Shared combat helpers extracted to `state/combat.ts`; `applyResolveDice` updated to import from there. `applyEffect` / `applyEffects` dispatcher in `abilities/dispatch.ts` — first-wave ops implemented (`dealDamage`, `addShields`, `removeShields`, `drawCards`, `gainResources`, `loseResources`, `healDamage`); all other ops throw `NotImplementedError`. `applyPlayCard` wired to fire `immediate` abilities; `GameState` gains `cardAbilities` map; `play-card` action gains `characterTargets`. Op names migrated to camelCase in `packages/db/seed/cards.json`; admin `AbilityBuilder.tsx` updated. 3 new engine events (`shields.removed`, `damage.healed`, `cards.drawn`). 147 tests green; workspace typecheck clean.
- **2026-05-13 — ADMIN-1 — Original-card / deck admin UX + JSON-backed catalog** (`a8abde9`). New canonical catalog at `packages/db/seed/cards.json` + `decks.json` (37 cards + 2 decks, mechanically ported from `synthetic-set` with rewritten original-IP names + ability text). Shared Zod schemas (`cardSchema`, `deckSchema`, `effectSchema`, `abilitySchema`) in `@prophecy/protocol`. Game-server loads + validates the catalog at boot via `corpus.ts`; `startRoom` now plays from `packages/db/seed/` instead of `synthetic-set` (which stays test-only). New REST endpoints on game-server: `GET/PUT /admin/cards`, `GET/PUT /admin/decks` — dev-only, no auth. Admin UX at `/admin/cards` and `/admin/decks` in `apps/web`: per-tab table + edit form, character / battlefield / plot pickers driven by card type, ability builder with a form per known op plus a `(new)` placeholder that doubles as the running TODO list of unimplemented effect ops. Deck-build rule enforcement (color / faction / 30-card / 2-copy) intentionally out of scope — author manually for now. Die-face editor deferred — characters keep their seeded faces read-only. 121 engine tests still green; workspace typecheck clean.
- **2026-05-13 — ENGINE-5 — Modifier-with-parent enforcement + symbolless modifiers + Draw symbol** (`ac1d50d`). `DieSymbol` union extended with `'draw'` (new card-draw resolve path, currently rejected as "not yet implemented") and `'modifier'` (symbolless wild +N face). Mirrored in `@prophecy/protocol`, `@prophecy/db`, and the synthetic-set Zod schema. `applyResolveDice` replaces the implicit "all dice share a symbol + not all are modifiers" check with an explicit two-case rule: non-modifiers must share a symbol; each symboled modifier needs a same-symbol non-modifier; each symbolless `'modifier'` die needs any non-modifier with `value > 0` (special and blank are value 0 and never qualify). UI: `symbolGlyph` → `symbolLabel`, full words on the dice tiles (Melee, Ranged, Indirect, Shield, Resource, Disrupt, Discard, Draw, Focus, Special, Modifier, Blank); `canSelectDie` admits symbolless modifiers once a locked symbol is set. 121 engine tests green (5 new in `resolve-dice.test.ts`).
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