// Ability effect dispatcher.
//
// `applyEffect` handles one `Effect` node from an ability AST. First-wave
// ops are fully implemented; all other ops throw `NotImplementedError` so
// they parse cleanly but fail loudly at runtime — never silently no-op.
//
// `applyEffects` sequences an array, threading state and consuming
// character targets in order.

import type { EngineEvent } from '../events.js';
import { drawCards } from '../state/draw.js';
import { createRng } from '../rng/seeded-rng.js';
import type { CardFixture } from '../__fixtures__/synthetic-set/schema.js';
import {
  addShields,
  adjustResources,
  dealDamage,
  healDamage,
  opponentOf,
  ownerOf,
  removeShields,
} from '../state/combat.js';
import type { GameState, DieInPool } from '../state/types.js';
import type {
  AddShieldsEffect,
  DealDamageEffect,
  DrawCardsEffect,
  Effect,
  GainResourcesEffect,
  HealDamageEffect,
  LoseResourcesEffect,
  RemoveShieldsEffect,
  TargetSpec,
} from './types.js';

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────

export class NotImplementedError extends Error {
  constructor(op: string) {
    super(`effect op "${op}" is not yet implemented`);
    this.name = 'NotImplementedError';
  }
}

export interface DispatchContext {
  readonly playerId: string;
  /** Pre-resolved character instance IDs for effects that need a character
   * selection. Auto-targeted effects (opponent, self, each*) don't consume
   * from this list. Effects needing ownCharacter / opponentCharacter /
   * anyCharacter consume one entry in order. */
  readonly characterTargets: readonly string[];
  /**
   * The card instance that carries the ability being dispatched. Used to
   * resolve 'thisCharacter' and 'attachedCharacter' target specs without
   * requiring an extra entry in characterTargets.
   */
  readonly sourceCharacterId?: string;
  readonly catalog?: readonly CardFixture[];
}

export interface EffectResult {
  readonly state: GameState;
  readonly events: EngineEvent[];
  /** Number of entries consumed from ctx.characterTargets. */
  readonly targetsConsumed: number;
}

/** Apply a single effect, returning the new state and any events emitted. */
export function applyEffect(
  state: GameState,
  ctx: DispatchContext,
  effect: Effect,
  targetOffset = 0,
): EffectResult {
  switch (effect.op) {
    case 'gainResources':
      return applyGainResources(state, ctx, effect);
    case 'loseResources':
      return applyLoseResources(state, ctx, effect);
    case 'drawCards':
      return applyDrawCards(state, ctx, effect);
    case 'dealDamage':
      return applyDealDamage(state, ctx, effect, targetOffset);
    case 'addShields':
      return applyAddShields(state, ctx, effect, targetOffset);
    case 'removeShields':
      return applyRemoveShields(state, ctx, effect, targetOffset);
    case 'healDamage':
      return applyHealDamage(state, ctx, effect, targetOffset);
    case 'rollEventDie':
      return applyRollEventDie(state, ctx, effect as any);
    case 'rollCardDie':
      return applyRollCardDie(state, ctx, effect as any);
    default:
      throw new NotImplementedError(effect.op);
  }
}

/** Apply an array of effects sequentially, threading state and targets. */
export function applyEffects(
  state: GameState,
  ctx: DispatchContext,
  effects: readonly Effect[],
): { state: GameState; events: EngineEvent[] } {
  let current = state;
  const allEvents: EngineEvent[] = [];
  let targetOffset = 0;

  for (const effect of effects) {
    const result = applyEffect(current, ctx, effect, targetOffset);
    current = result.state;
    allEvents.push(...result.events);
    targetOffset += result.targetsConsumed;
  }

  return { state: current, events: allEvents };
}

// ────────────────────────────────────────────────────────────────────
// First-wave implementations
// ────────────────────────────────────────────────────────────────────

function applyGainResources(
  state: GameState,
  ctx: DispatchContext,
  effect: GainResourcesEffect,
): EffectResult {
  const events: EngineEvent[] = [];
  const next = adjustResources(state, ctx.playerId, effect.amount);
  events.push({ type: 'resources.gained', payload: { playerId: ctx.playerId, amount: effect.amount } });
  return { state: next, events, targetsConsumed: 0 };
}

