import type { EngineEvent } from '../events';
import { createRng } from '../rng/seeded-rng';
import { endTurn } from '../state/turn';
import { guardCanAct, runUpkeepAndStartRound } from './pass';
import type { ApplyResult } from './pass';
import type { CharacterState, DieFace, DieInPool, GameState, PlayerState } from '../state/types';
import { IllegalActionError } from './illegal';

/**
 * Activate action.
 *
 * Exhausts the chosen character and rolls all of its dice (plus its
 * attached upgrade dice — not yet modeled) into the active player's
 * dice pool. The roll happens server-side via the seeded RNG; the
 * client never computes random outcomes. Any of the character's dice
 * already in the pool are not rerolled, per the rules document.
 */
export function applyActivate(
  state: GameState,
  playerId: string,
  characterId: string,
): ApplyResult {
  guardCanAct(state, playerId);

  const player = state.players[playerId];
  if (!player) throw new Error(`player ${playerId} missing from state`);

  const character = player.characters[characterId];
  if (!character) {
    throw new IllegalActionError(
      `character ${characterId} does not belong to ${playerId}`,
    );
  }
  if (character.exhausted) {
    throw new IllegalActionError(`character ${characterId} is exhausted`);
  }

  // RNG forked from the action stream so replays are deterministic even
  // across many activations within a game.
  const rng = createRng(state.seed).fork(
    `activate:${state.turnIndex}:${characterId}`,
  );

  const alreadyInPool = new Set(
    player.diceInPool
      .filter((d) => character.dice.some((cd) => cd.instanceId === d.instanceId))
      .map((d) => d.instanceId),
  );

  const newDice: DieInPool[] = [];
  const rolledFaces: { instanceId: string; faceIndex: number; face: DieFace }[] = [];
  for (const die of character.dice) {
    if (alreadyInPool.has(die.instanceId)) continue;
    const faceIndex = rng.rollDie(6);
    const face = die.faces[faceIndex]!;
    newDice.push({
      instanceId: die.instanceId,
      cardId: die.cardId,
      faceIndex,
      face,
    });
    rolledFaces.push({ instanceId: die.instanceId, faceIndex, face });
  }

  const updatedCharacter: CharacterState = { ...character, exhausted: true };
  const updatedPlayer: PlayerState = {
    ...player,
    characters: { ...player.characters, [characterId]: updatedCharacter },
    diceInPool: [...player.diceInPool, ...newDice],
  };

  const events: EngineEvent[] = [
    {
      type: 'character.activated',
      payload: {
        playerId,
        characterId,
        rolledDice: rolledFaces,
      },
    },
  ];

  // Activate is an action, not a pass — reset consecutivePasses and end
  // this player's turn. endTurn consumes an extra-turn slot (Ambush)
  // before rotating, and rotateAndCascade handles the auto-pass case
  // if the next seat has already claimed this round.
  const stateAfterActivate: GameState = {
    ...state,
    players: { ...state.players, [playerId]: updatedPlayer },
    consecutivePasses: 0,
  };
  const rotated = endTurn(stateAfterActivate, playerId, events);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
