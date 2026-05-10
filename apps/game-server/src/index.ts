import { IllegalActionError } from '@prophecy/game-engine';
import type {
  ClientToServerEvents,
  ErrorPayload,
  ServerToClientEvents,
} from '@prophecy/protocol';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';

import {
  applyRoomAction,
  createRoom,
  getRoomById,
  joinRoom,
  LobbyError,
  lobbyStateOf,
  startRoom,
  trackConnection,
  type Room,
} from './rooms.js';

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'game-server' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173',
    credentials: true,
  },
});

// Per-socket state. Keyed by socket.id.
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

  socket.on('disconnect', (reason) => {
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
