# Roadmap

Spec registry, backlog, and shipped history for Prophecy. **Status tracking (in-progress, blocked) lives in [GitHub Issues](https://github.com/pearlyeti/prophecy/issues).** Process for picking up or promoting a card is in [CLAUDE.md](CLAUDE.md#picking-up-a-task-card).

Cards are coded by area: `ENGINE-N` · `WEB-N` · `SERVER-N` · `API-N` · `AUTH-N` · `ADMIN-N` · `OPS-N` · `TEST-N`.

---

## Up next

Fully specced, claimable cards. Each has a [GitHub Issue](https://github.com/pearlyeti/prophecy/issues) and is sized for one focused session (~200–500 lines of changes including tests).

---

#### ENGINE-CH1 — `choose` op (modal "or" / "Choose N")

**Why now.** Modal abilities ("Give a shield, deal 2 damage, or draw a card") and "Choose N of M" are common in the rules reference. The current `choice` schema entry is a stub: no engine dispatch, no designer form. With ENGINE-ST1 in place, this is the natural next step.

**Scope.**
- `packages/protocol/src/catalog.ts`: replace the `choice` stub with a real `choose` schema — `{ op: 'choose', count: number, branches: { label?: string, steps: EffectStep[] }[], optional: boolean }`. Add to `KNOWN_OPS`.
- `packages/game-engine/src/abilities/types.ts`: `GameState.pendingChoice: PendingChoice | null` mirroring `pendingSearch`.
- `packages/game-engine/src/abilities/dispatch.ts`: `applyChoose` sets `pendingChoice = { branches, count, remainingSteps }` and bails out the same way `searchDeck` does (suspension pattern).
- `apps/game-server/src/match/actions/resolve-choice.ts` NEW — mirrors `resolve-search.ts`. Receives the player's branch picks, validates (count matches, picks are in range, distinct), runs them via the step engine in chosen order, clears `pendingChoice`, resumes `remainingSteps`.
- `getLegalActions` blocks all actions except `resolve-choice` while `pendingChoice` is set; exposes `canResolveChoice`.
- `apps/web/src/routes/designer/AbilityBuilder.tsx`: `choose` form — number input for `count`, branch list with add/remove, each branch wrapping a nested step list. "Choose…" entry in the implemented-ops optgroup.
- ROADMAP op-status table: tick `choose` and reference ENGINE-CH1.

**Context to load.**
- `packages/game-engine/src/abilities/dispatch.ts` (lines 145–155 — `pendingSearch` suspension pattern)
- `packages/game-engine/src/abilities/types.ts`
- `packages/protocol/src/catalog.ts`
- `apps/game-server/src/match/actions/resolve-search.ts` (template)
- `apps/web/src/routes/designer/AbilityBuilder.tsx`
- `README.md` §Engine implementation notes

**Depends on.** ENGINE-ST1.

**Out of scope.** Live-match player UI for picking a branch in a match — separate WEB card (designer can author choose-cards and server enforces them; player just can't pick yet via UI). Filed as a follow-up in the backlog.

**Done when.** Typecheck clean. Tests: `choose` count=1 (3 branches) → only chosen branch applies. `choose` count=2 (3 branches) → two chosen branches apply in chosen order. `choose` followed by a then-gated step → gates on whether all chosen branches fully resolved. `choose` mid-ability → `remainingSteps` resumes correctly after resolution. `getLegalActions` blocks unrelated actions while `pendingChoice` is set. Designer round-trips "Choose two: A, B, C" without raw JSON.

---

#### ENGINE-PC1 — Enforce `playCondition` in the engine

**Why now.** Schema and designer UI for `playCondition` have been complete since ENGINE-7 (`catalog.ts` lines 62–76) — but no execution path reads the field. A "spot a yellow character" triggered or action ability fires regardless of whether the player has a yellow character in play. This is a zero-trust violation (client can't be the only check) and a correctness gap covering ≥ 8 condition kinds already in the schema. Pure bug fix; small surface.

**Scope.**
- `packages/game-engine/src/legal-actions.ts`: new pure helper `playConditionMet(state, ctx, condition): boolean`. Cover every existing kind: `controlsBattlefield`, `spotCharacter` (color, unique, count), `spotCard`, `moreReadyCharacters`, `firstActionOfRound`, `opponentHasNoCards`, `haveNCharactersInPlay`, `opponentHasNCharacters`.
- Wire `playConditionMet` into the legal-action selector so cards/abilities whose condition fails are excluded from the offered set (client greys them out naturally).
- `apps/game-server/src/match/actions/use-card-action.ts`: pre-dispatch check. Unmet condition returns a structured `IllegalActionError` with `reason: 'playCondition'` and the failing kind.
- Same pre-dispatch check on any other entry point that fires an ability with a `playCondition` (triggered ability dispatch path, immediate ability on play, etc.) — audit and gate consistently.

**Relationship to ENGINE-PR1.** PR1 introduces a new top-level `playRestriction` field on cards; PC1 enforces the existing per-ability `playCondition` field. Different fields, different scopes (card-level vs ability-level), but the predicate evaluators share enough shape that whichever lands second should factor out a common module. Note this in the PR description; no upfront refactor required.

**Context to load.**
- `packages/protocol/src/catalog.ts` (lines 62–76 — `playConditionSchema`)
- `packages/game-engine/src/abilities/types.ts` (`PlayCondition`, ability kinds carrying it)
- `packages/game-engine/src/legal-actions.ts` (`costsCanBeMet` lives here; add alongside)
- `apps/game-server/src/match/actions/use-card-action.ts`
- All paths that dispatch a `triggered` / `immediate` / `claim` ability (search for `applyEffects` callers in the engine).

**Out of scope.** New `PlayCondition` kinds (existing 8 only). Generalising the predicate AST to share with ENGINE-PR1 (note for the second card to land, not required of this one).

**Done when.** Typecheck clean. `legal-actions.test.ts` covers every condition kind (≥ 8 tests) — present/absent and any sub-fields (color, count). Pre-dispatch test on `use-card-action`: server rejects with `reason: 'playCondition'` when unmet, succeeds when met. Manual smoke: seed a card with `spotCharacter: { color: 'yellow' }`; attempt to play with no yellow character → engine blocks and client greys it; play a yellow character first → card becomes legal.

---

#### ENGINE-CM1 — Cost-modification effects (with play-time prompt)

**Why now.** Several seeded card concepts need "this costs N less if…" or "+1 to play if…" semantics. Today there's no authored shape for it — authors fall back to hand-edited JSON, and the engine can't enforce it. This unblocks a meaningful slice of design space and lays the primitive ENGINE-PASS1 reuses.

**Scope.**
- New `Effect` op `modifyCost` (or new ability kind `costModifier`, decided in implementation): predicate `appliesTo: CardCriteria` + integer `delta` (negative or positive, clamped so adjusted cost ≥ 0). Optional `oncePerTurn` flag, optional `usesPerRound: number`.
- `packages/protocol/src/catalog.ts`: Zod schema; add to `KNOWN_OPS`.
- `packages/game-engine`:
  - `GameState.costModifiers` index: derived from in-play sources (characters, supports, upgrades, battlefield) each turn; cleared/recomputed on enter/leave play and on round/turn boundaries.
  - `play-card` action accepts optional `costModifierSourceId`. Engine validates the source still exists, predicate matches the played card, and the per-turn/round usage cap hasn't been hit. Adjusted cost is deducted; an `cost.modified` event records the source + delta.
  - `getLegalActions` / a new `getCostModifierOptions(playerId, cardInHandId)` selector exposes the choices the client renders. Returns an array of `{ sourceCardInstanceId, label, delta }`.
- `apps/web`:
  - At `play-card` dispatch time: if `getCostModifierOptions` returns ≥ 1 entry for this card, open a confirm modal — "Apply −1 cost from Healer's Charm?" with options for each eligible modifier **and** a "Pay full cost" choice. Touch-first (≥ 44 px targets, confirm before commit). The user's pick rides on the `play-card` action.
  - If zero options, the modal is skipped (no UX regression for normal plays).
- `apps/web/src/routes/designer/AbilityBuilder.tsx`: new form for `modifyCost` with delta stepper, `CardCriteriaEditor` for `appliesTo`, usage-cap inputs. No raw-JSON fallback.

**Context to load.**
- `packages/game-engine/src/abilities/types.ts`
- `packages/game-engine/src/abilities/dispatch.ts`
- `packages/game-engine/src/actions/play-card.ts`
- `packages/game-engine/src/getLegalActions.ts`
- `packages/protocol/src/catalog.ts`, `packages/protocol/src/events.ts`
- `apps/web/src/routes/Game.tsx` (play-card dispatch path)
- `apps/web/src/store.ts` (ActiveFlow — add a `pendingCostModifierChoice` flow)
- `apps/web/src/routes/designer/AbilityBuilder.tsx`

**Out of scope.** Cost modifiers that target `action`/`powerAction` costs (separate card). Replacement-style "instead of paying X" effects (covered by the replacement-effect backlog item). Cost modifiers that change resource colors required (defer).

**Done when.** Typecheck clean. Engine tests: predicate-match, predicate-miss, clamp-at-zero, oncePerTurn enforcement, cost.modified event payload. Manual smoke: seed two cards — a static −1 modifier source and a target — confirm prompt offers the discount, "Pay full" deducts the base cost, choosing the modifier deducts the reduced cost, and a second play in the same turn is offered no modifier when `oncePerTurn` is set.

---

#### ENGINE-PR1 — Play restrictions ("only" conditions on cards)

**Why now.** Cards like *play only if you control a Shadow character* or *play only when your opponent has ≤ 2 cards in hand* are common designs. The check has to live in the engine (zero-trust client). Today there's no authored field for it — the engine accepts any play whose cost is paid.

**Scope.**
- New optional field `playRestriction?: PlayRestriction` on the catalog card schema (not on `Ability` — it gates the card itself, not its triggered/action abilities).
- `PlayRestriction` is a predicate AST. Start with a small composable set:
  - `controlsCharacter(criteria: CardCriteria)` / `controlsSupport(criteria)` / `controlsBattlefield(side: 'own' | 'opponent', criteria?)`
  - `handSize(op: '>=' | '<=' | '==', n: number, target: 'own' | 'opponent')`
  - `cardInPlay(criteria, side: 'own' | 'opponent' | 'either')`
  - `allOf([…])` / `anyOf([…])` / `not(child)`
- `packages/game-engine`:
  - `evaluatePlayRestriction(state, playerId, card)` exported pure helper.
  - `play-card` action validates restriction before cost deduction; returns IllegalAction with a structured `reason: 'playRestriction'` and the failing predicate path.
  - `getLegalActions` filters out plays whose restriction fails so the UI greys/hides the card naturally.
- `packages/protocol/src/catalog.ts`: Zod schema for the predicate AST (recursive). Versioned via existing catalog version.
- `apps/web/src/routes/designer/AbilityBuilder.tsx` (or the card-level editor that wraps it): new `PlayRestrictionEditor` component. Recursive UI mirroring the AST shape — `allOf`/`anyOf`/`not` containers with add-child buttons; leaf predicates have their own forms reusing `CardCriteriaEditor` where applicable. No raw JSON.
- `apps/web` greys disabled hand cards with a tap-to-see-reason tooltip ("Requires: control a Shadow character"). Touch-first.

**Context to load.**
- `packages/game-engine/src/actions/play-card.ts`
- `packages/game-engine/src/getLegalActions.ts`
- `packages/protocol/src/catalog.ts`
- `apps/web/src/routes/designer/AbilityBuilder.tsx` (or the card-level editor file)
- `apps/web/src/routes/Game.tsx` (hand-card legality rendering)

**Out of scope.** Play-zone restrictions (e.g. "play only on a support row" — covered by existing card-type/zone routing). Conditions that mutate during a single play resolution (e.g. "play only after spending a resource this turn" — defer until a card needs it). Triggered-ability `playCondition` is already a separate field and stays as-is.

**Done when.** Typecheck clean. Engine tests cover at least three restriction shapes including a nested `allOf(not(...), handSize(...))`. Server rejects a restriction-violating `play-card` with the structured reason. UI greys the card with the human-readable cause when the restriction fails; restriction passes → card plays normally. AbilityBuilder authors and round-trips a non-trivial restriction without raw JSON.

---

#### ENGINE-PASS1 — Passive / ongoing abilities (mechanical effects)

**Why now.** `passive` exists in the schema as an open `[k: string]: unknown` record (no dispatcher, no shape, no UI). The op-status table has had it sitting unchecked since ENGINE-6. Several characters/supports/upgrades need "while in play, X" semantics (stat buffs, granted keywords, ongoing cost discounts, targeting eligibility tweaks). Without this, those cards can't be authored or enforced.

**Scope.**
- Replace open-record `PassiveAbility` with a typed AST in `packages/game-engine/src/abilities/types.ts`:
  - `effects: readonly PassiveEffect[]`
  - `PassiveEffect` kinds (first wave): `modifyStat` (stability/shields-cap with `delta` and `stacking: 'add' | 'replaceWithMax'`), `grantKeyword`, `modifyCost` (reuses ENGINE-CM1's predicate + delta — eligible-source semantics shared), `modifyTargetingEligibility` (e.g. "cannot be targeted by events").
  - Each `PassiveEffect` carries `appliesTo: CardCriteria` (who it affects) and optional `whileCondition: PassiveCondition` (e.g. "while exhausted" — small AST, can stay tiny in v1).
- Engine lifecycle:
  - `GameState.activePassives: Record<instanceId, ActivePassive[]>` — index keyed by the **affected** card (so stat reads are O(1) per character).
  - `attachPassives(state, sourceCardInstanceId)` runs when a card enters play; recomputes the index. `detachPassives` runs on leave-play. Deterministic order: by `attachedAtSeq` then `instanceId`.
  - Stat read paths (`getEffectiveStability`, etc.), keyword checks (`hasKeyword`), cost calculation (folded into ENGINE-CM1 selector), and targeting eligibility (`matchesCardCriteria` consumers) all consult the index instead of the base card.
- `packages/protocol/src/catalog.ts`: discriminated-union Zod schema for `PassiveEffect`. Validates `kind: 'passive'` is no longer open-record.
- `apps/web/src/routes/designer/AbilityBuilder.tsx`: full passive form. Effect list + per-effect form (one per `PassiveEffect.kind`). `appliesTo` uses `CardCriteriaEditor`. No raw JSON; the open-record fallback is removed.
- `ROADMAP.md` op-status table: tick `passive` and reference this card.

**Context to load.**
- `packages/game-engine/src/abilities/types.ts`
- `packages/game-engine/src/state.ts` (GameState shape)
- `packages/game-engine/src/actions/play-card.ts` (entering play hook)
- Wherever defeated/discarded characters leave play (search `applyDefeat` / `applyDiscard`)
- `packages/game-engine/src/dispatch.ts` (stat / keyword / criteria readers)
- `packages/protocol/src/catalog.ts`
- `apps/web/src/routes/designer/AbilityBuilder.tsx`

**Depends on.** ENGINE-CM1 ✅ first — the `modifyCost` effect kind is shared. If ENGINE-PASS1 lands earlier, factor out the shared selector as part of this card.

**Out of scope.** Replacement effects (already a backlog item — "instead of"). Conditional passives whose `whileCondition` mutates mid-resolution (defer). Passives on cards in zones other than in-play (no current design need).

**Done when.** Typecheck clean. Engine tests: attach on enter play, detach on leave play, stat buff visible in combat math, keyword grant respected by triggered-ability gating, `replaceWithMax` vs. `add` stacking both verified, two stacking sources sum deterministically regardless of play order tiebreak via `instanceId`. AbilityBuilder authors a "+1 stability while in play" character and the value updates live in a smoke session. `passive` row in op-status table is checked and references ENGINE-PASS1.

---

#### WEB-20 — Per-player zone pagination
**Why now.** Supports enter play mid-game and may not fit alongside characters; we need a way to navigate to them without disrupting the character view.

**Scope.**
- Each player's zone independently shows a character page and optionally a support page.
- Support page only appears when at least one support cannot fit in the remaining column slots of the character view. When all supports fit, no pagination UI is shown.
- Page indicator (arrow buttons + dot pip) appears at the zone edge when a support page exists. Swipe (touch) and arrow buttons (pointer) navigate between pages.
- `activeFlow` — selected dice, `pendingTargets`, activate state — persists across page switches so cross-zone targeting works: select a support die on the support page, switch to the character page, tap a target.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (PlayerZone, OpponentZone, BattlefieldRow)
- `apps/web/src/store.ts` (ActiveFlow)

**Out of scope.** Animated slide transitions. Keyboard navigation.

**Depends on.** WEB-S1.

**Done when.** Typecheck clean. Play supports until they overflow the character page → support page indicator appears. Swipe navigates between pages. Select support die, switch to character page, tap target → resolve dispatches the full multi-target payload correctly.

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

#### SERVER-3 — Session-gate designer write routes
**Why now.** The designer PUT endpoints (`/designer/cards`, `/designer/decks`, `/designer/attributes`, `/designer/card-art/:cardId`) on the deployed game-server are completely unauthenticated — any request can overwrite the card catalog. AUTH-1 shipped real session auth; using it here is a one-session fix.

**Scope.**
- In `apps/game-server/src/index.ts`, extract a `requireSession(req, res): Promise<string | null>` helper that calls `{API_URL}/api/auth/get-session` with the incoming cookies and returns `userId` or writes a `401` and returns `null`. (Same pattern as the socket middleware.)
- Call `requireSession` at the top of each PUT route handler: if it returns `null`, return early — the 401 is already sent.
- GET routes (`GET /designer/cards`, etc.) remain open (read-only, no secrets at stake).
- No role check needed: any authenticated session can use the designer (it's a dev tool, not publicly linked).

**Context to load.**
- `apps/game-server/src/index.ts` (designer HTTP routes + socket session-verify middleware)

**Out of scope.** Role-based access control. Admin-only restriction. Rate limiting. Protecting GET routes.

**Depends on.** AUTH-1 ✅.

**Done when.** Typecheck clean. `curl -X PUT /designer/cards` without a valid session cookie → 401. Sign in, replay the request with the session cookie → succeeds.

---

## Backlog

Rough ideas and deferred work. Not yet specced, not yet claimable. When an item is ready to work on, spec it out, move it to **Up next**, and create a GitHub Issue. See [CLAUDE.md — Promoting a backlog item](CLAUDE.md#promoting-a-backlog-item-to-a-task-card).

#### Engine
- Replacement-effect interceptor framework — "instead" / "would be" effects that fire before the original event, prevent it being considered to have happened, and disqualify any abilities that would have triggered off it. Likely 2–3 cards once sized.
- Battlefield controller tiebreak across simultaneous abilities.
- Keyword resolvers: Modify (modifier-die routing), Redeploy (upgrades move on defeat).
- Ability AST resolver dispatch — full coverage of the op status table below.
- Replay reconstruction from seed + event log.
- "After setup" trigger pass.

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
- **WEB-23 — Smart zone column packing** — Instead of a fixed column width, compute each card column's width from the maximum dice count for that card in the pool. Cards with large dice pools get wider columns; cards never needing more than 2 dice get narrower ones. Keeps the total zone width fixed while maximising use of available real estate. Depends on WEB-S1 (supports add columns of their own).

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
- [x] `action` — player activates (exhaust/remove-die/spend cost) · _ENGINE-A1_
- [x] `powerAction` — same, once per round · _ENGINE-A1_
- [x] `special` — fires when this card's special die face is resolved · _ENGINE-K3_
- [ ] `passive` — always-on ongoing effects (stat buffs, keyword grants, cost mods, targeting eligibility) · _ENGINE-PASS1_
- [x] `claim` — fires when this battlefield is claimed · _ENGINE-C1_

#### Effect ops
**First-wave (ENGINE-6)**
- [x] `dealDamage` · [x] `addShields` · [x] `removeShields` · [x] `drawCards` · [x] `gainResources` · [x] `loseResources` · [x] `healDamage`

**Dice ops (ENGINE-6b)**
- [x] `rollEventDie` — roll the event card's own die into pool (transient) · _ENGINE-6b_
- [x] `rollCardDie` — roll a named card's die into pool (transient; catalog lookup) · _ENGINE-6b_

**Dice manipulation (ENGINE-D1)**
- [x] `removeDie` — remove N dice from own or opponent pool, filtered by `DieCriteria` · _ENGINE-D1, ENGINE-TF1_
- [x] `turnDie` — turn a die to show a different symbol, filtered by `DieCriteria` · _ENGINE-D1, ENGINE-TF1_
- [x] `modifyDieValue` — adjust die value up or down, clamped at 0 · _ENGINE-D1_
- [ ] `rerollDice` · [ ] `resolveDie` · [ ] `resolveWithoutRemoving` · [ ] `rollDie` · [ ] `setAsideDie`

**Card plays**
- [ ] `playCard` · [ ] `returnToHand` · [x] `searchDeck` · [ ] `discardCards` · [ ] `discardFromDeck` · [ ] `lookAtCards` · [ ] `revealTopCard` · [ ] `returnDefeatedCharacter`

**Character / card state**
- [ ] `activateCharacter` · [ ] `exhaustCard` · [ ] `readyCard` · [ ] `moveDamage` · [ ] `moveShields` · [ ] `placeDamageOnCard` · [ ] `placeResourceOnCard` · [ ] `grantKeyword` · [ ] `forceActivate` · [ ] `takeBattlefieldControl` · [ ] `claimBattlefield` · [ ] `endActionPhase` · [ ] `takeAdditionalActions`

**Branching**
- [ ] `choose` — modal "or" (count=1) / "Choose N of M" (count≥2); mid-resolution `pendingChoice` pause, branch picks resumed via `resolve-choice` · _ENGINE-CH1_

**Cost & restrictions**
- [ ] `modifyCost` — predicate-matched delta applied to a card's play cost; player chooses at play time via confirm prompt · _ENGINE-CM1_
- [ ] `playRestriction` — top-level card field, predicate AST enforced by `play-card` and `getLegalActions` · _ENGINE-PR1_

---

## Done
- **2026-05-17 — ENGINE-ST1 — Step model + `then` gating.** Replaced flat `effects: Effect[]` on all ability kinds with `steps: EffectStep[]` (`EffectStep = { effects: Effect[]; then?: boolean }`). `applySteps` in `dispatch.ts` iterates steps with then-gating: a step with `then: true` is skipped if the previous step did not fully resolve (AND of all effect `fullyResolved` flags). Per-op `fullyResolved` added to every handler: `gainResources` always true; `drawCards`/`loseResources` only if full amount; `dealDamage`/`addShields`/`removeShields`/`healDamage` only if ≥1 shield/damage event with `amount > 0` fired; die ops by count matched. `PendingSearch.remainingSteps` replaces `remainingEffects`; `QueueEntry.steps` replaces `QueueEntry.effects`; all 9 action-file callers updated. 25 seed card JSONs migrated from flat `effects: [...]` to `steps: [{effects:[...]}]`. New then-gating tests: (a) removeShields→dealDamage gates correctly; (b) multi-effect AND step gates the then-step; (c) per-op fullyResolved for gainResources, drawCards (empty deck). `AbilityBuilder.tsx` replaced `EffectsList` with `StepsList`: "Then ↳" toggle per step, "+ Add effect to step" inside each step, "+ Add step" below the list. 269 engine tests green; workspace typecheck clean.
- **2026-05-16 — WEB-9 — Drag-to-play Pass 2: character targeting.** `data-droptarget="character:{id}"` + `data-char-side` attributes on each `CharacterCard` outer div. `useDragToPlay` extended: `charTargetSide` field on `DragCardInfo`; `overCharTarget` state; updated `hitTest` finds character tiles via `closest('[data-droptarget]')` and computes validity; `begin` stores `charTargetSide`; `finish` dispatches with `characterTargets: [id]` on valid char drop or plain play on generic zone (char-targeting cards cancel on generic zone drop). `getCharTargetSide` helper: `upgrade` → `'own'`, event with `dealDamage`/`removeShields` → `'opponent'`, event with `addShields`/`healDamage` → `'own'`. Ring feedback: `drag-hover-valid` (strong emerald, scale-105), `drag-valid` (soft emerald), `drag-hover-invalid` (strong red), `drag-invalid` (dimmed). `DragArtifact` border reflects hover state. `BattleZone` → `OpponentZone`/`PlayerZone` → `BattlefieldRow` plumbing for `dragCharTargetSide` + `dragOverCharId`. Typecheck clean. (`f9f5772`)
- **2026-05-15 — TEST-1 — Playwright E2E scaffold + 1v1 happy-path smoke.** `apps/web/e2e/` directory with `playwright.config.ts` (Chromium, 3× webServer blocks for api/game-server/web). `e2e/global-setup.ts` creates two test users via better-auth email+password (enabled by adding `emailAndPassword: { enabled: true }` to `apps/api/src/auth.ts`) and saves their session cookies as Playwright storage state. `e2e/smoke.test.ts`: two browser contexts, both Find Match, auto-handle setup phase (choose-first-player + place-shields), active player concedes, assert both clients see `wins.` banner with exactly one Victory. `.github/workflows/e2e.yml` runs on every PR to main via Postgres + Redis service containers; skipped when `skip-e2e` label is set. Typecheck clean. (`5ca55b0`)
- **2026-05-16 — WEB-S1 — Support cards on the battlefield.** `SupportCard` component renders stability/shields badges, activate ring, exhausted tilt, and A/PA ability badges at ~75% character column width (70px). `SupportStrip` renders the full `supportOrder` row with pool dice above (player) or below (opponent) the card. Wired into `OpponentZone` (top, non-interactive) and `PlayerZone` (bottom, uses `activatableSupportIds` from `getLegalActions`). `cardCount` flex-grow includes `supportOrder.length`. `SupportState` imported from engine. Also removes stale WEB-7/API-1/2/3 from Up next. Typecheck clean. (`856eaf2`)
- **2026-05-16 — ENGINE-DS1 — Deck search / reveal effects.** `SearchDeckEffect`, `SearchChoice`, `SearchDisposition` added to `abilities/types.ts`; `pendingSearch: PendingSearch | null` added to `GameState` (initialised `null` in `newGame()`). `applySearchDeck` in `dispatch.ts` draws from top of source deck, sets `pendingSearch`, emits `deck.searched` + `cards.revealed`; suspension pattern in `applyEffects` stashes remaining effects and breaks early. New `resolve-search.ts` action validates picks, applies dispositions (toHand, toTop, toBottom, shuffleIntoDeck, discard), deterministically shuffles via seeded RNG when needed, clears `pendingSearch`, resumes continuation. Fixed same-player (ownDeck) merge bug where hand updates were lost. `getLegalActions` blocks all actions while `pendingSearch` is set; exposes `canResolveSearch`. `searchDeck` promoted from stub to full Zod schema in `packages/protocol`; added to `KNOWN_OPS`. AbilityBuilder `searchDeck` form: source, revealCount, defaultDisposition, optional, choice list (count + disposition per choice). 15 new tests (262 total); full workspace typecheck clean. (`40e49df`)
- **2026-05-16 — ENGINE-TF1 — Targeting criteria (dice and cards).** `DieCriteria` and `CardCriteria` composite predicate types added to `abilities/types.ts`. Die ops (`removeDie`, `turnDie`, `modifyDieValue`) upgraded: `symbol`/`fromSymbol` fields replaced by `criteria?: DieCriteria`. Character-targeting effects (`dealDamage`, `addShields`, `removeShields`, `healDamage`) gain `criteria?: CardCriteria`. `matchesDieCriteria` and `matchesCardCriteria` exported from `dispatch.ts`. Pre-selected targets throw on criteria mismatch; auto-targets (each*) silently skip non-matching characters. `cardMeta` on `GameState` provides type/color/subtypes/isUnique for criteria resolution. Zod schemas added to `packages/protocol`; `DieCriteriaEditor` and `CardCriteriaEditor` forms added to `AbilityBuilder.tsx`. 21 new tests; 247 engine tests green; full workspace typecheck clean. (`82f6a37`)
- **2026-05-16 — SERVER-2 — Designer server deployment + GitHub commit workflow.** Migrated card catalog from `packages/db/seed/cards.json` to per-card files (`cards/{id}.json`) so concurrent authors editing different cards never conflict. `githubSync.ts`: fetches committed snapshot at startup, diffs in-memory corpus vs committed, commits atomically via Git Data API (create-tree → create-commit → update-ref); auto-retries on stale SHA without surfacing an error. New routes: `GET /designer/committed`, `GET /designer/pending`, `POST /designer/commit` (with optional `CommitSelection` for partial commits), `GET /designer/cards/:id/history`, `GET /designer/cards/:id/at/:sha`, `GET /designer/commits/:sha`. `DESIGNER_SECRET` env-var guard on all mutating designer routes. **Changes tab**: dedicated tab showing every uncommitted card/deck/attribute change with checkboxes and new/modified/deleted badges; Commit selected, Commit all (with commit-message modal + change summary), Revert selected. **Card History panel**: per-card commit log with field-level diff (`CardDiff.tsx`) between any historical version and current; Restore to any version. **Commit report modal**: click any SHA → see every card/deck/attribute in that commit; items are clickable to navigate to that tab. `vercel.json` SPA rewrite added so `/designer` and other client routes don't 404. (`9403ff4`)
- **2026-05-16 — ENGINE-D1 — Dice manipulation ops.** `removeDie`, `turnDie`, `modifyDieValue` implemented in `abilities/dispatch.ts`. Proper typed effects replace stubs in `abilities/types.ts`; Zod schemas added to `packages/protocol/src/catalog.ts`; all three added to `KNOWN_OPS`; `AbilityBuilder.tsx` updated with per-op form UI. Events: `die.removed`, `die.turned`, `die.value-modified`. 13 new tests; 226 engine tests green; full workspace typecheck clean. (`d785f6b`)
- **2026-05-16 — ENGINE-C1 — Claim ability dispatcher.** `applyClaim` now fires all `claim`-kind abilities on the claimer's battlefield card via `applyEffects` before rotating the turn. `cardAbilities` keyed by `battlefieldCardId` — no new GameState fields required. 4 new tests; all engine tests green; workspace typecheck clean. (`ba94e38`)
- **2026-05-16 — ENGINE-K3 — Special ability dispatcher.** `applyResolveDice` gains a `case 'special':` branch that looks up the die's owning card's `special` ability and fires it via `applyEffects`. Resolving a special die on a card with no special ability is a silent no-op. `'special'` added to `RESOLVABLE_SYMBOLS_V1`. Existing test updated to remove `special` from the "should throw" list. 4 new tests; all engine tests green; workspace typecheck clean. (`ba94e38`)
- **2026-05-16 — ENGINE-K2 — Ambush keyword.** `performCharacterActivation` checks `cardKeywords[characterId]?.includes('ambush')` and `!ambushGrantedThisTurn` after after-triggers commit; if both hold, calls `grantExtraTurn` and sets `ambushGrantedThisTurn: true`. `endTurn` already consumes the extra turn and clears the flag — no other changes needed. 4 new tests; all engine tests green; workspace typecheck clean. (`ba94e38`)
- **2026-05-16 — AUTH-1 — Sessions + Google/Discord OAuth via better-auth.** `better-auth` 1.6.11 wired in `apps/api` with Drizzle adapter. Four auth tables added to `packages/db` schema (`user`, `session`, `account`, `verification`) with migration `0003_huge_sinister_six.sql`. `apps/api/src/auth.ts` configures Google + Discord social providers (env-var-driven, disabled when `CLIENT_ID` unset); auth routes mounted at `/api/auth/**` in Hono. `createContext` resolves session from request cookies and sets `userId` on tRPC context. `appRouter.auth.session` procedure returns `{ userId }` or `null`. `apps/web` gains `SignIn` route with Google/Discord buttons (better-auth client `signIn.social`); Router gates behind session; session userId synced into Zustand store as `playerId`. `apps/game-server` socket middleware calls `{API_URL}/api/auth/get-session` to verify cookies; rejects unauthenticated connections; uses `socket.data.userId` as authoritative player identifier across all room ops. Env vars: `AUTH_SECRET`, `API_PUBLIC_URL`, `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET`, `API_URL` (game-server). Typecheck clean. (`de0f767`)
- **2026-05-16 — ENGINE-K1 — Guardian keyword.** `cardKeywords` map added to `GameState`; `pendingGuardian` state added. `applyActivate` checks Guardian keyword + opponent damage dice before before-triggers fire, setting `pendingGuardian` and returning early. New `applyGuardianIntercept` handler (`guardian-intercept.ts`) removes the chosen opponent die, deals its face value as damage to the Guardian (shields-first, defeat-checked), clears `pendingGuardian`, then delegates to extracted `performCharacterActivation` shared with the normal path. `getLegalActions` blocks all other actions while `pendingGuardian` is set, exposes `guardianInterceptableDieIds` and `canSkipGuardian`. 8 new tests; 201 engine tests green; workspace typecheck clean. (`8803396`)
- **2026-05-16 — API-3 — Incremental event-log writes for in-flight durability.** Added `game_session_status` enum and `status` column to `game_sessions` (migration `0002_deep_bishop.sql`). Rewrote `GameWriter` with `open()`/`append()`/`close()` API: `open()` inserts the session row with `status='active'`; `append()` enqueues immediate per-room event writes via a promise chain; `close()` chains the final `status='completed'` update and awaits the queue. `markAbandonedSessions()` on boot updates any leftover `active` sessions to `abandoned`. 2 persistence tests (incremental write + boot scan); 185 engine tests green; workspace typecheck clean. (`199fea5`)
- **2026-05-16 — OPS-3 — Game-server graceful shutdown on deploy.** On `SIGTERM`: set `draining` flag, call `httpServer.close()` to stop new TCP connections, clear the matchmaking queue, broadcast `server.draining` (with `drainTimeoutMs`) to all connected clients, then poll via `checkDrainComplete()` — exits cleanly when `getActiveRoomCount() === 0`. Hard exit after `DRAIN_TIMEOUT_MS` (default 5 min, env-configurable). New-connection handlers (`lobby.create`, `lobby.findMatch`) reject with an error while draining. `server.draining` event added to protocol `ServerToClientEvents`. `getActiveRoomCount()` added to rooms module. Typecheck + 193 engine tests green. (`d82e29f`)
- **2026-05-16 — API-2 — Persist completed games on game-end.** New `game_sessions` and `game_events` tables added to Drizzle schema with migration `0001_opposite_iron_patriot.sql`. `GameWriter` in `apps/game-server/src/persistence.ts` buffers events per room and flushes both tables in a single transaction on `game.ended`. Wired into `lobby.start`, `lobby.findMatch`, `game.action`, and reconnect-timeout forfeit paths. Vitest config added for game-server; end-to-end test confirms session row (players, winner, seed, duration) and all event rows land after a concede. 185 engine tests + 1 persistence test green; workspace typecheck clean. (`8e30d41`)
- **2026-05-16 — ENGINE-A1 — Action and Power Action ability dispatch.** `LegalActions` gains `actionableCardIds` and `powerActionableCardIds` — engine is now the authority on which characters have usable actions, replacing the Zustand client-side workaround. `use-card-action` action gains optional `targetCharacterIds`; `applyUseCardAction` threads them into `ctx.characterTargets` so targeted effects (`dealDamage`, `addShields`, etc.) resolve against a chosen character. 8 new tests; 193 engine tests green; workspace typecheck clean. (`0b3fbb2`)
- **2026-05-15 — API-1 — Apply first DB migration against real Postgres.** Migration `0000_deep_stellaris.sql` applied cleanly against Postgres 16. All 7 tables and 5 enums confirmed via psql. Fixed `migrate.ts` to use the same local-dev default as `drizzle.config.ts` (no longer errors when `DATABASE_URL` is unset). Fixed README `docker compose up -d` → `docker compose -f infra/docker-compose.yml up -d`. Typecheck clean. (`dde7003`)
- **2026-05-15 — ENGINE-S1 — Support card state + Stability system.** `SupportState` type with stability/shields/exhausted/dice fields. Playing a support routes to `player.supports` (not discard); activation exhausts and rolls dice into pool (with `ownerInstanceId`); Disrupt/Discard dice reduce stability via `targetSupportId` on resolve-dice (shields-first, `support.discarded` at 0); upkeep readies exhausted supports; `activatableSupportIds` in `LegalActions`; `cardTypes`/`cardStability`/`cardDieFaces` maps on `GameState`; `stability` field in protocol; `SUP_001 Scout Walker` in seed data. 10 new tests; 185 engine tests green; workspace typecheck clean. (`77b8e82`)
- **2026-05-15 — ENGINE-6b — Event-owned dice + cross-card die roll mechanic.** `rollEventDie` rolls the event card's own dieFaces into the pool as a transient die; `rollCardDie` rolls any referenced catalog card's die by ID. `CatalogDieEntry` interface threaded through `applyPlayCard` → `applyAction` via `ApplyOptions`. Transient die cleanup on resolve-dice confirmed. Seed cards EVT_056 (Wild Strike) and EVT_057 (Call the Hound) added. `AbilityBuilder.tsx` forms added for both ops. 4 new tests; 175 engine tests green; workspace typecheck clean. (`04fb024`)
- **2026-05-15 — ENGINE-8 — Multi-target resolve-dice action.** `resolve-dice` action gains `targets: readonly { dieInstanceIds; targetCharacterId? }[]`; resolution loop applies per-group damage/shields; backward-compat flat shape normalised in apply-action.ts; 3 new tests (2-melee split, shield split, legacy compat); all existing tests migrated to new shape; 171 engine tests green, typecheck clean. (`8a0c00e`)
- **2026-05-15 — SERVER-1 — Reconnect window.** 60-second away timer starts on disconnect when game is in-progress; clears on `lobby.rejoin`. Timer expiry applies a `concede` on behalf of the disconnected player and broadcasts `game.events` + `game.state` + `lobby.state` to the room. Client-side rejoin was already fully wired (`SocketBridge` → `lobby.rejoin` on reconnect, `lobbyCache` for roomId persistence). Game-server typecheck clean; 168 engine tests green. (`5fae253`)
- **2026-05-16 — WEB-22 — Adaptive zone sizing.** `OpponentZone` and `PlayerZone` containers replace `flex-1` with `flexGrow: Math.max(1, characterOrder.length)` (inline style + `shrink basis-0` Tailwind classes). Zones proportionally share vertical space based on live card count; minimum of 1 prevents collapse on empty zones. WEB-21 Done hash backfilled to `224105e`. Typecheck clean. (`eb2fb7f`)
- **2026-05-16 — Activity log: batch architecture.** Replaced flat `recentEvents: EngineEvent[]` accumulator + peek-ahead index logic with `recentBatches: (EngineEvent[])[]` — one entry per `game.events` socket message (= one player action). `buildLogEntries` now processes each batch with `find`/`filter` by event type: no index math, no boundary detection, no scanning. Adds `support.activated`, `card.action-used`, `"— defeated!"` suffix on lethal hits, and multi-target card damage. (`ee439b2`)
- **2026-05-16 — Engine bug fix: `newGameFromDecks` missing `cardAbilities`.** `newGameFromDecks` built every card map (`cardCosts`, `cardTypes`, `cardMeta`, etc.) but never populated `cardAbilities`. Every production game started with an empty abilities map, so playing any event card, character power action, or card action had zero effect. Fixed by populating `cardAbilities` for both the character loop and the deck-card loop. Also fixed 40 seed card JSON files where ability text and effect ops were out of sync; added stale-object-storage detection in `corpus.ts` so updated disk files are picked up on redeploy. (`721820a`)
- **2026-05-16 — WEB-21 — Live opponent action preview.** `game.preview` socket event (debounced 50 ms) broadcasts `ActiveFlow` to opponent on every change while active. Game-server relays fire-and-forget. `opponentPreview` in Zustand; SocketBridge sets/clears it. `BattlefieldRow` renders: green selected / dimmed spent dice on opponent zone (resolve), amber dice on reroll pick, faint sky ring on opponent char being activated, pending counter badges on any targeted character (both zones). `DiceStack` + `DicePool3D` accept preview die-ID props. `CharacterCard` gains `previewActivate`. Typecheck + 175 engine tests green. (`224105e`)
- **2026-05-15 — WEB-19 — Multi-target damage and shield resolution UI.** `ActiveFlow.resolve` gains `pendingTargets` (committed die groups) replacing `targetCharacterId`. Resolution loop: select dice → tap character to commit group → dice dim as spent → pending counter badge (−N red / +N blue) on target character. Tapping an already-assigned character replaces its group. Commit enabled when `pendingTargets.length > 0 && selectedDieIds.length === 0`. Dispatches `resolve-dice` with `targets` array. DicePool3D and DiceStack both updated. Resource/disrupt unchanged single-group path. Typecheck + 175 engine tests green. (`30e02ca`)
- **2026-05-15 — WEB-7 — Human-readable activity log.** (`b508409`) Replaced raw JSON event dump with a formatted collapsible activity log in BattleZone. `buildLogEntries` maps all engine events to plain-English strings with bold player/character names and color-coded die chips (`DieChip`). `dice.resolved` is merged with follow-on `damage.dealt` / `shields.placed` / `resources.gained` / `resources.lost` into single entries. `round.begin` renders as a centered divider. Automatic passes, trigger lifecycle, and upkeep noise are suppressed. Log is collapsed by default via `<details>`, scrollable to 30 entries, `aria-live` for screen readers. Typecheck + 168 engine tests green. (`b508409`)
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
