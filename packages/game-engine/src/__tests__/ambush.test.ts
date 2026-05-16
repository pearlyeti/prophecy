import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'ambush-test' }));
}

function activeId(state: GameState) {
  return state.activePlayerId!;
}

function withAmbush(state: GameState, charId: string): GameState {
  return { ...state, cardKeywords: { ...state.cardKeywords, [charId]: ['ambush'] } };
}

function firstCharId(state: GameState, playerId: string): string {
  return state.players[playerId]!.characterOrder[0]!;
}

describe('Ambush keyword', () => {
  it('activating a non-ambush character rotates the turn normally', () => {
    const initial = setup();
    const active = activeId(initial);
    const charId = firstCharId(initial, active);

    const { state } = applyAction(initial, { type: 'activate', playerId: active, cardId: charId });

    // Turn should have rotated to the opponent.
    expect(state.activePlayerId).not.toBe(active);
  });

  it('activating an Ambush character keeps the same player active', () => {
    const initial = setup();
    const active = activeId(initial);
    const charId = firstCharId(initial, active);
    const state = withAmbush(initial, charId);

    const { state: after } = applyAction(state, { type: 'activate', playerId: active, cardId: charId });

    // Extra turn: same player is still active.
    expect(after.activePlayerId).toBe(active);
    // Extra turn consumed after this action, so pending should now be 0.
    expect(after.extraTurnsPending[active] ?? 0).toBe(0);
    // ambushGrantedThisTurn is reset by endTurn.
    expect(after.ambushGrantedThisTurn).toBe(false);
  });

  it('Ambush does not stack: ambushGrantedThisTurn gate blocks a second grant in the same turn', () => {
    // Simulate the state mid-extra-turn: ambushGrantedThisTurn is already true.
    // Manually inject it and try activating another Ambush character — no extra turn should be granted.
    const initial = setup();
    const active = activeId(initial);
    const charId = firstCharId(initial, active);
    // State with Ambush keyword but the flag already set (simulates "already granted this turn").
    const state = { ...withAmbush(initial, charId), ambushGrantedThisTurn: true };

    const { state: after } = applyAction(state, { type: 'activate', playerId: active, cardId: charId });

    // No extra turn granted — turn rotated.
    expect(after.activePlayerId).not.toBe(active);
  });

  it('ambushGrantedThisTurn resets at the start of the next round', () => {
    // Drive the game to the next round; verify the flag is clear.
    const initial = setup();
    const active = activeId(initial);
    const charId = firstCharId(initial, active);
    const state = withAmbush(initial, charId);

    // Activate the Ambush character (grants extra turn, flag set).
    const { state: afterActivate } = applyAction(state, { type: 'activate', playerId: active, cardId: charId });
    expect(afterActivate.activePlayerId).toBe(active);

    // Pass on the extra turn and let both players pass to trigger upkeep.
    // (The engine will reset ambushGrantedThisTurn during upkeep/round-start.)
    const { state: afterPass } = applyAction(afterActivate, { type: 'pass', playerId: active });

    // Now the opponent passes too if still in the round, OR we may already be in round 2.
    // Either way, by the next round ambushGrantedThisTurn must be false.
    // Drive to round 2 by having the remaining active player(s) pass.
    let driving = afterPass;
    let safetyCount = 0;
    while (driving.roundNumber === initial.roundNumber && safetyCount++ < 10) {
      if (!driving.activePlayerId) break;
      const r = applyAction(driving, { type: 'pass', playerId: driving.activePlayerId });
      driving = r.state;
    }

    expect(driving.roundNumber).toBeGreaterThan(initial.roundNumber);
    expect(driving.ambushGrantedThisTurn).toBe(false);
  });
});