function applyLoseResources(
  state: GameState,
  ctx: DispatchContext,
  effect: LoseResourcesEffect,
): EffectResult {
  const targetId = effect.target === 'self' ? ctx.playerId : (opponentOf(state, ctx.playerId) ?? ctx.playerId);
  const current = state.players[targetId]?.resources ?? 0;
  const lost = effect.amount === 'all' ? current : Math.min(current, effect.amount);
  const events: EngineEvent[] = [];
  const next = adjustResources(state, targetId, -lost);
  events.push({ type: 'resources.lost', payload: { playerId: targetId, amount: lost } });
  return { state: next, events, targetsConsumed: 0 };
}

function applyDrawCards(
  state: GameState,
  ctx: DispatchContext,
  effect: DrawCardsEffect,
): EffectResult {
  const events: EngineEvent[] = [];
  let current = state;

  const playersToDraw: string[] =
    effect.player === 'eachPlayer'
      ? [...state.playerOrder]
      : effect.player === 'opponent'
        ? [opponentOf(state, ctx.playerId) ?? ctx.playerId]
        : [ctx.playerId];

  for (const pid of playersToDraw) {
    const player = current.players[pid];
    if (!player) continue;
    const n = effect.toHandSize ? player.handSize - player.hand.length : (effect.amount ?? 1);
    if (n <= 0) continue;
    const { state: s, drawn } = drawCards(current, pid, n);
    current = s;
    events.push({ type: 'cards.drawn', payload: { playerId: pid, count: drawn } });
  }

  return { state: current, events, targetsConsumed: 0 };
}

function applyDealDamage(
  state: GameState,
  ctx: DispatchContext,
  effect: DealDamageEffect,
  targetOffset: number,
): EffectResult {
  const events: EngineEvent[] = [];
  const unblockable = effect.unblockable ?? false;

  const targets = resolveCharacterTargets(state, ctx, effect.target, targetOffset);
  let current = state;
  for (const { ownerId, characterId } of targets) {
    current = dealDamage(current, ownerId, characterId, effect.amount, events, unblockable);
    if (current.winnerId !== null) break;
  }

  return { state: current, events, targetsConsumed: targets.consumed };
}

function applyAddShields(
  state: GameState,
  ctx: DispatchContext,
  effect: AddShieldsEffect,
  targetOffset: number,
): EffectResult {
  const events: EngineEvent[] = [];
  const targets = resolveCharacterTargets(state, ctx, effect.target, targetOffset);
  let current = state;
  for (const { ownerId, characterId } of targets) {
    current = addShields(current, ownerId, characterId, effect.amount, events);
  }
  return { state: current, events, targetsConsumed: targets.consumed };
}

function applyRemoveShields(
  state: GameState,
  ctx: DispatchContext,
  effect: RemoveShieldsEffect,
  targetOffset: number,
): EffectResult {
  const events: EngineEvent[] = [];
  const targets = resolveCharacterTargets(state, ctx, effect.target, targetOffset);
  let current = state;
  for (const { ownerId, characterId } of targets) {
    current = removeShields(current, ownerId, characterId, effect.amount, events);
  }
  return { state: current, events, targetsConsumed: targets.consumed };
}

function applyHealDamage(
  state: GameState,
  ctx: DispatchContext,
  effect: HealDamageEffect,
  targetOffset: number,
): EffectResult {
  const events: EngineEvent[] = [];
  const targets = resolveCharacterTargets(state, ctx, effect.target, targetOffset);
  let current = state;
  for (const { ownerId, characterId } of targets) {
    current = healDamage(current, ownerId, characterId, effect.amount, events);
  }
  return { state: current, events, targetsConsumed: targets.consumed };
}

