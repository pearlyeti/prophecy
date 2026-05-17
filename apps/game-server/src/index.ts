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
import { getAttributes, initializeAttributes, writeAttributes } from './attributeCorpus.js';
import { isStorageConfigured, uploadFile } from './storage.js';
import {
  commitCatalog,
  fetchCardAtSha,
  fetchCardHistory,
  fetchCommitReport,
  getCommittedSnapshot,
  GitHubConflictError,
  getPendingChanges,
  initializeGitHubSync,
  isGitHubSyncEnabled,
} from './githubSync.js';

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
  clearReconnectTimer,
  createRoom,
  getActiveRoomCount,
  getRoomById,
  joinRoom,
  LobbyError,
  lobbyStateOf,
  rejoinRoom,
  startReconnectTimer,
  startRoom,
  sweepIdleRooms,
  trackConnection,
  type Room,
} from './rooms.js';
import { GameWriter, getDb, markAbandonedSessions } from './persistence.js';

// One GameWriter per active room. Created when a game starts; removed on close.
const gameWriters = new Map<string, GameWriter>();

async function startWriter(roomId: string, playerIds: string[], seed: string): Promise<void> {
  const writer = new GameWriter(getDb(), playerIds, seed);
  gameWriters.set(roomId, writer);
  try {
    await writer.open();
  } catch (e) {
    console.error('[game-server] persistence open failed:', e);
  }
}

function appendEvents(roomId: string, events: readonly import('@prophecy/game-engine').EngineEvent[]): void {
  gameWriters.get(roomId)?.append(events);
}

async function closeWriter(roomId: string, winnerId: string | null): Promise<void> {
  const writer = gameWriters.get(roomId);
  if (!writer) return;
  gameWriters.delete(roomId);
  try {
    await writer.close(winnerId);
  } catch (e) {
    console.error('[game-server] persistence close failed:', e);
  }
}

