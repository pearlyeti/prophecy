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
import {
  addShields,
  adjustResources,
  dealDamage,
  healDamage,
  opponentOf,
  ownerOf,
  removeShields,
} from '../state/combat.js';
import type { DieFace, GameState, DieInPool, PendingSearch } from '../state/types.js';
import type {
  AddShieldsEffect,
  CardCriteria,
  DealDamageEffect,
  DieCriteria,
  DrawCardsEffect,
  Effect,
  GainResourcesEffect,
  HealDamageEffect,
  LoseResourcesEffect,
  ModifyDieValueEffect,
  RemoveDieEffect,
  RemoveShieldsEffect,
  RollCardDieEffect,
  SearchDeckEffect,
  TargetSpec,
  TurnDieEffect,
} from './types.js';

/**
 * Minimal catalog entry shape needed for die-roll ops.
 * Both CardFixture (test fixtures) and Card (production corpus) satisfy this.
 */
export interface CatalogDieEntry {
  readonly id: string;
  readonly dieFaces: readonly DieFace[] | null;
}

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
   * requiring an extra entry in characterTargets. For events, this is the
   * event card's instance ID (used by rollEventDie to find the catalog entry
   * via state.cardCatalogIds).
   */
  readonly sourceCharacterId?: string;
  /** Minimal catalog for die-roll ops. Tests pass an inline array; the
   * game-server passes the loaded corpus. Required for rollEventDie / rollCardDie. */
  readonly catalog?: readonly CatalogDieEntry[];
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
      return applyRollEventDie(state, ctx);
    case 'rollCardDie':
      return applyRollCardDie(state, ctx, effect);
    case 'removeDie':
      return applyRemoveDie(state, ctx, effect);
    case 'turnDie':
      return applyTurnDie(state, ctx, effect);
    case 'modifyDieValue':
      return applyModifyDieValue(state, ctx, effect);
    case 'searchDeck':
      return applySearchDeck(state, ctx, effect);
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

  for (let i = 0; i < effects.length; i++) {
    const hadSearch = current.pendingSearch !== null;
    const result = applyEffect(current, ctx, effects[i]!, targetOffset);
    current = result.state;
    allEvents.push(...result.events);
    targetOffset += result.targetsConsumed;

    // If a searchDeck effect just set pendingSearch, stash the remaining
    // effects into it and stop — execution resumes via resolve-search.
    if (!hadSearch && current.pendingSearch !== null) {
      current = {
        ...current,
        pendingSearch: {
          ...current.pendingSearch,
          remainingEffects: effects.slice(i + 1),
        },
      };
      break;
    }
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

  const targets = resolveCharacterTargets(state, ctx, effect.target, targetOffset, effect.criteria);
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
  const targets = resolveCharacterTargets(state, ctx, effect.target, targetOffset, effect.criteria);
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
  const targets = resolveCharacterTargets(state, ctx, effect.target, targetOffset, effect.criteria);
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
  const targets = resolveCharacterTargets(state, ctx, effect.target, targetOffset, effect.criteria);
  let current = state;
  for (const { ownerId, characterId } of targets) {
    current = healDamage(current, ownerId, characterId, effect.amount, events);
  }
  return { state: current, events, targetsConsumed: targets.consumed };
}

function applyRollEventDie(state: GameState, ctx: DispatchContext): EffectResult {
  if (!ctx.sourceCharacterId) {
    throw new Error('rollEventDie requires sourceCharacterId in context (the event card instance ID)');
  }
  if (!ctx.catalog) throw new Error('rollEventDie requires catalog in context');

  // sourceCharacterId is the event card's instance ID; look up the catalog ID via state.
  const catalogId = state.cardCatalogIds[ctx.sourceCharacterId];
  if (!catalogId) {
    throw new Error(`rollEventDie: no catalog mapping for card instance ${ctx.sourceCharacterId}`);
  }
  const card = ctx.catalog.find((c) => c.id === catalogId);
  if (!card) throw new Error(`rollEventDie: card ${catalogId} not found in catalog`);
  if (!card.dieFaces || card.dieFaces.length === 0) {
    throw new Error(`rollEventDie: card ${catalogId} has no dieFaces`);
  }

  const rng = createRng(state.seed).fork(`event-die:${state.turnIndex}:${ctx.sourceCharacterId}`);
  const faceIndex = rng.rollDie(card.dieFaces.length);
  const face = card.dieFaces[faceIndex]!;

  const newDie: DieInPool = {
    instanceId: `${ctx.sourceCharacterId}.transient`,
    cardId: catalogId,
    faceIndex,
    face,
    transient: true,
  };

  const player = state.players[ctx.playerId]!;
  const nextState = {
    ...state,
    players: { ...state.players, [ctx.playerId]: { ...player, diceInPool: [...player.diceInPool, newDie] } },
  };
  return { state: nextState, events: [], targetsConsumed: 0 };
}

