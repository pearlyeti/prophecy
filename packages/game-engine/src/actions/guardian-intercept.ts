import { dealDamage } from '../state/combat.js';
import type { EngineEvent } from '../events.js';
import type { GameState, PlayerState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';
import { performCharacterActivation } from './activate.js';
import type { ApplyResult } from './pass.js';

/**
 * Resolve a Guardian intercept decision.
 *
 * The pending Guardian was set by applyActivate when the activating character
 * has the `guardian` keyword and the opponent has at least one damage die.
 * The owning player chooses to either:
 *   - Intercept: remove a specific opponent die and take damage equal to its value.
 *   - Skip: proceed with activation immediately without taking damage.
 */
export function applyGuardianIntercept(
  state: GameState,
  playerId: string,
  dieInstanceId: string | null,
): ApplyResult {
  const pending = state.pendingGuardian;
  if (!pending) {
    throw new IllegalActionError('no guardian intercept is pending');
  }
  if (pending.activatingPlayerId !== playerId) {
    throw new IllegalActionError(`guardian intercept must be submitted by the activating player (${pending.activatingPlayerId})`);
  }

  const { activatingCharacterId, activatingPlayerId } = pending;
  let working: GameState = { ...state, pendingGuardian: null };
  const allEvents: EngineEvent[] = [];

  if (dieInstanceId !== null) {
    // Find the die in the opponent's pool.
    const oppId = working.playerOrder.find((id) => id !== activatingPlayerId);
    if (!oppId) throw new Error('no opponent found');
    const oppPlayer = working.players[oppId];
    if (!oppPlayer) throw new Error(`opponent ${oppId} missing from state`);

    const dieIndex = oppPlayer.diceInPool.findIndex((d) => d.instanceId === dieInstanceId);
    if (dieIndex === -1) {
      throw new IllegalActionError(`die ${dieInstanceId} is not in the opponent's pool`);
    }
    const die = oppPlayer.diceInPool[dieIndex]!;
    const damageAmount = die.face.value;

    // Remove the die from the opponent's pool.
    const updatedOpp: PlayerState = {
      ...oppPlayer,
      diceInPool: oppPlayer.diceInPool.filter((_, i) => i !== dieIndex),
    };
    working = { ...working, players: { ...working.players, [oppId]: updatedOpp } };

    // Deal damage equal to the die's face value to the Guardian character.
    working = dealDamage(working, activatingPlayerId, activatingCharacterId, damageAmount, allEvents);

    // If the Guardian character was defeated by its own intercept, the game
    // may have ended — stop here.
    if (working.winnerId !== null) {
      return { state: working, events: allEvents };
    }

    // Also check that the character still exists (defeated but game not over
    // means another character remains). If defeated, we cannot activate it.
    const ownerAfter = working.players[activatingPlayerId];
    if (!ownerAfter?.characters[activatingCharacterId]) {
      // Character defeated itself by intercepting; activation cannot proceed.
      return { state: working, events: allEvents };
    }
  }

  // Proceed with the activation (before-triggers, roll, after-triggers, turn rotation).
  const activationResult = performCharacterActivation(working, activatingPlayerId, activatingCharacterId);
  return {
    state: activationResult.state,
    events: [...allEvents, ...activationResult.events],
  };
}
