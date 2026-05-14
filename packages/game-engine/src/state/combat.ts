// Shared combat helpers used by both applyResolveDice and the ability
// dispatcher. Keeping them here avoids duplication and ensures the two
// code paths apply damage, shields, and resources identically.

import type { EngineEvent } from '../events';
import type { CharacterState, GameState, PlayerState } from './types';

export const MAX_SHIELDS = 3;

// ────────────────────────────────────────────────────────────────────
// Resource management
// ────────────────────────────────────────────────────────────────────

export function adjustResources(state: GameState, playerId: string, delta: number): GameState {
  const p = state.players[playerId];
  if (!p) return state;
  const next: PlayerState = { ...p, resources: Math.max(0, p.resources + delta) };
  return { ...state, players: { ...state.players, [playerId]: next } };
}

// ────────────────────────────────────────────────────────────────────
// Shield management
// ────────────────────────────────────────────────────────────────────

export function addShields(
  state: GameState,
  ownerId: string,
  characterId: string,
  amount: number,
  events: EngineEvent[],
): GameState {
  const player = state.players[ownerId];
  if (!player) return state;
  const c = player.characters[characterId];
  if (!c) return state;
  const added = Math.min(MAX_SHIELDS - c.shields, amount);
  events.push({ type: 'shields.placed', payload: { characterId, amount: added } });
  if (added <= 0) return state;
  const updated: CharacterState = { ...c, shields: c.shields + added };
  return {
    ...state,
    players: {
      ...state.players,
      [ownerId]: { ...player, characters: { ...player.characters, [characterId]: updated } },
    },
  };
}

export function removeShields(
  state: GameState,
  ownerId: string,
  characterId: string,
  amount: number | 'all',
  events: EngineEvent[],
): GameState {
  const player = state.players[ownerId];
  if (!player) return state;
  const c = player.characters[characterId];
  if (!c) return state;
  const removed = amount === 'all' ? c.shields : Math.min(c.shields, amount);
  events.push({ type: 'shields.removed', payload: { characterId, amount: removed } });
  if (removed === 0) return state;
  const updated: CharacterState = { ...c, shields: c.shields - removed };
  return {
    ...state,
    players: {
      ...state.players,
      [ownerId]: { ...player, characters: { ...player.characters, [characterId]: updated } },
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// Damage / healing
// ────────────────────────────────────────────────────────────────────

export function dealDamage(
  state: GameState,
  ownerId: string,
  characterId: string,
  amount: number,
  events: EngineEvent[],
  unblockable = false,
): GameState {
  const owner = state.players[ownerId];
  if (!owner) return state;
  const c = owner.characters[characterId];
  if (!c) return state;
  const shieldsUsed = unblockable ? 0 : Math.min(c.shields, amount);
  const damageDealt = amount - shieldsUsed;
  const newDamage = c.damage + damageDealt;
  const newShields = c.shields - shieldsUsed;

  events.push({
    type: 'damage.dealt',
    payload: { characterId, amount: damageDealt, shieldsBlocked: shieldsUsed },
  });

  if (newDamage >= c.health) {
    return defeatCharacter(state, ownerId, characterId, events);
  }

  const updated: CharacterState = { ...c, damage: newDamage, shields: newShields };
  return {
    ...state,
    players: {
      ...state.players,
      [ownerId]: { ...owner, characters: { ...owner.characters, [characterId]: updated } },
    },
  };
}

export function healDamage(
  state: GameState,
  ownerId: string,
  characterId: string,
  amount: number,
  events: EngineEvent[],
): GameState {
  const owner = state.players[ownerId];
  if (!owner) return state;
  const c = owner.characters[characterId];
  if (!c) return state;
  const healed = Math.min(c.damage, amount);
  events.push({ type: 'damage.healed', payload: { characterId, amount: healed } });
  if (healed === 0) return state;
  const updated: CharacterState = { ...c, damage: c.damage - healed };
  return {
    ...state,
    players: {
      ...state.players,
      [ownerId]: { ...owner, characters: { ...owner.characters, [characterId]: updated } },
    },
  };
}

export function defeatCharacter(
  state: GameState,
  ownerId: string,
  characterId: string,
  events: EngineEvent[],
): GameState {
  const owner = state.players[ownerId];
  if (!owner) return state;
  const character = owner.characters[characterId];
  if (!character) return state;

  events.push({ type: 'character.defeated', payload: { playerId: ownerId, characterId } });

  const dieIds = new Set(character.dice.map((d) => d.instanceId));
  const newOrder = owner.characterOrder.filter((id) => id !== characterId);
  const { [characterId]: _dropped, ...remainingChars } = owner.characters;
  const newPool = owner.diceInPool.filter((d) => !dieIds.has(d.instanceId));

  const updated: PlayerState = {
    ...owner,
    characters: remainingChars,
    characterOrder: newOrder,
    diceInPool: newPool,
  };

  let next: GameState = {
    ...state,
    players: { ...state.players, [ownerId]: updated },
  };

  if (newOrder.length === 0) {
    const winnerId = state.playerOrder.find((p) => p !== ownerId) ?? null;
    events.push({
      type: 'game.ended',
      payload: { winnerId, reason: 'all-characters-defeated' },
    });
    next = { ...next, winnerId, phase: 'ended' };
  }
  return next;
}

// ────────────────────────────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────────────────────────────

export function ownerOf(state: GameState, characterId: string): string | null {
  for (const id of state.playerOrder) {
    if (state.players[id]?.characters[characterId]) return id;
  }
  return null;
}

export function opponentOf(state: GameState, playerId: string): string | null {
  return state.playerOrder.find((id) => id !== playerId) ?? null;
}
