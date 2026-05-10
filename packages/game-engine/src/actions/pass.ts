import type { EngineEvent } from '../events';
import type { GameState, PlayerState } from '../state/types';
import { IllegalActionError } from './illegal';

const UPKEEP_RESOURCES = 2;

export interface PassResult {
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
}

/**
 * Pass action.
 *
 * - Validates phase, active player, and that the game is still in progress.
 * - Increments `consecutivePasses`.
 * - If everyone has passed in a row, runs upkeep and starts the next round.
 * - Otherwise rotates `activePlayerId` to the next player in seating order.
 *
 * The exact upkeep effects modeled here for v1: clear dice pools and grant
 * +2 resources to each player. Readying exhausted cards and the hand-size
 * draw are no-ops in this slice because we don't yet simulate card-level
 * state. They're stubbed at the right place so they're easy to fill in.
 */
export function applyPass(state: GameState, playerId: string): PassResult {
  if (state.winnerId !== null) {
    throw new IllegalActionError('game has already ended');
  }
  if (state.phase !== 'action') {
    throw new IllegalActionError(`cannot pass during ${state.phase} phase`);
  }
  if (state.activePlayerId !== playerId) {
    throw new IllegalActionError(
      `it is not ${playerId}'s turn (active: ${state.activePlayerId})`,
    );
  }

  const consecutivePasses = state.consecutivePasses + 1;
  const events: EngineEvent[] = [
    { type: 'player.passed', payload: { playerId, consecutivePasses } },
  ];

  if (consecutivePasses < state.playerOrder.length) {
    const idx = state.playerOrder.indexOf(playerId);
    const nextIdx = (idx + 1) % state.playerOrder.length;
    const nextPlayer = state.playerOrder[nextIdx];
    if (nextPlayer === undefined) {
      throw new Error(
        `playerOrder is malformed; cannot resolve next player from index ${nextIdx}`,
      );
    }

    events.push({ type: 'turn.advanced', payload: { from: playerId, to: nextPlayer } });

    return {
      state: {
        ...state,
        consecutivePasses,
        activePlayerId: nextPlayer,
        turnIndex: state.turnIndex + 1,
      },
      events,
    };
  }

  // Everyone passed in a row → action phase ends. Run upkeep.
  return runUpkeepAndStartRound(state, events);
}

function runUpkeepAndStartRound(
  state: GameState,
  prefixEvents: EngineEvent[],
): PassResult {
  const events: EngineEvent[] = [...prefixEvents, { type: 'upkeep.begin', payload: {} }];

  const players: Record<string, PlayerState> = {};
  for (const id of state.playerOrder) {
    const p = state.players[id];
    if (!p) {
      throw new Error(`player ${id} missing from state.players`);
    }
    // 1. Ready exhausted cards — no-op until we model exhaustion.
    // 2. Return dice in pool to matching cards (clear pool).
    // 3. Gain 2 resources.
    // 4. Discard any number of cards then draw up to hand size.
    //    Hand draws are deferred until card-level state lands; this is the
    //    right place for them.
    players[id] = {
      ...p,
      diceInPool: [],
      resources: p.resources + UPKEEP_RESOURCES,
    };
    events.push({
      type: 'upkeep.player',
      payload: {
        playerId: id,
        resourcesGained: UPKEEP_RESOURCES,
        diceReturned: p.diceInPool.length,
      },
    });
  }

  events.push({ type: 'upkeep.end', payload: {} });

  const nextRound = state.roundNumber + 1;
  const nextActive = state.battlefieldControllerId ?? state.playerOrder[0];
  if (nextActive === undefined) {
    throw new Error('no battlefield controller and no players to act first');
  }

  events.push({
    type: 'round.begin',
    payload: { roundNumber: nextRound, activePlayerId: nextActive },
  });

  return {
    state: {
      ...state,
      phase: 'action',
      activePlayerId: nextActive,
      roundNumber: nextRound,
      consecutivePasses: 0,
      turnIndex: state.turnIndex + 1,
      players,
    },
    events,
  };
}
