import type { GameState, PlayerState } from './types';

export interface NewGameInput {
  readonly seed: string;
  /** Two player IDs in seating order. v1 is 1v1 only; FFA comes post-v1. */
  readonly playerIds: readonly [string, string];
  /** Winner of the opening roll-off — the chosen battlefield's owner. */
  readonly battlefieldControllerId: string;
  /** Optional per-player overrides for testing (starting resources, hand, etc.). */
  readonly playerOverrides?: Readonly<Record<string, Partial<PlayerState>>>;
}

const DEFAULT_HAND_SIZE = 5;
const DEFAULT_DECK_SIZE = 30;
const STARTING_HAND = 5;
const STARTING_RESOURCES = 2;

/**
 * Build the initial GameState after setup completes.
 *
 * Setup is modeled as already-done by the time `newGame` returns: opening
 * hands drawn, roll-off resolved, battlefield chosen, starting resources
 * granted. The engine begins in the action phase with the battlefield
 * controller on the first turn, per the rules document.
 */
export function newGame(input: NewGameInput): GameState {
  const { seed, playerIds, battlefieldControllerId, playerOverrides } = input;

  if (!playerIds.includes(battlefieldControllerId)) {
    throw new Error(
      `battlefieldControllerId ${battlefieldControllerId} is not in playerIds`,
    );
  }

  const players: Record<string, PlayerState> = {};
  for (const id of playerIds) {
    const base: PlayerState = {
      id,
      handCount: STARTING_HAND,
      deckCount: DEFAULT_DECK_SIZE - STARTING_HAND,
      discardIds: [],
      resources: STARTING_RESOURCES,
      handSize: DEFAULT_HAND_SIZE,
      characterIds: [],
      battlefieldId: id === battlefieldControllerId ? `${id}.battlefield` : null,
      diceInPool: [],
    };
    players[id] = { ...base, ...(playerOverrides?.[id] ?? {}) };
  }

  return {
    seed,
    turnIndex: 0,
    roundNumber: 1,
    phase: 'action',
    battlefieldControllerId,
    playerOrder: playerIds,
    activePlayerId: battlefieldControllerId,
    players,
    consecutivePasses: 0,
    winnerId: null,
  };
}
