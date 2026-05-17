# Decisions

Append-only log of architectural choices, scope boundaries, and non-obvious design decisions. When a future session asks "why did we do X this way?", the answer lives here.

**Format:** date · area tag · decision and rationale. Append at the bottom; never edit existing entries. One entry per decision. Two sentences max on rationale — if it needs more, the README is the right place. See [CLAUDE.md → DECISIONS.md — record non-obvious choices](CLAUDE.md#decisionsmd--record-non-obvious-choices) for when to add an entry.

---

### 2026-05-10 — [ARCH] Three apps, not six

Started with `web`, `api`, and `game-server` rather than immediately splitting out `admin`, `matchmaker`, and `jobs`. The future extraction points are named in ROADMAP.md Backlog so they don't get lost, but splitting before load demands it adds coordination overhead for no gain.

### 2026-05-10 — [ARCH] Pure engine package — no I/O, no framework deps

`packages/game-engine` has zero I/O or framework dependencies. This makes it fully deterministic given a seed (unit-testable without a server, DB, or network), enables full game replay from seed + event log, and keeps the rules portable if infra changes.

### 2026-05-10 — [ARCH] Event sourcing for game records

Games are stored as seed + ordered event sequence, not as snapshots. This enables replay (spectators, post-game review), anti-cheat analysis (heuristics run over the full post-game event log), and animation choreography on the client (re-play events to drive effects). Redis holds the live snapshot for fast reads; Postgres holds the durable event log.

### 2026-05-10 — [ARCH] Server-authoritative, zero trust on client

Game state lives exclusively in the engine on the server; clients send action intents, the server validates through the engine before applying anything. A client that tracks game state locally can be modified to cheat — server authority is the only real defense for a web-based game.

### 2026-05-10 — [TECH] Hono over Express

Fast, minimal, and runs unchanged on Node, Bun, and edge runtimes. Chosen over Express to avoid the middleware incompatibility surface and keep future deployment options open.

### 2026-05-10 — [TECH] tRPC for web ↔ api

Type-safe RPC with no codegen; both sides share TypeScript types from `packages/protocol` so the contract is verified at compile time. REST exists only for third parties (webhooks, OAuth callbacks) that can't use tRPC.

### 2026-05-10 — [TECH] Drizzle over Prisma

Drizzle is lightweight with no runtime engine — it generates typed SQL, not an ORM abstraction layer, and migrations are plain SQL files that are easy to audit and apply manually. Chosen over Prisma primarily to avoid the binary query-engine overhead and the Prisma Client generation step.

### 2026-05-10 — [TECH] Socket.io over raw WebSockets

Socket.io adds rooms, namespaces, automatic reconnect-on-disconnect, and fallback transport — all things we'd otherwise build ourselves. The game-server needs per-game rooms and reliable reconnect; Socket.io solves both with low boilerplate.

### 2026-05-10 — [TECH] Neon (serverless Postgres)

PITR (7-day window) covers accidental deletes and bad migrations; database branching gives preview deploys their own isolated DB without extra provisioning. Chosen over RDS or Supabase for the branching story and serverless cold-start economics at early scale.

### 2026-05-10 — [TECH] Upstash Redis

Pay-per-request regional Redis — enough for active game state, matchmaking queues, and session cache at current scale, with no persistent connection overhead. Chosen over Redis Cloud or self-hosted for operational simplicity until we need more control.

### 2026-05-10 — [TECH] Cloudflare R2 for asset storage

Zero egress fees vs S3's $0.09/GB. For a card game with art-heavy assets (card backs, dice skins, animated playmats), egress dominates at scale. The S3-compatible API means no lock-in if we move later.

### 2026-05-10 — [TECH] Three.js for board dice

CSS 3D transforms cannot produce chamfered cube edges or physically-accurate lighting. Three.js (`RoundedBoxGeometry` + directional lights) gives real geometry for the persistent board dice layer; `@react-three/fiber` and `@react-three/drei` keep it idiomatic React without a separate render loop.

### 2026-05-10 — [TECH] better-auth over auth.js / Passport

better-auth ships session management, OAuth2 social providers, and a Drizzle adapter as a coherent unit with modern TypeScript DX. Auth.js has a larger ecosystem but weaker TypeScript ergonomics and more configuration surface. Passport is effectively unmaintained.

### 2026-05-10 — [TECH] Paraglide for i18n

Compile-time message extraction with zero runtime overhead and strict TypeScript message typing. Chosen over react-i18next for the absence of runtime bundle cost — all translations are resolved at build time, not at render time.

### 2026-05-10 — [TECH] BullMQ workers in-process initially

Workers live inside `apps/api` rather than a separate `apps/jobs` service. This avoids inter-service coordination overhead until queue load or worker reliability becomes a real problem; the extraction point is named in ROADMAP.md Backlog.

### 2026-05-10 — [GAME] Ability text stored as AST, not prose

Card abilities in `card_abilities` are a structured JSON AST the engine dispatches directly (`kind`, `trigger`, `effect[]`, `conditions`), with a separate `display_text` column for the human-readable card text. This keeps rules machine-interpretable without parsing natural language and lets display wording change without touching engine behavior.

### 2026-05-10 — [GAME] Mechanical-only third-party fixtures isolated under `__fixtures__/`

The engine needs a large corpus to exercise edge cases before Prophecy's own card set exists. A public reference game's mechanics (dice face profiles, point values, keywords, ability type tags) are uncopyrightable and useful for engine testing; titles, ability prose, and art are not. The fixture lives only under `packages/game-engine/__fixtures__/`, imported only from test paths, never bundled into production.

### 2026-05-10 — [SCOPE] v1.0.0 is 1v1 only

2v2 and free-for-all are documented in the rules and the engine keeps the right abstractions (battlefield-controller tiebreak, multi-opponent targeting, clockwise turn order), but matchmaking, UI, balance work, and content for non-1v1 modes waits until v1 ships. Building and tuning other modes before the core game is stable is a reliable way to ship nothing.

### 2026-05-10 — [SCOPE] Touch-first, not mobile-port-later

Every interaction is designed for touch first; desktop gets the same UI with a cursor on top. Retrofitting touch onto a hover-driven design takes longer than doing it right from the start and is the kind of work that never gets finished before ship.

### 2026-05-10 — [MONETIZATION] No paid randomized gameplay-card packs

Booster packs of gameplay cards are sold for soft currency only; hard currency (real money) buys cosmetics, season pass, and currency packs. This sidesteps lootbox regulation in most jurisdictions and keeps the ranked ladder fair-to-play.

### 2026-05-10 — [MONETIZATION] Cosmetics are strictly gameplay-neutral

Anything purchasable with hard currency cannot affect game balance. This is a bright line, not a guideline — the distinction protects both player trust and regulatory clarity.

### 2026-05-13 — [GAME] Roll-off winner chooses who goes first

The player who wins the opening roll-off picks which player acts first; the engine then assigns the shield recipient automatically. This gives the roll-off winner a meaningful strategic decision (tempo vs. shield) rather than a purely luck-based start.

### 2026-05-15 — [UI] Roll cam removed but foundations kept

A full-screen physics roll animation was prototyped and removed — the feel was too janky. `DicePool3D` and the quaternion helpers (`FACE_CORRECT_Q`) are kept because the right solution uses the same stack (proper textured die geometry, physics-based settle, hard cut back to the board). Deleting the foundations would mean rebuilding them.

### 2026-05-16 — [CATALOG] Per-card JSON files instead of monolithic seed

Migrated from a single `cards.json` to `packages/db/seed/cards/{id}.json` — one file per card. Git diffs are surgical (a diff for CHAR_001 only shows CHAR_001), and concurrent authors or sessions editing different cards never produce merge conflicts. The designer's Git Data API commit path creates one tree entry per changed card so the commit is still atomic.

### 2026-05-16 — [ARCH] Incremental event-log writes for in-flight durability

`GameWriter` was rewritten from flush-on-game-end to `open()` / `append()` / `close()`. Each round's events are written immediately; if the server dies mid-game, the partial log is already in Postgres and the session can be marked `abandoned` on boot. The old model lost all events for games that never reached `game.ended`.

### 2026-05-17 — [GAME] Cost-modifier effects prompt at play time

When a player plays a card and one or more in-play cost modifiers are eligible (predicate matches, usage cap not hit), the client opens a confirm modal listing each option plus "Pay full cost"; the player's pick rides on the `play-card` action and the engine validates+applies it. We rejected always auto-applying the best discount because some modifiers carry side costs (exhausting the source, consuming a charge) and the player must consent — the engine is still source of truth via `getCostModifierOptions`, the client only renders the choice.

### 2026-05-17 — [ENGINE] Play restrictions are a card-level field, not an ability

`playRestriction` lives on the catalog card schema, not inside `Ability`. Triggered abilities already have `playCondition` for "fire only if…" semantics; conflating the two would muddy what's gating what — card-level restrictions gate whether the card can be played at all, evaluated by `play-card` / `getLegalActions` before any ability dispatches.

### 2026-05-17 — [ENGINE] Passive abilities use an attached-index, not on-read recomputation

`GameState.activePassives` is keyed by the affected card and recomputed on enter/leave-play, not on every stat read; combat math reads stability and keywords many times per resolution and an index keeps that O(1). Deterministic ordering is fixed at attach time (`attachedAtSeq`, tiebreak `instanceId`) rather than re-derived on every read, which avoids subtle non-determinism when multiple passives modify the same stat.

### 2026-05-17 — [ENGINE] Step model with implicit AND (no explicit container)

Abilities expose `steps: EffectStep[]` where each step is `{ effects: Effect[], then?: boolean }`. AND-grouping ("Discard a card AND remove a shield") is implicit in a step holding multiple effects; we rejected an explicit `AND` wrapper because authors think "I'm adding another effect to this step", not "I'm wrapping things in a container". `then` gates a step on the previous step's `fullyResolved` (AND of its effects' resolution flags) — this handles "Discard AND remove a shield. Then deal 3." gating on **both** prior effects, which a flat then-on-the-last-effect model can't express.