function applyRollCardDie(state: GameState, ctx: DispatchContext, effect: RollCardDieEffect): EffectResult {
  if (!ctx.catalog) throw new Error('rollCardDie requires catalog in context');

  const card = ctx.catalog.find((c) => c.id === effect.cardId);
  if (!card) throw new Error(`rollCardDie: card "${effect.cardId}" not found in catalog`);
  if (!card.dieFaces || card.dieFaces.length === 0) {
    throw new Error(`rollCardDie: card "${effect.cardId}" has no dieFaces`);
  }

  const rng = createRng(state.seed).fork(`card-die:${state.turnIndex}:${effect.cardId}`);
  const faceIndex = rng.rollDie(card.dieFaces.length);
  const face = card.dieFaces[faceIndex]!;

  const newDie: DieInPool = {
    instanceId: `${effect.cardId}.transient`,
    cardId: effect.cardId,
    faceIndex,
    face,
    transient: true,
  };

  const player = state.players[ctx.playerId]!;
  const nextState = {
    ...state,
    players: { ...state.players, [ctx.playerId]: { ...player, diceInPool: [...player.diceInPool, newDie] } },
  };
  return { state: nextState, events: [], targetsConsumed: 0 };
}

// ────────────────────────────────────────────────────────────────────
// Targeting criteria helpers (ENGINE-TF1)
// ────────────────────────────────────────────────────────────────────

/** Returns true when the die satisfies all fields in the criteria. */
export function matchesDieCriteria(die: DieInPool, criteria: DieCriteria | undefined, state: GameState): boolean {
  if (!criteria) return true;

  const { symbol, minValue, maxValue, modifier, ownerCardType, ownerColor, ownerSubtype } = criteria;

  if (symbol !== undefined) {
    const set = Array.isArray(symbol) ? symbol : [symbol];
    if (!set.includes(die.face.symbol)) return false;
  }
  if (minValue !== undefined && die.face.value < minValue) return false;
  if (maxValue !== undefined && die.face.value > maxValue) return false;
  if (modifier !== undefined && die.face.modifier !== modifier) return false;

  if (ownerCardType !== undefined || ownerColor !== undefined || ownerSubtype !== undefined) {
    const meta = die.ownerInstanceId ? state.cardMeta[die.ownerInstanceId] : undefined;
    if (!meta) return false;
    if (ownerCardType !== undefined) {
      const set = Array.isArray(ownerCardType) ? ownerCardType : [ownerCardType];
      if (!set.includes(meta.type)) return false;
    }
    if (ownerColor !== undefined) {
      const set = Array.isArray(ownerColor) ? ownerColor : [ownerColor];
      if (!set.includes(meta.color)) return false;
    }
    if (ownerSubtype !== undefined && !meta.subtypes.includes(ownerSubtype)) return false;
  }

  return true;
}

