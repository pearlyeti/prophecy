import { applyEffects } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import { drainQueue } from '../queue/drain.js';
import { collectAfterTriggers, collectBeforeTriggers, commitTriggers } from '../queue/scan.js';
import { addShields, adjustResources, dealDamage, ownerOf } from '../state/combat.js';
import { endTurn } from '../state/turn.js';
import type { DieInPool, GameState, PlayerState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';
import { guardCanAct, runUpkeepAndStartRound, type ApplyResult } from './pass.js';

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

  // Split modifiers from non-modifiers so we can enforce the rule
  // explicitly: a symboled modifier needs a same-symbol non-modifier
  // in the selection; a symbolless modifier ('modifier' symbol) needs
  // ANY non-modifier with value > 0 (special and blank are value 0 and
  // never qualify). Non-modifiers among themselves still have to share
  // one symbol for v1 (card-routed mixed-symbol resolutions land later).
  const nonModifiers = dice.filter((d) => !d.face.modifier);
  const modifiers = dice.filter((d) => d.face.modifier);

  if (nonModifiers.length === 0) {
    throw new IllegalActionError(
      'a modifier die cannot resolve without a non-modifier in the selection',
    );
  }

  const nonModSymbols = new Set(nonModifiers.map((d) => d.face.symbol));
  if (nonModSymbols.size > 1) {
    throw new IllegalActionError('all non-modifier dice resolved together must share a symbol');
  }
  const symbol = nonModifiers[0]!.face.symbol;

  if (symbol === 'blank') {
    throw new IllegalActionError('blank dice cannot be resolved');
  }
  if (
    symbol === 'special' ||
    symbol === 'focus' ||
    symbol === 'indirect' ||
    symbol === 'discard' ||
    symbol === 'draw'
  ) {
    throw new IllegalActionError(`resolving "${symbol}" is not yet implemented`);
  }
  if (symbol === 'modifier') {
    // A non-modifier face whose symbol claims it's a "modifier" face is
    // a data-shape invariant violation, not a player-illegal action.
    throw new Error(
      `data invariant: a non-modifier die has symbol 'modifier' (instance ${nonModifiers[0]!.instanceId})`,
    );
  }

  const valuedNonMods = nonModifiers.filter((d) => d.face.value > 0);
  for (const m of modifiers) {
    if (m.face.symbol === 'modifier') {
      // Symbolless wild modifier — needs ANY valued non-modifier in selection.
      if (valuedNonMods.length === 0) {
        throw new IllegalActionError(
          'a symbolless modifier needs a non-modifier with a value in the selection',
        );
      }
    } else if (m.face.symbol !== symbol) {
      throw new IllegalActionError(
        `modifier (${m.face.symbol}) cannot resolve without a non-modifier of its symbol`,
      );
    }
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
      // Before triggers: run inline before damage lands.
      const beforeCandidates = collectBeforeTriggers(working, 'beforeTakeDamage', {
        targetCharacterId,
        targetOwnerId: ownerId,
      });
      const sortedBefore = [...beforeCandidates].sort((a, b) =>
        a.sourceCardInstanceId.localeCompare(b.sourceCardInstanceId),
      );
      for (const candidate of sortedBefore) {
        const ctx = {
          playerId: candidate.playerId,
          characterTargets: [],
          sourceCharacterId: candidate.sourceCardInstanceId,
        };
        const r = applyEffects(working, ctx, candidate.ability.effects);
        working = r.state;
        events.push(...r.events);
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
  const remainingDice = post.diceInPool.filter((d) => !removed.has(d.instanceId) && !d.transient);
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

  // If dealing damage already ended the game, skip triggers + rotation.
  if (finalState.winnerId !== null) {
    return { state: finalState, events };
  }

  // After triggers: scan the emitted events for after-trigger matches.
  const afterCandidates = collectAfterTriggers(finalState, events);
  finalState = commitTriggers(finalState, afterCandidates);

  if (!finalState.pendingTriggers) {
    const drained = drainQueue(finalState);
    finalState = drained.state;
    events.push(...drained.events);
  }

  if (finalState.winnerId !== null) {
    return { state: finalState, events };
  }

  const rotated = endTurn(finalState, playerId, events);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
