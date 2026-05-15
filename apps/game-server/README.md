# apps/game-server

Real-time game server. Socket.io rooms, one per active match. All game logic is delegated to `@prophecy/game-engine` — this app is I/O around the engine, not a reimplementation of it.

## Running locally

```sh
# From repo root — starts game-server + watches for changes:
pnpm --filter @prophecy/game-server dev

# Or from this directory:
pnpm dev
```

Requires env vars (copy from `../../.env.example`):
- `PORT` — defaults to 3001
- `WEB_PUBLIC_URL` — CORS allowed origin (defaults to `*` in dev)
- `GAME_SERVER_URL` — used by Railway; set in the Railway dashboard for prod

## File layout

```
src/
  index.ts          # Socket.io server, all event handlers, HTTP routes
  rooms.ts          # In-memory room registry, reconnect timers, action dispatch
  corpus.ts         # Loads and validates cards.json + decks.json at boot
  attributeCorpus.ts # Loads card attribute metadata
  storage.ts        # File upload helpers (local disk in dev, S3-compatible in prod)
```

## Key conventions

**`rooms.ts` owns all room state.** `index.ts` handles socket lifecycle and calls into `rooms.ts`. Don't put room logic in `index.ts`.

**Never reimplement engine rules here.** If you're tempted to validate a game condition in this file, add it to `@prophecy/game-engine` instead. The engine is the only authority.

**Every action goes through `applyRoomAction`.** This calls the engine's `applyAction`, which validates and applies the action. Bypassing it (e.g. mutating `room.game` directly) breaks determinism and replay.

**Socket events follow the `domain.verb` convention** — e.g. `lobby.create`, `lobby.rejoin`, `game.action`, `game.state`. Add new events to `ClientToServerEvents` / `ServerToClientEvents` in `packages/protocol/src/events.ts` first.

## Reconnect window

When a player disconnects mid-game, a 60-second timer starts (keyed `${roomId}:${playerId}`). If they rejoin before it fires, the timer is cleared. If it fires, a `concede` action is applied on their behalf. Implemented in `rooms.ts` via `startReconnectTimer` / `clearReconnectTimer`.

## HTTP routes

Beyond Socket.io, the server exposes:
- `GET /health` — liveness probe
- `GET /card-art/:filename` — static card art serving
- `PUT /designer/card-art/:cardId` — card art upload (dev only)
- `GET/PUT /designer/cards` — card catalog CRUD (dev only)
- `GET/PUT /designer/decks` — deck catalog CRUD (dev only)
- `GET/PUT /designer/attributes` — attribute catalog CRUD (dev only)
