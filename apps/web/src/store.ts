import type { EngineEvent, GameState, LobbyState } from '@prophecy/protocol';
import { create } from 'zustand';

import { clearCachedLobby } from './lib/lobbyCache';
import { getOrCreatePlayerId } from './lib/playerId';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/**
 * Transient UI state for the dice-selection flows (resolve and reroll).
 * Stored centrally so the dice tray, sticky action bar, and any target
 * overlay all read/write the same selection without prop-drilling.
 *
 *  - 'resolve' enforces symbol-lock at the tile level and dispatches a
 *    `resolve-dice` action.
 *  - 'reroll' has no symbol lock (you can rough up any dice you want to
 *    reroll) and dispatches a `reroll-dice` action against the
 *    pre-chosen discard card.
 */
export type SelectionMode =
  | { readonly kind: 'resolve'; readonly selectedDieIds: readonly string[] }
  | {
      readonly kind: 'reroll';
      readonly selectedDieIds: readonly string[];
      readonly discardCardId: string;
    };

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

  selectionMode: SelectionMode | null;
  enterResolveMode: () => void;
  enterRerollMode: (discardCardId: string) => void;
  exitSelectionMode: () => void;
  toggleSelectedDie: (instanceId: string) => void;

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

  selectionMode: null,
  enterResolveMode: () => set({ selectionMode: { kind: 'resolve', selectedDieIds: [] } }),
  enterRerollMode: (discardCardId) =>
    set({ selectionMode: { kind: 'reroll', selectedDieIds: [], discardCardId } }),
  exitSelectionMode: () => set({ selectionMode: null }),
  toggleSelectedDie: (instanceId) =>
    set((s) => {
      if (!s.selectionMode) return {};
      const current = s.selectionMode.selectedDieIds;
      const next = current.includes(instanceId)
        ? current.filter((id) => id !== instanceId)
        : [...current, instanceId];
      return { selectionMode: { ...s.selectionMode, selectedDieIds: next } };
    }),

  reset: () => {
    clearCachedLobby();
    set({
      lobby: null,
      game: null,
      recentEvents: [],
      lastError: null,
      selectionMode: null,
    });
  },
}));
