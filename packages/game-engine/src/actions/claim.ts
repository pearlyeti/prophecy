import type { EngineEvent } from '../events';
import { rotateAndCascade } from '../state/turn';
import type { GameState } from '../state/types';
import { IllegalActionError } from './illegal';
import { guardCanAct, runUpkeepAndStartRound, type ApplyResult } from './pass';

/**
 * Claim the battlefield.
 *
 * Per the rules document:
 * - Validates phase and active player.
 * - Only one player may claim per round.
 * - The claimer takes (or keeps) battlefield control.
 * - Their `Claim` ability may resolve here — stubbed for v1 because we
 *   don't yet model card abilities; the events.ts payload is in place
 *   so the resolver can fill in `claim.ability.resolved` later.
 * - Claim is an action, not a pass — `consecutivePasses` resets to 0.
 * - The claimer's subsequent turns this round are auto-passed by the
 *   engine (handled by `rotateAndCascade` reading `playerWhoClaimedThisRound`).
 */
export function applyClaim(state: GameState, playerId: string): ApplyResult {
  guardCanAct(state, playerId);

  if (state.playerWhoClaimedThisRound !== null) {
    throw new IllegalActionError(
      `battlefield already claimed this round by ${state.playerWhoClaimedThisRound}`,
    );
  }

  const events: EngineEvent[] = [
    {
      type: 'battlefield.claimed',
      payload: { playerId, previousControllerId: state.battlefieldControllerId },
    },
  ];

  const claimedState: GameState = {
    ...state,
    battlefieldControllerId: playerId,
    playerWhoClaimedThisRound: playerId,
    consecutivePasses: 0,
  };

  const rotated = rotateAndCascade(claimedState, playerId, events);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
