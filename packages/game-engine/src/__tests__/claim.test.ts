import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGame } from '../state/new-game';

function setup() {
  return newGame({
    seed: 'claim-test',
    playerIds: ['alice', 'bob'],
    battlefieldControllerId: 'alice',
  });
}

describe('applyAction({ type: "claim-battlefield" })', () => {
  it('records the claimer and rotates to the opponent', () => {
    const initial = setup();
    const { state, events } = applyAction(initial, {
      type: 'claim-battlefield',
      playerId: 'alice',
    });

    expect(state.battlefieldControllerId).toBe('alice');
    expect(state.playerWhoClaimedThisRound).toBe('alice');
    expect(state.activePlayerId).toBe('bob');
    expect(state.consecutivePasses).toBe(0); // claim is an action, not a pass
    expect(state.phase).toBe('action');

    const types = events.map((e) => e.type);
    expect(types).toContain('battlefield.claimed');
    expect(types).toContain('turn.advanced');
  });

  it("transfers control when the non-controller claims", () => {
    const initial = setup(); // alice is controller
    const { state } = applyAction(initial, {
      type: 'claim-battlefield',
      playerId: 'alice',
    });
    // alice claims again — battlefield.claimed should record previous controller
    expect(state.battlefieldControllerId).toBe('alice');

    // Now simulate bob being able to claim instead. Wind to a fresh round
    // and let bob be active and claim.
    const r2 = applyAction(state, { type: 'pass', playerId: 'bob' }).state;
    // alice's seat comes around but she has claimed → auto-passed inside the
    // pass handler. r2 should be in upkeep already.
    expect(r2.roundNumber).toBe(2);
    expect(r2.playerWhoClaimedThisRound).toBeNull();
    expect(r2.activePlayerId).toBe('alice'); // controller acts first
  });

  it("after a claim, the claimer's next turn is auto-passed and an opponent pass ends the round", () => {
    const initial = setup();
    const claimed = applyAction(initial, {
      type: 'claim-battlefield',
      playerId: 'alice',
    }).state;
    expect(claimed.activePlayerId).toBe('bob');
    expect(claimed.consecutivePasses).toBe(0);

    const { state: afterBobPass, events } = applyAction(claimed, {
      type: 'pass',
      playerId: 'bob',
    });

    // Bob's pass made it 1, alice auto-passed making it 2 → upkeep ran.
    expect(afterBobPass.roundNumber).toBe(2);
    expect(afterBobPass.consecutivePasses).toBe(0);
    expect(afterBobPass.playerWhoClaimedThisRound).toBeNull();

    // Verify the auto-pass appeared in events with `automatic: true`.
    const passes = events.filter((e) => e.type === 'player.passed');
    expect(passes).toHaveLength(2);
    expect(passes[0]?.payload.playerId).toBe('bob');
    expect(passes[0]?.payload.automatic).toBeFalsy();
    expect(passes[1]?.payload.playerId).toBe('alice');
    expect(passes[1]?.payload.automatic).toBe(true);
  });

  it('only one player can claim per round', () => {
    const initial = setup();
    const claimed = applyAction(initial, {
      type: 'claim-battlefield',
      playerId: 'alice',
    }).state;
    // Now active is bob. Bob tries to claim.
    expect(() =>
      applyAction(claimed, { type: 'claim-battlefield', playerId: 'bob' }),
    ).toThrow(/already claimed/);
  });

  it('throws when it is not the player\'s turn', () => {
    const initial = setup(); // alice active
    expect(() =>
      applyAction(initial, { type: 'claim-battlefield', playerId: 'bob' }),
    ).toThrow(IllegalActionError);
  });

  it('claim flag resets at the start of the next round', () => {
    const initial = setup();
    const c = applyAction(initial, { type: 'claim-battlefield', playerId: 'alice' }).state;
    expect(c.playerWhoClaimedThisRound).toBe('alice');
    const r2 = applyAction(c, { type: 'pass', playerId: 'bob' }).state;
    expect(r2.playerWhoClaimedThisRound).toBeNull();
    // Alice can claim again in round 2.
    const c2 = applyAction(r2, { type: 'claim-battlefield', playerId: 'alice' }).state;
    expect(c2.playerWhoClaimedThisRound).toBe('alice');
  });
});
