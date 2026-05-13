# Prophecy

An online multiplayer platform for **Prophecy** — an original dice-and-card dueling game. This repository implements the rules engine, the live service around it (real-time matches, matchmaking, ladder, tournaments), the player-facing client (deckbuilder, collection, storefront), and the back-office tools that keep them running.

**Target platforms:** desktop, tablet, and mobile/phone. Desktop is the priority for early testing because that's what we work on, but tablet and mobile are first-class targets, not afterthoughts. The full game must be playable with touch input alone — no right-clicks, no hover-only affordances, no precision drags. See [Input model](#input-model).

**v1.0.0 scope: 1v1 only.** Other modes — **2v2** team play, **3–4 player free-for-all**, and any other variant — wait until 1v1 has launched and stabilized. The engine and rules document already cover FFA, and the abstractions (battlefield-controller tiebreak, clockwise turn order, elimination, multi-opponent targeting) generalize cleanly enough that 2v2 fits the same shape. But matchmaking, UI flows, balance tuning, and content work for non-1v1 modes are explicitly post-v1. See [Backlog — post-v1.0](#backlog--post-v10).

> **Scope note.** Prophecy is an original property. The gameplay system implemented here is inspired by the design space of dice-and-card dueling games but does **not** ship with or depend on any third-party intellectual property (names, art, characters, factions, world). All cards, art, names, and lore that ship to players are original to this project. The reference rules document under `docs/` describes the abstract game system only.
>
> Third-party reference data (e.g., a public card index from a related game) may live under clearly-isolated `__fixtures__/` paths for engine-validation purposes only — mechanical structure only, no titles, ability prose, or art. See [Reference data & test fixtures](#reference-data--test-fixtures).

---

## Source of truth

**This README is the canonical description of Prophecy's product, architecture, tech stack, schema, and roadmap.**

Whenever a decision is made — a new service is added, a library is swapped, a feature is scoped, a schema column is added, a TODO is opened or closed — update this file in the same change. Conversation transcripts and chat threads are not durable; the README is. See [Working agreements](#working-agreements).

---

## What is Prophecy (the game)?

A two-player (or 3–4 player free-for-all) dice-and-card duel. Each player builds a **team of characters** (up to 30 points), a **30-card deck**, and brings a **battlefield**. Characters have custom dice; **upgrades** and **supports** add more dice. Players alternate single actions — activating characters to roll dice into a pool, resolving dice for damage / resources / shields / effects, playing cards, claiming the battlefield — until one side's characters are all defeated.

What the engine has to model:

- **Dice pool** — rolled dice sit in a pool; players resolve them one action at a time.
- **Resources** — currency gained each upkeep, spent on cards and on dice with resource costs.
- **Faction** (Light / Shadow / Neutral) and **color** (Red / Blue / Yellow / Gray) gating for team and deck construction.
- **Upgrades** attached to characters (max 3 per character), with **Redeploy** moving them on defeat.
- **Keywords** — Ambush, Guardian, Modify, Redeploy.
- **Ability types** — Action, Power Action, Claim, Ongoing, Special (S die symbol), Triggered (after / before).
- **Battlefield control** — winner of opening roll-off chooses the battlefield and acts first each round.
- **Modes beyond 1v1** *(post-v1)* — 2v2 team play and 3–4 player free-for-all are documented in the rules and accommodated in the engine design, but ship after v1.0.0.
- **Replacement effects** ("instead" / "would be") and the **queue** that orders simultaneous after-abilities while letting before-abilities interrupt.
- **Simultaneous-ability tiebreak** by the battlefield controller.
- **Inherent dice abilities** that travel with the die independent of the card being in play.

The full ruleset is [docs/rules-reference.md](docs/rules-reference.md) and is the binding spec for the engine.

---

## Architecture

Prophecy is a **TypeScript monorepo** (pnpm workspaces + Turborepo). Three apps to start; the boundary lines for future extractions are drawn but not yet split.

```
prophecy/
├── apps/
│   ├── web/            # Player client + role-gated admin pages
│   ├── api/            # HTTP + tRPC API (Hono host) + in-process BullMQ workers
│   └── game-server/    # Real-time game engine host (WebSocket)
├── packages/
│   ├── game-engine/    # Pure, deterministic rules engine
│   ├── protocol/       # Shared tRPC routers, Zod schemas, event types
│   └── db/             # Drizzle schema + generated client
├── infra/
│   ├── docker-compose.yml
│   └── migrations/
└── docs/
    └── rules-reference.md   # binding spec for the engine
```

**Why three apps, not six?** A platform like this eventually wants separate `admin`, `matchmaker`, and `jobs` services for independent scaling and blast-radius reasons. None of that matters on day one. We start with the smallest viable split and extract on demand. The [Roadmap](#roadmap) tracks the future extractions so they don't get lost.

### Services

#### `apps/api` — HTTP + tRPC API
**Hono** host with **tRPC** mounted for internal (web ↔ api) calls and a thin REST surface for third parties / webhooks (Stripe, OAuth callbacks). **Drizzle ORM** for database access. **BullMQ** workers run in-process initially (extract to a separate `apps/jobs` when load demands).

- Authentication (session-based via **better-auth**, OAuth via Google & Discord).
- Player accounts and profiles.
- Card collection management.
- Deck builder (create, validate, update, delete).
- Storefront (Stripe checkout sessions, webhooks, receipts, refunds).
- Season pass progress and reward claiming.
- Cosmetics shop and inventory.
- Tournament registration and bracket queries.
- Ladder standings and match history.
- Matchmaking queue workers (extract to `apps/matchmaker` when load demands).
- Admin endpoints (role-gated; surfaced through `apps/web` admin pages).

#### `apps/game-server` — Real-time Game Server
WebSocket service (**Socket.io** for room/namespace ergonomics and reconnect handling). Each active game is an isolated room with a server-authoritative state machine. Clients send action **intents**; the server validates and applies them against the engine, then broadcasts the resulting events to everyone in the room.

- **Zero trust on client input** — every action is validated server-side by the engine.
- Live game state in **Redis** (fast reads, TTL cleanup, pub/sub fan-out).
- Final game results and the full event log persisted to Postgres on game end.
- Spectator support via read-only room subscriptions.
- Reconnect window with hand-rehydration based on the stored event log.
- Sticky room ownership via a Redis-backed coordinator (any server can claim a room; only one owns it at a time).

#### `apps/web` — Player Client
**React 19 + TypeScript**, bundled with **Vite**. Ships as a **PWA** (installable, offline-cacheable shell). Native shells via **Capacitor** are a future path, not v1.

- **TanStack Query** + **tRPC client** for server state.
- **Zustand** for ephemeral client game state (animation queues, UI interactions).
- **Socket.io-client** for the live game connection.
- **Pixi.js v8** + **@pixi/particle-emitter** for the 2D game board, dice, particles, and combat-effect overlays (energy blade trails, ranged-shot tracers, impact bursts, dust, screen-flashes). Pixi sprite-sheets cover celebration animations too — no separate Lottie pipeline.
- **Framer Motion** for DOM-side animations: card lifts, drag-and-drop, modal transitions, pack-opening choreography.
- **Howler.js** for SFX + music with mixing buses (UI, card, dice, ambient, music) and a per-bus volume slider.
- **Tailwind CSS + shadcn/ui** for the surrounding UI (lobby, deckbuilder, store, profile, admin).
- **Paraglide** for i18n (compile-time, zero runtime overhead).
- Reduced-motion mode that swaps every animation for a static fade and disables particle emitters.
- Color-blind mode that pairs dice symbols and faction colors with distinguishable shapes.
- Admin pages live at `/admin/*` behind a server-checked role gate (no separate app yet).
- **Touch-first responsive layout** — desktop, tablet, and phone are all first-class. Desktop ships first because it's our test environment, but no UI affordance exists that doesn't have a touch equivalent. See [Input model](#input-model).

#### `packages/game-engine` — Rules Engine
Pure TypeScript, **zero dependencies on any framework or I/O**. Fully deterministic given a seed. The heart of the platform.

```
game-engine/
├── state/           # GameState, PlayerState, DicePool, Queue types
├── actions/         # One file per action type (activate, resolve, play-card, ...)
├── abilities/       # Triggered, ongoing, special, keyword, replacement resolvers
├── queue/           # Queue + interrupt handling (before/after, additional actions)
├── validators/      # Deck validation, action legality, targeting rules
├── reducers/        # Pure (state, action) => { state, events } transitions
├── rng/             # Seeded RNG + dice rolling
├── __tests__/       # Exhaustive unit tests per rule section
└── __fixtures__/    # Reference test data (see "Reference data & test fixtures")
```

All rules from [docs/rules-reference.md](docs/rules-reference.md) are implemented here. The game server imports this package and wraps it with I/O (sockets, persistence).

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript (strict) | End-to-end type safety, shared types |
| Monorepo | pnpm workspaces + Turborepo | Fast installs, incremental builds, remote cache |
| Frontend framework | React 19 | Ecosystem, team familiarity |
| Frontend build | Vite | Fast HMR, ESM-native |
| Game board renderer | Pixi.js v8 | GPU-accelerated 2D canvas, ideal for card games |
| Particle effects | @pixi/particle-emitter | Sword/saber trails, blaster bolts, impact bursts |
| DOM animation | Framer Motion | Card lifts, drag, modals, choreographed pack-open |
| Audio | Howler.js | SFX + music, mixing buses, web-audio under the hood |
| i18n | Paraglide | Compile-time translations, no runtime |
| API framework | Hono | Fast, minimal, runs on Node/Bun/Edge with no changes |
| API contract | tRPC | Type-safe RPC between web and api with no codegen |
| Real-time | Socket.io | Reliable WS with fallback, rooms, namespaces, reconnect |
| ORM | Drizzle | Type-safe SQL, lightweight, no runtime engine, easy migrations |
| Primary DB | PostgreSQL (Neon) | Relational, ACID, branching for preview deploys, PITR |
| Cache / pubsub | Redis (Upstash) | Active game state, matchmaking queues, session cache |
| Job queues | BullMQ | Tournament scheduling, season rollover, async notifications |
| Auth | better-auth + OAuth2 | Session-based, modern DX, Discord/Google login, 2FA-ready |
| Validation | Zod | Runtime + compile-time, shared via `packages/protocol` |
| Payments | Stripe (+ Stripe Tax) | Cards, Apple/Google Pay, regional pricing, tax, refunds |
| Email | Resend | Transactional email (receipts, password reset, alerts) |
| Testing | Vitest + Playwright | Fast unit tests, E2E for game flows |
| Observability | OpenTelemetry + Sentry | Distributed traces + error tracking across services |
| Containerization | Docker + Docker Compose | Consistent local dev |
| CI/CD | GitHub Actions | Lint / typecheck / test / build on every PR; deploy on merge |
| Asset storage / CDN | Cloudflare R2 | S3-compatible, **zero egress fees** — large savings for art/audio delivery |
| Asset pipeline | Sharp + ffmpeg in CI | Resize / encode source art into delivery atlases & WebP/AVIF |
| Edge / DDoS | Cloudflare proxy + Turnstile | DDoS shielding, bot protection on signup and high-value actions |

> **Tech stack changes go in this table.** If you add or swap a dependency that other services touch, update this table and the relevant service section in the same PR.

---

## Hosting & operations

| Concern | Choice | Notes |
|---|---|---|
| Web client | Vercel | Static + edge functions, PR previews, fast global CDN |
| `api` | Fly.io | Regional deploy, Docker, easy private networking to game-server |
| `game-server` | Fly.io | Regional deploy keeps WebSocket latency low; player routed to nearest region |
| Postgres | Neon | Serverless Postgres with branching (preview deploys get their own DB) and PITR |
| Redis | Upstash | Pay-per-request, regional, enough for live game state and queues |
| Object storage | Cloudflare R2 | Card art, audio, replays, cosmetic assets |
| Edge / WAF | Cloudflare | Sits in front of all public endpoints; DDoS, rate-limit rules, bot detection |
| Email | Resend | Transactional |
| Errors / traces | Sentry + OTel collector | Self-hosted collector → Sentry for errors, Honeycomb/Tempo for traces |

### Backup & disaster recovery

- **Postgres:** Neon's PITR (7-day window) covers accidental deletes and bad migrations. Logical dumps to R2 on a daily schedule for long-term retention.
- **Event log:** every game's event stream is durable in Postgres. We can rebuild any completed game from its seed + events even if Redis is lost.
- **In-flight games:** if a game-server region dies mid-match, players reconnect to a healthy region; the room is rehydrated from Redis (live snapshot) or Postgres (event-log replay) by the new owner. Rooms older than the current round are abandoned with a no-loss ladder credit.
- **Asset bucket:** R2 with versioning enabled.
- **Restore drills:** documented runbook + a quarterly "restore from yesterday's dump into a scratch DB" exercise.

### Anti-cheat

Server-authoritative + event-sourced is the foundation; everything below sits on top.

- **Rate limits** at the edge (Cloudflare) and per-user inside `api` for sensitive endpoints (login, purchase, queue join).
- **Action timing checks** in `game-server` — actions arriving faster than a configurable floor get queued with backpressure; impossible reaction times flagged.
- **Concurrent-game limits** per account (no botting via parallel games on one account).
- **Replay analysis** workers: post-game heuristics for dice-roll bias (chi-squared per user over a window), suspicious win patterns, queue-dodging.
- **Turnstile** challenge on signup, on first purchase per device, and on flagged accounts.
- **Soft and hard ban tiers** in `audit_log` + `users`. Soft = match-restricted; hard = full account hold.

---

## Database Schema (Overview)

```
users                  — accounts, OAuth providers, settings, age band, role, ban tier
sessions               — auth sessions (better-auth)
cards                  — full card catalog (id, set, type, faction, color, cost, health, points, display_text)
card_abilities         — JSONB AST per card; one row per ability (kind, trigger, effect, conditions)
card_dice              — dice faces for each card (symbol, value, cost, modifier_flag)
card_collections       — user ↔ card ownership (quantity, foil, alt-art variants)
decks                  — user-created decks (name, faction, character lineup, battlefield)
deck_cards             — cards in a deck with counts
game_sessions          — completed game records (players, winner, duration, summary)
game_events            — per-game event log (event-sourced replay)
seasons                — season metadata (number, start/end dates, rewards table)
season_rankings        — user MMR, wins, losses, rank tier per season
season_pass_progress   — user progress through season pass tiers (free + premium)
cosmetics              — catalog (card backs, dice skins, avatars, animated playmats, emotes)
user_cosmetics         — owned cosmetics, active selections
currencies             — soft + hard balances per user
currency_ledger        — append-only audit log of all grants/spends/refunds
sku_catalog            — purchasable items (passes, currency packs, bundles, individual cosmetics)
purchases              — Stripe checkout sessions, status, receipts
entitlements           — what a purchase or grant unlocked (idempotent)
tournaments            — tournament instance (format, status, start time)
tournament_players     — registrations, seedings
tournament_rounds      — rounds with pairings and results
tournament_matches     — individual matches within a round
support_tickets        — player reports, refund requests, abuse reports
audit_log              — admin actions and anti-cheat events (who did what, when, why)
```

### Card abilities are structured, not free text

A card's ability is the most load-bearing piece of game data. We store abilities as a small **AST in JSONB** that the engine can interpret directly, with a separate `display_text` column for the printed card text the player sees.

```jsonc
// example card_abilities row (illustrative shape only)
{
  "kind": "triggered.after",
  "trigger": { "event": "activate", "subject": "self" },
  "effect": [
    { "op": "resolve", "from": "self.upgrade_dice", "count": 1 }
  ],
  "conditions": [],
  "may": true
}
```

The fixture importer ([Reference data & test fixtures](#reference-data--test-fixtures)) emits the same AST. The engine's ability registry dispatches on `kind` and resolves `effect[]` against game state. Adding a new ability shape means adding a tag + a resolver — never editing core action logic.

---

## Game Features

### Matchmaking *(v1: 1v1 only)*
- **Ranked 1v1** — Elo/MMR system, seasonal ladder, placement matches at season start.
- **Casual 1v1** — no rank impact, faster queue.
- **Private lobby** — shareable invite code, custom rulesets for friendly 1v1 games.
- *Post-v1:* **2v2** team queue, **free-for-all** 3–4 player queue. See [Backlog — post-v1.0](#backlog--post-v10).

### Deck builder
- Full card catalog browser with filtering (type, color, faction, set, rarity, dice symbols, keywords).
- Character team builder with point calculator (elite / non-elite toggle, plot point math).
- Deck validation against the rules (30 cards, ≤2 copies, color / faction gating, plot legality).
- Import / export via a community plaintext format.
- Deck sharing (public link, snapshot at time of share).

### Card collection
- Cards earned through booster packs (purchased with **soft** currency, never with cash) or direct craft.
- Wildcard system for targeted crafting per rarity.
- Trade history and collection statistics.
- Wishlist for targeted pack opening.

### Live match experience
- Pixi-rendered board with discrete zones (team, dice pool, hand, deck, discard, battlefield, supports, set-aside).
- Action affordances: drag a die to target, click to resolve, hold to inspect.
- Combat effects keyed off engine events: melee → blade-trail + impact, ranged → tracer + spark, indirect → distributed shockwaves, focus → die-flip glow, special → card-tinted burst.
- Dice resolution timeline at the bottom of the screen — each event narrated and replayable.
- Turn timer with grace period and configurable round clock for tournaments.
- Emote wheel (limited, with cooldowns and a mute-opponent option).
- Spectator mode: server pushes the same event stream with a small delay.

### Season pass & cosmetics
- Each season has a free track and a premium pass track.
- Rewards: card backs, dice skins, avatars, animated playmats, victory emotes, title flair, currency.
- **Cosmetics never affect gameplay.**
- Direct shop for non-season cosmetics + bundles + currency packs.

### Storefront & monetization

- **Two currencies:** *Crystals* (hard, cash-purchased, also granted from passes) and *Shards* (soft, earned via play).
- **What you can buy with cash:** premium season pass tier, currency packs, cosmetic bundles, individual cosmetic items.
- **What you cannot buy with cash:** booster packs of gameplay cards, single gameplay cards, ranked rewards, MMR. Avoiding paid randomized gameplay-card packs sidesteps gambling/lootbox regulation in most jurisdictions and keeps the competitive ladder fair-to-play.
- **Storefront UI:** featured carousel, season pass landing page, daily-rotated bundles, cosmetic browser with preview (3D dice tumble, animated playmat preview, avatar try-on), purchase confirmation with receipt and EULA reference.
- **Stripe** for checkout (cards + Apple Pay + Google Pay), Stripe Tax for VAT/sales tax, regional pricing on currency packs.
- **Receipts** by email; in-app purchase history; refund request flow that opens a support ticket.
- **Age gating** on hard-currency purchases (configurable per region, parental-controls hooks).
- **Idempotent fulfillment:** the `entitlements` table is the source of truth; a Stripe webhook can be replayed safely.

### Season ladder
- MMR-based ranks: **Bronze → Silver → Gold → Diamond → Champion**.
- Top-N Champions on a leaderboard.
- Seasonal resets with partial MMR preservation (soft reset).
- End-of-season rank rewards (cosmetic + currency).

### Tournaments
- **Swiss** (recommended for 8+ players, X rounds).
- **Single Elimination**.
- **Double Elimination**.
- Tournament organizer dashboard (bracket management, results entry, DQ handling).
- Open registration or invite-only.
- Prize-pool / trophy cosmetics for top finishers.

### Accessibility

- **Reduced motion** swaps every animation for a static fade and disables particle emitters.
- **Color-blind mode** pairs dice symbols and faction colors with distinguishable shapes, not just hue.
- **Keyboard-first navigation** for the lobby, deckbuilder, and storefront.
- **Screen-reader narration** of game events in the live match (event log piped to an aria-live region).
- **Configurable text size** at the OS level respected; per-app override available.

### Input model

Touch-first across every screen. The desktop UI is the touch UI with a cursor on top — not a separate mouse-and-keyboard design that gets ported to mobile later. This is a hard rule because mobile/tablet are first-class targets and retrofitting touch onto a hover-driven UI is the kind of work nobody ever finishes.

Concretely:

- **No hover-only affordances.** Anything visible on hover must also be reachable via tap (one-tap inspect, info card stays until dismissed).
- **No right-click menus.** Use long-press (touch) / right-click (desktop, optional) as a *shortcut* to actions that are also reachable from a visible button.
- **Tap targets ≥ 44 × 44 CSS pixels.** Standard accessibility floor. Cards, dice, action buttons, store tiles all comply.
- **No precision-drag-required actions.** Where drag-and-drop exists (assigning a die to a target, attaching an upgrade), there is always a tap-to-select-then-tap-to-target alternative. Drag is a power-user shortcut, never the only path.
- **Gestures are optional, not load-bearing.** Pinch-to-zoom on the board, two-finger pan, swipe to dismiss — all welcome, all redundant with on-screen controls.
- **Keyboard shortcuts have visible UI.** Every shortcut corresponds to an on-screen button or menu item; we don't ship hidden hotkeys.
- **Confirm before destructive.** A two-step tap (or visible hold-to-confirm) on anything irreversible — claim battlefield, concede, dismantle a card. Easier to mis-tap on touch than to mis-click on desktop.
- **Layout breakpoints we test against.** Phone portrait 360 × 640, phone landscape 800 × 360, tablet portrait 768 × 1024, tablet landscape 1024 × 768, desktop 1440 × 900 and up. The live match must be fully playable at all of them.
- **Phone live-match layout.** Smaller hand on a swipe-up tray, opponent's board collapsed by default with tap-to-expand, dice pool always visible at the bottom of the screen. The desktop layout is *not* a shrunken version of this.

> **Working agreement #10** below codifies this: every interaction must have a touch path. Reviewers reject changes that break it.

---

## Game Engine Design Principles

1. **Server-authoritative.** Clients render state; they never own it. Every action is a message to the server; the engine validates and applies it.
2. **Deterministic.** Given the same initial state and action sequence, the engine always produces the same result. Seeded RNG for dice rolls enables full replay. No wall-clock reads, no unseeded randomness, no iteration over insertion-ordered structures whose order isn't part of the state.
3. **Pure reducers.** `(GameState, Action) → { state, events }`. No I/O inside the engine. Enables time-travel debugging and replay.
4. **Golden Rule encoded.** Card text overrides rules. The engine's ability system is structured so card-specific overrides are localized, not scattered.
5. **Event sourcing.** Games are stored as a sequence of events. Replays reconstruct state by replaying events from the seed. Useful for spectators, post-game review, anti-cheat, and animation choreography on the client.

## Engine implementation notes

These follow directly from the rules and are written down so they're not "rediscovered" later.

- **The queue is a first-class data structure.** After-abilities enter the queue; before-abilities interrupt the queue and resolve before what triggered them; additional actions live outside the queue and run between actions, not inside them. Encode all three; don't model them as the same thing.
- **Replacement effects short-circuit events.** "Instead" and "would be" effects fire before the original event, prevent it from being considered to have happened, and disqualify any abilities that would have triggered off the original. Model them as event interceptors that run before the event is committed.
- **Inherent dice abilities travel with the die.** A special ability (S) and any ability the rules call "inherent" still applies even when the matching card is not in play (e.g., dice resolved through another card's effect). Do not gate these on `cardInPlay`.
- **Simultaneous-ability tiebreak.** When more than one ability triggers at the same instant, the **battlefield controller** orders them. If only one player has triggered abilities, that player orders their own. Persist battlefield control as authoritative state, including in FFA (where claim transitions and elimination can rotate it).
- **"Then" gating.** An effect after the word "then" only resolves if the preceding effect resolved in full. Track a per-resolution success bit.
- **Negative > positive.** Negative effects ("cannot") win over positive effects ("can / may"). Apply in that order during effect composition.
- **Uniqueness is per-title, per-controller.** Two players can each have a copy of a unique card in play; one player cannot. Subtitles do not create new identities for uniqueness; titles do.
- **Modifier dice resolve with their parent.** A `+N` die only resolves alongside a non-modifier die of the same symbol. Card-routed resolution (e.g., "resolve a die showing X") cannot pull in modifiers unless the card explicitly allows multiple of the same symbol.
- **Damage timing.** Damage is dealt at distinct moments per resolved die unless modified by another die (then simultaneous). Excess damage above remaining health is ignored. "Distribute as you wish" assigns first, deals simultaneously, and respects per-character (health + shields) caps unless otherwise required.
- **Replay determinism.** The seed plus the action stream must reproduce the entire game. Server records both. Replays are how spectators, post-game, and anti-cheat work.

---

## Local Development

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### Setup

```bash
git clone https://github.com/pearlyeti/prophecy.git
cd prophecy

# Install all dependencies
pnpm install

# Start infrastructure (Postgres, Redis, MinIO as R2 stand-in)
docker compose up -d

# Copy and fill in env vars
cp .env.example .env

# Run DB migrations and seed card catalog
pnpm db:migrate
pnpm db:seed

# Start all services in dev mode (hot reload)
pnpm dev
```

Services will be available at:

- Web UI (incl. admin pages at `/admin`): `http://localhost:5173`
- API: `http://localhost:3000`
- Game Server: `http://localhost:3001`

### Running tests

```bash
# Unit tests (game engine, API handlers)
pnpm test

# E2E tests (requires dev stack running)
pnpm test:e2e

# Game engine only (fast, no infra needed)
pnpm --filter @prophecy/game-engine test
```

---

## Reference data & test fixtures

The engine needs a substantial corpus of cards to be exercised against. Building Prophecy's own card pool will take time, so during early development we use a public reference set as **engine-validation fixtures only**.

- **What.** A *mechanical* snapshot derived from a public community card index for the dice-and-card system Prophecy descends from. Dice profiles (symbol, value, cost, modifier flag), point values, health, faction, color, keyword set, and ability *type tags* — never card titles, ability prose, or art.
- **Where.** `packages/game-engine/__fixtures__/reference-set/` — clearly labeled as third-party-derived reference data, JSON only. Loaded only by tests under `__tests__/`.
- **What it's for.** Verifying engine behavior against a large, real-world card pool with weird interactions (Guardian + Redeploy + Ambush, replacement effects, inherent dice abilities, etc.). Catches edge cases that hand-written fixtures miss.
- **What it is *not* for.** Production seed data, art, copy, names, or anything user-visible. The production card catalog (`pnpm db:seed`) loads only original Prophecy cards from `packages/db/seed/cards/`.
- **Build vs. ship.** `__fixtures__/` is excluded from production bundles by Turborepo build outputs. Tests that import from it run in CI but never ship.

This separation is enforced by [Working agreement #5](#working-agreements). If you find yourself reaching into `__fixtures__/` from a non-test path, stop.

---

## Roadmap

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

#### ENGINE-1 — Per-card hand & deck tracking
**Why now.** Blocks every card-touching action (play-card, reroll-dice, upkeep draw). `PlayerState` currently tracks hand and deck as integer counts — we need actual instance ids to play or discard them.

**Scope.**
- Replace `handCount: number` and `deckCount: number` on `PlayerState` with `hand: readonly string[]` and `deck: readonly string[]` (card instance ids). Keep `handSize` as the per-game max and `discardIds` as is (or rename to `discard` for symmetry — your call, but be consistent).
- Seeded shuffle + initial deal of 5 in `newGame`. Deck instance ids should be deterministic (e.g. `${playerId}.deck.${index}`).
- Add a `drawCards(state, playerId, n)` helper. Wire it into the upkeep transition so each player draws up to `handSize` (currently the transition doesn't draw — verify and fix as part of this card).
- Update `legal-actions.canReroll` / `canPlayCard` to use `hand.length`.
- Update `reroll-dice` precheck (currently reads `handCount`).

**Context to load.**
- `packages/game-engine/src/state/types.ts` (PlayerState)
- `packages/game-engine/src/state/new-game.ts`
- `packages/game-engine/src/state/legal-actions.ts`
- `packages/game-engine/src/actions/pass.ts` (upkeep transition lives here)
- `packages/game-engine/src/__tests__/new-game.test.ts`, `pass.test.ts`

**Out of scope.** Mulligan UX. Ability effects. `applyPlayCard` itself. Just the data model + initial deal + draw helper + tests.

**Done when.** `pnpm typecheck` clean. `pnpm --filter @prophecy/game-engine test` green (existing tests adapted + new tests for deterministic deal, draw-on-upkeep, and that two games with the same seed deal the same hand). README Done section updated.

---

#### ENGINE-2 — `applyPlayCard` (vanilla cost-only)
**Why now.** First real card-from-hand action. Lands cost payment and hand→discard plumbing without yet entangling with the ability AST.

**Scope.**
- Implement `applyPlayCard(state, playerId, cardId)` and dispatch from `applyAction`.
- Validate: active player, in `action` phase, card is in that player's hand, player can pay the cost (resources only for v1 — defer dice-cost payment).
- Pay cost (decrement `resources`), move card hand → discard, emit `card.played` event.
- Reset `consecutivePasses` and rotate the turn (use the existing `rotateAndCascade` helper).
- Card abilities **do not fire** in this card. Cards that play with no ongoing effect are fine for now; the AST resolver is a separate, later card.
- Update `legal-actions.canPlayCard` to also check the player has at least one card whose cost ≤ resources.

**Context to load.**
- `packages/game-engine/src/actions/types.ts` (Action union — add the new action shape if missing)
- `packages/game-engine/src/reducers/apply-action.ts`
- `packages/game-engine/src/actions/activate.ts` (good reference for turn rotation + events)
- `packages/game-engine/src/events.ts`
- `packages/game-engine/src/__tests__/fixtures.ts` (basicGameInput helper)

**Out of scope.** Ability resolution (ongoing effects, triggered abilities, special-die abilities). Dice-cost payment. Targeting. Just play-for-cost → discard.

**Depends on.** ENGINE-1.

**Done when.** Typecheck clean. New `play-card.test.ts` covering: legal play, illegal when not your turn, illegal when not in hand, illegal when can't afford, hand→discard, resources decremented, turn rotates, `card.played` event emitted.

---

#### ENGINE-3 — `applyRerollDice`
**Why now.** Players need a way to fix bad rolls. Already in the Action union; needs a handler.

**Scope.**
- Implement `applyRerollDice(state, playerId, discardCardId, dieInstanceIds)` and dispatch.
- Validate: active player, action phase, discard card in hand, every die id in the player's pool.
- Move the discard card hand → discard. Reroll the listed dice using the deterministic seeded RNG (use the same per-action fork pattern as `applyActivate`).
- Emit `dice.rerolled` event with the new face indexes.
- Counts as a turn action: reset `consecutivePasses`, rotate.

**Context to load.**
- `packages/game-engine/src/actions/activate.ts` (RNG fork pattern, die roll helper)
- `packages/game-engine/src/state/rng.ts` (or wherever Mulberry32 + FNV lives)
- `packages/game-engine/src/__tests__/activate.test.ts` (deterministic-roll pattern to mirror)

**Out of scope.** Card effects that grant free rerolls. Multiple dice rerolled from different sources. Just the canonical "discard 1 card, reroll N dice" action.

**Depends on.** ENGINE-1.

**Done when.** Typecheck clean. New `reroll.test.ts` for determinism (same seed → same new faces), illegal-when-card-not-in-hand, illegal-when-die-not-in-pool, turn rotation.

---

#### ENGINE-4 — Ambush + extra-turn plumbing
**Why now.** Ambush is a core keyword; the rules say "after this character activates, they may take an additional action this turn" — and other effects grant extra turns too. Without this, the turn loop is structurally wrong even if no card uses it yet.

**Scope.**
- Add `extraTurnsPending: Readonly<Record<string, number>>` to `GameState`. Increments via a helper; the turn-rotation path checks the current player's count before rotating and decrements instead of rotating if > 0.
- Add `ambushGrantedThisTurn: boolean` (per the rule: Ambush only grants one extra action *per* turn, doesn't stack within a turn but chains across).
- Extract a single `endTurn(state)` helper used by `pass`, `activate`, `play-card`, `reroll-dice` — so all four paths share the extra-turn logic.
- Add a `grantExtraTurn(state, playerId)` helper for ability code to call (no callers yet; that's fine — wire the seam).
- Reset `ambushGrantedThisTurn` to false on each turn rotation.

**Context to load.**
- `packages/game-engine/src/reducers/rotate-and-cascade.ts` (or wherever the turn rotation helper lives)
- `packages/game-engine/src/state/types.ts`
- `packages/game-engine/src/actions/pass.ts`, `activate.ts`
- `packages/game-engine/src/__tests__/pass.test.ts`

**Out of scope.** Ambush keyword wiring on actual card abilities (the ability AST doesn't resolve abilities yet). Just the state shape + helpers + tests that verify the *mechanism* via synthesized state.

**Done when.** Typecheck clean. New tests assert: synthesized `extraTurnsPending` keeps the same player on next rotation; flag is consumed once; `ambushGrantedThisTurn` resets on rotation; chained extra turns across two turns work.

---

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

#### WEB-1 — ActionPanel: action → target two-step
**Why now.** Touch-first input rule. Current ActionPanel renders flat buttons; a target-requiring action (activate, resolve, play) should open a target overlay rather than expecting a long-press or right-click.

**Scope.**
- Refactor `apps/web/src/routes/Game.tsx` ActionPanel: tapping an action that needs a target ("Activate", "Resolve dice", "Play card") opens a bottom-sheet (mobile) / modal (desktop) showing legal targets. Tap a target to dispatch.
- Illegal actions render dimmed-but-visible, not hidden — gives the player visibility into what's available next turn.
- Tap targets ≥ 44×44px. Confirm modal for destructive actions (concede, claim).
- Use `getLegalActions` to drive both the action list and the per-action target list.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (ActionPanel, SetupPanel for reference)
- `packages/game-engine/src/state/legal-actions.ts`
- `README.md#input-model` (touch-first rules)

**Out of scope.** Resolve-mode symbol-lock UX (separate card). Card detail modal. Pixi board. Just the action→target overlay flow for already-implemented actions.

**Done when.** Typecheck clean. Manual smoke test on phone-portrait viewport (360×640) and desktop. Activate, pass, claim, concede all reachable via tap-only with no hover/right-click. Verified visually before claiming done — type checks don't tell you the UX is right.

---

#### WEB-2 — Resolve mode: symbol-locked die selection
**Why now.** Resolving dice is the most-clicked action in a real game. The interaction needs to feel right and prevent illegal selections at the UI layer.

**Scope.**
- After the player taps "Resolve dice" in the action panel, enter a `resolve-mode` Zustand slice: dice tray expands, first die tapped locks the symbol, subsequent taps only enable same-symbol dice (modifiers of the locked symbol included).
- A "Resolve" confirm button at the bottom; "Cancel" returns the player to the action panel.
- For damage symbols (melee/ranged): after dice selection, require a target character tap. Send `{ type: 'resolve-dice', playerId, dieInstanceIds, targetCharacterId }`.
- For resource / disrupt / discard: no target needed.

**Context to load.**
- `apps/web/src/routes/Game.tsx`
- `apps/web/src/state/app.ts` (Zustand store)
- `packages/game-engine/src/actions/resolve-dice.ts` (what the action expects)
- `packages/game-engine/src/state/types.ts` (DieInPool, DieSymbol)

**Out of scope.** Animations and Pixi visuals. Special / focus / indirect resolution paths (not engine-supported yet). Just the canonical resolve-mode for the symbols the engine handles.

**Depends on.** WEB-1.

**Done when.** Typecheck clean. Manual smoke: full action of "activate → die rolls into pool → resolve mode → pick a melee → pick target → damage lands" works end-to-end across two browsers in a real lobby.

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
- Card catalog ingestion + admin tooling.
- Deck builder API + validator.
- Spectator mode read-only socket.
- Sticky room ownership coordinator (Redis-based) — only needed once we run multi-instance.
- Matchmaking queues (casual → ranked → private).
- Tournament engine (Swiss → single-elim → double-elim).
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
- **2026-05-12 — Engine: split setup into independent first-player + shield-recipient choices** (`27b3667`). Diverges from SWD's single-choice setup: the roll-off winner now makes two separate decisions — who goes first (= battlefield controller) and who receives the 2 starting shields. The recipient distributes shields freely (1+1 or 2+0). `SetupStep` reworked, three new actions (`setup.choose-first-player`, `setup.choose-shield-recipient`, `setup.place-shield`), events renamed, legal-actions inspector and web SetupPanel rewired, rules-reference updated. 92 engine tests passing.
- **2026-05-12 — Engine: `resolve-dice` + character defeat** (`c186d6c`). Resolves melee / ranged / shield / resource / disrupt. Shields block damage 1-for-1 (capped at 3). Damage ≥ remaining health defeats the character: removed from `characterOrder`, dice removed from pool. Win condition: opponent has no characters → game ends. Optional `targetCharacterId` on the action shape for damage / shields; ignored for resource / disrupt.
- **2026-05-12 — Engine: `getLegalActions` inspector + `activate` rotates the turn** (`589fa62`). Pure read-only inspector returning the set of actions each player can take right now (driven by both the UI and tests). Surfaced a latent bug: `activate` wasn't rotating the turn — fixed. `RESOLVABLE_SYMBOLS_V1` excludes blank, special, focus, indirect until those land.
- **2026-05-11 — Server: lobby + game multiplayer wiring** (`b2b7c4e`, `79bb5b7`, `7ba3949`, `843c6a8`). `apps/game-server` instantiates an engine game per Socket.io room and broadcasts events back to clients. Lobby persistence with idle-room TTL; localStorage-backed rejoin on the web client. Random but deterministic deck assignment from seed. Cross-device LAN testing unblocked: CORS widening, Vite `envDir`, secure-context-aware `crypto.randomUUID` fallback, polling-then-upgrade Socket.io transport.
- **2026-05-11 — Engine: `activate` action with seeded dice rolling** (`98ce3a4`). Exhaust character, roll N dice into the player's pool (1 die per non-elite character, 2 for elite). Deterministic via per-action seeded fork (Mulberry32 + FNV-1a). `character.activated` event includes the rolled dice. Threw when the character was already exhausted or didn't belong to the player.
- **2026-05-11 — Fixtures: deck legality validator + test decks** (`0871bc4`, `83ccb33`). `validateDeck` enforces Part 4 rules: team points ≤ 30, faction match (Light/Shadow/Neutral compatibility), color gating, 30 cards total, max 2 of any card. Returns `{ valid, errors, stats: { teamPointTotal, deckCardTotal, costCurve, characterColors } }`. Two reference test decks (`DECK_A` Light, `DECK_B` Shadow) load at game-server startup.
- **2026-05-10 — Fixtures: third-party-derived reference set, mechanical-only** (`81f0594`). 173-card mechanical port under `packages/game-engine/__fixtures__/synthetic-set/` for engine-validation testing. No card text, no art, no titles — dice profiles, costs, points, types only. Strictly test-only; never bundled into production builds.
- **2026-05-10 — Monorepo skeleton bootstrapped.** pnpm workspaces + Turborepo + strict TS. Three apps (`web`, `api`, `game-server`) and three packages (`game-engine`, `protocol`, `db`) compile and run. Hono + tRPC v11 in `api`; Socket.io in `game-server`; React 19 + Vite 6 + Tailwind v4 + tRPC client in `web`. Drizzle + postgres.js in `db` with a starter `users` table. Seeded RNG and pure-reducer skeleton in `game-engine`. Docker Compose for Postgres / Redis / MinIO. Touch-first CSS defaults (44 × 44 hit targets, `touch-action: manipulation`, `prefers-reduced-motion` respected) and a Splash route that pings `/trpc` for liveness.
- **2026-05-10 — Card catalog and deck schema, first migration.** Shared enum value lists in `@prophecy/protocol` (Zod schemas) and a duplicated copy in `@prophecy/db` (drizzle-kit can't follow cross-package imports cleanly) guarded by a drift test. Tables: `cards`, `card_abilities`, `card_dice`, `decks`, `deck_characters`, `deck_cards`. Generated migration `0000_deep_stellaris.sql` — five Postgres enums plus seven tables with FK cascades and indexes. Migration validated by drizzle-kit's schema model; pending apply against a live Postgres ([API-1](#api-1--apply-first-db-migration-against-real-postgres)).
- **2026-05-10 — Engine: first action slice.** `newGame` factory; pure-reducer `applyAction` dispatch. Three actions implemented: `pass` (consecutive-pass counting, rotation, upkeep transition with +2 resources and dice-pool clear), `claim-battlefield` (single-claim-per-round guard, control transfer, auto-pass cascade for the claimer's subsequent turns this round), and `concede` (1v1 opponent-wins). End-of-round loss check (hand=0 AND deck=0 → lose; battlefield controller wins ties). Typed `EngineEvent` discriminated union. Shared `guardCanAct` and `rotateAndCascade` helpers.

---

## Working agreements

These rules apply to every contributor and to Claude when assisting in this repo.

1. **README is the source of truth.** Architecture, tech stack, services, schemas, features, and roadmap live here. If a change makes any of those statements out of date, update the README in the same change.
2. **Decisions land in the README, not in chat.** When a non-trivial decision is made (library swap, new service, schema change, scope cut), reflect it in the relevant section. If the rationale is non-obvious, leave a one-line note.
3. **TODOs go in [Roadmap](#roadmap).** Don't sprinkle TODO comments in code as the system of record. A code TODO is fine for a localized follow-up; anything cross-cutting belongs in the roadmap.
4. **Game rules live only in `packages/game-engine`.** No game logic in `apps/api`, `apps/web`, or `apps/game-server`. Those are I/O around the engine.
5. **Original IP only in shipped surfaces.** No third-party names, art, characters, factions, or lore in anything that ships to users. Third-party reference data may live under `__fixtures__/` for engine validation tests only — mechanical-only, never imported from a non-test path, never bundled into production builds. See [Reference data & test fixtures](#reference-data--test-fixtures).
6. **Server-authoritative, deterministic.** Don't add logic that breaks replay determinism (unseeded randomness, wall-clock dependencies, non-deterministic iteration order, network-dependent shuffles, etc.).
7. **Cosmetics are gameplay-neutral.** Anything purchasable with hard currency cannot affect game balance. The line is bright; do not blur it.
8. **No paid randomized gameplay-card packs.** Booster packs of gameplay cards are bought with soft currency only. This keeps the platform out of the lootbox-regulation mess and keeps the ladder fair-to-play.
9. **Build small, extract on demand.** New services don't get their own app until existing services are clearly hurting. The future-extractions list in the Roadmap names what may split, but the default is to merge.
10. **Touch-first input, always.** Every interaction must have a touch path: no hover-only affordances, no right-click-only menus, no precision-drag-required actions, tap targets ≥ 44 × 44 CSS pixels. Desktop is a touch UI with a cursor on top — not a separate mouse-and-keyboard design that we'll port to mobile later. See [Input model](#input-model). Reviewers reject changes that break this.
11. **v1.0.0 is 1v1 only.** Don't gold-plate other modes before v1 ships. Engine code keeps the abstractions that 2v2 and FFA will need (battlefield-controller tiebreaks, multi-opponent targeting, clockwise turn order), but UI, matchmaking, balance, and content work for 2v2 / FFA / other modes waits until [post-v1](#backlog--post-v10).

---

## License

MIT (engine and platform code). Original Prophecy IP (cards, art, lore, names) is © the project owners; not licensed under MIT.
