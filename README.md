# Prophecy

An online multiplayer platform for **Prophecy** — an original dice-and-card dueling game. This repository implements the rules engine, the live service around it (real-time matches, matchmaking, ladder, tournaments), the player-facing client (deckbuilder, collection, storefront), and the back-office tools that keep them running.

**Target platforms:** desktop, tablet, and mobile/phone. Desktop is the priority for early testing because that's what we work on, but tablet and mobile are first-class targets, not afterthoughts. The full game must be playable with touch input alone — no right-clicks, no hover-only affordances, no precision drags. See [Input model](#input-model).

**v1.0.0 scope: 1v1 only.** Other modes — **2v2** team play, **3–4 player free-for-all**, and any other variant — wait until 1v1 has launched and stabilized. The engine and rules document already cover FFA, and the abstractions (battlefield-controller tiebreak, clockwise turn order, elimination, multi-opponent targeting) generalize cleanly enough that 2v2 fits the same shape. But matchmaking, UI flows, balance tuning, and content work for non-1v1 modes are explicitly post-v1. See [TODO.md → Backlog — post-v1.0](TODO.md#backlog--post-v10).

> **Scope note.** Prophecy is an original property. The gameplay system implemented here is inspired by the design space of dice-and-card dueling games but does **not** ship with or depend on any third-party intellectual property (names, art, characters, factions, world). All cards, art, names, and lore that ship to players are original to this project. The reference rules document under `docs/` describes the abstract game system only.
>
> Third-party reference data (e.g., a public card index from a related game) may live under clearly-isolated `__fixtures__/` paths for engine-validation purposes only — mechanical structure only, no titles, ability prose, or art. See [Engine test fixtures](#engine-test-fixtures-test-only).

---

## Source of truth

**This README is the canonical description of Prophecy's product, architecture, tech stack, schema, and features.** Task tracking — In progress, Up next cards, Backlog, Done — lives in [TODO.md](TODO.md).

Whenever a decision is made — a new service is added, a library is swapped, a feature is scoped, a schema column is added — update this file in the same change. When a task is opened, claimed, or finished, update [TODO.md](TODO.md). Conversation transcripts and chat threads are not durable; the README and TODO.md are. See [Working agreements](#working-agreements).

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

**Why three apps, not six?** A platform like this eventually wants separate `admin`, `matchmaker`, and `jobs` services for independent scaling and blast-radius reasons. None of that matters on day one. We start with the smallest viable split and extract on demand. [TODO.md](TODO.md) tracks the future extractions so they don't get lost.

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
└── __fixtures__/    # Engine test fixtures only — see "Engine test fixtures (test-only)"
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

The fixture importer ([Engine test fixtures](#engine-test-fixtures-test-only)) emits the same AST. The engine's ability registry dispatches on `kind` and resolves `effect[]` against game state. Adding a new ability shape means adding a tag + a resolver — never editing core action logic.

---

## Game Features

### Matchmaking *(v1: 1v1 only)*
- **Ranked 1v1** — Elo/MMR system, seasonal ladder, placement matches at season start.
- **Casual 1v1** — no rank impact, faster queue.
- **Private lobby** — shareable invite code, custom rulesets for friendly 1v1 games.
- *Post-v1:* **2v2** team queue, **free-for-all** 3–4 player queue. See [TODO.md → Backlog — post-v1.0](TODO.md#backlog--post-v10).

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
- **Board layout:** four-column battlefield — player cards in play (left), player dice pool grouped by owning card (center-left), opponent dice pool (center-right), opponent cards in play (right). Cards use the standard CCG aspect ratio (63×88 mm). Exhausted cards rotate 90°; dice always stay upright. Upgrade cards are not shown as separate cards in play — they appear as circular badge overlays on the card they are attached to; tapping a badge opens the upgrade's full card view.
- **Stability (supports):** Support cards have Stability instead of Health. Stability can only be reduced by Disrupt or Discard dice sides — not by Melee, Ranged, or Indirect damage. Shields block Stability loss the same way they block damage. When Stability reaches 0 the support is immediately discarded. Full rules in `docs/rules-reference.md § Stability`.
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

## Card catalog & deck registry

The canonical original-IP catalog lives in committed JSON at:

- `packages/db/seed/cards.json` — every card the game knows about (events, characters, upgrades, supports, plots, battlefields).
- `packages/db/seed/decks.json` — saved decks (starter / preview / curated).

Both files are loaded at game-server startup (`apps/game-server/src/corpus.ts`) and validated against the Zod schemas in `@prophecy/protocol` (`cardSchema`, `deckSchema`). A typo in either file fails fast at boot. The same files are managed through the admin UX (see below) and will be the `pnpm db:seed` source once API-1 lands.

### Admin UX

`apps/web/src/routes/admin/*` ships a hidden authoring tool at `/admin`:

- **`/admin/cards`** — table of every card; click to edit metadata (name, type, subtype, faction, color, rarity, cost, point / elite-point / health, isUnique, displayText, die faces read-only for now). Abilities use a form-based builder: pick an `op` from a dropdown of the engine-supported ops, fill in its parameters. Cards that need an op the engine doesn't have yet pick `(new)` and write a working name + notes; that effectively tags the catalog with the running TODO list of ops to implement next.
- **`/admin/decks`** — table of decks; click to edit name, faction, characters (with elite toggle), battlefield, plot, and the card list (counts). Deck-building rule enforcement (color / faction / 30-card / 2-copy cap) is **not** enforced in the UX — author rules manually for now; a validator lands later.

Persistence is filesystem-direct: `GET /admin/cards`, `PUT /admin/cards`, `GET /admin/decks`, `PUT /admin/decks` on the game-server. Dev-only, no auth in v1.

### Engine test fixtures (test-only)

Separately from the canonical catalog above, the engine has a third-party-derived synthetic corpus used by automated tests only:

- **Where.** `packages/game-engine/src/__fixtures__/synthetic-set/` — clearly labeled, JSON + Zod schemas. Loaded only by `__tests__/` paths.
- **What.** A *mechanical* snapshot derived from a public community card index for the dice-and-card system Prophecy descends from. Dice profiles, point values, health, faction, color, keyword set, and ability *type tags* — never card titles, ability prose, or art.
- **What it's for.** Exercising the engine against a large card pool with weird interactions; catches edge cases hand-written fixtures miss.
- **What it is *not* for.** Live play, the admin UX, seed data, or anything user-visible. The game-server reads from `packages/db/seed/` instead.
- **Build vs. ship.** `__fixtures__/` is excluded from production bundles. This separation is enforced by [Working agreement #5](#working-agreements).

---

## Roadmap

Task tracking — In progress, Up next (sized cards), Backlog, and the running Done log — lives in [TODO.md](TODO.md). Anything cross-cutting that needs tracking belongs there, not in code TODO comments.

---

## Working agreements

These rules apply to every contributor and to Claude when assisting in this repo.

1. **README is the source of truth for product and architecture; TODO.md is the source of truth for tasks.** Architecture, tech stack, services, schemas, and features live in the README. In progress, Up next cards, Backlog, and Done log live in [TODO.md](TODO.md). If a change makes any of those statements out of date, update the relevant file in the same change.
2. **Decisions land in the README, not in chat.** When a non-trivial decision is made (library swap, new service, schema change, scope cut), reflect it in the relevant section. If the rationale is non-obvious, leave a one-line note.
3. **TODOs go in [TODO.md](TODO.md).** Don't sprinkle TODO comments in code as the system of record. A code TODO is fine for a localized follow-up; anything cross-cutting belongs in TODO.md.
4. **Game rules live only in `packages/game-engine`.** No game logic in `apps/api`, `apps/web`, or `apps/game-server`. Those are I/O around the engine.
5. **Original IP only in shipped surfaces.** No third-party names, art, characters, factions, or lore in anything that ships to users. Third-party reference data may live under `__fixtures__/` for engine validation tests only — mechanical-only, never imported from a non-test path, never bundled into production builds. See [Engine test fixtures](#engine-test-fixtures-test-only).
6. **Server-authoritative, deterministic.** Don't add logic that breaks replay determinism (unseeded randomness, wall-clock dependencies, non-deterministic iteration order, network-dependent shuffles, etc.).
7. **Cosmetics are gameplay-neutral.** Anything purchasable with hard currency cannot affect game balance. The line is bright; do not blur it.
8. **No paid randomized gameplay-card packs.** Booster packs of gameplay cards are bought with soft currency only. This keeps the platform out of the lootbox-regulation mess and keeps the ladder fair-to-play.
9. **Build small, extract on demand.** New services don't get their own app until existing services are clearly hurting. The future-extractions list in [TODO.md](TODO.md) names what may split, but the default is to merge.
10. **Touch-first input, always.** Every interaction must have a touch path: no hover-only affordances, no right-click-only menus, no precision-drag-required actions, tap targets ≥ 44 × 44 CSS pixels. Desktop is a touch UI with a cursor on top — not a separate mouse-and-keyboard design that we'll port to mobile later. See [Input model](#input-model). Reviewers reject changes that break this.
11. **v1.0.0 is 1v1 only.** Don't gold-plate other modes before v1 ships. Engine code keeps the abstractions that 2v2 and FFA will need (battlefield-controller tiebreaks, multi-opponent targeting, clockwise turn order), but UI, matchmaking, balance, and content work for 2v2 / FFA / other modes waits until [TODO.md → post-v1](TODO.md#backlog--post-v10).
12. **Admin card editor stays in sync with the schema.** Any change that adds or renames an `Effect` op, an `Ability` kind, or any other field a card author needs to fill in (play condition, trigger event, action cost, card disposition, etc.) must update `apps/web/src/routes/admin/AbilityBuilder.tsx` in the same commit. New ops that aren't dispatched yet still get a form field — the `(new)` placeholder exists exactly for this gap. Card authors should never need to hand-edit JSON to express an intent the schema already supports.

---

## License

MIT (engine and platform code). Original Prophecy IP (cards, art, lore, names) is © the project owners; not licensed under MIT.
