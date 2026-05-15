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
> **Mobile-first redesign — WEB-11 through WEB-19.**
> These cards collectively replace the current side-by-side BattleZone with a full mobile-first layout and a complete turn interaction system. Pick them up in order; each depends on the previous. WEB-4, WEB-5, and WEB-6 are superseded by this series and should be skipped.
---

#### WEB-11 — Mobile-first layout shell
**Why now.** The current layout is side-by-side (player left / opponent right), designed for desktop. The new design is top-to-bottom, built for 360pt phone screens first. This card lays the structural skeleton all subsequent cards build on.

**Scope.**
- Replace the `<section>` in `BattleZone` with a new top-to-bottom flex-col shell. Seven named regions stacked vertically, each a clearly labelled sub-component placeholder (real content lands in later cards):
  1. `AvatarBar` — player avatar + resources + deck count (left) | battlefield card (center, tilts toward controller) | opponent avatar + hand count + deck count (right). Use the existing `opponentName`, resource count, and deck count already on game state. Battlefield card renders the card name and a subtle tilt indicator. ⚡ action button lives here for now, right of battlefield card.
  2. `OpponentZone` — placeholder `<div>` labelled "Opponent cards".
  3. `PlayerZone` — placeholder `<div>` labelled "Your cards".
  4. `HandStrip` — compact always-visible strip. Each card in hand shows: small art swatch (color gradient by type), card name truncated, cost badge. Tapping a card toggles an inline expansion showing the full ability text below the strip row. No overlay — it expands in place and pushes content below it down. Eligible-to-play cards (cost ≤ resources, your turn, action phase) get a green border.
  5. `ActionBar` — two-button bar pinned to the bottom. Left: Undo button (disabled/hidden when no reversible action is pending). Right: Commit button (label = "Pass" by default). "Pass" shows a confirmation dialog ("Pass your turn?") before dispatching. No other logic yet — those come in WEB-14/15.
- Remove the existing `max-w-sm` / `max-w-2xl` width caps; let the layout use full viewport width.
- Remove the existing `HandStrip` fixed-position footer and the `showHandStrip` spacer div — the new HandStrip is part of the natural flow.
- Remove the `SelectionActionBar` for now (it comes back in WEB-14 as the ActionBar).
- Keep `BattleZone` as the component name; just gut and replace its internals.
- The existing `DiceStack`, `CharacterCard`, `CharStatsRow`, `distributeToRows` helpers remain in the file — they'll be used by WEB-12. Don't delete them.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (full file — BattleZone, HandStrip, SelectionActionBar, Game layout)
- `packages/game-engine/src/state/types.ts` (GameState, PlayerState — resource count, hand, deck, battlefield)
- `packages/protocol/src/catalog.ts` (Card shape — for battlefield card name lookup)

**Out of scope.** Real character/dice rendering (WEB-12). Highlight system (WEB-14). Activation/resolution flows (WEB-15–18). Avatar images.

**Done when.** Typecheck clean. Manual smoke: on a 360px-wide viewport, all seven regions are visible and stacked top-to-bottom without overflow; hand strip shows real card names and costs; tapping a hand card expands it in place to show ability text; Pass button shows a confirmation dialog; Undo is disabled.

---

#### WEB-12 — Dynamic battlefield columns
**Why now.** Characters and their dice need to display in the OpponentZone and PlayerZone introduced by WEB-11. The column width adapts to each character's dice count so 44pt dice tiles always fit.

**Scope.**
- **Column width formula.** Each character (and support) gets a column. Column width = `max(3, diceCount) × 44 + gaps`, capped at the viewport width divided by 1 (minimum — a character always gets at least one column). In practice 3 dice = ~140pt column; characters with 0–1 dice (most supports) get a 1-die minimum column (~44pt + padding).
- **Row packing.** Pack characters left-to-right into a row until adding the next character's column would exceed the available width. Start a new row. Distribute remaining characters across rows with more in front rows (existing `distributeToRows` logic, but now column-width-aware rather than count-capped).
- **Per-row layout.** Each row is a horizontal flex container. Each character cell is a `flex-col` with `width` set to the computed column width (not flex-1). Within a cell:
  - *Player cell* (PlayerZone): dice band on top (44pt tiles, `flex-row flex-wrap`), card below, HP/shield row below that.
  - *Opponent cell* (OpponentZone): HP/shield row on top, card below, dice band on bottom.