/** Returns true when the character/support satisfies all fields in the criteria. */
export function matchesCardCriteria(
  charId: string,
  ownerId: string,
  state: GameState,
  criteria: CardCriteria | undefined,
): boolean {
  if (!criteria) return true;

  const player = state.players[ownerId];
  const charState = player?.characters[charId] ?? player?.supports[charId];
  if (!charState) return false;

  const { subtype, color, unique, exhausted, hasUpgrade, minHealth, maxDamage } = criteria;

  if (exhausted !== undefined && charState.exhausted !== exhausted) return false;

  if ('damage' in charState) {
    if (minHealth !== undefined && charState.health - charState.damage < minHealth) return false;
    if (maxDamage !== undefined && charState.damage > maxDamage) return false;
    if (hasUpgrade !== undefined && (charState.upgradeIds.length > 0) !== hasUpgrade) return false;
  }

  const meta = state.cardMeta[charId];
  if (subtype !== undefined || color !== undefined || unique !== undefined) {
    if (!meta) return false;
    if (unique !== undefined && meta.isUnique !== unique) return false;
    if (color !== undefined) {
      const set = Array.isArray(color) ? color : [color];
      if (!set.includes(meta.color)) return false;
    }
    if (subtype !== undefined) {
      const set = Array.isArray(subtype) ? subtype : [subtype];
      if (!set.some((s) => meta.subtypes.includes(s))) return false;
    }
  }

  return true;
}

function applyRemoveDie(state: GameState, ctx: DispatchContext, effect: RemoveDieEffect): EffectResult {
  const targetPlayerId =
    effect.from === 'ownPool' ? ctx.playerId : (opponentOf(state, ctx.playerId) ?? ctx.playerId);
  const player = state.players[targetPlayerId]!;
  const count = effect.count ?? 1;

  const remaining: DieInPool[] = [];
  const removed: DieInPool[] = [];
  for (const die of player.diceInPool) {
    if (removed.length < count && matchesDieCriteria(die, effect.criteria, state)) {
      removed.push(die);
    } else {
      remaining.push(die);
    }
  }

  const events: EngineEvent[] = removed.map((d) => ({
    type: 'die.removed' as const,
    payload: { playerId: targetPlayerId, dieInstanceId: d.instanceId, face: d.face },
  }));

  const next: GameState = {
    ...state,
    players: { ...state.players, [targetPlayerId]: { ...player, diceInPool: remaining } },
  };
  return { state: next, events, targetsConsumed: 0 };
}

function applyTurnDie(state: GameState, ctx: DispatchContext, effect: TurnDieEffect): EffectResult {
  const targetPlayerId =
    effect.from === 'ownPool' ? ctx.playerId : (opponentOf(state, ctx.playerId) ?? ctx.playerId);
  const player = state.players[targetPlayerId]!;
  const count = effect.count ?? 1;

  let turned = 0;
  const events: EngineEvent[] = [];
  const newPool = player.diceInPool.map((die) => {
    if (turned >= count) return die;
    if (!matchesDieCriteria(die, effect.criteria, state)) return die;
    turned++;
    const fromSymbol = die.face.symbol;
    events.push({
      type: 'die.turned' as const,
      payload: { playerId: targetPlayerId, dieInstanceId: die.instanceId, fromSymbol, toSymbol: effect.toSymbol },
    });
    return { ...die, faceIndex: -1, face: { ...die.face, symbol: effect.toSymbol as DieFace['symbol'] } };
  });

  const next: GameState = {
    ...state,
    players: { ...state.players, [targetPlayerId]: { ...player, diceInPool: newPool } },
  };
  return { state: next, events, targetsConsumed: 0 };
}

function applyModifyDieValue(state: GameState, ctx: DispatchContext, effect: ModifyDieValueEffect): EffectResult {
  const targetPlayerId =
    effect.from === 'ownPool' ? ctx.playerId : (opponentOf(state, ctx.playerId) ?? ctx.playerId);
  const player = state.players[targetPlayerId]!;
  const count = effect.count ?? 1;

  let modified = 0;
  const events: EngineEvent[] = [];
  const newPool = player.diceInPool.map((die) => {
    if (modified >= count) return die;
    if (die.face.symbol === 'blank') return die;
    if (!matchesDieCriteria(die, effect.criteria, state)) return die;
    modified++;
    const newValue = Math.max(0, die.face.value + effect.delta);
    events.push({
      type: 'die.value-modified' as const,
      payload: { playerId: targetPlayerId, dieInstanceId: die.instanceId, delta: effect.delta, newValue },
    });
    return { ...die, face: { ...die.face, value: newValue } };
  });

  const next: GameState = {
    ...state,
    players: { ...state.players, [targetPlayerId]: { ...player, diceInPool: newPool } },
  };
  return { state: next, events, targetsConsumed: 0 };
}

