import { IllegalActionError } from '@prophecy/game-engine';
import {
  cardCatalogSchema,
  deckCatalogSchema,
  type ClientToServerEvents,
  type ErrorPayload,
  type ServerToClientEvents,
} from '@prophecy/protocol';
import { createReadStream, existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { Server } from 'socket.io';

import { artDir, getCards, getDecks, initialize, writeCards, writeDecks } from './corpus.js';
import { isStorageConfigured, uploadFile } from './storage.js';

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

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
  // CORS preflight + headers for /admin and /card-art routes.
  const origin = (req.headers.origin as string | undefined) ?? '*';
  if (req.url?.startsWith('/admin') || req.url?.startsWith('/card-art/')) {
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

  // ── Card art static serving ──────────────────────────────────────────
  const artMatch = req.url?.match(/^\/card-art\/([^/]+)$/);
  if (artMatch && req.method === 'GET') {
    const filename = basename(artMatch[1]!); // basename strips any sneaky path separators
    const filePath = resolve(artDir, filename);
    const ext = extname(filename).slice(1).toLowerCase();
    if (!existsSync(filePath) || !EXT_MIME[ext]) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': EXT_MIME[ext]!, 'Cache-Control': 'public, max-age=31536000, immutable' });
    createReadStream(filePath).pipe(res);
    return;
  }

  // ── Card art upload (binary PUT body, Content-Type = image/*) ────────
  const artUploadMatch = req.url?.match(/^\/admin\/card-art\/([^/]+)$/);
  if (artUploadMatch && req.method === 'PUT') {
    const cardId = decodeURIComponent(artUploadMatch[1]!);
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(cardId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid cardId' }));
      return;
    }
    const contentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    const ext = ALLOWED_IMAGE_TYPES[contentType];
    if (!ext) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unsupported image type' }));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 20 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'file too large (max 20 MB source)' }));
        return;
      }
      chunks.push(chunk as Buffer);
    }
    // Convert to WebP (max 1024×1024) regardless of source format.
    const body = await sharp(Buffer.concat(chunks))
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const key = `card-art/${cardId}.webp`;
    let artUrl: string;
    if (isStorageConfigured()) {
      artUrl = await uploadFile(key, body, contentType);
    } else {
      // Local disk fallback — dev only. Wipe stale extension if it changed.
      for (const existing of readdirSync(artDir)) {
        const stem = existing.replace(/\.[^.]+$/, '');
        if (stem === cardId && existing !== `${cardId}.${ext}`) unlinkSync(resolve(artDir, existing));
      }
      writeFileSync(resolve(artDir, `${cardId}.${ext}`), body);
      const proto = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
      const host = req.headers['host'] ?? `localhost:${port}`;
      artUrl = `${proto}://${host}/card-art/${cardId}.${ext}`;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, artUrl }));
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
        console.log(`[game-server] pairing ${waiting.playerId} + ${req.playerId}`);
        const seed = randomUUID();
        const room = createRoom(waiting.playerId, waiting.displayName);
        console.log(`[game-server] room created: ${room.id} code=${room.code}`);

        // Wire the waiting player's socket into the room.
        const waitingSocket = io.sockets.sockets.get(waiting.socketId);
        console.log(`[game-server] waiting socket found: ${!!waitingSocket}`);
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
        console.log(`[game-server] joining ${req.playerId} to room`);
        joinRoom(room.code, req.playerId, req.displayName);
        socket.join(room.id);
        trackConnection(room.id, req.playerId, 1);
        state.playerId = req.playerId;
        state.roomId = room.id;

        // Start the game.
        console.log(`[game-server] starting room, members: ${room.members.size}`);
        const started = startRoom(room.id, waiting.playerId, seed);
        const payload = { lobby: lobbyStateOf(started), game: started.game ?? null };
        console.log(`[game-server] game started, phase: ${started.phase}`);

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
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[game-server] unexpected error:', msg, e);
  // Pass the real message through in dev so it's visible in the browser.
  return { code: 'internal', message: msg };
}

const port = Number(process.env.PORT ?? process.env.GAME_SERVER_PORT ?? 3001);

await initialize();

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