function applyRollEventDie(
  state: GameState,
  ctx: DispatchContext,
  effect: { op: 'rollEventDie' },
): EffectResult {
  if (!ctx.sourceCharacterId) throw new Error('rollEventDie requires sourceCharacterId');
  if (!ctx.catalog) throw new Error('rollEventDie requires catalog in context');

  const card = ctx.catalog.find((c) => c.id === ctx.sourceCharacterId);
  if (!card) throw new Error(`card ${ctx.sourceCharacterId} not in catalog`);
  if (!card.dieFaces) throw new Error(`card ${ctx.sourceCharacterId} has no dieFaces`);

  const rng = createRng(state.seed).fork(`event-die:${state.turnIndex}:${ctx.sourceCharacterId}`);
  const faceIndex = rng.rollDie(6);
  const face = card.dieFaces[faceIndex]!;

  const newDie: DieInPool = {
    instanceId: `${ctx.sourceCharacterId}.transient`,
    cardId: card.id,
    faceIndex,
    face,
    transient: true,
  };

  const player = state.players[ctx.playerId]!;
  const nextPlayer = { ...player, diceInPool: [...player.diceInPool, newDie] };
  const nextState = { ...state, players: { ...state.players, [ctx.playerId]: nextPlayer } };

  return { state: nextState, events: [], targetsConsumed: 0 };
}

function applyRollCardDie(
  state: GameState,
  ctx: DispatchContext,
  effect: { op: 'rollCardDie'; cardId: string },
): EffectResult {
  if (!ctx.catalog) throw new Error('rollCardDie requires catalog in context');

  const card = ctx.catalog.find((c) => c.id === effect.cardId);
  if (!card) throw new Error(`card ${effect.cardId} not in catalog`);
  if (!card.dieFaces) throw new Error(`card ${effect.cardId} has no dieFaces`);

  const rng = createRng(state.seed).fork(`card-die:${state.turnIndex}:${effect.cardId}`);
  const faceIndex = rng.rollDie(6);
  const face = card.dieFaces[faceIndex]!;

  const newDie: DieInPool = {
    instanceId: `${effect.cardId}.transient`,
    cardId: card.id,
    faceIndex,
    face,
    transient: true,
  };

  const player = state.players[ctx.playerId]!;
  const nextPlayer = { ...player, diceInPool: [...player.diceInPool, newDie] };
  const nextState = { ...state, players: { ...state.players, [ctx.playerId]: nextPlayer } };

  return { state: nextState, events: [], targetsConsumed: 0 };
}

// ────────────────────────────────────────────────────────────────────
// Target resolution
// ────────────────────────────────────────────────────────────────────

interface ResolvedTarget {
  ownerId: string;
  characterId: string;
}

interface TargetList extends Array<ResolvedTarget> {
  consumed: number;
}

function resolveCharacterTargets(
  state: GameState,
  ctx: DispatchContext,
  spec: TargetSpec,
  targetOffset: number,
): TargetList {
  const result: TargetList = Object.assign([], { consumed: 0 });

  switch (spec.kind) {
    case 'opponentCharacter':
    case 'ownCharacter':
    case 'anyCharacter': {
      const characterId = ctx.characterTargets[targetOffset];
      if (!characterId) throw new Error(`effect needs a character target at index ${targetOffset} but none was provided`);
      const ownerId = ownerOf(state, characterId);
      if (!ownerId) throw new Error(`character ${characterId} is not in play`);
      result.push({ ownerId, characterId });
      result.consumed = 1;
      break;
    }
    case 'eachOpponentCharacter': {
      const oppId = opponentOf(state, ctx.playerId);
      if (oppId) {
        for (const charId of state.players[oppId]?.characterOrder ?? []) {
          result.push({ ownerId: oppId, characterId: charId });
        }
      }
      result.consumed = 0;
      break;
    }
    case 'eachCharacter': {
      for (const pid of state.playerOrder) {
        for (const charId of state.players[pid]?.characterOrder ?? []) {
          result.push({ ownerId: pid, characterId: charId });
        }
      }
      result.consumed = 0;
      break;
    }
    case 'attachedCharacter':
    case 'thisCharacter': {
      // Resolved from sourceCharacterId if available, otherwise from characterTargets.
      const characterId = ctx.sourceCharacterId ?? ctx.characterTargets[targetOffset];
      if (!characterId) throw new Error(`effect needs an attached/this-character target at index ${targetOffset}`);
      const ownerId = ownerOf(state, characterId);
      if (!ownerId) throw new Error(`character ${characterId} is not in play`);
      result.push({ ownerId, characterId });
      result.consumed = 1;
      break;
    }
    // opponent / self are not character targets; callers that pass these
    // to a character-targeting function have authored bad card data.
    default:
      throw new Error(`resolveCharacterTargets: target kind "${spec.kind}" is not a character target`);
  }

  return result;
}
