# Claude instructions for Prophecy

## Read this first

Before doing anything substantive in this repo, read [README.md](README.md). It is the **source of truth** for:

- Project scope and IP boundaries
- Architecture (services, packages, directory layout)
- Tech stack (every library and the reason it was chosen)
- Database schema overview
- Game features (matches, deckbuilder, storefront, ladder, tournaments)
- Game engine design principles **and** [Engine implementation notes](README.md#engine-implementation-notes)
- Card catalog & deck registry (and the test-only engine fixtures policy)
- Roadmap (up next as task cards, backlog, done history)
- Working agreements

If a question can be answered from the README, prefer that over guessing or grepping the web.

The binding spec for game mechanics is [docs/rules-reference.md](docs/rules-reference.md). Read it before writing engine code.

## Picking up a task card

Most work in this repo is handed off as a **task card** — a self-contained entry in `ROADMAP.md` under "Up next — task cards". Each card lists what to build, which files to load, what's out of scope, and how to verify the work is done. The point is that a fresh agent context can start cheaply: you don't need to spelunk the whole codebase to be useful; the card has already pre-selected what matters.

**Status tracking (claiming, in-progress, done) lives in [GitHub Issues](https://github.com/pearlyeti/prophecy/issues)** — one issue per card. `ROADMAP.md` is the spec registry and history log; Issues are the coordination layer.

When the user hands you a task code (e.g. `ENGINE-2`, `WEB-1`), follow this protocol:

1. **Find the card.** Read its full entry under "Up next — task cards" in `ROADMAP.md`. If a `Depends on:` line points to an unfinished card (open GitHub Issue), stop and ask the user before proceeding.
2. **Check for conflicts.** Use `mcp__github__list_issues` with `labels: ["in-progress"]` to list all currently claimed cards. Compare the "Context to load" files of every in-progress card against this card's files. If there is any overlap, stop and report it to the user — do not claim the card. Multiple sessions may be running concurrently; GitHub Issues are the coordination layer.
3. **Claim it.** Add the `in-progress` label to the card's GitHub Issue using `mcp__github__issue_write` with `method: "update"`. If no issue exists yet for the card, create one first with `method: "create"`.
4. **Load only the listed files.** The card's "Context to load" section is the contract for context — load those, plus what they transitively reveal. Don't grep the codebase for general "understanding" outside the card's scope.
5. **Stay strictly in scope.** If you find related work that doesn't fit, surface it to the user and propose a new card — don't bundle it in. Scope creep is the #1 way a fresh context burns tokens for no value.
6. **Run the listed checks.** "Done when" gates completion. Don't claim done if anything's red. For UI cards, "manual smoke" means actually run the dev server and verify in a browser — typecheck does not prove a feature works.
7. **Merge cleanly.** For deployed-path cards (anything touching the paths listed in [Pull requests & self-healing main](#pull-requests--self-healing-main)), open a PR with Auto-fix and auto-merge — follow that section. Include `Closes #N` in the PR body so the GitHub Issue closes automatically on merge. For doc-only or fixture-only cards, rebase onto main (`git fetch origin && git rebase origin/main`), re-run "Done when" checks, then push directly and close the issue manually. If the rebase has conflicts, stop and report to the user.
8. **Close out in ROADMAP.md.** Append the card to the `### Done` section with today's date and a one-line summary. The GitHub Issue is closed automatically by the `Closes #N` PR reference (or close it manually for direct-push cards via `mcp__github__issue_write`).
9. **Commit, then backfill the hash.** Stage everything (including the ROADMAP.md close-out) and commit. Then edit the Done entry to append the resulting short hash in backticks at the end of the line — e.g. `` (`8d4526f`) `` — and make a tiny follow-up commit like `docs: backfill ENGINE-N hash`. The hash is non-negotiable for traceability; every Done entry must end up with one.
10. **If the premise is wrong, stop.** If you discover the design needs to change (missing dependency, wrong approach), report it to the user. Don't silently redefine scope and push through.

Cards are sized for one focused session — roughly 200–500 lines of changes including tests. If a card feels much bigger than that once you've loaded the files, that's a signal: flag it and propose splitting before you start writing code.

## Pull requests & self-healing main

`main` is the deployment branch. Vercel rebuilds and serves the web app on every push; Railway rebuilds `apps/game-server` when its watched paths change. A red CI run on `main` means production is broken until someone fixes it.

To keep `main` green without manual policing, any change that can break a production deploy goes through a pull request with **Auto-fix enabled**. On CI failure, Anthropic's webhook handler spawns a Claude session that pushes a fix; GitHub's auto-merge lands the PR once CI is green.

**Use a PR (not direct push to `main`) for changes touching:**

- `apps/web/**` (Vercel build / runtime)
- `apps/game-server/**` (Railway build / runtime)
- `packages/game-engine/**`, `packages/protocol/**`, `packages/db/**` (transitive deps of both apps)
- `pnpm-lock.yaml`, `turbo.json`, root `package.json`, root `tsconfig*.json` (build config that affects everything)

Doc-only and test-fixture-only changes (`README.md`, `ROADMAP.md`, `CLAUDE.md`, `docs/**`, `packages/game-engine/__fixtures__/**`) can push to `main` directly. When in doubt, use a PR.

**The PR routine:**

1. Push on a feature branch with a clear name (e.g. `engine/multi-target-resolve`, `web/results-cam-revamp`).
2. Open a PR against `main`. Title is conventional-commit form (`feat(engine): …`). Body links to the task card if one applies.
3. **Enable Auto-fix on the PR.** Non-negotiable for deployed-path PRs. The session opening the PR should turn it on in the same step — in chat say "auto-fix this PR"; in the session's CI status bar toggle **Auto-fix**; from a terminal session on the PR branch run `/autofix-pr`.
4. **Enable auto-merge:** `gh pr merge --auto --squash` (or the GitHub UI button). The PR lands itself once required checks pass.
5. Walk away. If CI fails, Auto-fix pushes commits until green; auto-merge then fires.

If a session is closing out a task card via a PR, append the **merge** commit's short hash to the Done entry once auto-merge lands — same as the direct-push protocol, just sourced from the merge commit.

The Claude GitHub App must be installed on the repo for Auto-fix webhooks to deliver. It is already installed on `pearlyeti/prophecy` (scope: this repo only).

## The README is the source of truth — keep it that way

Every time a decision is made or scope changes, the README must be updated **in the same change** that made the decision. This is non-negotiable. Specifically:

- **Architecture change** (new service, removed service, changed boundary) → update [Architecture](README.md#architecture).
- **Tech stack change** (added, removed, or swapped library) → update the [Tech Stack](README.md#tech-stack) table **and** the affected service's section.
- **Schema change** (new / renamed / removed table or column) → update [Database Schema (Overview)](README.md#database-schema-overview).
- **Feature scope change** (added, cut, redesigned) → update [Game Features](README.md#game-features).
- **Engine principle or implementation-note change** → update [Game Engine Design Principles](README.md#game-engine-design-principles) or [Engine implementation notes](README.md#engine-implementation-notes). Treat these as load-bearing — don't change them without explicit user agreement.
- **Rules clarification / new ruling** → update [docs/rules-reference.md](docs/rules-reference.md) (Errata, Card Clarifications, or FAQ).
- **New task card or shipped milestone** → update [ROADMAP.md](ROADMAP.md). Add cards to *Up next*; append shipped work to *Done*. Status (in-progress, blocked) lives in GitHub Issues, not in this file.
- **New working agreement / convention** → add it to [Working agreements](README.md#working-agreements).

If you find yourself making a decision in chat without writing it down, stop and update the README first. Conversation transcripts are not durable; the README is.

If the README is wrong (out of date vs. the code), fix the README, then keep working. Don't silently work around stale docs.

## IP boundary

Prophecy is an **original property**. The gameplay system is inspired by dice-and-card dueling games but ships with **no third-party IP** — no franchise names, characters, factions, art, or lore.

For anything that ships to users (production seed data, UI copy, art, audio, marketing, store listings):

- Do **not** use franchise-specific names (characters, places, organizations, ships, etc.).
- Faction names are **Light / Shadow / Neutral**. Color gating is **Red / Blue / Yellow / Gray**.
- Rank tiers are **Bronze → Silver → Gold → Diamond → Champion**.
- If you need a placeholder name, invent a generic one (e.g., "Test Character A") rather than using anything recognizable.

For test fixtures, see the next section.

## Reference data & test fixtures

The engine needs a large corpus of cards to be exercised against well. Until Prophecy's own card pool is built, we use a **mechanical abstraction** of a public reference set as engine-validation fixtures.

Rules for any third-party-derived fixture data:

- **Lives only under** `packages/game-engine/__fixtures__/reference-set/`. Imported only from `__tests__/` paths. Never bundled into production builds.
- **Mechanical only.** Dice face profiles (symbol, value, cost, modifier flag), point values, health, ability *type tags* (e.g., `triggered.before.activates`, `keyword.guardian`, `inherent.dice.split-shields`) are fine — those are uncopyrightable game mechanics.
- **No verbatim ability text.** Replace card text with a generic templated form sufficient for engine tests, or with a structured representation the engine can interpret. Don't copy/paste card prose.
- **Generic names in fixtures.** Replace specific character/card titles with neutral identifiers (`CHAR_001`, `UPGRADE_BLADE_A`, etc.) so a fixture diff is unambiguously about mechanics, not someone else's IP.
- **No artwork or audio**, ever.

If you are about to fetch, scrape, or paste card data from a third-party source, **stop and confirm with the user first**, and use the rules above to filter what you keep.

If you find yourself reaching into `__fixtures__/` from a non-test path, stop.

## Zero trust on the client — game state lives in the engine only

The client is untrusted. Players can modify browser memory, intercept WebSocket messages, and replay actions. The only defence is that the server validates every action through the engine before it takes effect.

This means:

- **Never track game state in Zustand, component state, or localStorage.** "Game state" means anything that affects the outcome of the game: health, resources, whose turn it is, whether a power action has been used, which dice are in the pool, etc. If it needs to be enforced by a rule, it lives in `GameState` inside the engine — full stop.
- **`GameState` is the source of truth.** The client receives `GameState` from the server after every action and renders it. It never derives game-truth from local tracking.
- **Cosmetic / animation state is fine in Zustand.** Whether a card is visually tilted as part of a pending-activation preview, which flow the player is currently in (ActiveFlow), scroll position, overlay visibility — none of this affects game outcomes and is fine client-side.
- **The engine enforces all rules.** If a rule (e.g. "power action once per round") is only checked on the client, it isn't enforced — a cheater ignores the client. Add the check to the engine action handler.

When reviewing or writing client code: if you find yourself updating a variable to track "has X happened this game/round/turn", stop and ask whether the engine already exposes that in `GameState`. If not, add it to the engine first.

## Where game logic lives

All rules live in `packages/game-engine`. Pure TypeScript, no I/O dependencies, fully deterministic given a seed.

- **Don't** put game rules, action validation, or dice resolution anywhere else.
- `apps/api` does account / collection / deck / season / tournament / storefront CRUD — no in-game logic.
- `apps/game-server` is I/O around the engine (sockets, rooms, persistence). It imports the engine, never reimplements it.
- `apps/web` renders state. It never owns state.
- `apps/admin` is back-office only — never touch player-facing flows from here.

Determinism rules for the engine: no unseeded randomness, no wall-clock reads, no iteration over insertion-ordered structures whose order isn't part of the state, no network-dependent shuffles. If you have to break this, surface it to the user — it's a roadmap-level concern.

When implementing rules, follow the [Engine implementation notes](README.md#engine-implementation-notes) — the queue, replacement effects, inherent dice abilities, simultaneous-ability tiebreak, "then" gating, negative-over-positive, uniqueness semantics, modifier-die handling, and damage timing all have specific behaviors that are easy to get wrong.

## Input model — touch-first, always

Prophecy targets desktop, tablet, and phone. Desktop is the early test target, but tablet and mobile are first-class — not a port-later concern. Every interaction must have a touch path:

- No hover-only affordances. Anything visible on hover must also be reachable via tap.
- No right-click-only menus. Long-press and right-click are shortcuts to actions that also have visible buttons.
- No precision-drag-required actions. Drag exists, but tap-to-select-then-tap-to-target is always available.
- Tap targets ≥ 44 × 44 CSS pixels.
- Confirm before destructive (claim, concede, dismantle).
- Layout must work at 360 × 640 (phone portrait) all the way up to desktop.

When you design a new UI affordance, ask "how does a finger do this?" before "how does a mouse do this?" If the touch path is clunky, the design is wrong — fix it before shipping.

See [Input model in README](README.md#input-model) for breakpoints and the live-match phone layout sketch.

## v1.0.0 scope — 1v1 only

v1.0.0 ships **1v1 only**. 2v2 team play and 3–4 player free-for-all are post-v1.

What this means in practice:

- The **engine** keeps abstractions that 2v2/FFA will need (battlefield-controller tiebreak, multi-opponent targeting, clockwise turn order, elimination). Don't strip them out — the rules already describe them and the engine should be correct on day one.
- The **UI, matchmaking, balance work, and content** for non-1v1 modes is post-v1. Don't build FFA opponent panels, 2v2 team-aware targeting UI, or queue support before v1 ships.
- The [post-v1 roadmap](README.md#backlog--post-v10) lists what's deferred. If you find yourself implementing a feature there, stop and confirm.

## Storefront integrity

Two non-negotiable rules around monetization:

- **Cosmetics are gameplay-neutral.** Anything purchasable with hard currency cannot affect game balance. The line is bright; do not blur it.
- **No paid randomized gameplay-card packs.** Booster packs of gameplay cards are bought with soft currency only. Hard currency buys: premium season pass, currency packs, cosmetic bundles, individual cosmetics. Never gameplay cards directly or as paid randomized rewards.

These exist for fairness and to keep the platform clear of lootbox regulation. If a feature design seems to brush up against either, raise it before implementing.

## Admin card editor — keep it in sync

Any change that adds or renames an `Effect` op, an `Ability` kind, or any field a card author fills in (play condition, trigger event, action cost, card disposition, target spec, etc.) **must update `apps/web/src/routes/designer/AbilityBuilder.tsx` in the same commit.** This is non-negotiable.

- New dispatched ops get a proper form with all their parameters.
- New stub ops (schema defined, engine not yet implemented) still get a form entry — the `(new)` placeholder is the fallback of last resort, not the default.
- Card authors must never need to hand-edit raw JSON to express an intent the schema already supports.

If you're adding a feature to `packages/protocol/src/catalog.ts` or `packages/game-engine/src/abilities/types.ts`, load `AbilityBuilder.tsx` in your context before finishing.

## Style

- Match the README's tone in any docs you write — concise, declarative, no marketing language.
- Don't write multi-paragraph code comments. One short line max, only when the *why* is non-obvious.
- Don't create new top-level docs (`ARCHITECTURE.md`, `DECISIONS.md`, etc.) — fold the content into the README instead.
- The rules document, the README, and this file are the only canonical docs. Everything else is code, fixtures, or tests.