- **Dice tiles.** 44×44pt touch targets. Each tile shows the symbol label and value. Opponent dice are read-only (no tap handler). Use existing die tile markup but enforce 44pt min-width and min-height.
- **Support cards.** Follow character cards in the same row-packing system. Supports typically have 0–1 dice; give them a 1-die-wide column (no special treatment needed — the formula handles it).
- **Front row placement.** For PlayerZone: front row (most characters) is the topmost row in the zone (closest to opponent). For OpponentZone: front row is the bottommost row (closest to player). Use `justify-end` on the OpponentZone flex-col so rows stack from the bottom up.
- Wire `myRows` / `oppRows` computed from the new packing logic into `PlayerZone` and `OpponentZone`.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (BattleZone, CharacterCard, DiceStack, CharStatsRow, distributeToRows — all already in file)
- `packages/game-engine/src/state/types.ts` (CharacterState, PlayerState.characterOrder, diceInPool)

**Out of scope.** Support card state (ENGINE-S1). Green highlights (WEB-14). Interactive dice tap (WEB-15). Card ability badges (WEB-19).

**Depends on.** WEB-11.

**Done when.** Typecheck clean. Manual smoke: start a game with 2–3 characters per side; columns are wide enough that dice tiles are ≥44pt; player dice appear above their card, opponent dice appear below; support cards (if any in seed data) appear after character cards; front rows sit closest to the center of the board.

---

#### WEB-13 — Avatar bar: resources, deck count, battlefield card
**Why now.** The AvatarBar placeholder from WEB-11 needs real data. Players need to see their resources, deck size, and who controls the battlefield at a glance.

