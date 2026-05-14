import type { EngineEvent } from '../events.js';
import { createRng } from '../rng/seeded-rng.js';
import { endTurn } from '../state/turn.js';
import type { DieFace, DieInPool, GameState, PlayerState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';
import { guardCanAct, runUpkeepAndStartRound, type ApplyResult } from './pass.js';

/**
 * Reroll-dice action.
 *
 * Discards one card from the player's hand and rerolls the listed dice
 * from their pool, deterministic via a per-action seeded RNG fork.
 * Counts as a turn action: resets `consecutivePasses` and rotates.
 *
 * Validates: active player + action phase, discard card in hand, every
 * die id present in the player's pool. Modifiers can be rerolled
 * standalone — the symbol-lock rule only applies to *resolving*.
 */
export function applyRerollDice(
  state: GameState,
  playerId: string,
  discardCardId: string,
  dieInstanceIds: readonly string[],
): ApplyResult {
  guardCanAct(state, playerId);

  const player = state.players[playerId];
  if (!player) throw new Error(`player ${playerId} missing from state`);

  // Zero dice is legal — the player discards the card without rerolling
  // anything (useful for cycling and as a low-impact turn action).
  if (!player.hand.includes(discardCardId)) {
    throw new IllegalActionError(
      `card ${discardCardId} is not in ${playerId}'s hand`,
    );
  }

  const poolById = new Map(player.diceInPool.map((d) => [d.instanceId, d]));
  for (const id of dieInstanceIds) {
    if (!poolById.has(id)) {
      throw new IllegalActionError(`die ${id} is not in ${playerId}'s pool`);
    }
  }

  // Map each die instance back to its source CardDie's faces. Defeated
  // characters have already had their dice removed from the pool in
  // resolve-dice, so we only need to search live characters.
  const facesById = new Map<string, readonly DieFace[]>();
  for (const cid of player.characterOrder) {
    const c = player.characters[cid];
    if (!c) continue;
    for (const die of c.dice) {
      facesById.set(die.instanceId, die.faces);
    }
  }

  // Per-action RNG fork: ties replays to the action stream, decoupled
  // from any other RNG users on the same turn (activate, future cards).
  const rng = createRng(state.seed).fork(
    `reroll:${state.turnIndex}:${discardCardId}`,
  );

  const rolled: { instanceId: string; faceIndex: number; face: DieFace }[] = [];
  const toReroll = new Set(dieInstanceIds);
  const updatedPool: DieInPool[] = player.diceInPool.map((d) => {
    if (!toReroll.has(d.instanceId)) return d;
    const faces = facesById.get(d.instanceId);
    if (!faces) {
      throw new Error(`die ${d.instanceId} has no source character definition`);
    }
    const faceIndex = rng.rollDie(6);
    const face = faces[faceIndex]!;
    rolled.push({ instanceId: d.instanceId, faceIndex, face });
    return {
      instanceId: d.instanceId,
      cardId: d.cardId,
      faceIndex,
      face,
      ...(d.ownerInstanceId !== undefined ? { ownerInstanceId: d.ownerInstanceId } : {}),
    };
  });

  const updatedPlayer: PlayerState = {
    ...player,
    hand: player.hand.filter((id) => id !== discardCardId),
    discard: [...player.discard, discardCardId],
    diceInPool: updatedPool,
  };

  const events: EngineEvent[] = [
    {
      type: 'dice.rerolled',
      payload: { playerId, discardCardId, rerolledDice: rolled },
    },
  ];

  const stateAfter: GameState = {
    ...state,
    players: { ...state.players, [playerId]: updatedPlayer },
    consecutivePasses: 0,
  };

  const rotated = endTurn(stateAfter, playerId, events);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
