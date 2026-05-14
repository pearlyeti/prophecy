import { IllegalActionError } from '@prophecy/game-engine';
import {
  cardCatalogSchema,
  deckCatalogSchema,
  type ClientToServerEvents,
  type ErrorPayload,
  type ServerToClientEvents,
} from '@prophecy/protocol';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';

import { getCards, getDecks, writeCards, writeDecks } from './corpus.js';

import {
  applyRoomAction,
  createRoom,
  getRoomById,
  joinRoom,
  LobbyError,
  lobbyStateOf,
  rejoinRoom,
  startRoom,
  sweepIdleRooms,
  trackConnection,
  type Room,
} from './rooms.js';

const httpServer = createServer(async (req, res) => {
  // CORS preflight + headers for every /admin response.
  const origin = (req.headers.origin as string | undefined) ?? '*';
  if (req.url?.startsWith('/admin')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'game-server' }));
    return;
  }

  if (req.url === '/admin/cards' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cards: getCards() }));
    return;
  }
  if (req.url === '/admin/cards' && req.method === 'PUT') {
    try {
      const body = await readJsonBody(req);
      const parsed = cardCatalogSchema.parse(body);
      writeCards(parsed.cards);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: parsed.cards.length }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
    }
    return;
  }
  if (req.url === '/admin/decks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ decks: getDecks() }));
    return;
  }
  if (req.url === '/admin/decks' && req.method === 'PUT') {
    try {
      const body = await readJsonBody(req);
      const parsed = deckCatalogSchema.parse(body);
      writeDecks(parsed.decks);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: parsed.decks.length }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    // Dev-friendly: reflect any origin. Lock down via WEB_PUBLIC_URL
    // in prod (engine is server-authoritative; CORS isn't a security
    // boundary for game state).
    origin: process.env.WEB_PUBLIC_URL ?? true,
    credentials: true,
  },
});

// Engine.io-level diagnostics: tells us when and why the underlying
// transport fails (CORS, upgrade probe, ping timeout, etc.).
io.engine.on('connection_error', (err: { code: number; message: string; context: unknown }) => {
  console.error('[engine] connection_error', err.code, err.message, err.context);
});
io.engine.on('initial_headers', (_headers, req) => {
  console.log('[engine] initial', req.method, req.url, 'origin=', req.headers.origin);
});

// ────────────────────────────────────────────────────────────────────
// Matchmaking queue (in-memory FIFO; Redis-backed when multi-instance)
// ────────────────────────────────────────────────────────────────────

interface QueueEntry {
  readonly playerId: string;
  readonly displayName: string;
  readonly socketId: string;
  readonly joinedAt: number;
}

/** Keyed by playerId. Insertion order preserved (Map is FIFO). */
const matchmakingQueue = new Map<string, QueueEntry>();

function dequeue(): QueueEntry | undefined {
  const first = matchmakingQueue.keys().next().value as string | undefined;
  if (!first) return undefined;
  const entry = matchmakingQueue.get(first)!;
  matchmakingQueue.delete(first);
  return entry;
}

// ────────────────────────────────────────────────────────────────────
// Per-socket state. Keyed by socket.id.
// ────────────────────────────────────────────────────────────────────

interface SocketState {
  playerId?: string;
  roomId?: string;
}
const socketStates = new WeakMap<NonNullable<unknown>, SocketState>();

