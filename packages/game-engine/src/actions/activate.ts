import { applyEffects } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import { drainQueue } from '../queue/drain.js';
import { collectAfterTriggers, collectBeforeTriggers, commitTriggers } from '../queue/scan.js';
import { createRng } from '../rng/seeded-rng.js';
import { endTurn } from '../state/turn.js';
import { guardCanAct, runUpkeepAndStartRound } from './pass.js';
import type { ApplyResult } from './pass.js';
import type { CharacterState, DieFace, DieInPool, GameState, PlayerState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';

/**
 * Activate action.
 *
 * Trigger interception:
 * - Before: 'beforeActivate' triggers run inline before exhausting + rolling.
 * - After: 'afterActivateCharacter' triggers enter the queue (or pendingTriggers
 *   for simultaneous ordering), then the queue drains.
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
    throw new IllegalActionError(`character ${characterId} does not belong to ${playerId}`);
  }
  if (character.exhausted) {
    throw new IllegalActionError(`character ${characterId} is exhausted`);
  }

  // ── Before triggers ──────────────────────────────────────────────
  let working: GameState = state;
  const allEvents: EngineEvent[] = [];

  const beforeCandidates = collectBeforeTriggers(state, 'beforeActivate', {
    activatingPlayerId: playerId,
    activatingCharacterId: characterId,
  });

  // Deterministic auto-order for before-triggers (by source card id).
  const sorted = [...beforeCandidates].sort((a, b) =>
    a.sourceCardInstanceId.localeCompare(b.sourceCardInstanceId),
  );
  for (const candidate of sorted) {
    const ctx = {
      playerId: candidate.playerId,
      characterTargets: [],
      sourceCharacterId: candidate.sourceCardInstanceId,
    };
    const result = applyEffects(working, ctx, candidate.ability.effects);
    working = result.state;
    allEvents.push(...result.events);
  }

  // ── Activation ───────────────────────────────────────────────────
  const rng = createRng(working.seed).fork(`activate:${working.turnIndex}:${characterId}`);

  const currentPlayer = working.players[playerId]!;
  const currentChar = currentPlayer.characters[characterId]!;

  const alreadyInPool = new Set(
    currentPlayer.diceInPool
      .filter((d) => currentChar.dice.some((cd) => cd.instanceId === d.instanceId))
      .map((d) => d.instanceId),
  );

  const newDice: DieInPool[] = [];
  const rolledFaces: { instanceId: string; faceIndex: number; face: DieFace }[] = [];
  for (const die of currentChar.dice) {
    if (alreadyInPool.has(die.instanceId)) continue;
    const faceIndex = rng.rollDie(6);
    const face = die.faces[faceIndex]!;
    newDice.push({ instanceId: die.instanceId, cardId: die.cardId, faceIndex, face });
    rolledFaces.push({ instanceId: die.instanceId, faceIndex, face });
  }

  const updatedCharacter: CharacterState = { ...currentChar, exhausted: true };
  const updatedPlayer: PlayerState = {
    ...currentPlayer,
    characters: { ...currentPlayer.characters, [characterId]: updatedCharacter },
    diceInPool: [...currentPlayer.diceInPool, ...newDice],
  };

  const activateEvent: EngineEvent = {
    type: 'character.activated',
    payload: { playerId, characterId, rolledDice: rolledFaces },
  };
  allEvents.push(activateEvent);

  let stateAfterActivate: GameState = {
    ...working,
    players: { ...working.players, [playerId]: updatedPlayer },
    consecutivePasses: 0,
  };

  // ── After triggers ───────────────────────────────────────────────
  const afterCandidates = collectAfterTriggers(stateAfterActivate, [activateEvent]);
  stateAfterActivate = commitTriggers(stateAfterActivate, afterCandidates);

  // ── Drain queue (skip if pending ordering is waiting) ────────────
  if (!stateAfterActivate.pendingTriggers) {
    const drained = drainQueue(stateAfterActivate);
    stateAfterActivate = drained.state;
    allEvents.push(...drained.events);
  }

  if (stateAfterActivate.winnerId !== null) {
    return { state: stateAfterActivate, events: allEvents };
  }

  const rotated = endTurn(stateAfterActivate, playerId, allEvents);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
