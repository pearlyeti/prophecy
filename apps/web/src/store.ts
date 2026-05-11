import type { EngineEvent, GameState, LobbyState } from '@prophecy/protocol';
import { create } from 'zustand';

import { getOrCreatePlayerId } from './lib/playerId';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface AppStore {
  readonly playerId: string;
  displayName: string;
  setDisplayName: (s: string) => void;

  lobby: LobbyState | null;
  setLobby: (l: LobbyState | null) => void;

  game: GameState | null;
  setGame: (g: GameState | null) => void;

  recentEvents: readonly EngineEvent[];
  appendEvents: (e: readonly EngineEvent[]) => void;

  connectionStatus: ConnectionStatus;
  setConnectionStatus: (s: ConnectionStatus) => void;

  lastError: string | null;
  setError: (e: string | null) => void;

  reset: () => void;
}

const STORAGE_KEY_NAME = 'prophecy.displayName';

export const useApp = create<AppStore>((set) => ({
  playerId: getOrCreatePlayerId(),
  displayName: localStorage.getItem(STORAGE_KEY_NAME) ?? '',
  setDisplayName: (s) => {
    localStorage.setItem(STORAGE_KEY_NAME, s);
    set({ displayName: s });
  },

  lobby: null,
  setLobby: (l) => set({ lobby: l }),

  game: null,
  setGame: (g) => set({ game: g }),

  recentEvents: [],
  appendEvents: (events) =>
    set((s) => ({ recentEvents: [...s.recentEvents, ...events].slice(-50) })),

  connectionStatus: 'connecting',
  setConnectionStatus: (s) => set({ connectionStatus: s }),

  lastError: null,
  setError: (e) => set({ lastError: e }),

  reset: () =>
    set({
      lobby: null,
      game: null,
      recentEvents: [],
      lastError: null,
    }),
}));
