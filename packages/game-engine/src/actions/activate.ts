import { applyEffects } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import { drainQueue } from '../queue/drain.js';
import { collectAfterTriggers, collectBeforeTriggers, commitTriggers } from '../queue/scan.js';
import { createRng } from '../rng/seeded-rng.js';
import { endTurn, grantExtraTurn } from '../state/turn.js';
import { guardCanAct, runUpkeepAndStartRound } from './pass.js';
import type { ApplyResult } from './pass.js';
import type { CharacterState, DieFace, DieInPool, GameState, PlayerState, SupportState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';

const GUARDIAN_DAMAGE_SYMBOLS = new Set(['melee', 'ranged', 'indirect'] as const);

/**
 * Activate action.
 *
 * Trigger interception:
 * - Guardian keyword: checked first, before-triggers. If the activating
 *   character has Guardian and the opponent has damage dice, sets
 *   pendingGuardian and returns early — the player must send
 *   'guardian.intercept' before activation continues.
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

  // Supports and characters share the same activate action — look up which one.
  const support = player.supports[characterId];
  if (support !== undefined) {
    return applyActivateSupport(state, playerId, characterId, support);
  }

  const character = player.characters[characterId];
  if (!character) {
    throw new IllegalActionError(`card ${characterId} does not belong to ${playerId} as a character or support`);
  }
  if (character.exhausted) {
    throw new IllegalActionError(`character ${characterId} is exhausted`);
  }

  // ── Guardian keyword check (fires before before-triggers) ────────
  const keywords = state.cardKeywords[characterId] ?? [];
  if (keywords.includes('guardian')) {
    const oppId = state.playerOrder.find((id) => id !== playerId);
    const oppPool = oppId ? (state.players[oppId]?.diceInPool ?? []) : [];
    const hasDamageDie = oppPool.some((d) => GUARDIAN_DAMAGE_SYMBOLS.has(d.face.symbol as any));
    if (hasDamageDie) {
      return {
        state: { ...state, pendingGuardian: { activatingCharacterId: characterId, activatingPlayerId: playerId } },
        events: [],
      };
    }
  }

  return performCharacterActivation(state, playerId, characterId);
}

/**
 * The core activation logic shared by applyActivate (no-guardian path)
 * and applyGuardianIntercept (post-intercept path).
 */
export function performCharacterActivation(
  state: GameState,
  playerId: string,
  characterId: string,
): ApplyResult {
  const allEvents: EngineEvent[] = [];
  let working: GameState = state;

  // ── Before triggers ──────────────────────────────────────────────
  const beforeCandidates = collectBeforeTriggers(state, 'beforeActivate', {
    activatingPlayerId: playerId,
    activatingCharacterId: characterId,
  });

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
    newDice.push({ instanceId: die.instanceId, cardId: die.cardId, faceIndex, face, ownerInstanceId: characterId });
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

  // ── Ambush keyword ───────────────────────────────────────────────
  // Grant one extra turn if the activated character has Ambush and the
  // per-turn gate hasn't already fired. endTurn consumes the extra turn
  // (keeping activePlayerId the same) and clears ambushGrantedThisTurn.
  const ambushKeywords = stateAfterActivate.cardKeywords[characterId] ?? [];
  if (ambushKeywords.includes('ambush') && !stateAfterActivate.ambushGrantedThisTurn) {
    stateAfterActivate = {
      ...grantExtraTurn(stateAfterActivate, playerId),
      ambushGrantedThisTurn: true,
    };
  }

  const rotated = endTurn(stateAfterActivate, playerId, allEvents);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}

function applyActivateSupport(
  state: GameState,
  playerId: string,
  supportId: string,
  support: SupportState,
): ApplyResult {
  if (support.exhausted) {
    throw new IllegalActionError(`support ${supportId} is exhausted`);
  }
  if (support.dice.length === 0) {
    throw new IllegalActionError(`support ${supportId} has no die and cannot be activated`);
  }

  const allEvents: EngineEvent[] = [];
  const rng = createRng(state.seed).fork(`activate:${state.turnIndex}:${supportId}`);

  const currentPlayer = state.players[playerId]!;
  const currentSupport = currentPlayer.supports[supportId]!;

  const alreadyInPool = new Set(
    currentPlayer.diceInPool
      .filter((d) => currentSupport.dice.some((cd) => cd.instanceId === d.instanceId))
      .map((d) => d.instanceId),
  );

  const newDice: DieInPool[] = [];
  const rolledFaces: { instanceId: string; faceIndex: number; face: DieFace }[] = [];
  for (const die of currentSupport.dice) {
    if (alreadyInPool.has(die.instanceId)) continue;
    const faceIndex = rng.rollDie(6);
    const face = die.faces[faceIndex]!;
    newDice.push({ instanceId: die.instanceId, cardId: die.cardId, faceIndex, face, ownerInstanceId: supportId });
    rolledFaces.push({ instanceId: die.instanceId, faceIndex, face });
  }

  const updatedSupport: SupportState = { ...currentSupport, exhausted: true };
  const updatedPlayer: PlayerState = {
    ...currentPlayer,
    supports: { ...currentPlayer.supports, [supportId]: updatedSupport },
    diceInPool: [...currentPlayer.diceInPool, ...newDice],
  };

  const activateEvent: EngineEvent = {
    type: 'support.activated',
    payload: { playerId, supportId, rolledDice: rolledFaces },
  };
  allEvents.push(activateEvent);

  let stateAfterActivate: GameState = {
    ...state,
    players: { ...state.players, [playerId]: updatedPlayer },
    consecutivePasses: 0,
  };

  const afterCandidates = collectAfterTriggers(stateAfterActivate, [activateEvent]);
  stateAfterActivate = commitTriggers(stateAfterActivate, afterCandidates);

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
