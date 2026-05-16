// Wire protocol between web client and game-server (Socket.io).
//
// Conventions:
// - Client → server messages use the suffix .req when they expect a
//   server response, and unsuffixed otherwise.
// - Server → client messages are usually broadcast to the whole room,
//   except `error` which is unicast to the sender.

import type { Action, EngineEvent, GameState } from '@prophecy/game-engine';

// ────────────────────────────────────────────────────────────────────
// Client → server
// ────────────────────────────────────────────────────────────────────

export interface LobbyCreateReq {
  /** Stable client-generated player id (UUID stored in localStorage). */
  readonly playerId: string;
  /** Display name shown to the opponent. */
  readonly displayName: string;
}

export interface LobbyJoinReq {
  readonly playerId: string;
  readonly displayName: string;
  /** 6-char invite code shared by the host. */
  readonly code: string;
}

export interface LobbyStartReq {
  readonly playerId: string;
  readonly roomId: string;
}

export interface LobbyRejoinReq {
  /** The same playerId the client used originally. */
  readonly playerId: string;
  /** The room id stashed in localStorage after the initial join. */
  readonly roomId: string;
}

export interface GameActionReq {
  readonly playerId: string;
  readonly roomId: string;
  readonly action: Action;
}

// ────────────────────────────────────────────────────────────────────
// Server → client
// ────────────────────────────────────────────────────────────────────

export interface LobbyMember {
  readonly playerId: string;
  readonly displayName: string;
  readonly connected: boolean;
}

export type LobbyPhase = 'lobby' | 'in-game' | 'ended';

export interface LobbyState {
  readonly roomId: string;
  readonly code: string;
  readonly hostId: string;
  readonly members: readonly LobbyMember[];
  readonly phase: LobbyPhase;
}

export interface GameStatePayload {
  readonly roomId: string;
  readonly state: GameState;
}

export interface GameEventsPayload {
  readonly roomId: string;
  readonly events: readonly EngineEvent[];
}

export interface ErrorPayload {
  readonly code:
    | 'lobby-not-found'
    | 'lobby-full'
    | 'not-host'
    | 'not-member'
    | 'illegal-action'
    | 'internal';
  readonly message: string;
}

// ────────────────────────────────────────────────────────────────────
// Socket.io named-event maps
// ────────────────────────────────────────────────────────────────────

export interface RejoinResp {
  readonly lobby: LobbyState;
  /** Present when the room is in-game so the client can rehydrate immediately. */
  readonly game: GameState | null;
}

export interface LobbyFindMatchReq {
  readonly playerId: string;
  readonly displayName: string;
  /** One of the corpus deck IDs (e.g. 'DECK_A'). Ignored for now — server assigns randomly. */
  readonly deckId: string;
}

export interface LobbyLeaveQueueReq {
  readonly playerId: string;
}

export interface MatchFoundPayload {
  readonly lobby: LobbyState;
  /** Always present for matchmaking — game starts immediately when the pair is found. */
  readonly game: GameState | null;
}

/** Live preview of the active player's in-progress action (fire-and-forget, no validation). */
export interface GamePreviewPayload {
  readonly roomId: string;
  /** Player whose ActiveFlow is being broadcast. */
  readonly playerId: string;
  /** Opaque ActiveFlow — defined in the web client; cast on receipt. null = flow cleared. */
  readonly flow: Record<string, unknown> | null;
}

export interface ClientToServerEvents {
  'lobby.create': (req: LobbyCreateReq, ack: (resp: LobbyState | ErrorPayload) => void) => void;
  'lobby.join': (req: LobbyJoinReq, ack: (resp: LobbyState | ErrorPayload) => void) => void;
  'lobby.rejoin': (req: LobbyRejoinReq, ack: (resp: RejoinResp | ErrorPayload) => void) => void;
  'lobby.start': (req: LobbyStartReq, ack: (resp: LobbyState | ErrorPayload) => void) => void;
  'game.action': (req: GameActionReq, ack: (resp: { ok: true } | ErrorPayload) => void) => void;
  /** Broadcast active flow to opponent. Fire-and-forget — server relays to room peers. */
  'game.preview': (req: GamePreviewPayload) => void;
  /** Join the matchmaking queue. Ack fires immediately; match arrives via lobby.matchFound. */
  'lobby.findMatch': (req: LobbyFindMatchReq, ack: (resp: { queued: true } | ErrorPayload) => void) => void;
  /** Leave the matchmaking queue. Fire-and-forget — no ack needed. */
  'lobby.leaveQueue': (req: LobbyLeaveQueueReq) => void;
}

export interface ServerToClientEvents {
  'lobby.state': (state: LobbyState) => void;
  'game.state': (payload: GameStatePayload) => void;
  'game.events': (payload: GameEventsPayload) => void;
  'game.preview': (payload: GamePreviewPayload) => void;
  'error': (payload: ErrorPayload) => void;
  /** Unicast to both matched players when the pair is found and the game has started. */
  'lobby.matchFound': (payload: MatchFoundPayload) => void;
  /** Broadcast when the server receives SIGTERM. Active games continue; new connections are refused. */
  'server.draining': (payload: { drainTimeoutMs: number }) => void;
}

export function isError<T>(resp: T | ErrorPayload): resp is ErrorPayload {
  return (
    typeof resp === 'object' &&
    resp !== null &&
    'code' in resp &&
    'message' in resp &&
    typeof (resp as ErrorPayload).code === 'string'
  );
}
