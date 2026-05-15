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

Cards are coded by area: `ENGINE-N` (game-engine), `WEB-N` (apps/web), `SERVER-N` (apps/game-server), `API-N` (apps/api + packages/db), `ADMIN-N` (admin tooling spanning game-server + web), `OPS-N` (infra, CI, deploy).

### In progress
- _(none — claim a card from Up next.)_

### Up next — task cards

---
> **WEB-11 through WEB-17 are complete** — see Done section. WEB-4, WEB-5, and WEB-6 are superseded and should be skipped.
---

#### WEB-18 — Card ability badges on in-play cards
**Why now.** Characters and supports with `Action` abilities need a visible badge on their card. This is the last piece of the core turn interaction surface.

**Scope.**
- **Badge.** For each in-play character or support whose catalog entry has at least one ability with `kind: 'action'` or `kind: 'powerAction'`, render a circular badge (40×40pt, matching the existing upgrade badge size) on the bottom edge of their card. Use the card's `badgeArtUrl` from the catalog if set; otherwise use a colored circle (card's type color).
- **Placement.** Same visual layer as upgrade badges but on the opposite corner (bottom-left vs bottom-right), or below the upgrade badge row if needed to avoid overlap.
- **Green highlight.** When it's your turn and action phase and the ability is usable (not a power action already used, card is ready for actions requiring exhaust), the badge gets a green ring.
- **Tap.** Tapping a green badge sets `activeFlow = { kind: 'cardAction', cardId, abilityIndex }` and clears all other highlights. Commit = "Use ability" (generic for now — refine once card action UX is designed further). Dispatch `use-card-action` on commit.
- **Power action tracking.** The engine already tracks used power actions. Read from game state to grey out used power action badges (no green highlight, not tappable).
- Update `AbilityBuilder.tsx` if any new badge-related field is introduced to the catalog schema.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (CharacterCard, BattleZone, activeFlow)
- `packages/protocol/src/catalog.ts` (Card, Ability — action/powerAction kinds, badgeArtUrl)
- `apps/web/src/routes/admin/AbilityBuilder.tsx` (sync if schema changes)
- `packages/game-engine/src/legal-actions.ts` (use-card-action legality)

**Out of scope.** Rendering the full card action effect chain in the UI (depends on which ops those abilities use). Support card activation badge (supports activate via the main card tap, not the badge — badge is for explicit Action abilities only).

**Depends on.** WEB-17.

**Done when.** Typecheck clean. Manual smoke: a character with an Action ability shows a circle badge; badge highlights green on your turn; tapping it enters the flow; Commit dispatches use-card-action; power action badge greys out after use and stays grey until next round.

---

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

---
> **3D dice — WEB-3D-1 through WEB-3D-3.**
> Three connected cards delivering the full 3D dice experience: persistent Three.js dice on the board, the physics-based Dice Results Cam via dice-box, and the face-picker UX for focus/event effects. Pick them up in order.
---

#### WEB-3D-1 — Three.js board dice layer
**Why now.** Flat 2D die tiles don't communicate the physical feel of the game. Dice sitting in the pool should look like real dice — 3D rounded cubes with the correct face showing up, proper lighting, subtle perspective angle as if looking down at a table.

**Scope.**
- Install `three` and `@react-three/fiber` + `@react-three/drei`. Lazy-load — only bundled when the game route is visited.
- Replace the flat `DiceStack` tile rendering with a `<DicePool3D>` component: a `<Canvas>` element (react-three-fiber) that renders each die in the pool as a `RoundedBoxGeometry` (from drei) with chamfered edges matching physical dice.
- **At rest:** die is static, correct face showing up, ambient + point light from above-right so the top face is brightest, side faces mid-tone. Subtle fixed tilt (~15° rotateX, ~10° rotateY) so the 3D shape reads clearly — like looking down at a die on a table.
- **Pre-roll state:** when `activeFlow = { kind: 'activate', charId }` and these dice belong to that character — begin the Mario Party tumble. Rapid face-cycling, tumbling on all axes. This runs on the board in place, building anticipation before the player commits to Roll Dice.
- Die faces show value + symbol label. Use card color (`getDieBaseClass` logic) for face color.
- Touch targets: the Canvas is sized to the same footprint as the current tile area. Tap events map through to the existing `handleTap` logic.
- Keep the existing flat `DiceStack` component as a fallback (`<Suspense fallback={<DiceStack ... />}>`).

