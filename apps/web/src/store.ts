import type { DieFace, EngineEvent, GameState, LobbyState } from '@prophecy/protocol';
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
/**
 * Which action flow the player is currently in. Only one flow is active
 * at a time; entering one clears all others. null = idle state.
 * More kinds are added in WEB-15/16/17.
 */
/** One step in a focus flow — either a face flip or chaining a new focuser. */
export type FacePickEvent =
  | { readonly kind: 'flip'; readonly targetDieId: string; readonly faceIndex: number; readonly prevFaceIndex: number; readonly prevFace: DieFace }
  | { readonly kind: 'chain'; readonly chainedFocuserId: string; readonly budgetAdded: number };

export type ActiveFlow =
  | { readonly kind: 'activate'; readonly charId: string; readonly rolling?: true }
  | { readonly kind: 'claim' }
  | {
      readonly kind: 'face-pick';
      /** All focuser dice that will be removed from pool on commit. */
      readonly focuserDieIds: readonly string[];
      /** Remaining flips available. */
      readonly budget: number;
      /** Ordered history of flip/chain events — drives undo. */
      readonly history: readonly FacePickEvent[];
      /** Die whose face picker panel is open, or null. */
      readonly pickingForDieId: string | null;
    }
  | {
      readonly kind: 'cardAction';
      readonly cardId: string;
      readonly abilityIndex: number;
      readonly abilityKind: 'action' | 'powerAction';
    }
  | {
      readonly kind: 'resolve';
      readonly symbol: string;
      readonly selectedDieIds: readonly string[];
      /** Groups already committed — each group targets one character. */
      readonly pendingTargets: readonly { readonly dieInstanceIds: readonly string[]; readonly targetCharacterId: string }[];
    }
  | {
      readonly kind: 'reroll';
      /** 'pick-card': player choosing which card to discard. 'pick-dice': choosing dice to reroll. */
      readonly step: 'pick-card' | 'pick-dice';
      readonly discardCardId: string | null;
      readonly selectedDieIds: readonly string[];
    }
  | {
      readonly kind: 'pendingCharTargetPlay';
      readonly cardId: string;
      readonly targetCharId: string;
      readonly cardName: string;
    };

export type SelectionMode =
  | { readonly kind: 'resolve'; readonly selectedDieIds: readonly string[] }
  | {
      readonly kind: 'reroll';
      readonly selectedDieIds: readonly string[];
      readonly discardCardId: string;
    };

interface AppStore {
  playerId: string;
  setPlayerId: (id: string) => void;
  displayName: string;
  setDisplayName: (s: string) => void;

  lobby: LobbyState | null;
  setLobby: (l: LobbyState | null) => void;

  game: GameState | null;
  setGame: (g: GameState | null) => void;

  /** Each entry is the complete event output of one player action. */
  recentBatches: readonly (readonly EngineEvent[])[];
  appendBatch: (batch: readonly EngineEvent[]) => void;

  connectionStatus: ConnectionStatus;
  setConnectionStatus: (s: ConnectionStatus) => void;

  lastError: string | null;
  setError: (e: string | null) => void;

  selectionMode: SelectionMode | null;
  enterResolveMode: () => void;
  enterRerollMode: (discardCardId: string) => void;
  exitSelectionMode: () => void;
  toggleSelectedDie: (instanceId: string) => void;

  activeFlow: ActiveFlow | null;
  setActiveFlow: (flow: ActiveFlow | null) => void;

  /** Die instance IDs currently mid-tumble from a roll (character.activated / support.activated). */
  tumblingPoolDieIds: readonly string[];
  setTumblingPoolDieIds: (ids: readonly string[]) => void;

  /** Active flow of the opponent player (received via game.preview socket event). */
  opponentPreview: ActiveFlow | null;
  setOpponentPreview: (flow: ActiveFlow | null) => void;

  reset: () => void;
}

const STORAGE_KEY_NAME = 'prophecy.displayName';

export const useApp = create<AppStore>((set) => ({
  playerId: getOrCreatePlayerId(),
  setPlayerId: (id) => set({ playerId: id }),
  displayName: localStorage.getItem(STORAGE_KEY_NAME) ?? '',
  setDisplayName: (s) => {
    localStorage.setItem(STORAGE_KEY_NAME, s);
    set({ displayName: s });
  },

  lobby: null,
  setLobby: (l) => set({ lobby: l }),

  game: null,
  setGame: (g) => set({ game: g }),

  recentBatches: [],
  appendBatch: (batch) =>
    set((s) => ({ recentBatches: [...s.recentBatches, batch].slice(-30) })),

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

  activeFlow: null,
  setActiveFlow: (flow) => set({ activeFlow: flow }),

  tumblingPoolDieIds: [],
  setTumblingPoolDieIds: (ids) => set({ tumblingPoolDieIds: ids }),

  opponentPreview: null,
  setOpponentPreview: (flow) => set({ opponentPreview: flow }),

  reset: () => {
    clearCachedLobby();
    set({
      lobby: null,
      game: null,
      recentBatches: [],
      lastError: null,
      selectionMode: null,
      activeFlow: null,
      tumblingPoolDieIds: [],
      opponentPreview: null,
    });
  },
}));