io.on('connection', (socket) => {
  const state: SocketState = {};
  socketStates.set(socket, state);
  console.log(`[game-server] connected: ${socket.id}`);

  socket.on('lobby.create', (req, ack) => {
    console.log(`[game-server] lobby.create from ${req.playerId} (${req.displayName})`);
    try {
      const room = createRoom(req.playerId, req.displayName);
      enterSocketRoom(socket, room, req.playerId);
      state.playerId = req.playerId;
      state.roomId = room.id;
      ack(lobbyStateOf(room));
      io.to(room.id).emit('lobby.state', lobbyStateOf(room));
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('lobby.join', (req, ack) => {
    console.log(`[game-server] lobby.join code=${req.code} from ${req.playerId}`);
    try {
      const room = joinRoom(req.code, req.playerId, req.displayName);
      enterSocketRoom(socket, room, req.playerId);
      state.playerId = req.playerId;
      state.roomId = room.id;
      ack(lobbyStateOf(room));
      io.to(room.id).emit('lobby.state', lobbyStateOf(room));
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('lobby.rejoin', (req, ack) => {
    console.log(`[game-server] lobby.rejoin room=${req.roomId} from ${req.playerId}`);
    try {
      const room = rejoinRoom(req.roomId, req.playerId);
      enterSocketRoom(socket, room, req.playerId);
      state.playerId = req.playerId;
      state.roomId = room.id;
      ack({ lobby: lobbyStateOf(room), game: room.game });
      io.to(room.id).emit('lobby.state', lobbyStateOf(room));
      if (room.game) {
        // Unicast the current game state to the returning client only.
        socket.emit('game.state', { roomId: room.id, state: room.game });
      }
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('lobby.start', (req, ack) => {
    try {
      const seed = randomUUID();
      const room = startRoom(req.roomId, req.playerId, seed);
      ack(lobbyStateOf(room));
      io.to(room.id).emit('lobby.state', lobbyStateOf(room));
      if (room.game) {
        io.to(room.id).emit('game.state', { roomId: room.id, state: room.game });
      }
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('game.action', (req, ack) => {
    try {
      const { room, result } = applyRoomAction(req.roomId, req.playerId, req.action);
      ack({ ok: true });
      io.to(room.id).emit('game.events', {
        roomId: room.id,
        events: result.events,
      });
      io.to(room.id).emit('game.state', { roomId: room.id, state: result.state });
      if (room.phase === 'ended') {
        io.to(room.id).emit('lobby.state', lobbyStateOf(room));
      }
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('lobby.findMatch', (req, ack) => {
    console.log(`[game-server] lobby.findMatch from ${req.playerId} (${req.displayName})`);
    try {
      // Remove any stale entry for this player (e.g. double-click).
      matchmakingQueue.delete(req.playerId);

      const waiting = dequeue();

      if (waiting) {
        // Pair found — create room, join both players, start immediately.
        const seed = randomUUID();
        const room = createRoom(waiting.playerId, waiting.displayName);

        // Wire the waiting player's socket into the room.
        const waitingSocket = io.sockets.sockets.get(waiting.socketId);
        if (waitingSocket) {
          waitingSocket.join(room.id);
          trackConnection(room.id, waiting.playerId, 1);
          const ws = socketStates.get(waitingSocket);
          if (ws) {
            ws.playerId = waiting.playerId;
            ws.roomId = room.id;
          }
        }

        // Wire the current player's socket.
        joinRoom(room.code, req.playerId, req.displayName);
        socket.join(room.id);
        trackConnection(room.id, req.playerId, 1);
        state.playerId = req.playerId;
        state.roomId = room.id;

        // Start the game.
        const started = startRoom(room.id, waiting.playerId, seed);
        const payload = { lobby: lobbyStateOf(started), game: started.game ?? null };

        // Unicast to both — they're now in the socket.io room.
        io.to(room.id).emit('lobby.matchFound', payload);
        console.log(`[game-server] matched ${waiting.playerId} + ${req.playerId} → room ${room.id}`);
      } else {
        // No one waiting — add to queue.
        matchmakingQueue.set(req.playerId, {
          playerId: req.playerId,
          displayName: req.displayName,
          socketId: socket.id,
          joinedAt: Date.now(),
        });
        console.log(`[game-server] queued ${req.playerId} (queue size: ${matchmakingQueue.size})`);
      }

      ack({ queued: true });
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('lobby.leaveQueue', (req) => {
    const deleted = matchmakingQueue.delete(req.playerId);
    if (deleted) console.log(`[game-server] ${req.playerId} left matchmaking queue`);
  });

  socket.on('disconnect', (reason) => {
    // Remove from matchmaking queue on disconnect (tab close, network drop, etc.)
    if (state.playerId) matchmakingQueue.delete(state.playerId);

    if (state.roomId && state.playerId) {
      trackConnection(state.roomId, state.playerId, -1);
      const room = getRoomById(state.roomId);
      if (room) io.to(room.id).emit('lobby.state', lobbyStateOf(room));
    }
    console.log(`[game-server] disconnected: ${socket.id} (${reason})`);
  });
});

function enterSocketRoom(
  socket: { join: (room: string) => void },
  room: Room,
  playerId: string,
): void {
  socket.join(room.id);
  trackConnection(room.id, playerId, 1);
}

function toError(e: unknown): ErrorPayload {
  if (e instanceof LobbyError) {
    return { code: e.code, message: e.message };
  }
  if (e instanceof IllegalActionError) {
    return { code: 'illegal-action', message: e.reason };
  }
  console.error('[game-server] unexpected error', e);
  return { code: 'internal', message: 'unexpected server error' };
}

const port = Number(process.env.GAME_SERVER_PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`game-server listening on http://localhost:${port}`);
});

// Periodic sweep so abandoned rooms don't accumulate in the in-memory
// store. Replace with Redis-backed expiry when the room store moves
// out-of-process.
setInterval(() => {
  const dropped = sweepIdleRooms();
  if (dropped.length > 0) {
    console.log(`[game-server] swept ${dropped.length} idle rooms: ${dropped.join(', ')}`);
  }
}, 60_000).unref();