**Context to load.**
- `apps/web/src/routes/Game.tsx` (DiceStack, BattlefieldRow, activeFlow wiring)
- `packages/db/seed/cards.json` (card color field for die coloring)

**Out of scope.** Roll animation / Results Cam (WEB-3D-2). Face picker (WEB-3D-3). Dice in the opponent pool are read-only — same 3D rendering, no interaction.

**Done when.** Typecheck clean. Manual smoke: dice in pool appear as small 3D rounded cubes with correct face up; activating a character makes their unrolled dice tumble; non-activating dice remain static; fallback flat tiles show during canvas load.

---

#### WEB-3D-2 — Dice Results Cam (dice-box physics overlay)
**Why now.** Rolling dice is the central action of the game. It should feel like a real roll — tactile, unpredictable, satisfying. The Results Cam is a full-screen physics simulation that plays when the player commits Roll Dice, then cuts back to the board with dice already in position.

**Scope.**
- Install `@3d-dice/dice-box`. Lazy-load — only initialized when the first roll happens (background fetch starts at game-start so it's ready by the time the first activation occurs).
- **Trigger:** when the player commits Roll Dice (`activeFlow = { kind: 'activate' }` + Commit), before dispatching the `activate` action:
  1. Start the Results Cam overlay (full-screen, dark background, centered canvas).
  2. Pass the number and type of dice to roll. Pass the server-determined result values so dice-box guides the physics to land on the correct faces.
  3. The `activate` action dispatches to the server simultaneously — no waiting.
- **Physics play:** dice-box runs the Ammo.js simulation. Dice tumble, bounce off each other and the surface, gradually settle.
- **Results display:** once dice are still, briefly show the result (symbol + value) for each die on-screen.
- **Dismiss:** player taps / swipes up to dismiss. The overlay fades/sweeps away. Hard cut back to the board — the Three.js board dice (WEB-3D-1) are already showing the correct faces since the game state has updated.
- Server-determined result values: read from the `character.activated` engine event payload (`rolledDice`) which arrives via socket while the overlay is playing. Hold the overlay open until the event arrives if needed.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (activation flow, send dispatch, socket event handling)
- `apps/web/src/store.ts` (activeFlow, appendEvents)
- `packages/game-engine/src/events.ts` (`character.activated` event payload shape)

**Out of scope.** Per-symbol particle effects on landing (post-launch polish). Opponent roll cam (show opponent's rolls too — backlog). Sound effects (separate card).

**Depends on.** WEB-3D-1 (board dice layer must exist for the cut-back to work).

**Done when.** Typecheck clean. Manual smoke: tap a ready character, commit Roll Dice — full-screen dice cam appears, dice tumble with real physics, settle on the server-determined faces, dismiss → board shows correct dice in pool. Bundle: dice-box WASM only loads after game start; measured load time on throttled connection is acceptable.

---

#### WEB-3D-3 — Die face picker (focus + event card effects)
**Why now.** Focus dice and many event cards let the player choose a new face for one or more dice in their pool. This needs clear UX: see all options, make a strategic choice, watch the die update.

**Scope.**
- **Trigger:** when resolving focus dice (or an event card effect that requires face selection), enter a `{ kind: 'face-pick', targetDieIds: string[], budget: number, chosen: Record<string, DieFace> }` flow.
- **Panel:** tapping a die in face-pick mode opens a compact panel anchored to that die showing all 6 of its faces as small tiles (symbol + value). The current face is highlighted. Tapping any face selects it — the 3D die in WEB-3D-1 spins to show that face. The panel closes.
- **Budget:** a visible counter shows "X dice remaining to focus." Once all budget is spent (or player skips remaining), Commit = "End focus" becomes active.
- **Focus chaining:** if a newly chosen face is also a focus face, that die joins `targetDieIds` and adds to the budget. Keep a running total visible.
- **Direct manipulation (secondary):** the player can also swipe/drag on the 3D die to rotate it and select a face that way. Tap to confirm. This is a power-user shortcut; the panel is always the primary path.
- Dispatch the face assignments via `resolve-dice` with the focus dice and chosen face indices once "End focus" is committed.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (DiceStack / DicePool3D, activeFlow, ActionBar)
- `apps/web/src/store.ts` (ActiveFlow — add face-pick kind)
- `packages/game-engine/src/actions/resolve-dice.ts` (focus resolution path — verify face-index API)

**Depends on.** WEB-3D-1 (3D die must exist to spin to chosen face).

**Done when.** Typecheck clean. Manual smoke: resolve a focus die → budget counter appears → tap a die → panel shows all 6 faces → tap a face → 3D die spins to it → budget decrements → End focus commits correctly. Focus chaining: choosing a focus face adds to budget.

---

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

---
> **WEB-4, WEB-5, and WEB-6 are superseded by the mobile-first redesign (WEB-11–18).** Skip these unless the redesign is reverted.
---

#### WEB-4 — Hand panel: real card display, expanded view, play-card integration
**Why now.** Cards in hand currently render as raw instance ID suffixes (e.g. `deck.0`). Players can't make meaningful decisions without seeing card names, costs, types, and ability text. This blocks real playtesting.

**Scope.**
- **Engine (small change):** Add `cardCatalogIds: Readonly<Record<string, string>>` to `GameState` in `packages/game-engine/src/state/types.ts`. Populate it in `newGameFromDecks` (`packages/game-engine/src/state/new-game.ts`) — maps each assigned instance ID to the catalog card ID it came from. This lets the web client look up catalog data given an instance ID.
- **Catalog fetch:** On game start, `Game.tsx` fetches the card catalog from the game-server (`GET /admin/cards`) once and stores it in component state. No new endpoints needed — the admin endpoint already exists.
- **Hand strip:** Replace the existing collapsed hand count in `PlayerSummaries` with a visible horizontal strip at the bottom of the board showing your hand (opponent's hand remains hidden as a count). Each card tile shows: name, cost badge, card type. Cards that are affordable and legal to play are highlighted with an emerald border.
- **Expanded hand view:** Tapping any card in the strip (or clicking the existing "Play card" or "Discard to reroll" action buttons) opens a full-screen overlay showing all cards in hand as a scrollable row of larger tiles.
- **Card focus / inspect:** Long pressing a card (500 ms `touchstart` timer; right-click on desktop) in either the strip or expanded view opens a focused single-card view showing: name, type, cost, full ability text, and a compact list of die face specs (symbol + value for each face). A "Play" button appears on the focused card if it's legal to play and it's your turn. Tapping elsewhere or pressing Escape closes.
- **Play-card workflow:** The existing `play-card` overlay (`ActionPanel`) is replaced — clicking "Play card" now opens the expanded hand view. Selecting a card in that view that is affordable dispatches `play-card` and closes. Selecting one that isn't affordable does nothing (it stays dimmed).
- **Reroll workflow:** Same — "Discard to reroll" opens the expanded hand view; all cards are selectable (cost irrelevant for discarding).

**Context to load.**
- `apps/web/src/routes/Game.tsx` (full file — ActionPanel, DicePoolStrip, PlayerSummaries)
- `packages/game-engine/src/state/types.ts` (`GameState`)
- `packages/game-engine/src/state/new-game.ts` (`newGameFromDecks`)
- `packages/protocol/src/events.ts` (`GameState` re-export shape)
- `apps/web/src/routes/admin/api.ts` (catalog fetch pattern to reuse)
- `packages/db/seed/cards.json` (catalog shape — understand the `dieFaces` and `abilities` fields)

**Out of scope.** Character/support cards in play (WEB-5). Die face inspector on dice tiles (WEB-6). Opponent's hand contents (always hidden). Support / event / plot card play (no play-card action for those card types yet).

**Done when.** Typecheck clean. Manual smoke: hand strip shows real card names and costs; expanded view opens from strip tap or action button; long press shows full ability text; play-card and reroll workflows use the new hand view; eligible cards are visually highlighted.

---

#### WEB-5 — Characters and supports in play: real names, ability text, die specs
**Why now.** Characters in play show as `deck.0`, `deck.1` etc. Players can't tell which character is which, can't read abilities, and can't see die face options without memorizing the catalog.

**Scope.**
- In `PlayerSummaries` (and the activate / target overlays in `ActionPanel`), replace the `cid.replace(/^.*\./, '')` placeholder with the character's real name looked up via `game.cardCatalogIds[cid]` → catalog.
- Each character card in play shows: name, health / damage bar, shield pips (up to 3), exhausted badge, elite badge if applicable.
- Ability text: if the catalog entry has `abilities`, render each ability as a compact line below the stats (kind label + first-line text, truncated with a "…" expand on tap if long).
- Die specs: render the character's die face list as a row of compact pips below the ability text (6 faces, symbol initial + value, greyed if not the current face).
- Support cards: same treatment — name + ability text. No die faces (supports don't have dice).
- Reuse the catalog already fetched in WEB-4 (pass it down as a prop or read from the same component state).

**Context to load.**
- `apps/web/src/routes/Game.tsx` (PlayerSummaries, TargetButton for activate/target overlays)
- `packages/db/seed/cards.json` (character and support catalog shape)

**Out of scope.** Battlefield and plot cards (no activate/target action applies to them yet). Animated ability triggers. Inline die-face inspector (WEB-6).

**Depends on.** WEB-4 (catalog fetch + `cardCatalogIds` in game state).

**Done when.** Typecheck clean. Manual smoke: characters in play show real names, health, shields, exhausted state, and any ability text; activate overlay uses real names; die face row visible on character tiles.

---

#### WEB-6 — Dice: tap-to-resolve shortcut and long-press die face inspector
**Why now.** Entering resolve mode currently requires tapping "Resolve dice" in the action panel, then tapping dice. Tapping a die directly is the natural gesture — it's how the physical game works. The long-press inspector addresses the parallel need to understand what a die can roll before committing to activating that character.

**Scope.**
- **Tap-to-resolve shortcut:** In `DicePoolStrip`, when it's your turn and `selectionMode` is `null`, tapping a die that passes `canSelectDie` calls `enterResolveMode()` and immediately toggles that die as selected — one gesture instead of two. The "Resolve dice" button in `ActionPanel` remains for discoverability but is now a secondary path.
- **Long-press to inspect die:** 500 ms `touchstart` timer on each die tile (cancel on `touchmove` or `touchend`; `contextmenu` / right-click on desktop). Opens an `ActionOverlay` showing all 6 faces of that die type: look up the character via `game.cardCatalogIds`, find the die spec in the fetched catalog, render each face as symbol + value + cost + modifier flag. Closes on backdrop tap or Escape.
- Long press works on both your dice and the opponent's dice (reading-only, no action).

**Context to load.**
- `apps/web/src/routes/Game.tsx` (DicePoolStrip, ActionPanel, canSelectDie, enterResolveMode)
- `apps/web/src/store.ts` (enterResolveMode, selectionMode shape)
- `packages/db/seed/cards.json` (die face spec shape)

**Out of scope.** Reroll-mode tap shortcut (reroll requires choosing a discard card first — that flow stays button-driven). Transient dice visual distinction (ENGINE-6b). Animated dice roll.

**Depends on.** WEB-4 (catalog fetch + `cardCatalogIds`).

**Done when.** Typecheck clean. Manual smoke: tapping a die on your turn immediately enters resolve mode with that die selected; long pressing any die shows all 6 faces; cancel returns to board without side effects.

---

#### WEB-8 — Drag-to-play (Pass 1: gesture + no targeting)
**Why now.** Tapping a card to open an overlay then tapping "Play" is two gestures too many. Every touch-first card game uses drag-to-play: press a card, drag it out of your hand, release to play. Pass 1 lands the gesture and the visual artifact without requiring engine-level targeting — the card plays identically to tapping "Play this card" in the overlay.

**Scope.**
- **Drag initiation:** `onTouchStart` (and `onMouseDown` for desktop) on each `HandCardTile` starts a drag after a 120 ms delay or 8 px of movement — whichever comes first. Short taps still open the expanded overlay (existing behaviour). The delay prevents accidental drags while scrolling.
- **Drag artifact:** a `position: fixed` clone of the card tile that follows `touch.clientX / touch.clientY`. Rendered in a portal at `z-60` so it floats above everything. Scale up slightly (1.1×) to lift it above the hand.
- **Hit-testing:** `touchmove` fires on the original element, so use `document.elementFromPoint(touch.clientX, touch.clientY)` each frame to find what's under the finger. Elements that accept a drop carry a `data-droptarget="play"` attribute (added to the game board area). Highlight that zone with a pulsing emerald ring while the finger is over it.
- **Drop:** `touchend` / `mouseup` — if the finger is over a valid drop target and the card is affordable, dispatch `play-card` exactly as the overlay does. If the drop is invalid (wrong zone, unaffordable) or the drag is cancelled (finger lifted outside), animate the clone back to its origin and do nothing.
- **Drop target for Pass 1:** a single `data-droptarget="play"` zone covering the main game board area above the hand strip. Upgrade and event cards both target here for now — they play cost-only regardless of card type. Character cards in play are NOT yet drop targets (that's Pass 2).
- **Cancel:** Escape key or lifting finger outside any drop target cancels the drag.
- Mouse and touch both work; no pointer-events API (too limited on iOS Safari).

**Context to load.**
- `apps/web/src/routes/Game.tsx` (HandCardTile, HandStrip, Game layout, send callback)
- `apps/web/src/store.ts` (selectionMode — drag should not start if selectionMode is active)

**Out of scope.** Dragging onto specific character targets (Pass 2). SVG arrow from card to finger (nice-to-have, defer). Reroll-discard via drag. Drag on opponent's cards.

**Done when.** Typecheck clean. Manual smoke on mobile: press and drag a card out of the hand strip — clone follows finger, game board lights up as a drop zone, release plays the card. Desktop: same with mouse. Short tap still opens the expanded card view.

---

#### WEB-10 — Battle zone: four-column board layout with CCG card ratio
**Why now.** The current board shows characters and dice as plain stat blocks. The target layout mirrors physical card game tables: player cards in play on the far left, player dice pool in the center-left (grouped and vertically aligned with the card that owns them), opponent dice in the center-right, opponent cards on the far right. Characters are rendered as CCG-ratio cards (63×88 mm, ~5:7) with art gradient, remaining health badge, exhausted = rotated 90°, and upgrade circular badges.

**Scope.**

*Engine (small):*
- Add `ownerInstanceId: string` to `DieInPool` in `packages/game-engine/src/state/types.ts`. Populated in `actions/activate.ts` when dice are rolled into the pool — set to the activating character's instance id. This replaces string-parsing of `instanceId` in the UI and makes ownership explicit.
- Mirror in `@prophecy/protocol`.

*Web:*
- New `BattleZone` component that replaces `PlayerSummaries` and `DicePoolStrip`. It takes up all available vertical space between the header and the hand strip.
- **Four-column grid:** `[player cards] [player dice] [opponent dice] [opponent cards]`. On a 360px screen the target split is roughly 90px card | 70px dice | 70px dice | 90px card with 8px total gutters.
- **Character card in play:** portrait orientation, CCG ratio (width × 1.397 = height), art gradient (same system as hand tiles), card name, remaining health badge (e.g. `♥ 7`). Exhausted = `transform: rotate(90deg)` on the card element; wrapper keeps the rotated bounding box so layout doesn't collapse (width and height swap). Clicking opens the expanded card view (reuse `HandOverlay` or a new `CardDetailOverlay`) showing max health, full ability text, subtypes.
- **Upgrade badges:** circular badge (40×40 px) overlaid at the bottom edge of the owning card's art. Multiple badges stack horizontally. Each badge shows the upgrade's type-color gradient. Tapping opens the upgrade's card detail overlay.
- **Dice:** each character's dice are shown as a vertical stack of die tiles in the adjacent dice column, aligned (top-edge matched) with the character's card row. Die tiles use the existing 48×48 design. Dice are interactive (tap to enter resolve mode) when it is your turn and `selectionMode === null` — reuse the `enterResolveMode` shortcut from WEB-6. Opponent dice are read-only.
- **Row alignment:** since the number of characters per side may differ, each side's rows are independent stacks. No forced row-pairing across sides.
- **Up to 8 character rows (4 per side)** must be comfortable at 360px tall (estimate ~120px per row including gap; 4 rows = ~480px, so the zone may need to scroll vertically if both sides have 4 characters).
- Remove `DicePoolStrip` and `PlayerSummaries` from `Game.tsx` once `BattleZone` is in.
- The action panel stays for now (Activate, Resolve, Play card, etc.) — removal is a follow-on card once the direct-interaction shortcuts fully cover it.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (full file — especially PlayerSummaries, DicePoolStrip, Game layout, selectionMode wiring)
- `packages/game-engine/src/state/types.ts` (DieInPool, CharacterState, PlayerState)
- `packages/game-engine/src/actions/activate.ts` (where dice enter the pool — add ownerInstanceId here)
- `apps/web/src/store.ts` (enterResolveMode)
- `packages/db/seed/cards.json` (catalog shape — character die faces for the upgrade badge lookup)

**Out of scope.** Support cards in play (deferred — see ENGINE-S1 / WEB-S1 below). Animated exhausted rotation. Drag-to-activate (that's WEB-9). Real card art. Plot and battlefield zone rendering.

**Done when.** Typecheck clean. Engine tests still green. Manual smoke: start a game, characters appear as CCG-ratio cards in the correct columns; dice appear next to their owning character; activating a character exhausts (rotates) the card and dice appear in pool; the exhausted card shows rotated while dice stay upright; clicking a character opens the detail overlay; upgrade badge appears and tapping it opens the upgrade card.

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

### Backlog — supports & stability (deferred until after WEB-10)

These cards are blocked on WEB-10 landing first and the engine support work being scoped.

#### ENGINE-S1 — Support card state + Stability mechanic
Add `SupportState` to `PlayerState` (mirrors `CharacterState` but with `stability`/`maxStability` instead of `health`/`damage`). Stability can only be reduced by Disrupt or Discard dice sides. When Stability reaches 0 the support is discarded and its dice (including upgrade dice) are removed from the pool. Supports can be activated (exhaust + roll their die if they have one). `DieInPool.ownerInstanceId` must also cover support instance ids. Update `getLegalActions`, `applyResolveDice`, `applyActivate`, `newGameFromDecks`. Full rules in `docs/rules-reference.md § Stability`.

#### WEB-S1 — Support cards in the battle zone
Render support cards in play inside `BattleZone` below their owning player's characters (or in a separate support row). Supports have a Stability badge instead of a health badge. Supports can be activated (tap → activate action, same flow as characters). Upgrade badges appear on supports the same way as on characters. Clicking opens detail overlay with Stability, ability text, subtypes.

### Backlog — client (not yet sized)
- Phone-portrait layout pass (360×640): opponent strip, table, hand, dice tray.
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
- **2026-05-14 — WEB-17 — Discard-to-reroll + claim (already in WEB-15).** Reroll flow: pick-card (amber hand), pick-dice (amber tiles), Undo walks back steps. Focus deferred pending engine support. (`3f8f48c`)
- **2026-05-14 — WEB-16 — Dice resolution flows.** Tap-to-resolve with symbol locking; red/blue targeting rings on chars; resolve-dice dispatch with target; Commit disabled until target chosen for damage/shields. (`8cdb871`)
- **2026-05-14 — WEB-15 — Activation flow.** Roll Dice dispatches activate action; claim-battlefield wired; pendingExhaust tilt on card while flow is active. (`c15773c`)
- **2026-05-14 — WEB-14 — Green highlight system + turn state machine.** ActiveFlow in store; green rings on activatable chars, resolvable dice, claimable battlefield; Undo button; Commit label changes by flow; clears on turn rotation. (`5b5d0e0`)
- **2026-05-14 — WEB-13 — Avatar bar.** Resources, deck, discard, battlefield card name + controller arrow, opponent hand/deck/resources. Typecheck clean. (`21eee6d`)
- **2026-05-14 — WEB-12 — Dynamic battlefield columns.** Character cards and dice render in OpponentZone and PlayerZone. ResizeObserver computes max-per-row from container width (2 per row on iPhone). Dice, CharStatsRow, and CharacterCard all wired. Typecheck clean. (`002104c`)
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