// ────────────────────────────────────────────────────────────────────
// ENGINE-DS1: deck search / reveal
// ────────────────────────────────────────────────────────────────────

function applySearchDeck(state: GameState, ctx: DispatchContext, effect: SearchDeckEffect): EffectResult {
  const sourcePlayerId =
    effect.source === 'ownDeck'
      ? ctx.playerId
      : (state.playerOrder.find((id) => id !== ctx.playerId) ?? ctx.playerId);

  const sourcePlayer = state.players[sourcePlayerId]!;
  const sourceDeck = [...sourcePlayer.deck];

  // Determine how many cards to reveal.
  const maxReveal = effect.revealCount === 'all' ? sourceDeck.length : effect.revealCount;
  const revealed: string[] = [];

  for (let i = 0; i < maxReveal && i < sourceDeck.length; i++) {
    revealed.push(sourceDeck[i]!);
    // Check early-stop condition from revealUntil.
    if (effect.revealUntil) {
      const { type: filterType, color: filterColor, count: stopCount } = effect.revealUntil;
      const matchCount = revealed.filter((cid) => {
        if (filterType && state.cardTypes[cid] !== filterType) return false;
        if (filterColor && state.cardMeta[cid]?.color !== filterColor) return false;
        return true;
      }).length;
      if (matchCount >= stopCount) break;
    }
  }

  // Remove revealed cards from the source deck.
  const newSourceDeck = sourceDeck.slice(revealed.length);
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [sourcePlayerId]: { ...sourcePlayer, deck: newSourceDeck },
    },
    pendingSearch: {
      waitingForPlayerId: ctx.playerId,
      revealedCardIds: revealed,
      source: effect.source,
      choices: effect.choices,
      defaultDisposition: effect.defaultDisposition,
      remainingEffects: [], // populated by applyEffects after this returns
      resumePlayerId: ctx.playerId,
    } satisfies PendingSearch,
  };

  const events: EngineEvent[] = [
    { type: 'deck.searched', payload: { playerId: ctx.playerId, source: effect.source, revealedCount: revealed.length } },
    { type: 'cards.revealed', payload: { playerId: ctx.playerId, cardIds: revealed } },
  ];

  return { state: nextState, events, targetsConsumed: 0 };
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
  criteria?: CardCriteria,
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
      if (!matchesCardCriteria(characterId, ownerId, state, criteria)) {
        throw new Error(`character ${characterId} does not meet the effect's targeting criteria`);
      }
      result.push({ ownerId, characterId });
      result.consumed = 1;
      break;
    }
    case 'eachOpponentCharacter': {
      const oppId = opponentOf(state, ctx.playerId);
      if (oppId) {
        for (const charId of state.players[oppId]?.characterOrder ?? []) {
          if (matchesCardCriteria(charId, oppId, state, criteria)) {
            result.push({ ownerId: oppId, characterId: charId });
          }
        }
      }
      result.consumed = 0;
      break;
    }
    case 'eachCharacter': {
      for (const pid of state.playerOrder) {
        for (const charId of state.players[pid]?.characterOrder ?? []) {
          if (matchesCardCriteria(charId, pid, state, criteria)) {
            result.push({ ownerId: pid, characterId: charId });
          }
        }
      }
      result.consumed = 0;
      break;
    }
    case 'attachedCharacter':
    case 'thisCharacter': {
      const characterId = ctx.sourceCharacterId ?? ctx.characterTargets[targetOffset];
      if (!characterId) throw new Error(`effect needs an attached/this-character target at index ${targetOffset}`);
      const ownerId = ownerOf(state, characterId);
      if (!ownerId) throw new Error(`character ${characterId} is not in play`);
      result.push({ ownerId, characterId });
      result.consumed = 1;
      break;
    }
    default:
      throw new Error(`resolveCharacterTargets: target kind "${spec.kind}" is not a character target`);
  }

  return result;
}
