import type { EngineEvent } from '../events.js';
import type { GameState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';
import type { ApplyResult } from './pass.js';

/**
 * Concede. Voluntary surrender. v1 is 1v1 only — the conceding player
 * loses outright and the opponent wins. FFA elimination semantics
 * (player removed, game continues) come post-v1.
 *
 * Concede is allowed from any phase as long as the game hasn't already
 * ended.
 */
export function applyConcede(state: GameState, playerId: string): ApplyResult {
  if (state.winnerId !== null || state.phase === 'ended') {
    throw new IllegalActionError('game has already ended');
  }
  if (!state.playerOrder.includes(playerId)) {
    throw new IllegalActionError(`${playerId} is not in this game`);
  }

  // 1v1: opponent wins. Asserted by the playerOrder length check.
  if (state.playerOrder.length !== 2) {
    throw new IllegalActionError(
      'concede is implemented for 1v1 only; FFA post-v1',
    );
  }
  const opponentId = state.playerOrder.find((id) => id !== playerId);
  if (opponentId === undefined) {
    throw new Error('1v1 concede: could not resolve opponent');
  }

  const events: EngineEvent[] = [
    {
      type: 'game.ended',
      payload: { winnerId: opponentId, reason: 'concede' },
    },
  ];

  return {
    state: { ...state, winnerId: opponentId, phase: 'ended' },
    events,
  };
}
