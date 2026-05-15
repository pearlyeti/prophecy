import {
  applyAction,
  createRng,
  newGameFromDecks,
  type Action,
  type ApplyResult,
  type GameState,
} from '@prophecy/game-engine';
import type { LobbyMember, LobbyPhase, LobbyState } from '@prophecy/protocol';
import { randomBytes, randomUUID } from 'node:crypto';

import { getCards, getDecks } from './corpus.js';

// Two-player limit per the v1 scope (1v1 only).
const ROOM_CAPACITY = 2;

export interface Room {
  readonly id: string;
  readonly code: string;
  hostId: string;
  members: Map<string, RoomMember>;
  phase: LobbyPhase;
  game: GameState | null;
  /** Set when all members are disconnected; cleared on next connect. */
  emptySince: number | null;
}

export interface RoomMember {
  readonly playerId: string;
  displayName: string;
  /** Live socket connection count; 0 means disconnected (game continues). */
  connections: number;
}

export class LobbyError extends Error {
  constructor(
    readonly code: 'lobby-not-found' | 'lobby-full' | 'not-host' | 'not-member',
    message: string,
  ) {
    super(message);
  }
}

const rooms = new Map<string, Room>();
const codeIndex = new Map<string, string>(); // code → roomId

// ── Reconnect timers ────────────────────────────────────────────────
// Keyed by `${roomId}:${playerId}`. When the timer fires the caller's
// callback runs (typically: forfeit the game).

const RECONNECT_TIMEOUT_MS = 60_000;
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function startReconnectTimer(
  roomId: string,
  playerId: string,
  onExpire: () => void,
): void {
  const key = `${roomId}:${playerId}`;
  clearReconnectTimer(roomId, playerId);
  reconnectTimers.set(
    key,
    setTimeout(() => {
      reconnectTimers.delete(key);
      onExpire();
    }, RECONNECT_TIMEOUT_MS),
  );
}

export function clearReconnectTimer(roomId: string, playerId: string): void {
  const key = `${roomId}:${playerId}`;
  const timer = reconnectTimers.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    reconnectTimers.delete(key);
  }
}

export function createRoom(playerId: string, displayName: string): Room {
  const id = randomUUID();
  const code = generateInviteCode();

  const member: RoomMember = { playerId, displayName, connections: 0 };
  const room: Room = {
    id,
    code,
    hostId: playerId,
    members: new Map([[playerId, member]]),
    phase: 'lobby',
    game: null,
    emptySince: Date.now(),
  };
  rooms.set(id, room);
  codeIndex.set(code, id);
  return room;
}

export function joinRoom(code: string, playerId: string, displayName: string): Room {
  const id = codeIndex.get(code.toUpperCase());
  const room = id ? rooms.get(id) : undefined;
  if (!room) throw new LobbyError('lobby-not-found', `no lobby with code ${code}`);

  // Re-joining as an existing member is allowed (reconnect).
  const existing = room.members.get(playerId);
  if (existing) {
    existing.displayName = displayName;
    return room;
  }

  if (room.members.size >= ROOM_CAPACITY) {
    throw new LobbyError('lobby-full', 'lobby is full');
  }
  if (room.phase !== 'lobby') {
    throw new LobbyError('lobby-full', 'game has already started');
  }

  room.members.set(playerId, { playerId, displayName, connections: 0 });
  return room;
}

/**
 * Re-attach a returning player to an existing room. Unlike joinRoom,
 * this is keyed by roomId and works after the game has started — it's
 * the path for "reload tab" / "network blip" recovery. Fails if the
 * player wasn't a member of the room.
 */
export function rejoinRoom(roomId: string, playerId: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new LobbyError('lobby-not-found', `no lobby with id ${roomId}`);
  if (!room.members.has(playerId)) {
    throw new LobbyError('not-member', `${playerId} is not a member of this lobby`);
  }
  return room;
}

