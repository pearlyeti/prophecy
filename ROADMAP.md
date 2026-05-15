# Roadmap

Spec registry, backlog, and shipped history for Prophecy. **Status tracking (in-progress, blocked) lives in [GitHub Issues](https://github.com/pearlyeti/prophecy/issues).** Process for picking up or promoting a card is in [CLAUDE.md](CLAUDE.md#picking-up-a-task-card).

Cards are coded by area: `ENGINE-N` · `WEB-N` · `SERVER-N` · `API-N` · `AUTH-N` · `ADMIN-N` · `OPS-N` · `TEST-N`.

---

## Up next

Fully specced, claimable cards. Each has a [GitHub Issue](https://github.com/pearlyeti/prophecy/issues) and is sized for one focused session (~200–500 lines of changes including tests).

---

#### WEB-9 — Drag-to-play (Pass 2: character targeting)
**Why now.** Once the engine supports targeted `play-card` (upgrades attaching to characters, events targeting opponent characters), the drag gesture should route to the correct target rather than a generic play zone.

**Scope.**
- Add `data-droptarget="character:{instanceId}"` attributes to each character tile in `PlayerSummaries` and the activate overlay.
- On drag-over a character tile: highlight it with a ring color-coded by legality (emerald = valid, red = invalid). Valid targets depend on card type: upgrades → own characters, damage events → opponent characters, shield events → own characters.
- On drop over a valid character target: dispatch `play-card` with `targetCharacterId`.
- Remove or deprioritize the generic `data-droptarget="play"` zone for cards that require a character target; keep it for cards with no target (resources, supports, events with no target spec).

**Context to load.**
- `apps/web/src/routes/Game.tsx` (drag system from WEB-8, PlayerSummaries, character tile rendering)
- `packages/game-engine/src/actions/play-card.ts`
- `packages/protocol/src/events.ts`

**Out of scope.** Multi-target events. AoE effects. Drag to reroll-discard.

**Depends on.** WEB-8 ✅. Engine card that adds `targetCharacterId` to `play-card` action.

**Done when.** Typecheck clean. Manual smoke: drag an upgrade card onto an eligible character — it attaches. Drag a damage event onto an opponent character — damage is dealt. Drag onto an ineligible target — drag cancels with red feedback.

---

#### WEB-7 — Human-readable activity log
**Why now.** The current event log renders raw JSON next to event type names — unreadable in play. Testers can't follow what happened or why a game state changed without decoding engine internals.

**Scope.**
- Write a `formatEvent` function (or grouped formatter) that maps each `EngineEvent` type to a human-readable string. Target strings:
  - `character.activated` → "**{PlayerName}** activates **{CharacterName}** — rolls [Melee 3] [Shield 1]"
  - `dice.resolved` + following `damage.dealt` → "**{PlayerName}** resolves [5 Melee] against **{CharacterName}** — deals 4 damage (1 blocked)"
  - `dice.resolved` without `damage.dealt` → "**{PlayerName}** resolves [3 Resource] — gains 3 resources" / "disrupts" / "places 2 shields on **{CharacterName}**"
  - `shields.placed` standalone (setup) → "**{PlayerName}** places a shield on **{CharacterName}**"
  - `card.played` → "**{PlayerName}** plays **{CardName}** (cost {N})"
  - `dice.rerolled` → "**{PlayerName}** rerolls {N} dice (discards **{CardName}**)"
  - `character.defeated` → "**{CharacterName}** is defeated"
  - `battlefield.claimed` → "**{PlayerName}** claims the battlefield"
  - `round.begin` → "— Round {N} —" (centered divider, not a bullet)
  - `game.ended` → "**{WinnerName}** wins ({reason})"
  - `player.passed` with `automatic: true` → skip
  - `player.passed` explicit → "**{PlayerName}** passes"
  - `upkeep.player` → "**{PlayerName}** draws {N} and gains {R} resources" (only if N > 0 or R > 0)
  - All other events (trigger lifecycle, setup roll-off, `turn.advanced`, upkeep begin/end) → skip silently
- **Die chip component:** small inline badge `[Symbol Value]`, color-coded by symbol.
- **Event grouping:** `dice.resolved` immediately followed by `damage.dealt` / `shields.placed` / `resources.gained` / `shields.removed` merges into one entry.
- **Updated EventLog component:** styled `<ol>`, up to 30 entries, scrollable, `round.begin` as a centered divider. Collapsed by default on mobile.
- **Name resolution:** display names from lobby for player IDs; character/card names from `game.cardCatalogIds` + catalog; fall back to instance-ID suffix if catalog not loaded.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (EventLog component)
- `packages/game-engine/src/events.ts`
- `apps/web/src/store.ts` (`recentEvents` shape)

**Out of scope.** Animated event feed. Sound effects. Filtering by player. Exporting the log.

**Done when.** Typecheck clean. Manual smoke: play a full turn (activate → resolve → pass) and confirm the log reads naturally in plain English with die chips; damage events are merged with their resolve; round dividers appear; automatic passes and upkeep noise are hidden; log is scrollable past 10 entries.

---

#### API-1 — Apply first DB migration against real Postgres
**Why now.** Schema is generated but never executed. Until the migration actually runs against a live Postgres, the `db:seed` path and any future API endpoints are blocked.

**Scope.**
- Run `docker compose -f infra/docker-compose.yml up -d postgres` and confirm it's healthy.
- Run `pnpm db:migrate`. Capture any drift or errors; resolve them.
- Smoke-check from psql that the seven tables and five enums exist.
- Document any one-time setup steps in the README's Local Development section if anything was missing.

**Context to load.**
- `infra/docker-compose.yml`
- `packages/db/drizzle.config.ts`
- `packages/db/migrations/0000_*.sql`
- `README.md#local-development`

**Out of scope.** New schema. Seed data import.

**Done when.** Migration applies without errors. `psql` confirms tables exist. README's setup instructions are accurate.

---

#### API-2 — Persist completed games on game-end
**Why now.** The engine emits a full event log per game but nothing is ever written to Postgres. Without this the README's "rebuild any completed game from its seed + events" claim isn't true and the schema is dormant.

**Scope.**
- On `game.ended`, write one row to `game_sessions` (players, winner, duration, seed, summary) and one row per emitted `EngineEvent` to `game_events` (`session_id`, `sequence_number`, `event_type`, `payload jsonb`, `occurred_at`).
- New `apps/game-server/src/persistence.ts` exposes a `GameWriter` that subscribes to a room's event stream and flushes at game-end in a single Drizzle transaction.
- Index `game_events(session_id, sequence_number)` for replay reads.
- One end-to-end test: spin up Postgres via the existing compose stack, play a deterministic concede game, assert both rows land.

**Context to load.**
- `apps/game-server/src/rooms.ts`
- `packages/db/src/schema.ts`
- `packages/game-engine/src/events.ts`

**Out of scope.** Incremental writes during the game (API-3). Replay UI. Anti-cheat post-processing.

**Depends on.** API-1.

**Done when.** Typecheck clean. Concede a game; `select count(*) from game_events where session_id = ?` returns the expected event count; `game_sessions` row has winner, duration, seed.

---

#### API-3 — Incremental event-log writes for in-flight durability
**Why now.** If a game-server process crashes mid-match, the only durable copy of the event log is in-memory. This card closes that gap.

**Scope.**
- Replace the buffer-until-game-end approach from API-2 with a streaming write: after each engine event is broadcast to clients, append a `game_events` row.
- Open `game_sessions` at game-start with `status='active'`, seed, and players; update `status='completed'` (or `abandoned`) on `game.ended`.
- Per-room background write queue (in-process initially; switch to BullMQ if it becomes a bottleneck).
- On game-server boot, scan `game_sessions where status = 'active'`: if the room is still alive in Redis, leave it; if not, mark `abandoned`.

**Context to load.**
- `apps/game-server/src/rooms.ts`
- `apps/game-server/src/persistence.ts` (from API-2)
- `packages/db/src/schema.ts`

**Out of scope.** Cross-server resume. Live snapshots to Redis.

**Depends on.** API-2.

**Done when.** Typecheck clean. Kill the game-server mid-match and restart; `game_events` for that session contains every event up to the crash; the session is marked `abandoned` on the next boot.

---

#### AUTH-1 — Sessions + Google/Discord OAuth via better-auth
**Why now.** Nothing persistent works without identity: collection, ladder, deck saves, storefront, ranked all need it. Today the only "player" is a transient lobby UUID in localStorage.

**Scope.**
- Wire `better-auth` in `apps/api` with the Drizzle adapter pointed at our Postgres.
- Add a `sessions` table to `packages/db/src/schema.ts` if not already present; confirm `users.oauth_provider`, `users.oauth_subject` columns match the README schema overview.
- Configure Google + Discord OAuth providers (env-var driven: `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET`).
- Expose `auth.session` on the tRPC router plus REST `/auth/*` for the OAuth callbacks.
- `apps/web`: SessionProvider reads from tRPC on boot. Splash gains "Sign in with Google / Discord" buttons; the anonymous lobby flow is gated behind a session.
- `apps/game-server`: socket handshake reads the session cookie via better-auth's `verifyRequest`; reject connections without a session. Replace transient client UUIDs with `userId` everywhere downstream.
- Document the new env vars in `README.md` Local Development.

**Context to load.**
- `apps/api/src/*`
- `packages/db/src/schema.ts`
- `apps/web/src/App.tsx`, `apps/web/src/splash.tsx`
- `apps/game-server/src/index.ts`
- `packages/protocol/src/*`

**Out of scope.** 2FA, email/password sign-up, account merge, profile editing, role-assignment UI, email verification.

**Depends on.** API-1.

**Done when.** Typecheck clean. Sign in with Google, sign in with Discord, refresh → still signed in, sign out → splash gates. Game-server socket rejects connections without a session.

---

#### OPS-2 — Sentry + OpenTelemetry exporter wiring
**Why now.** We're past the toy-project stage but flying blind. Sentry lets us see every error in test/prod; OTel exporters add tracing across the api ↔ game-server ↔ engine boundary.

**Scope.**
- `apps/api`, `apps/game-server`, `apps/web`: init `@sentry/node` (services) / `@sentry/react` (web) keyed by `SENTRY_DSN`. Tag releases with the commit SHA from CI.
- Configure source-maps upload in the web CI build so prod stack traces deminify.
- Top-level React error boundary in `apps/web` that reports to Sentry and renders a "something went wrong" screen.
- OTel SDK in each service (`@opentelemetry/sdk-node`), HTTP + tRPC + Socket.io instrumentation, OTLP exporter pointed at `OTEL_EXPORTER_OTLP_ENDPOINT` (no-op when unset).
- Document required env vars in README Local Development.

**Context to load.**
- `apps/api/src/index.ts`, `apps/game-server/src/index.ts`, `apps/web/src/main.tsx`
- `.env.example`
- `infra/docker-compose.yml`

**Out of scope.** Backend collector setup (Honeycomb/Tempo). Real-user monitoring (RUM). Performance budgets / alerting rules.

**Done when.** Typecheck clean. Manually throw an error in each service; it surfaces in Sentry. Local dev with a stub collector: spans emitted for one Find Match → game-end round-trip.

---

#### OPS-3 — Game-server graceful shutdown on deploy
**Why now.** Every deploy currently kills active matches. Pairs with SERVER-1 to give players a transparent experience across deploys. Pre-launch requirement.

**Scope.**
- On `SIGTERM`: stop accepting new connections and refuse new room creation.
- Existing rooms keep running; the server waits up to a configurable drain timeout (default 5 min) for natural game-end.
- Broadcast a "server will restart, your game is safe" event so the client can show a banner.
- After timeout (or all rooms ended), exit cleanly. Railway routes new connections to the fresh instance.
- The fresh instance picks up nothing — active games stay on the draining instance until SERVER-1's reconnect window handles drops.

**Context to load.**
- `apps/game-server/src/index.ts`
- `apps/game-server/src/rooms.ts`

**Out of scope.** Sticky-room ownership coordinator (Redis lock — separate card). Cross-region failover.

**Depends on.** SERVER-1 ✅.

**Done when.** Typecheck clean. `kill -TERM` on a running game-server: new connections refused, an in-flight match plays to completion, then the process exits within the drain window.

---

#### TEST-1 — Playwright E2E scaffold + 1v1 happy-path smoke
**Why now.** The engine has 168+ unit tests but no automated coverage of the full Socket.io + web + game-server path. A scaffold + one happy-path test now means future flows can be added cheaply.

**Scope.**
- `apps/web/e2e/` directory with Playwright config.
- `pnpm test:e2e` script: bring up Postgres + Redis via the existing compose stack, start `apps/api` + `apps/game-server` + `apps/web` in dev mode, run Playwright.
- One test: launch two browser contexts, both press Find Match, wait for `lobby.matchFound`, play one deterministic concede game (player A concedes turn 1), assert both clients receive `game.ended` with player B as the winner.
- GitHub Actions job that runs the suite on every PR to main, gated by a `skip-e2e` label for fast iteration.

**Context to load.**
- `apps/web/src/App.tsx`
- `infra/docker-compose.yml`
- `apps/web/package.json`
- existing Vitest config(s)

**Out of scope.** Visual regression. Mobile-viewport E2E. More than one test.

**Done when.** `pnpm test:e2e` passes locally with the dev stack up. CI runs it on PRs and blocks merge on failure (unless `skip-e2e` is set).

---

## Backlog

Rough ideas and deferred work. Not yet specced, not yet claimable. When an item is ready to work on, spec it out, move it to **Up next**, and create a GitHub Issue. See [CLAUDE.md — Promoting a backlog item](CLAUDE.md#promoting-a-backlog-item-to-a-task-card).

#### Engine
- Replacement-effect interceptor framework — "instead" / "would be" effects that fire before the original event, prevent it being considered to have happened, and disqualify any abilities that would have triggered off it. Likely 2–3 cards once sized.
- Battlefield controller tiebreak across simultaneous abilities.
- Keyword resolvers: Ambush (extra-turn plumbing), Guardian (redirect damage), Modify (modifier-die routing), Redeploy (upgrades move on defeat).
- Special-ability registry with inherent-die semantics (S face).
- Ability AST resolver dispatch — full coverage of the op status table below.
- Replay reconstruction from seed + event log.
- "After setup" trigger pass.
- Plots / battlefield abilities (Claim).

#### Supports & stability _(WEB-S1 blocked on ENGINE-S1)_
- **WEB-S1** — Render support cards in `BattleZone` below characters. Stability badge instead of health badge. Activate flow same as characters. Upgrade badges on supports. Detail overlay with Stability, ability text, subtypes.

#### Services
- Deck builder API + validator (CRUD to save user decks to DB).
- Card ownership logic (`card_collections` integration, opened packs).
- Ranked matchmaking: hidden MMR (Glicko-2) + visible trailing rank tiers.
- Casual matchmaking: fast-expanding MMR bounds.
- Tournament matchmaking: bracket-aware.
- Spectator mode read-only socket.
- Sticky room ownership coordinator (Redis-based, multi-instance).
- Stripe integration: checkout, webhooks, entitlements, refunds.
- Season pass + currency ledger.
- Anti-cheat heuristics workers (queue dodging, dice-roll bias, AFK).
- Cloudflare in front of api/game-server with rate-limit rules.
- Turnstile on signup and high-value actions.

#### Client
- Phone-portrait layout pass (360×640): opponent strip, table, hand, dice tray.
- Game over screen + rematch.
- Combat-effect library (melee/ranged/indirect/special) keyed off engine events.
- Pack-opening choreography.
- Storefront UI (Stripe Elements, currency packs, bundles, season-pass page).
- Reduced-motion + color-blind modes.
- Audio: SFX, music, mixing buses, ducking.
- Spectator UI.
- PWA install + offline shell caching.
- i18n scaffold (Paraglide); ship English first.
- Screen-reader event narration in live match.
- **Roll cam (revamp)** — removed 2026-05-15 (feel was too janky). Bring back when there's time to do it right: proper die geometry with six textured faces, weighty physics, clean camera-cut back to the board. `DicePool3D` and `FACE_CORRECT_Q` are good foundations.

#### Content & ops
- First original Prophecy set: ~140 cards across factions/colors with 5 keywords represented.
- Lore bible + naming conventions for original IP.
- Art pipeline (commissioning, approvals, atlas generation in CI).
- Tournament rules document.
- Player support runbook.
- Backup/restore drill runbook + quarterly exercise.

#### Post-v1.0
- **2v2 team play** — paired-team queue, shared-resource rules, team-vs-team UI, team-aware targeting.
- **Free-for-all** (3–4 player) — matchmaking, FFA-specific UI, elimination handling, tournament formats with FFA pods.
- Other modes (drafted decks, sealed events, gauntlets) once 1v1 is healthy.
- Capacitor-wrapped native shells (iOS / Android) once the PWA experience is solid.

#### Future service extractions
Keep boundaries clean now so extractions are straightforward when scale justifies them.
- Extract `apps/admin` from `apps/web` once back-office workflows outgrow the player client.
- Extract `apps/matchmaker` from `apps/api` once queue throughput or pairing complexity warrants it.
- Extract `apps/jobs` from `apps/api` once worker load makes co-location risky.

---

## Ability op status

Which `Effect` ops and `Ability` kinds have live dispatcher support. A checked box means the dispatcher handles it and tests cover it. Card authors: if an op isn't checked, author the AST shape but expect a `NotImplementedError` at runtime.

#### Ability kinds
- [x] `immediate` — event plays, effects fire, card is discarded/set aside · _ENGINE-6_
- [x] `triggered` — before/after a game event fires this automatically · _ENGINE-7_
- [ ] `action` — player activates (exhaust/remove-die/spend cost)
- [ ] `powerAction` — same, once per round
- [ ] `special` — fires when this card's special die face is resolved
- [ ] `passive` — always-on predicate read by other engine paths; no dispatcher
- [ ] `claim` — fires when this battlefield is claimed

#### Effect ops
**First-wave (ENGINE-6)**
- [x] `dealDamage` · [x] `addShields` · [x] `removeShields` · [x] `drawCards` · [x] `gainResources` · [x] `loseResources` · [x] `healDamage`

**Dice ops (ENGINE-6b)**
- [ ] `rollEventDie` — roll the event card's own die into pool (transient)
- [ ] `rollCardDie` — roll a named card's die into pool (transient; catalog lookup)

**Dice manipulation**
- [ ] `removeDie` · [ ] `rerollDice` · [ ] `turnDie` · [ ] `resolveDie` · [ ] `resolveWithoutRemoving` · [ ] `rollDie` · [ ] `setAsideDie` · [ ] `modifyDieValue`

**Card plays**
- [ ] `playCard` · [ ] `returnToHand` · [ ] `searchDeck` · [ ] `discardCards` · [ ] `discardFromDeck` · [ ] `lookAtCards` · [ ] `revealTopCard` · [ ] `returnDefeatedCharacter`

**Character / card state**
- [ ] `activateCharacter` · [ ] `exhaustCard` · [ ] `readyCard` · [ ] `moveDamage` · [ ] `moveShields` · [ ] `placeDamageOnCard` · [ ] `placeResourceOnCard` · [ ] `grantKeyword` · [ ] `forceActivate` · [ ] `takeBattlefieldControl` · [ ] `claimBattlefield` · [ ] `endActionPhase` · [ ] `takeAdditionalActions`

**Branching**
- [ ] `choice` — present two effect branches; active player or opponent picks one

---

## Done
- **2026-05-15 — ENGINE-6b — Event-owned dice + cross-card die roll mechanic.** `rollEventDie` rolls the event card's own dieFaces into the pool as a transient die; `rollCardDie` rolls any referenced catalog card's die by ID. `CatalogDieEntry` interface threaded through `applyPlayCard` → `applyAction` via `ApplyOptions`. Transient die cleanup on resolve-dice confirmed. Seed cards EVT_056 (Wild Strike) and EVT_057 (Call the Hound) added. `AbilityBuilder.tsx` forms added for both ops. 4 new tests; 175 engine tests green; workspace typecheck clean. (`04fb024`)
- **2026-05-15 — ENGINE-8 — Multi-target resolve-dice action.** `resolve-dice` action gains `targets: readonly { dieInstanceIds; targetCharacterId? }[]`; resolution loop applies per-group damage/shields; backward-compat flat shape normalised in apply-action.ts; 3 new tests (2-melee split, shield split, legacy compat); all existing tests migrated to new shape; 171 engine tests green, typecheck clean. (`8a0c00e`)
- **2026-05-15 — SERVER-1 — Reconnect window.** 60-second away timer starts on disconnect when game is in-progress; clears on `lobby.rejoin`. Timer expiry applies a `concede` on behalf of the disconnected player and broadcasts `game.events` + `game.state` + `lobby.state` to the room. Client-side rejoin was already fully wired (`SocketBridge` → `lobby.rejoin` on reconnect, `lobbyCache` for roomId persistence). Game-server typecheck clean; 168 engine tests green. (`5fae253`)
- **2026-05-15 — WEB-19 — Multi-target damage and shield resolution UI.** `ActiveFlow.resolve` gains `pendingTargets` (committed die groups) replacing `targetCharacterId`. Resolution loop: select dice → tap character to commit group → dice dim as spent → pending counter badge (−N red / +N blue) on target character. Tapping an already-assigned character replaces its group. Commit enabled when `pendingTargets.length > 0 && selectedDieIds.length === 0`. Dispatches `resolve-dice` with `targets` array. DicePool3D and DiceStack both updated. Resource/disrupt unchanged single-group path. Typecheck + 175 engine tests green. (`30e02ca`)
- **2026-05-15 — WEB-7 — Human-readable activity log.** (`b508409`) Replaced raw JSON event dump with a formatted collapsible activity log in BattleZone. `buildLogEntries` maps all engine events to plain-English strings with bold player/character names and color-coded die chips (`DieChip`). `dice.resolved` is merged with follow-on `damage.dealt` / `shields.placed` / `resources.gained` / `resources.lost` into single entries. `round.begin` renders as a centered divider. Automatic passes, trigger lifecycle, and upkeep noise are suppressed. Log is collapsed by default via `<details>`, scrollable to 30 entries, `aria-live` for screen readers. Typecheck + 168 engine tests green.
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
- **2026-05-14 — WEB-10 — Battle zone: four-column board layout with CCG card ratio.** `ownerInstanceId?: string` added to `DieInPool`. New `BattleZone` component replaces `PlayerSummaries` + `DicePoolStrip`. `CharacterCard` renders CCG-ratio tiles with art gradient, health badge, name scrim; exhausted characters rotate 90°. Upgrade badges are 40×40 circular buttons outside the card button. `DiceStack` shows vertical die tiles per character. `CardDetailOverlay` and `UpgradeDetailOverlay`. 152 engine tests green; typecheck clean. (`6970602`)
- **2026-05-14 — WEB-8 — Drag-to-play Pass 1.** `useDragToPlay` hook handles touch and mouse globally. Drag starts after 8px movement or 120ms hold. Floating `DragArtifact` portal follows the finger imperatively. Game board glows emerald when card is dragged over it. Release over board plays the card; release elsewhere cancels. Typecheck clean. (`78c03ce`)
- **2026-05-14 — WEB-4 — Hand strip, expanded view, play-card integration.** `cardCatalogIds` added to `GameState`. Persistent `HandStrip` with compact tiles, cost badge, affordability highlight. `HandOverlay` bottom-sheet with scrollable card row and focused-card detail panel. `ActionPanel`'s old inline play-card and reroll target grids removed. 152 engine tests green; workspace typecheck clean. (`10d2fc2`)
- **2026-05-14 — OPS-1 — External hosting: Vercel (web) + Railway (game-server).** Vercel frontend deployed and Railway socket server deployed. Dynamic `PORT` fallback, `WEB_PUBLIC_URL` for CORS, `VITE_GAME_SERVER_URL` in Vite. Real-time multiplayer verified across devices.
- **2026-05-13 — SERVER-2 + WEB-3 — FIFO matchmaking queue + Find Match UI.** In-memory FIFO queue (`lobby.findMatch` / `lobby.leaveQueue`). Match fires `lobby.matchFound` unicast to both players. New protocol types. `SocketBridge` handles `matchFound`. Splash rewritten with Find Match as primary CTA. (`c3ea317`)
- **2026-05-13 — ENGINE-7 — The queue, after-triggers, before-triggers.** `GameState` gains `queue`, `pendingTriggers`, `nextQueueEntryId`. Trigger scanner, `collectAfterTriggers` + `collectBeforeTriggers` + `commitTriggers` + `applyOrderTriggers`. Queue drain FIFO loop with tail-append. Before-triggers wired in `activate.ts` and `resolve-dice.ts`. After-triggers wired in `activate.ts`, `resolve-dice.ts`, `play-card.ts`. Simultaneous trigger ordering via `order-triggers` action. 152 tests green. (`e6e86a7`)
- **2026-05-13 — ENGINE-6 — Ability AST framework + first-wave event dispatcher.** Full `Ability`/`Effect` TypeScript type system (6 ability kinds, 7 first-wave ops + 28 stubs). Matching Zod schemas in `@prophecy/protocol`. `applyEffect` / `applyEffects` dispatcher — first-wave ops implemented. `applyPlayCard` fires `immediate` abilities. 3 new engine events. 147 tests green. (`2676a51`)
- **2026-05-13 — ADMIN-1 — Original-card / deck admin UX + JSON-backed catalog.** New canonical catalog at `packages/db/seed/cards.json` + `decks.json` (37 cards + 2 decks). Shared Zod schemas in `@prophecy/protocol`. New REST endpoints on game-server. Admin UX at `/admin/cards` and `/admin/decks`. 121 engine tests still green. (`a8abde9`)
- **2026-05-13 — ENGINE-5 — Modifier-with-parent enforcement + symbolless modifiers + Draw symbol.** `DieSymbol` extended with `'draw'` and `'modifier'`. Explicit two-case resolve rule. UI: full symbol words on die tiles. 121 engine tests green. (`ac1d50d`)
- **2026-05-13 — ENGINE-4 — Ambush + extra-turn plumbing.** `extraTurnsPending` and `ambushGrantedThisTurn` added to `GameState`. `endTurn` helper routes through extras. `grantExtraTurn` seam for ability code. 116 engine tests green. (`8431bd2`)
- **2026-05-13 — ENGINE-3 — `applyRerollDice` + discard-first UI.** New `applyRerollDice` handler. `selectionMode` discriminated union in Zustand. 109 engine tests green. (`ffce0f1`, `7ba508f`)
- **2026-05-13 — WEB-2 — Resolve mode: symbol-locked die selection.** Tap "Resolve dice" → dice tiles become tap targets → sticky bottom bar drives dispatch. First die tap locks the symbol. (`31a15d4`)
- **2026-05-13 — Engine: ready exhausted characters at upkeep.** Plugs placeholder in `runUpkeepAndStartRound`. (`fcf4920`)
- **2026-05-13 — WEB-1 — ActionPanel: action → target two-step.** ActionPanel drives every action through `getLegalActions`. Bottom-sheet / centered modal for targets. Claim and Concede through `ConfirmOverlay`. (`1767a5d`)
- **2026-05-13 — Server: wire `startRoom` to the committed test decks.** `newGameFromDecks` against the loaded corpus. Deck pairing randomized 50/50 by `deck-assignment` RNG fork. (`0c49534`)
- **2026-05-13 — Engine: collapse setup to a single roll-off-winner choice.** Roll-off winner chooses who goes first; engine assigns shield recipient automatically. `SetupStep` simplified. 102 engine tests green. (`d87e0d2`)
- **2026-05-13 — ENGINE-2 — `applyPlayCard` (vanilla cost-only).** Validates active player + action phase + card in hand + affordable. Pays cost, moves to discard, emits `card.played`. `GameState` gains `cardCosts`. 105 engine tests green. (`33e349f`)
- **2026-05-12 — ENGINE-1 — Per-card hand & deck tracking.** `hand`, `deck`, `discard` on `PlayerState`. Fisher-Yates shuffle + deal 5. `drawCards` helper. Upkeep redraws to `handSize`. 97 engine tests green. (`8d4526f`)
- **2026-05-12 — Engine: split setup into independent first-player + shield-recipient choices.** Three new actions, events renamed, legal-actions inspector and web SetupPanel rewired. Reverted 2026-05-13. (`27b3667`)
- **2026-05-12 — Engine: `resolve-dice` + character defeat.** Resolves melee / ranged / shield / resource / disrupt. Shields block damage 1-for-1. Defeat removes character + dice. Win condition wired. (`c186d6c`)
- **2026-05-12 — Engine: `getLegalActions` inspector + `activate` rotates the turn.** Pure read-only inspector. Fixed latent bug: `activate` wasn't rotating the turn. (`589fa62`)
- **2026-05-11 — Server: lobby + game multiplayer wiring.** `apps/game-server` instantiates engine games per Socket.io room and broadcasts events. Lobby persistence with idle-room TTL; localStorage-backed rejoin. (`b2b7c4e`, `79bb5b7`, `7ba3949`, `843c6a8`)
- **2026-05-11 — Engine: `activate` action with seeded dice rolling.** Exhaust character, roll N dice into pool. Deterministic via per-action seeded fork. (`98ce3a4`)
- **2026-05-11 — Fixtures: deck legality validator + test decks.** `validateDeck` enforces Part 4 rules. Two reference test decks (DECK_A Light, DECK_B Shadow). (`0871bc4`, `83ccb33`)
- **2026-05-10 — Fixtures: third-party-derived reference set, mechanical-only.** 173-card mechanical port under `packages/game-engine/__fixtures__/synthetic-set/`. Strictly test-only. (`81f0594`)
- **2026-05-10 — Monorepo skeleton bootstrapped.** pnpm workspaces + Turborepo + strict TS. Three apps, three packages. Touch-first CSS defaults. Splash route pings `/trpc` for liveness.
- **2026-05-10 — Card catalog and deck schema, first migration.** Shared enum value lists in `@prophecy/protocol` and `@prophecy/db`. Seven tables, five enums. Migration `0000_deep_stellaris.sql` generated.
- **2026-05-10 — Engine: first action slice.** `newGame` factory; `applyAction` dispatch. `pass`, `claim-battlefield`, `concede` implemented. End-of-round loss check. `EngineEvent` discriminated union.
