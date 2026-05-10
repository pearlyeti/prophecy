import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGameInActionPhase } from '../state/new-game';
import { basicGameInput } from './fixtures';

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'claim-test' }));
}

describe('applyAction({ type: "claim-battlefield" })', () => {
  it('records the claimer and rotates to the opponent', () => {
    const initial = setup();
    const claimer = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== claimer)!;

    const { state, events } = applyAction(initial, {
      type: 'claim-battlefield',
      playerId: claimer,
    });

    expect(state.battlefieldControllerId).toBe(claimer);
    expect(state.playerWhoClaimedThisRound).toBe(claimer);
    expect(state.activePlayerId).toBe(opponent);
    expect(state.consecutivePasses).toBe(0); // claim is an action, not a pass
    expect(state.phase).toBe('action');

    const types = events.map((e) => e.type);
    expect(types).toContain('battlefield.claimed');
    expect(types).toContain('turn.advanced');
  });

  it("after a claim, the claimer's next turn is auto-passed and an opponent pass ends the round", () => {
    const initial = setup();
    const claimer = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== claimer)!;

    const claimed = applyAction(initial, {
      type: 'claim-battlefield',
      playerId: claimer,
    }).state;
    expect(claimed.activePlayerId).toBe(opponent);
    expect(claimed.consecutivePasses).toBe(0);

    const { state: afterOpponentPass, events } = applyAction(claimed, {
      type: 'pass',
      playerId: opponent,
    });

    // Opponent's pass made it 1, claimer auto-passed making it 2 → upkeep ran.
    expect(afterOpponentPass.roundNumber).toBe(2);
    expect(afterOpponentPass.consecutivePasses).toBe(0);
    expect(afterOpponentPass.playerWhoClaimedThisRound).toBeNull();

    const passes = events.filter((e) => e.type === 'player.passed');
    expect(passes).toHaveLength(2);
    expect(passes[0]?.payload.playerId).toBe(opponent);
    expect(passes[0]?.payload.automatic).toBeFalsy();
    expect(passes[1]?.payload.playerId).toBe(claimer);
    expect(passes[1]?.payload.automatic).toBe(true);
  });

  it('only one player can claim per round', () => {
    const initial = setup();
    const claimer = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== claimer)!;

    const claimed = applyAction(initial, {
      type: 'claim-battlefield',
      playerId: claimer,
    }).state;
    expect(() =>
      applyAction(claimed, { type: 'claim-battlefield', playerId: opponent }),
    ).toThrow(/already claimed/);
  });

  it("throws when it is not the player's turn", () => {
    const initial = setup();
    const inactive = initial.playerOrder.find((id) => id !== initial.activePlayerId)!;
    expect(() =>
      applyAction(initial, { type: 'claim-battlefield', playerId: inactive }),
    ).toThrow(IllegalActionError);
  });

  it('claim flag resets at the start of the next round', () => {
    const initial = setup();
    const claimer = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== claimer)!;

    const c = applyAction(initial, {
      type: 'claim-battlefield',
      playerId: claimer,
    }).state;
    expect(c.playerWhoClaimedThisRound).toBe(claimer);
    const r2 = applyAction(c, { type: 'pass', playerId: opponent }).state;
    expect(r2.playerWhoClaimedThisRound).toBeNull();
    expect(r2.activePlayerId).toBe(c.battlefieldControllerId);
    // Claim again in round 2.
    const c2 = applyAction(r2, {
      type: 'claim-battlefield',
      playerId: r2.activePlayerId!,
    }).state;
    expect(c2.playerWhoClaimedThisRound).toBe(r2.activePlayerId);
  });
});