export function startRoom(roomId: string, playerId: string, seed: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new LobbyError('lobby-not-found', `no lobby with id ${roomId}`);
  if (room.hostId !== playerId) {
    throw new LobbyError('not-host', 'only the host can start the game');
  }
  if (room.members.size !== ROOM_CAPACITY) {
    throw new LobbyError('lobby-full', 'lobby needs exactly two players to start');
  }

  // Random-but-deterministic deck assignment from the seed: pick the
  // first two committed test decks and 50/50 swap which player gets
  // which. This is the stand-in until the deckbuilder lands and players
  // bring their own.
  const playerIds = [...room.members.keys()] as [string, string];
  const decks = getDecks();
  const deckA = decks[0];
  const deckB = decks[1];
  if (!deckA || !deckB) {
    throw new Error('corpus must expose at least two test decks');
  }
  const swap = createRng(seed).fork('deck-assignment').next() < 0.5;
  const [firstDeck, secondDeck] = swap ? [deckB, deckA] : [deckA, deckB];

  type GameDeck = Parameters<typeof newGameFromDecks>[0]['assignments'][number]['deck'];
  type GameCatalog = Parameters<typeof newGameFromDecks>[0]['catalog'];

  room.game = newGameFromDecks({
    seed,
    catalog: getCards() as unknown as GameCatalog,
    assignments: [
      { playerId: playerIds[0], deck: firstDeck as unknown as GameDeck },
      { playerId: playerIds[1], deck: secondDeck as unknown as GameDeck },
    ],
  });
  room.phase = 'in-game';
  return room;
}

export function applyRoomAction(
  roomId: string,
  playerId: string,
  action: Action,
): { room: Room; result: ApplyResult } {
  const room = rooms.get(roomId);
  if (!room) throw new LobbyError('lobby-not-found', `no lobby with id ${roomId}`);
  if (!room.members.has(playerId)) {
    throw new LobbyError('not-member', `${playerId} is not in this lobby`);
  }
  if (!room.game) {
    throw new LobbyError('not-member', 'game has not started');
  }

  const result = applyAction(room.game, action);
  room.game = result.state;
  if (result.state.winnerId !== null) {
    room.phase = 'ended';
  }
  return { room, result };
}

export function getRoomById(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function trackConnection(roomId: string, playerId: string, delta: 1 | -1): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const m = room.members.get(playerId);
  if (!m) return;
  m.connections = Math.max(0, m.connections + delta);

  // Track when the room becomes entirely unattended so the cleanup
  // sweep can drop it later.
  const anyConnected = [...room.members.values()].some((rm) => rm.connections > 0);
  room.emptySince = anyConnected ? null : Date.now();
}

const IDLE_ROOM_TTL_MS = 5 * 60 * 1000; // 5 min unattended → drop the room

/**
 * Returns ids of rooms that were swept. Caller can broadcast a "lobby
 * dissolved" event if desired (we currently rely on the next client
 * rejoin attempt to fail clean).
 */
export function sweepIdleRooms(now: number = Date.now()): string[] {
  const dropped: string[] = [];
  for (const [id, room] of rooms) {
    if (room.emptySince !== null && now - room.emptySince > IDLE_ROOM_TTL_MS) {
      rooms.delete(id);
      codeIndex.delete(room.code);
      dropped.push(id);
    }
  }
  return dropped;
}

export function lobbyStateOf(room: Room): LobbyState {
  const members: LobbyMember[] = [...room.members.values()].map((m) => ({
    playerId: m.playerId,
    displayName: m.displayName,
    connected: m.connections > 0,
  }));
  return {
    roomId: room.id,
    code: room.code,
    hostId: room.hostId,
    members,
    phase: room.phase,
  };
}

// 6 characters from a friendly alphabet (no I/O/0/1 confusion).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateInviteCode(): string {
  for (let attempt = 0; attempt < 32; attempt++) {
    const buf = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[buf[i]! % ALPHABET.length];
    }
    if (!codeIndex.has(code)) return code;
  }
  throw new Error('failed to generate a unique invite code');
}
