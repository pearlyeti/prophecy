# Claude instructions for Prophecy

## Read this first

Before doing anything substantive in this repo, read [README.md](README.md). It is the **source of truth** for:

- Project scope and IP boundaries
- Architecture (services, packages, directory layout)
- Tech stack (every library and the reason it was chosen)
- Database schema overview
- Game features (matches, deckbuilder, storefront, ladder, tournaments)
- Game engine design principles **and** [Engine implementation notes](README.md#engine-implementation-notes)
- Reference data & test fixtures policy
- Roadmap (in-progress, up next as task cards, backlog, done)
- Working agreements

If a question can be answered from the README, prefer that over guessing or grepping the web.

The binding spec for game mechanics is [docs/rules-reference.md](docs/rules-reference.md). Read it before writing engine code.

## Picking up a task card

Most work in this repo is handed off as a **task card** — a self-contained entry in TODO.md under "Up next — task cards". Each card lists what to build, which files to load, what's out of scope, and how to verify the work is done. The point is that a fresh agent context can start cheaply: you don't need to spelunk the whole codebase to be useful; the card has already pre-selected what matters.

When the user hands you a task code (e.g. `ENGINE-2`, `WEB-1`), follow this protocol:

1. **Find the card.** Read its full entry under "Up next — task cards" in `TODO.md`. If a `Depends on:` line points to an unfinished card, stop and ask the user before proceeding.
2. **Claim it.** Move the card line into `TODO.md`'s "In progress" subsection with today's date.
3. **Load only the listed files.** The card's "Context to load" section is the contract for context — load those, plus what they transitively reveal. Don't grep the codebase for general "understanding" outside the card's scope.
4. **Stay strictly in scope.** If you find related work that doesn't fit, surface it to the user and propose a new card — don't bundle it in. Scope creep is the #1 way a fresh context burns tokens for no value.
5. **Run the listed checks.** "Done when" gates completion. Don't claim done if anything's red. For UI cards, "manual smoke" means actually run the dev server and verify in a browser — typecheck does not prove a feature works.
6. **Close out in TODO.md.** Move the card from "In progress" to "Done" with today's date and a one-line summary. Don't leave stale "In progress" entries behind.
7. **Commit, then backfill the hash.** Stage everything (including the README close-out) and commit. Then edit the Done entry to append the resulting short hash in backticks at the end of the line — e.g. `` (`8d4526f`) `` — and make a tiny follow-up commit like `docs: backfill ENGINE-N hash`. The hash is non-negotiable for traceability; every Done entry must end up with one.
8. **If the premise is wrong, stop.** If you discover the design needs to change (missing dependency, wrong approach), report it to the user. Don't silently redefine scope and push through.

Cards are sized for one focused session — roughly 200–500 lines of changes including tests. If a card feels much bigger than that once you've loaded the files, that's a signal: flag it and propose splitting before you start writing code.

## The README is the source of truth — keep it that way

Every time a decision is made or scope changes, the README must be updated **in the same change** that made the decision. This is non-negotiable. Specifically:

- **Architecture change** (new service, removed service, changed boundary) → update [Architecture](README.md#architecture).
- **Tech stack change** (added, removed, or swapped library) → update the [Tech Stack](README.md#tech-stack) table **and** the affected service's section.
- **Schema change** (new / renamed / removed table or column) → update [Database Schema (Overview)](README.md#database-schema-overview).
- **Feature scope change** (added, cut, redesigned) → update [Game Features](README.md#game-features).
- **Engine principle or implementation-note change** → update [Game Engine Design Principles](README.md#game-engine-design-principles) or [Engine implementation notes](README.md#engine-implementation-notes). Treat these as load-bearing — don't change them without explicit user agreement.
- **Rules clarification / new ruling** → update [docs/rules-reference.md](docs/rules-reference.md) (Errata, Card Clarifications, or FAQ).
- **New TODO or shipped milestone** → update [Roadmap](README.md#roadmap). Move items between *In progress*, *Next up*, *Backlog*, and *Done* as state changes.
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

## Style

- Match the README's tone in any docs you write — concise, declarative, no marketing language.
- Don't write multi-paragraph code comments. One short line max, only when the *why* is non-obvious.
- Don't create new top-level docs (`ARCHITECTURE.md`, `DECISIONS.md`, etc.) — fold the content into the README instead.
- The rules document, the README, and this file are the only canonical docs. Everything else is code, fixtures, or tests.