const httpServer = createServer(async (req, res) => {
  // CORS preflight + headers for /designer and /card-art routes.
  const origin = (req.headers.origin as string | undefined) ?? '*';
  if (req.url?.startsWith('/designer') || req.url?.startsWith('/card-art/')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  const artUploadMatch = req.url?.match(/^\/designer\/card-art\/([^/]+)$/);
  if (artUploadMatch && req.method === 'PUT') {
    const userId = await requireSession(req, res);
    if (!userId) return;
    if (!checkDesignerAuth(req, res)) return;
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

  if (req.url === '/designer/cards' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cards: getCards() }));
    return;
  }
  if (req.url === '/designer/cards' && req.method === 'PUT') {
    const userId = await requireSession(req, res);
    if (!userId) return;
    if (!checkDesignerAuth(req, res)) return;
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
  if (req.url === '/designer/decks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ decks: getDecks() }));
    return;
  }
  if (req.url === '/designer/decks' && req.method === 'PUT') {
    const userId = await requireSession(req, res);
    if (!userId) return;
    if (!checkDesignerAuth(req, res)) return;
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
  if (req.url === '/designer/attributes' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAttributes()));
    return;
  }
  if (req.url === '/designer/attributes' && req.method === 'PUT') {
    const userId = await requireSession(req, res);
    if (!userId) return;
    if (!checkDesignerAuth(req, res)) return;
    try {
      const body = await readJsonBody(req);
      const { attributeCatalogSchema } = await import('@prophecy/protocol');
      const parsed = attributeCatalogSchema.parse(body);
      writeAttributes(parsed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
    }
    return;
  }

  if (req.url === '/designer/committed' && req.method === 'GET') {
    const snap = getCommittedSnapshot();
    if (!snap) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ enabled: false }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ enabled: true, cards: snap.cards, decks: snap.decks, attributes: snap.attributes }));
    return;
  }

  if (req.url === '/designer/pending' && req.method === 'GET') {
    if (!isGitHubSyncEnabled()) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ enabled: false }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ enabled: true, ...getPendingChanges() }));
    return;
  }

  if (req.url === '/designer/commit' && req.method === 'POST') {
    const userId = await requireSession(req, res);
    if (!userId) return;
    if (!checkDesignerAuth(req, res)) return;
    if (!isGitHubSyncEnabled()) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'GitHub sync not configured (set GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH)' }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const { message, selection } = body as {
        message?: string;
        selection?: { cardIds?: string[]; deckIds?: string[]; includeAttributes?: boolean };
      };
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'message is required' }));
        return;
      }
      if (message.length > 500) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'message must be 500 characters or fewer' }));
        return;
      }
      const result = await commitCatalog(message.trim(), selection);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (e) {
      if (e instanceof GitHubConflictError) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
      }
    }
    return;
  }

  const historyMatch = req.url?.match(/^\/designer\/cards\/([A-Za-z0-9_-]+)\/history$/) ?? null;
  if (historyMatch && req.method === 'GET') {
    if (!isGitHubSyncEnabled()) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'GitHub sync not configured' }));
      return;
    }
    try {
      const cardId = historyMatch[1]!;
      const history = await fetchCardHistory(cardId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(history));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  const atShaMatch = req.url?.match(/^\/designer\/cards\/([A-Za-z0-9_-]+)\/at\/([a-f0-9]{4,40})$/) ?? null;
  if (atShaMatch && req.method === 'GET') {
    if (!isGitHubSyncEnabled()) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'GitHub sync not configured' }));
      return;
    }
    try {
      const cardId = atShaMatch[1]!;
      const sha = atShaMatch[2]!;
      const card = await fetchCardAtSha(cardId, sha);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(card));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  const commitReportMatch = req.url?.match(/^\/designer\/commits\/([a-f0-9]{4,40})$/) ?? null;
  if (commitReportMatch && req.method === 'GET') {
    if (!isGitHubSyncEnabled()) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'GitHub sync not configured' }));
      return;
    }
    try {
      const sha = commitReportMatch[1]!;
      const report = await fetchCommitReport(sha);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(report));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  if (req.url === '/designer/ai/parse-abilities' && req.method === 'POST') {
    const userId = await requireSession(req, res);
    if (!userId) return;
    if (!checkDesignerAuth(req, res)) return;
    try {
      const body = await readJsonBody(req) as Record<string, unknown>;
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'text is required' }));
        return;
      }
      const { parseAbilities } = await import('./designerAi.js');
      const abilities = await parseAbilities(text);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, abilities }));
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: msg }));
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

// Verifies the session cookie against the API. Returns userId on success;
// writes a 401 and returns null on failure.
async function requireSession(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<string | null> {
  try {
    const resp = await fetch(`${AUTH_API_URL}/api/auth/get-session`, {
      headers: { cookie: req.headers.cookie ?? '' },
    });
    if (!resp.ok) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return null;
    }
    const data = (await resp.json()) as { user?: { id: string } } | null;
    if (!data?.user?.id) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return null;
    }
    return data.user.id;
  } catch {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    return null;
  }
}

// Guards mutating designer routes. Open in dev (no DESIGNER_SECRET set).
// Belt-and-suspenders alongside requireSession for local dev overrides.
function checkDesignerAuth(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): boolean {
  const secret = process.env.DESIGNER_SECRET;
  if (!secret) return true;
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
  return false;
}

