import { applySteps } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import { endTurn } from '../state/turn.js';
import type { GameState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';
import { guardCanAct, runUpkeepAndStartRound, type ApplyResult } from './pass.js';

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

  let claimedState: GameState = {
    ...state,
    battlefieldControllerId: playerId,
    playerWhoClaimedThisRound: playerId,
    consecutivePasses: 0,
  };

  // Fire any claim abilities on the claimer's battlefield card.
  const player = claimedState.players[playerId];
  const battlefieldId = player?.battlefieldCardId;
  if (battlefieldId) {
    const abilities = claimedState.cardAbilities[battlefieldId] ?? [];
    for (const ability of abilities) {
      if (ability.kind !== 'claim') continue;
      const ctx = { playerId, characterTargets: [] as string[], sourceCharacterId: battlefieldId };
      const result = applySteps(claimedState, ctx, ability.steps);
      claimedState = result.state;
      events.push(...result.events);
    }
  }

  const rotated = endTurn(claimedState, playerId, events);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
