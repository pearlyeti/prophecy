import type { EngineEvent } from '../events';
import { rotateAndCascade } from '../state/turn';
import type { GameState, PlayerState } from '../state/types';
import { IllegalActionError } from './illegal';
import { guardCanAct, runUpkeepAndStartRound } from './pass';
import type { ApplyResult } from './pass';

/**
 * Play-card action — vanilla cost-only.
 *
 * Pays the card's resource cost, moves the instance from hand → discard,
 * and rotates the turn. Card abilities (ongoing effects, triggered
 * abilities, special-die abilities) do not fire here; the AST resolver
 * lands as a separate piece of work. Cards whose cost is not in
 * `state.cardCosts` are treated as cost 0.
 */
export function applyPlayCard(
  state: GameState,
  playerId: string,
  cardId: string,
): ApplyResult {
  guardCanAct(state, playerId);

  const player = state.players[playerId];
  if (!player) throw new Error(`player ${playerId} missing from state`);

  if (!player.hand.includes(cardId)) {
    throw new IllegalActionError(
      `card ${cardId} is not in ${playerId}'s hand`,
    );
  }

  const cost = state.cardCosts[cardId] ?? 0;
  if (player.resources < cost) {
    throw new IllegalActionError(
      `${playerId} cannot afford ${cardId}: cost ${cost}, resources ${player.resources}`,
    );
  }

  const updatedPlayer: PlayerState = {
    ...player,
    resources: player.resources - cost,
    hand: player.hand.filter((id) => id !== cardId),
    discard: [...player.discard, cardId],
  };

  const events: EngineEvent[] = [
    {
      type: 'card.played',
      payload: { playerId, cardId, costPaid: cost },
    },
  ];

  const stateAfterPlay: GameState = {
    ...state,
    players: { ...state.players, [playerId]: updatedPlayer },
    consecutivePasses: 0,
  };

  const rotated = rotateAndCascade(stateAfterPlay, playerId, events);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