interface SocketData {
  userId: string;
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<never, never>, SocketData>(httpServer, {
  cors: {
    // Dev-friendly: reflect any origin. Lock down via WEB_PUBLIC_URL
    // in prod (engine is server-authoritative; CORS isn't a security
    // boundary for game state).
    origin: process.env.WEB_PUBLIC_URL ?? true,
    credentials: true,
  },
});

// ── Auth middleware ──────────────────────────────────────────────────────────
// Verify the session on every new connection using a bearer token passed in
// socket.handshake.auth.token. Cookie forwarding doesn't work here because the
// session cookie is scoped to the API domain, not the game-server domain.

const AUTH_API_URL = process.env.API_URL ?? 'http://localhost:3000';

io.use(async (socket, next) => {
  const token = (socket.handshake.auth as { token?: string }).token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const resp = await fetch(`${AUTH_API_URL}/api/auth/get-session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return next(new Error('unauthorized'));
    const data = (await resp.json()) as { user?: { id: string } } | null;
    if (!data?.user?.id) return next(new Error('unauthorized'));
    socket.data.userId = data.user.id;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
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

  // Use the session userId as the authoritative player identifier for all room ops.
  const userId = socket.data.userId;

  socket.on('lobby.create', (req, ack) => {
    if (draining) { ack({ code: 'internal', message: 'server is restarting, please reconnect' }); return; }
    console.log(`[game-server] lobby.create from ${userId} (${req.displayName})`);
    try {
      const room = createRoom(userId, req.displayName);
      enterSocketRoom(socket, room, userId);
      state.playerId = userId;
      state.roomId = room.id;
      ack(lobbyStateOf(room));
      io.to(room.id).emit('lobby.state', lobbyStateOf(room));
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('lobby.join', (req, ack) => {
    console.log(`[game-server] lobby.join code=${req.code} from ${userId}`);
    try {
      const room = joinRoom(req.code, userId, req.displayName);
      enterSocketRoom(socket, room, userId);
      state.playerId = userId;
      state.roomId = room.id;
      ack(lobbyStateOf(room));
      io.to(room.id).emit('lobby.state', lobbyStateOf(room));
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('lobby.rejoin', (req, ack) => {
    console.log(`[game-server] lobby.rejoin room=${req.roomId} from ${userId}`);
    try {
      const room = rejoinRoom(req.roomId, userId);
      clearReconnectTimer(req.roomId, userId);
      enterSocketRoom(socket, room, userId);
      state.playerId = userId;
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
      const room = startRoom(req.roomId, userId, seed);
      void startWriter(room.id, [...room.members.keys()], seed);
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
      const { room, result } = applyRoomAction(req.roomId, userId, req.action);
      appendEvents(room.id, result.events);
      ack({ ok: true });
      io.to(room.id).emit('game.events', {
        roomId: room.id,
        events: result.events,
      });
      io.to(room.id).emit('game.state', { roomId: room.id, state: result.state });
      if (room.phase === 'ended') {
        io.to(room.id).emit('lobby.state', lobbyStateOf(room));
        void closeWriter(room.id, result.state.winnerId);
        checkDrainComplete();
      }
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('game.preview', (req) => {
    // Fire-and-forget relay — no validation, just rebroadcast to room peers.
    socket.to(req.roomId).emit('game.preview', req);
  });

  socket.on('lobby.findMatch', (req, ack) => {
    if (draining) { ack({ code: 'internal', message: 'server is restarting, please reconnect' }); return; }
    console.log(`[game-server] lobby.findMatch from ${userId} (${req.displayName})`);
    try {
      // Remove any stale entry for this player (e.g. double-click).
      matchmakingQueue.delete(userId);

      const waiting = dequeue();

      if (waiting) {
        // Pair found — create room, join both players, start immediately.
        console.log(`[game-server] pairing ${waiting.playerId} + ${userId}`);
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
        console.log(`[game-server] joining ${userId} to room`);
        joinRoom(room.code, userId, req.displayName);
        socket.join(room.id);
        trackConnection(room.id, userId, 1);
        state.playerId = userId;
        state.roomId = room.id;

        // Start the game.
        console.log(`[game-server] starting room, members: ${room.members.size}`);
        const started = startRoom(room.id, waiting.playerId, seed);
        void startWriter(started.id, [...started.members.keys()], seed);
        const payload = { lobby: lobbyStateOf(started), game: started.game ?? null };
        console.log(`[game-server] game started, phase: ${started.phase}`);

        // Unicast to both — they're now in the socket.io room.
        io.to(room.id).emit('lobby.matchFound', payload);
        console.log(`[game-server] matched ${waiting.playerId} + ${userId} → room ${room.id}`);
      } else {
        // No one waiting — add to queue.
        matchmakingQueue.set(userId, {
          playerId: userId,
          displayName: req.displayName,
          socketId: socket.id,
          joinedAt: Date.now(),
        });
        console.log(`[game-server] queued ${userId} (queue size: ${matchmakingQueue.size})`);
      }

      ack({ queued: true });
    } catch (e) {
      ack(toError(e));
    }
  });

  socket.on('lobby.leaveQueue', (_req) => {
    const deleted = matchmakingQueue.delete(userId);
    if (deleted) console.log(`[game-server] ${userId} left matchmaking queue`);
  });

  socket.on('disconnect', (reason) => {
    // Remove from matchmaking queue on disconnect (tab close, network drop, etc.)
    if (state.playerId) matchmakingQueue.delete(state.playerId);

    if (state.roomId && state.playerId) {
      trackConnection(state.roomId, state.playerId, -1);
      const room = getRoomById(state.roomId);
      if (room) {
        io.to(room.id).emit('lobby.state', lobbyStateOf(room));

        // Give the player 60 s to reconnect before forfeiting the game.
        if (room.phase === 'in-game') {
          const { roomId, playerId } = { roomId: state.roomId, playerId: state.playerId };
          startReconnectTimer(roomId, playerId, () => {
            const r = getRoomById(roomId);
            if (!r || r.phase !== 'in-game') return;
            const member = r.members.get(playerId);
            if (!member || member.connections > 0) return; // player already rejoined
            console.log(`[game-server] reconnect timeout for ${playerId} in room ${roomId} — forfeiting`);
            try {
              const { room: ended, result } = applyRoomAction(roomId, playerId, { type: 'concede', playerId });
              appendEvents(ended.id, result.events);
              io.to(ended.id).emit('game.events', { roomId: ended.id, events: result.events });
              io.to(ended.id).emit('game.state', { roomId: ended.id, state: result.state });
              io.to(ended.id).emit('lobby.state', lobbyStateOf(ended));
              void closeWriter(ended.id, result.state.winnerId);
              checkDrainComplete();
            } catch (e) {
              console.error('[game-server] reconnect timeout forfeit failed:', e);
            }
          });
        }
      }
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
const DRAIN_TIMEOUT_MS = Number(process.env.DRAIN_TIMEOUT_MS ?? 5 * 60 * 1_000);

// ── Graceful shutdown ────────────────────────────────────────────────
// On SIGTERM (Railway deploy, manual restart): stop accepting new
// connections, broadcast a draining notice, then wait for active games
// to finish naturally before exiting. The reconnect window (SERVER-1)
// handles players whose connection drops during the drain.

let draining = false;

function checkDrainComplete(): void {
  if (!draining) return;
  if (getActiveRoomCount() === 0) {
    console.log('[game-server] all rooms ended — exiting cleanly');
    process.exit(0);
  }
}

process.on('SIGTERM', () => {
  if (draining) return;
  draining = true;
  console.log(`[game-server] SIGTERM — draining (timeout ${DRAIN_TIMEOUT_MS}ms)`);

  // Stop accepting new TCP connections (existing sockets stay alive).
  httpServer.close();

  // Clear the matchmaking queue; nobody should wait on a draining server.
  matchmakingQueue.clear();

  // Tell connected clients so they can show a "back soon" banner.
  io.emit('server.draining', { drainTimeoutMs: DRAIN_TIMEOUT_MS });

  // Exit immediately if no active games are in flight.
  checkDrainComplete();

  // Hard exit after the drain window regardless.
  setTimeout(() => {
    console.log('[game-server] drain timeout — force exit');
    process.exit(0);
  }, DRAIN_TIMEOUT_MS).unref();
});

await initialize();
await initializeAttributes();
await initializeGitHubSync();
await markAbandonedSessions(getDb()).catch((e) =>
  console.error('[game-server] abandoned-session scan failed:', e),
);

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
