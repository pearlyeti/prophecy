import type { EngineEvent } from '../events';
import { endTurn } from '../state/turn';
import type { CharacterState, DieInPool, GameState, PlayerState } from '../state/types';
import { IllegalActionError } from './illegal';
import { guardCanAct, runUpkeepAndStartRound, type ApplyResult } from './pass';

const MAX_SHIELDS = 3;

/**
 * Resolve one or more dice in the player's pool.
 *
 * Per the rules document: dice resolved together must share a symbol;
 * a modifier (+N) face cannot resolve alone. Resource costs on faces
 * are paid from the player's resources before effects apply.
 *
 * v1 supports: melee, ranged, shield, resource, disrupt. Special,
 * focus, indirect, discard, and blank throw IllegalActionError —
 * each needs its own follow-up slice (special needs ability resolvers,
 * focus needs a face-selection UI, indirect needs opponent-distributes
 * flow, discard needs per-card hand tracking).
 *
 * Damage application:
 * - Combined value (sum of face values across all resolved dice).
 * - Shields block damage 1-for-1 (rules: shields used before damage).
 * - Excess damage reduces remaining health.
 * - On `damage >= health`, the character is defeated: removed from
 *   characterOrder, its dice removed from the pool, the player loses
 *   when no characters remain.
 *
 * Targeting v1: one target character for the whole action. The rules
 * allow per-die targeting; that comes when the UI does too.
 */
export function applyResolveDice(
  state: GameState,
  playerId: string,
  dieInstanceIds: readonly string[],
  targetCharacterId: string | undefined,
): ApplyResult {
  guardCanAct(state, playerId);

  if (dieInstanceIds.length === 0) {
    throw new IllegalActionError('must select at least one die to resolve');
  }

  const player = state.players[playerId];
  if (!player) throw new Error(`player ${playerId} missing from state`);

  const dice: DieInPool[] = dieInstanceIds.map((id) => {
    const d = player.diceInPool.find((p) => p.instanceId === id);
    if (!d) throw new IllegalActionError(`die ${id} is not in your pool`);
    return d;
  });

  const symbol = dice[0]!.face.symbol;
  if (!dice.every((d) => d.face.symbol === symbol)) {
    throw new IllegalActionError('all resolved dice must share a symbol');
  }
  if (dice.every((d) => d.face.modifier)) {
    throw new IllegalActionError('a modifier die cannot resolve without a non-modifier of the same symbol');
  }
  if (symbol === 'blank') {
    throw new IllegalActionError('blank dice cannot be resolved');
  }
  if (symbol === 'special' || symbol === 'focus' || symbol === 'indirect' || symbol === 'discard') {
    throw new IllegalActionError(`resolving "${symbol}" is not yet implemented`);
  }

  const totalCost = dice.reduce((s, d) => s + d.face.cost, 0);
  if (player.resources < totalCost) {
    throw new IllegalActionError(
      `pool cost is ${totalCost} but ${playerId} has only ${player.resources} resources`,
    );
  }

  const totalValue = dice.reduce((s, d) => s + d.face.value, 0);

  // Effects apply against a copy of state; we then pay cost and remove
  // dice from the pool, then rotate.
  let working = state;
  const events: EngineEvent[] = [
    {
      type: 'dice.resolved',
      payload: { playerId, dieInstanceIds: [...dieInstanceIds], symbol, totalValue, totalCost },
    },
  ];

  switch (symbol) {
    case 'melee':
    case 'ranged': {
      if (!targetCharacterId) {
        throw new IllegalActionError(`${symbol} damage requires a target character`);
      }
      const ownerId = ownerOf(state, targetCharacterId);
      if (!ownerId) {
        throw new IllegalActionError(`character ${targetCharacterId} is not in play`);
      }
      working = dealDamage(working, ownerId, targetCharacterId, totalValue, events);
      break;
    }
    case 'shield': {
      if (!targetCharacterId) {
        throw new IllegalActionError('shield placement requires a target character');
      }
      const ownerId = ownerOf(state, targetCharacterId);
      if (ownerId !== playerId) {
        throw new IllegalActionError('shields can only be placed on your own characters');
      }
      working = addShields(working, playerId, targetCharacterId, totalValue, events);
      break;
    }
    case 'resource': {
      working = adjustResources(working, playerId, +totalValue);
      events.push({ type: 'resources.gained', payload: { playerId, amount: totalValue } });
      break;
    }
    case 'disrupt': {
      const oppId = state.playerOrder.find((p) => p !== playerId);
      if (!oppId) throw new Error('disrupt: no opponent in playerOrder');
      const oppRes = state.players[oppId]?.resources ?? 0;
      const lost = Math.min(oppRes, totalValue);
      working = adjustResources(working, oppId, -lost);
      events.push({ type: 'resources.lost', payload: { playerId: oppId, amount: lost } });
      break;
    }
  }

  // Pay the dice costs and remove the resolved dice from the player's
  // pool. Defeated characters in dealDamage may have already removed
  // *their* dice from the pool — re-fetch the player.
  const post = working.players[playerId];
  if (!post) throw new Error(`resolver lost track of player ${playerId}`);
  const removed = new Set(dieInstanceIds);
  const remainingDice = post.diceInPool.filter((d) => !removed.has(d.instanceId));
  const finalPlayer: PlayerState = {
    ...post,
    resources: post.resources - totalCost,
    diceInPool: remainingDice,
  };
  let finalState: GameState = {
    ...working,
    players: { ...working.players, [playerId]: finalPlayer },
    consecutivePasses: 0,
  };

  // If dealing damage already ended the game, skip the turn rotation.
  if (finalState.winnerId !== null) {
    return { state: finalState, events };
  }

  const rotated = endTurn(finalState, playerId, events);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function ownerOf(state: GameState, characterId: string): string | null {
  for (const id of state.playerOrder) {
    if (state.players[id]?.characters[characterId]) return id;
  }
  return null;
}

function adjustResources(state: GameState, playerId: string, delta: number): GameState {
  const p = state.players[playerId];
  if (!p) return state;
  const next: PlayerState = { ...p, resources: Math.max(0, p.resources + delta) };
  return { ...state, players: { ...state.players, [playerId]: next } };
}

function addShields(
  state: GameState,
  playerId: string,
  characterId: string,
  amount: number,
  events: EngineEvent[],
): GameState {
  const player = state.players[playerId]!;
  const c = player.characters[characterId]!;
  const added = Math.min(MAX_SHIELDS - c.shields, amount);
  if (added <= 0) {
    // No room — rules: excess shields are ignored. Still emit the
    // event so the UI knows the action resolved.
    events.push({ type: 'shields.placed', payload: { characterId, amount: 0 } });
    return state;
  }
  const updated: CharacterState = { ...c, shields: c.shields + added };
  events.push({ type: 'shields.placed', payload: { characterId, amount: added } });
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        characters: { ...player.characters, [characterId]: updated },
      },
    },
  };
}

function dealDamage(
  state: GameState,
  ownerId: string,
  characterId: string,
  amount: number,
  events: EngineEvent[],
): GameState {
  const owner = state.players[ownerId]!;
  const c = owner.characters[characterId]!;
  const shieldsUsed = Math.min(c.shields, amount);
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
      [ownerId]: {
        ...owner,
        characters: { ...owner.characters, [characterId]: updated },
      },
    },
  };
}

function defeatCharacter(
  state: GameState,
  ownerId: string,
  characterId: string,
  events: EngineEvent[],
): GameState {
  const owner = state.players[ownerId]!;
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
