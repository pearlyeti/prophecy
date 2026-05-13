import type { EngineEvent } from '../events';
import { drawCards } from '../state/draw';
import { endTurn } from '../state/turn';
import type { GameState, PlayerState } from '../state/types';
import { IllegalActionError } from './illegal';

const UPKEEP_RESOURCES = 2;

export interface ApplyResult {
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
}

/**
 * Pass action.
 *
 * Validates phase and active player, increments `consecutivePasses`,
 * rotates to the next seat, and runs the auto-pass cascade if the new
 * active player has already claimed this round. If the cascade brings
 * the consecutive-pass count to one-per-player, runs upkeep and starts
 * the next round.
 */
export function applyPass(state: GameState, playerId: string): ApplyResult {
  guardCanAct(state, playerId);

  const prelude: EngineEvent[] = [
    {
      type: 'player.passed',
      payload: { playerId, consecutivePasses: state.consecutivePasses + 1 },
    },
  ];
  const stateAfterPass: GameState = {
    ...state,
    consecutivePasses: state.consecutivePasses + 1,
  };

  if (stateAfterPass.consecutivePasses >= state.playerOrder.length) {
    // Edge case: 1-player game theoretically; engine still handles it.
    return runUpkeepAndStartRound(stateAfterPass, prelude);
  }

  const rotated = endTurn(stateAfterPass, playerId, prelude);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}

export function guardCanAct(state: GameState, playerId: string): void {
  if (state.winnerId !== null) {
    throw new IllegalActionError('game has already ended');
  }
  if (state.phase !== 'action') {
    throw new IllegalActionError(`cannot act during ${state.phase} phase`);
  }
  if (state.activePlayerId !== playerId) {
    throw new IllegalActionError(
      `it is not ${playerId}'s turn (active: ${state.activePlayerId})`,
    );
  }
}

export function runUpkeepAndStartRound(
  state: GameState,
  prefixEvents: readonly EngineEvent[],
): ApplyResult {
  const events: EngineEvent[] = [...prefixEvents, { type: 'upkeep.begin', payload: {} }];

  // First apply the deterministic per-player changes (ready, pool clear,
  // resource gain) into a working state. Then draw up to handSize off
  // each deck using the shared drawCards helper. Doing it in two passes
  // keeps the draw step pure (it just reads/writes deck and hand) and
  // mirrors the wording in the rules.
  let working: GameState = state;
  const diceReturnedBefore: Record<string, number> = {};
  const players: Record<string, PlayerState> = {};
  for (const id of state.playerOrder) {
    const p = state.players[id];
    if (!p) {
      throw new Error(`player ${id} missing from state.players`);
    }
    // 1. Ready exhausted cards.
    // 2. Return dice in pool to matching cards (clear pool).
    // 3. Gain 2 resources.
    // 4. Discard then draw to hand size — discard step deferred until
    //    play-card lands; draw step active.
    diceReturnedBefore[id] = p.diceInPool.length;
    const readied: Record<string, (typeof p.characters)[string]> = {};
    for (const cid of p.characterOrder) {
      const c = p.characters[cid];
      if (!c) continue;
      readied[cid] = c.exhausted ? { ...c, exhausted: false } : c;
    }
    players[id] = {
      ...p,
      diceInPool: [],
      resources: p.resources + UPKEEP_RESOURCES,
      characters: readied,
    };
  }
  working = { ...state, players };

  for (const id of state.playerOrder) {
    const p = working.players[id]!;
    const want = Math.max(0, p.handSize - p.hand.length);
    const drawResult = drawCards(working, id, want);
    working = drawResult.state;
    events.push({
      type: 'upkeep.player',
      payload: {
        playerId: id,
        resourcesGained: UPKEEP_RESOURCES,
        diceReturned: diceReturnedBefore[id] ?? 0,
        cardsDrawn: drawResult.drawn,
      },
    });
  }

  events.push({ type: 'upkeep.end', payload: {} });

  // End-of-round loss check (rules: a player with no cards in hand and
  // deck at the end of a round loses). All-lose tiebreak goes to the
  // battlefield controller.
  const losers = state.playerOrder.filter((id) => {
    const p = working.players[id];
    return p !== undefined && p.hand.length === 0 && p.deck.length === 0;
  });

  if (losers.length > 0) {
    let winnerId: string | null;
    if (losers.length >= state.playerOrder.length) {
      // Everyone empty — controller wins the tie.
      winnerId = state.battlefieldControllerId ?? state.playerOrder[0] ?? null;
    } else {
      const survivors = state.playerOrder.filter((id) => !losers.includes(id));
      // 1v1 (or any case with exactly one survivor) → that player wins.
      // FFA with multiple survivors continues into the next round; that
      // path is not exercised in v1.
      winnerId = survivors.length === 1 ? (survivors[0] ?? null) : null;
    }

    if (winnerId !== null) {
      events.push({
        type: 'game.ended',
        payload: { winnerId, reason: 'deck-and-hand-empty' },
      });
      return {
        state: {
          ...working,
          phase: 'ended',
          winnerId,
          consecutivePasses: 0,
          playerWhoClaimedThisRound: null,
          turnIndex: state.turnIndex + 1,
        },
        events,
      };
    }
    // FFA: multi-survivor case falls through and starts the next round.
  }

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
      ...working,
      phase: 'action',
      activePlayerId: nextActive,
      roundNumber: nextRound,
      consecutivePasses: 0,
      playerWhoClaimedThisRound: null,
      turnIndex: state.turnIndex + 1,
      // New round → new turn for the first player; fresh Ambush budget.
      ambushGrantedThisTurn: false,
    },
    events,
  };
}
