import { applySteps } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import { drainQueue } from '../queue/drain.js';
import { collectAfterTriggers, collectBeforeTriggers, commitTriggers } from '../queue/scan.js';
import {
  addShields,
  addSupportShields,
  adjustResources,
  dealDamage,
  ownerOf,
  reduceSupportStability,
  supportOwnerOf,
} from '../state/combat.js';
import { endTurn } from '../state/turn.js';
import type { DieInPool, GameState, PlayerState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';
import { guardCanAct, runUpkeepAndStartRound, type ApplyResult } from './pass.js';

/**
 * Resolve one or more dice in the player's pool, optionally against multiple targets.
 *
 * `targets` is the normalized multi-target shape from apply-action.ts. Each entry
 * groups one or more dice against a single targetCharacterId. All dice across all
 * groups must share a symbol; per-group values are applied independently so each
 * target character only receives damage / shields from its assigned dice.
 *
 * v1 supports: melee, ranged, shield, resource, disrupt, focus. Special,
 * indirect, discard, and blank throw IllegalActionError.
 */
export function applyResolveDice(
  state: GameState,
  playerId: string,
  targets: readonly {
    readonly dieInstanceIds: readonly string[];
    readonly targetCharacterId?: string;
    readonly targetSupportId?: string;
  }[],
  focusFlips?: readonly { readonly targetDieInstanceId: string; readonly faceIndex: number }[],
): ApplyResult {
  guardCanAct(state, playerId);

  const allDieInstanceIds = targets.flatMap((t) => [...t.dieInstanceIds]);

  if (allDieInstanceIds.length === 0) {
    throw new IllegalActionError('must select at least one die to resolve');
  }

  const player = state.players[playerId];
  if (!player) throw new Error(`player ${playerId} missing from state`);

  // Look up all dice across every target group.
  const allDice: DieInPool[] = allDieInstanceIds.map((id) => {
    const d = player.diceInPool.find((p) => p.instanceId === id);
    if (!d) throw new IllegalActionError(`die ${id} is not in your pool`);
    return d;
  });

  // Split modifiers from non-modifiers. Validation is across the full
  // combined selection — all dice in all groups must share one symbol.
  const nonModifiers = allDice.filter((d) => !d.face.modifier);
  const modifiers = allDice.filter((d) => d.face.modifier);

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
  if (symbol === 'indirect' || symbol === 'draw') {
    throw new IllegalActionError(`resolving "${symbol}" is not yet implemented`);
  }
  if (symbol === 'modifier') {
    throw new Error(
      `data invariant: a non-modifier die has symbol 'modifier' (instance ${nonModifiers[0]!.instanceId})`,
    );
  }

  const valuedNonMods = nonModifiers.filter((d) => d.face.value > 0);
  for (const m of modifiers) {
    if (m.face.symbol === 'modifier') {
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

  const totalCost = allDice.reduce((s, d) => s + d.face.cost, 0);
  if (player.resources < totalCost) {
    throw new IllegalActionError(
      `pool cost is ${totalCost} but ${playerId} has only ${player.resources} resources`,
    );
  }

  const totalValue = allDice.reduce((s, d) => s + d.face.value, 0);

  let working = state;
  const events: EngineEvent[] = [
    {
      type: 'dice.resolved',
      payload: { playerId, dieInstanceIds: allDieInstanceIds, symbol, totalValue, totalCost },
    },
  ];

  switch (symbol) {
    case 'focus': {
      // Focus uses the flat die IDs as focusers; focusFlips carries the face choices.
      const focuserSet = new Set(allDieInstanceIds);
      const flips = focusFlips ?? [];
      let pool = [...(working.players[playerId]?.diceInPool ?? [])];

      for (const flip of flips) {
        const idx = pool.findIndex((d) => d.instanceId === flip.targetDieInstanceId);
        if (idx < 0) {
          throw new IllegalActionError(`target die ${flip.targetDieInstanceId} is not in the pool`);
        }
        const targetDie = pool[idx]!;

        if (focuserSet.has(targetDie.instanceId)) {
          throw new IllegalActionError(`a focus die cannot target itself (${targetDie.instanceId})`);
        }

        const ownerChar = targetDie.ownerInstanceId
          ? working.players[playerId]?.characters[targetDie.ownerInstanceId]
          : undefined;
        const dieSpec = ownerChar?.dice.find((d) => d.instanceId === targetDie.instanceId);
        if (!dieSpec) {
          throw new IllegalActionError(`cannot find die spec for ${flip.targetDieInstanceId}`);
        }
        if (flip.faceIndex < 0 || flip.faceIndex >= dieSpec.faces.length) {
          throw new IllegalActionError(
            `face index ${flip.faceIndex} out of range for die ${flip.targetDieInstanceId}`,
          );
        }

        pool[idx] = { ...targetDie, faceIndex: flip.faceIndex, face: dieSpec.faces[flip.faceIndex]! };
      }

      working = {
        ...working,
        players: {
          ...working.players,
          [playerId]: { ...working.players[playerId]!, diceInPool: pool },
        },
      };
      break;
    }

    case 'melee':
    case 'ranged': {
      // Iterate over target groups; apply each group's dice value to its character.
      for (const group of targets) {
        if (!group.targetCharacterId) {
          throw new IllegalActionError(`${symbol} damage requires a target character`);
        }
        const ownerId = ownerOf(working, group.targetCharacterId);
        if (!ownerId) {
          throw new IllegalActionError(`character ${group.targetCharacterId} is not in play`);
        }

        const groupValue = group.dieInstanceIds.reduce((s, id) => {
          const d = allDice.find((die) => die.instanceId === id);
          return s + (d?.face.value ?? 0);
        }, 0);

        // Before triggers fire per-group, before that group's damage lands.
        const beforeCandidates = collectBeforeTriggers(working, 'beforeTakeDamage', {
          targetCharacterId: group.targetCharacterId,
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
          const r = applySteps(working, ctx, candidate.ability.steps);
          working = r.state;
          events.push(...r.events);
        }

        working = dealDamage(working, ownerId, group.targetCharacterId, groupValue, events);

        // If this group's damage ended the game, stop processing further groups.
        if (working.winnerId !== null) break;
      }
      break;
    }

    case 'shield': {
      for (const group of targets) {
        const groupValue = group.dieInstanceIds.reduce((s, id) => {
          const d = allDice.find((die) => die.instanceId === id);
          return s + (d?.face.value ?? 0);
        }, 0);

        if (group.targetSupportId) {
          // Shield placed on own support.
          const ownerId = supportOwnerOf(working, group.targetSupportId);
          if (ownerId !== playerId) {
            throw new IllegalActionError('shields can only be placed on your own supports');
          }
          working = addSupportShields(working, playerId, group.targetSupportId, groupValue, events);
        } else {
          if (!group.targetCharacterId) {
            throw new IllegalActionError('shield placement requires a target character or support');
          }
          const ownerId = ownerOf(working, group.targetCharacterId);
          if (ownerId !== playerId) {
            throw new IllegalActionError('shields can only be placed on your own characters');
          }
          working = addShields(working, playerId, group.targetCharacterId, groupValue, events);
        }
      }
      break;
    }

    case 'resource': {
      working = adjustResources(working, playerId, +totalValue);
      events.push({ type: 'resources.gained', payload: { playerId, amount: totalValue } });
      break;
    }

    case 'disrupt': {
      const firstTarget = targets[0];
      if (firstTarget?.targetSupportId) {
        // Disrupt targeting a support reduces its stability.
        const ownerId = supportOwnerOf(working, firstTarget.targetSupportId);
        if (!ownerId || ownerId === playerId) {
          throw new IllegalActionError('disrupt support must target an opponent support');
        }
        working = reduceSupportStability(working, ownerId, firstTarget.targetSupportId, totalValue, events);
      } else {
        const oppId = state.playerOrder.find((p) => p !== playerId);
        if (!oppId) throw new Error('disrupt: no opponent in playerOrder');
        const oppRes = state.players[oppId]?.resources ?? 0;
        const lost = Math.min(oppRes, totalValue);
        working = adjustResources(working, oppId, -lost);
        events.push({ type: 'resources.lost', payload: { playerId: oppId, amount: lost } });
      }
      break;
    }

    case 'discard': {
      const firstTarget = targets[0];
      if (firstTarget?.targetSupportId) {
        // Discard targeting a support reduces its stability.
        const ownerId = supportOwnerOf(working, firstTarget.targetSupportId);
        if (!ownerId || ownerId === playerId) {
          throw new IllegalActionError('discard support must target an opponent support');
        }
        working = reduceSupportStability(working, ownerId, firstTarget.targetSupportId, totalValue, events);
      } else {
        throw new IllegalActionError('resolving "discard" against opponent hand is not yet implemented');
      }
      break;
    }

    case 'special': {
      // For each resolved die, look up the owning card's special ability and fire it.
      for (const die of nonModifiers) {
        const ownerId = die.ownerInstanceId;
        if (!ownerId) continue;
        const abilities = working.cardAbilities[ownerId] ?? [];
        const specialAbility = abilities.find((a) => a.kind === 'special');
        if (!specialAbility || specialAbility.kind !== 'special') continue;
        const ctx = { playerId, characterTargets: [] as string[], sourceCharacterId: ownerId };
        const result = applySteps(working, ctx, specialAbility.steps);
        working = result.state;
        events.push(...result.events);
      }
      break;
    }
  }

  // Pay the dice costs and remove all resolved dice from the player's pool.
  // dealDamage may have already removed dice belonging to defeated characters;
  // re-fetch the player from working state.
  const post = working.players[playerId];
  if (!post) throw new Error(`resolver lost track of player ${playerId}`);
  const removed = new Set(allDieInstanceIds);
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

  if (finalState.winnerId !== null) {
    return { state: finalState, events };
  }

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