### 2026-05-17 — [ENGINE] `playCondition` (per-ability) and `playRestriction` (per-card) stay distinct fields

ENGINE-PC1 enforces the existing per-ability `playCondition`; ENGINE-PR1 adds a new top-level `playRestriction` on the card itself. They evaluate similar predicates but gate different things — one is whether the ability fires, the other is whether the card can leave hand at all. Whichever lands second factors out a shared predicate-evaluator module; we did not pre-merge them because the call sites differ and a premature merge would muddy which field gates what.

### 2026-05-17 — [WEB] Live Preview of opponent actions via fire-and-forget socket broadcast

The active player's `ActiveFlow` (client-side interaction state) is serialized and broadcast to opponents via a fire-and-forget `game.preview` Socket.io event whenever it changes; the opponent renders `previewFlow` to show card tilt, selected dice, spent dice, face-pick state, and reroll targets in real time without waiting for `game.state` commits. Dice tumble on the opponent side is driven separately by `tumblingPoolDieIds` (set from the authoritative `game.events` event) because the tumble must reflect actual rolled results, not the pre-roll preview.

### 2026-05-17 — [WEB] 3D dice render as six plane meshes per die, not one RoundedBox with six textured materials

`Die3D` is a group containing one `RoundedBox` body (solid color, no texture) plus six flat plane meshes overlaid on each face, each with an upright canvas texture. We tried the one-mesh-six-materials approach across nine PRs (#67, #78, #79, #81, #86, #100, #101, #102, #110) and it never stabilised — `RoundedBoxGeometry`'s UV axes differ from `BoxGeometry` and required per-face rotation, offset, and mirror corrections that drifted out of sync every time anything changed. Six planes makes the orientation derivable from first principles (`FACE_CORRECT_Q[2]` is identity by construction) and eliminates the entire `/dice-preview` tuner.
