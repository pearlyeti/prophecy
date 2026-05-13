import type { EngineEvent } from '../events';
import type { GameState } from './types';

/**
 * Resolve the player who should be active after the current player's
 * turn ends. This is purely seating-order — it does NOT account for
 * auto-pass cascading. Use `rotateAndCascade` when you also need the
 * "skip a player who already claimed" behaviour.
 */
export function nextSeat(state: GameState, fromPlayerId: string): string {
  const idx = state.playerOrder.indexOf(fromPlayerId);
  if (idx < 0) {
    throw new Error(`player ${fromPlayerId} not in playerOrder`);
  }
  const next = state.playerOrder[(idx + 1) % state.playerOrder.length];
  if (next === undefined) {
    throw new Error('playerOrder is empty');
  }
  return next;
}

export interface RotationResult {
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
  /** True when consecutivePasses reached playerOrder.length during cascade. */
  readonly allPlayersPassed: boolean;
}

/**
 * Rotate `activePlayerId` from `fromPlayerId` to the next seat, and then
 * keep auto-passing if the new active player has already claimed the
 * battlefield this round (per the rules: a player who has claimed
 * automatically passes all of their future turns that round).
 *
 * Each auto-pass increments `consecutivePasses`. If the cascade brings
 * `consecutivePasses` to `playerOrder.length` (everyone has effectively
 * passed in a row), the result has `allPlayersPassed = true` and the
 * caller is responsible for running the upkeep / start-of-round
 * transition.
 */
export function rotateAndCascade(
  state: GameState,
  fromPlayerId: string,
  events: readonly EngineEvent[],
): RotationResult {
  const out = [...events];
  let active = nextSeat(state, fromPlayerId);
  let consecutivePasses = state.consecutivePasses;
  let turnIndex = state.turnIndex + 1;

  out.push({ type: 'turn.advanced', payload: { from: fromPlayerId, to: active } });

  while (
    state.playerWhoClaimedThisRound === active &&
    consecutivePasses < state.playerOrder.length
  ) {
    consecutivePasses += 1;
    out.push({
      type: 'player.passed',
      payload: { playerId: active, consecutivePasses, automatic: true },
    });
    if (consecutivePasses >= state.playerOrder.length) break;
    const nextActive = nextSeat(state, active);
    out.push({ type: 'turn.advanced', payload: { from: active, to: nextActive } });
    active = nextActive;
    turnIndex += 1;
  }

  return {
    state: { ...state, activePlayerId: active, consecutivePasses, turnIndex },
    events: out,
    allPlayersPassed: consecutivePasses >= state.playerOrder.length,
  };
}

/**
 * End the current player's turn. If they have an extra turn pending
 * (e.g., granted by Ambush or another "additional action" effect),
 * consume one and keep them active for another action. Otherwise
 * rotate via `rotateAndCascade`.
 *
 * Every turn boundary — whether rotation or extra-turn consumption —
 * clears `ambushGrantedThisTurn` so the next turn starts with a fresh
 * Ambush budget (Ambush doesn't stack within a turn but chains across).
 *
 * Every action handler (`pass`, `activate`, `play-card`, `resolve-dice`,
 * `reroll-dice`) calls this instead of `rotateAndCascade` directly so
 * the extra-turn semantics stay in one place.
 */
export function endTurn(
  state: GameState,
  fromPlayerId: string,
  events: readonly EngineEvent[],
): RotationResult {
  const pending = state.extraTurnsPending[fromPlayerId] ?? 0;
  if (pending > 0) {
    // Same player acts again. Decrement their extras, reset the
    // per-turn Ambush flag, and bump turnIndex so seeded RNG forks
    // tied to (seed, turnIndex) still produce distinct streams across
    // the chained actions.
    const next: GameState = {
      ...state,
      extraTurnsPending: {
        ...state.extraTurnsPending,
        [fromPlayerId]: pending - 1,
      },
      ambushGrantedThisTurn: false,
      turnIndex: state.turnIndex + 1,
    };
    return { state: next, events, allPlayersPassed: false };
  }
  return rotateAndCascade(
    { ...state, ambushGrantedThisTurn: false },
    fromPlayerId,
    events,
  );
}

/**
 * Increment the named player's extra-turn counter by one. Pure seam
 * for ability code to call — no callers in the engine yet. The Ambush
 * keyword resolver will read `ambushGrantedThisTurn` before invoking
 * this to enforce the once-per-turn cap; other extra-turn sources
 * don't have that cap and can call this freely.
 */
export function grantExtraTurn(state: GameState, playerId: string): GameState {
  const current = state.extraTurnsPending[playerId] ?? 0;
  return {
    ...state,
    extraTurnsPending: {
      ...state.extraTurnsPending,
      [playerId]: current + 1,
    },
  };
}
