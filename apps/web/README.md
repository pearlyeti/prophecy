# apps/web

Player client + role-gated admin pages. React 19, TypeScript, Vite, Tailwind v4. Ships as a PWA.

## Running locally

```sh
# From repo root:
pnpm --filter @prophecy/web dev

# Or from this directory:
pnpm dev
```

Env vars (copy from `../../.env.example`):
- `VITE_GAME_SERVER_URL` — Socket.io server URL (defaults to `http://localhost:3001` in dev)
- `VITE_API_URL` — tRPC API URL

## File layout

```
src/
  main.tsx          # App entry point
  App.tsx           # Root component; SocketBridge (auto-rejoin on reconnect)
  store.ts          # Zustand store — ephemeral UI state only (see rules below)
  index.css         # Tailwind + global CSS

  routes/
    Splash.tsx      # Landing page — Find Match, invite code entry
    Lobby.tsx       # Pre-game lobby — waiting room, start button
    Game.tsx        # Main game view — BattleZone, ActionBar, hand, dice
    DicePool3D.tsx  # Three.js / r3f dice layer (lazy-loaded)
    designer/       # Card designer admin pages (/designer/*)

  lib/
    socket.ts       # Singleton Socket.io client factory
    lobbyCache.ts   # localStorage persistence for roomId/code (rejoin support)
    playerId.ts     # Persistent anonymous player ID (localStorage)
    trpc.ts         # tRPC client setup
    dieFaceTexture.ts  # Canvas texture generator for 3D dice faces
    ErrorBoundary.tsx  # Top-level React error boundary
```

## Zustand store rules

The store holds **ephemeral UI state only** — things that affect how the screen looks but not game outcomes:

- `ActiveFlow` — which interaction the player is currently in (activate, resolve, reroll, etc.)
- `lobby` / `game` — the latest `LobbyState` / `GameState` received from the server (cache of server truth, not derived state)
- `recentEvents` — last batch of engine events for the activity log

**Never put game logic here.** Never track "has the player used their power action" or "whose turn is it" in Zustand — the server's `GameState` is the authority. If you find yourself writing Zustand state that would need to be enforced as a rule, add it to the engine instead.

## Socket.io event flow

1. `SocketBridge` in `App.tsx` subscribes to `connect` and calls `attemptRejoin()` on every reconnect.
2. `attemptRejoin()` reads `lobbyCache` and emits `lobby.rejoin` if a room is cached.
3. On `lobby.matchFound` or `lobby.rejoin` success: `setLobby` + `setGame` → navigates to `/game`.
4. On `game.state`: `setGame` — React re-renders with the new state.
5. On `game.events`: `setRecentEvents` — activity log updates.

## Touch-first rules

Every interaction must have a touch path. Specific requirements:
- Tap targets ≥ 44 × 44 CSS pixels.
- No hover-only affordances — anything on hover must also be reachable by tap.
- No right-click-only menus — long-press / right-click are shortcuts, not the only path.
- Layout must work at 360 × 640 (phone portrait) up to desktop.

Reviewers reject changes that break touch usability. Test on a phone or with mobile DevTools before marking a UI card done.

## Admin / designer pages

Routes under `/designer/*` are the card editor (see CLAUDE.md § Admin card editor). Any engine schema change that adds or renames an ability op must update `src/routes/designer/AbilityBuilder.tsx` in the same commit.