**Scope.**
- **Player side (left).** Display name (truncated), resource count (coin icon + number), deck count (card stack icon + number), discard count (small). Use `myPlayer.resources`, `myPlayer.deck.length`, `myPlayer.discard.length` from game state.
- **Opponent side (right).** Display name, hand count (hidden card backs icon + number), deck count, resource count. Use `oppPlayer.hand.length`, `oppPlayer.deck.length`, `oppPlayer.resources`.
- **Battlefield card (center).** Look up the battlefield card name from the catalog (already fetched — use `game.cardCatalogIds` + `catalogById`). Show the name and a small indicator of who controls it (dot or arrow tilted toward the controlling player's side). No art — just text and indicator for now.
- **⚡ action button.** Keep it in the AvatarBar for now, to the right of the battlefield card. Opens the existing `ActionPanel` overlay (unchanged). This button is removed in a later card once all actions are surfaced directly on the board.
- Remove the existing header `<header>` from `Game.tsx` (it currently shows names and the ⚡ button) — all that info is now in AvatarBar.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (Game component header, AvatarBar placeholder from WEB-11, ActionPanel)
- `packages/game-engine/src/state/types.ts` (PlayerState — resources, deck, hand, discard)

**Out of scope.** Avatar images. Battlefield claim ability text. Opponent resource hiding (resources are open information per rules).

**Depends on.** WEB-11.

**Done when.** Typecheck clean. Manual smoke: AvatarBar shows correct resource counts, deck sizes, and hand count for both players; battlefield card name is visible; ⚡ button opens the action panel; old header is gone.

---

#### WEB-14 — Green highlight system + turn state machine
**Why now.** The board needs to communicate what's actionable. Everything eligible gets a green highlight; selecting one clears the others. The Commit button label and Undo state derive from this machine.

**Scope.**
- **Eligible action detection** (runs only on your turn, action phase, no active flow). Call `getLegalActions(game, playerId)` and map results to highlight targets:
  - `canActivate(cid)` → green ring on that character card.
  - `canResolve` (any dice in pool) → green ring on each resolvable die tile (non-blank, non-special, non-modifier-only).
  - `canPlayCard(iid)` → green border on that hand card (already handled by WEB-11 affordability check — unify here).
  - `canClaimBattlefield` → green ring on the battlefield card in AvatarBar.
  - Card action abilities (WEB-19, skip for now).
- **Single active flow.** Add a `activeFlow` field to app state (Zustand): `null | { kind: 'activate' | 'resolve' | 'play' | 'claim' | 'reroll', ... }`. When a player taps a green object, set `activeFlow` — all other green highlights immediately disappear (only the active flow's objects remain highlighted).
- **Commit button label** derived from `activeFlow`:
  - `null` → "Pass"
  - `'activate'` → "Roll Dice"
  - `'resolve'` → "Deal X damage" / "Gain X shields" / "Gain X resources" / "Disrupt X resources" / "Discard X cards" / "Focus X dice" (symbol-dependent, X = combined value of selected dice)
  - `'claim'` → "Claim"
  - `'reroll'` → "Reroll" (after dice selected) or "Discard card" (after card selected, before dice)
- **Undo.** When `activeFlow` is not null, show the Undo button. Clicking it resets `activeFlow` to null, restores any visual state (un-tilts a character if it was tilted client-side), and returns all highlights to the idle eligible set.
- **Pass confirmation.** Only shown when Commit is tapped and `activeFlow === null`. Existing confirm dialog from WEB-11 — keep as-is.
- Wire the new `activeFlow` state into `BattleZone`, `HandStrip`, and `ActionBar`.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (BattleZone, HandStrip, ActionBar from WEB-11/12)
- `apps/web/src/state/app.ts` (Zustand store — add `activeFlow`)
- `packages/game-engine/src/legal-actions.ts` (getLegalActions shape)

**Out of scope.** Actual dispatch of actions (WEB-15–18). Opponent-turn highlights. Card ability badges (WEB-19).

**Depends on.** WEB-12.

**Done when.** Typecheck clean. Manual smoke: on your turn, eligible characters glow green, eligible dice glow green, eligible hand cards have green borders, battlefield glows green if claimable; tapping one clears all others; Commit label updates; Undo appears; Undo resets the board to idle highlights.

---

#### WEB-15 — Activation flow + Roll Dice dispatch
**Why now.** The most common action in the game is activating a character and rolling its dice. This is the first complete action loop.

**Scope.**
- **Tap ready character (green).** Sets `activeFlow = { kind: 'activate', charId }`. The character card visually tilts (CSS `rotate(6deg)` — same exhausted transform, client-side only until committed). All other green highlights clear.
- **Tap it again.** If the tapped character is already the `activeFlow.charId`, reset `activeFlow` to null (same as Undo). Character un-tilts.
- **Undo.** Identical to tapping again — resets flow, un-tilts.
- **Commit ("Roll Dice").** Dispatch the `activate` action with `charId`. On success the server updates game state: the character exhausts server-side and dice enter the pool. The client-side tilt is replaced by the server-authoritative exhausted state. `activeFlow` resets to null. No confirmation dialog needed.
- **After activation: dice in pool.** Newly rolled dice appear in the character's dice band. They are immediately highlighted green (part of the idle eligible set — `canResolve` is now true). Player can start a resolve flow on their next tap or take another action if they have extra turns.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (CharacterCard, BattleZone, activeFlow wiring from WEB-14)
- `apps/web/src/state/app.ts` (activeFlow, send dispatch)
- `packages/game-engine/src/actions/activate.ts` (action shape)

**Out of scope.** Dice resolution (WEB-16). Support card activation (WEB-19). Animated dice roll.

**Depends on.** WEB-14.

**Done when.** Typecheck clean. Manual smoke: tap a ready character → it tilts, Commit = "Roll Dice"; tap again → un-tilts; tap Commit → dice appear in pool, character shows exhausted, flow resets.

---

#### WEB-16 — Dice resolution flows (damage, shields, resources, disrupt, discard)
**Why now.** Resolving dice is the core decision loop. This card covers all symbol types except focus and special.

**Scope.**
- **Tap a die (non-modifier, green).** Sets `activeFlow = { kind: 'resolve', selectedDieIds: [id], lockedSymbol }`. Other dice with the same symbol (non-modifier) remain green. Modifier dice of the same symbol become green (eligible to add). All other dice lose their green highlight.
- **Tap a modifier die (green after a non-modifier is selected).** Adds it to `selectedDieIds`. A modifier die cannot be the first selection.
- **Tap a selected die.** Removes it from `selectedDieIds`. If removing the last non-modifier die, also deselect all modifiers and check if any modifier-only selection remains — if so, clear it (modifiers can't stand alone).
- **Tap a die outside current symbol.** No-op (die is not highlighted, so tap is inert).
- **Target selection:**
  - *Melee / Ranged damage* — after at least one die selected, opponent's character cards highlight red. Must tap a target before Commit activates. Each die can target a different character (tap a die, tap a target, tap next die, tap next target — or tap all dice first, all damage goes to one target).
  - *Indirect damage* — no player-side targeting. Commit = "Deal X indirect damage". After commit, opponent sees a targeting prompt to distribute damage across their characters.
  - *Shields* — own character cards highlight blue. Tap to target. Commit = "Gain X shields".
  - *Resource / Disrupt / Discard* — no target needed. Commit activates immediately once dice selected.
- **Commit labels** (from WEB-14): "Deal X melee/ranged damage", "Deal X indirect damage", "Gain X shields", "Gain X resources", "Disrupt X resources", "Discard X cards". X = combined value of selected dice (sum of values, accounting for modifier addition).
- **Dispatch.** On Commit, send `resolve-dice` action with `dieInstanceIds` and `targetCharacterId` (if applicable). On success, dice leave the pool, effects apply, `activeFlow` resets.
- **Indirect damage opponent UX.** When an indirect damage resolution lands (engine emits the event), if the current player is the opponent and their characters need damage distributed: set a local state flag that shows a distribution overlay (tap characters to assign damage, total must equal the value). Simple integer input per character. Confirm closes the overlay. This is client-side only — the engine already handles the distribution; the UX just provides the `targetCharacterId` + amounts.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (DiceStack, BattleZone, activeFlow wiring)
- `apps/web/src/state/app.ts` (activeFlow shape — extend with targetMap)
- `packages/game-engine/src/actions/resolve-dice.ts` (action shape, symbol enum)
- `packages/game-engine/src/legal-actions.ts` (canSelectDie, canResolve)

**Out of scope.** Focus (WEB-17). Special (deferred). Animated damage numbers.

**Depends on.** WEB-15.

**Done when.** Typecheck clean. Manual smoke: tap a melee die → symbol locks, matching dice stay green, modifier of same symbol lights up; tap opponent character → red target; Commit = "Deal X melee damage"; resolves correctly. Repeat for shields (blue target), resource (no target), discard, disrupt. Indirect damage prompts opponent to distribute.

---

#### WEB-17 — Focus flow + claim battlefield + discard-to-reroll
**Why now.** These three action flows complete the core turn options. Each has a multi-step UX that needs its own slot.

**Scope.**
- **Focus flow.** Tap focus die(s) → Commit = "Focus X dice". On commit, enter focus mode: X dice in the pool become selectable (tap to cycle through their faces). Each die shows a face-picker (all 6 faces of that die, tap to choose). Once a player has changed at least one face, Commit changes to "End focus". Clicking End focus dispatches `resolve-dice` with the focus dice and the chosen face assignments. Note: focus chaining — if a newly chosen face is also focus, those dice become selectable too. Keep a "remaining focus budget" counter visible.
- **Claim battlefield flow.** Tap battlefield card in AvatarBar when it's green → `activeFlow = { kind: 'claim' }`. Battlefield card gets a green pulsing ring. Commit = "Claim". On commit, dispatch `claim-battlefield`. No confirmation dialog (it's not destructive to the claiming player). After claim, that player auto-passes; engine handles the auto-pass cascade.
- **Discard-to-reroll flow.** The left slot of ActionBar (where Undo lives when active) also shows a "Discard to reroll" button when `activeFlow === null` and it's your turn and you have cards in hand and dice in pool. Clicking it expands the HandStrip into a card-chooser mode (all cards highlighted, pick one to discard). Once a card is chosen, Commit = "Discard card". Committing moves to step 2: all dice in pool highlight green. Select any number. Commit = "Reroll". Dispatches `reroll-dice` with the chosen card and dice. Undo at any step walks back one step.

**Context to load.**
- `apps/web/src/routes/Game.tsx` (ActionBar, HandStrip, AvatarBar, activeFlow wiring)
- `apps/web/src/state/app.ts` (activeFlow — extend with reroll sub-steps, focus state)
- `packages/game-engine/src/actions/claim.ts` (claim action shape)
- `packages/game-engine/src/actions/reroll-dice.ts` (reroll action shape)
- `packages/game-engine/src/actions/resolve-dice.ts` (focus resolution path)

**Out of scope.** Special die resolution (deferred). Focus chaining edge cases beyond the basic loop (flag if discovered, don't solve in this card).

**Depends on.** WEB-16.

**Done when.** Typecheck clean. Manual smoke: focus dice selectable → face picker shows → chaining works for simple case → end focus dispatches correctly. Claim battlefield highlights card → commit claims it and player auto-passes. Discard-to-reroll walks through all three steps correctly with Undo at each step.

---

#### WEB-18 — Card ability badges on in-play cards
**Why now.** Characters and supports with `Action` abilities need a visible badge on their card in the battlefield. This is the last piece of the core turn interaction surface.

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