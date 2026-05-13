import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action';
import { newGameInActionPhase } from '../state/new-game';
import { endTurn, grantExtraTurn } from '../state/turn';
import { basicGameInput } from './fixtures';

// Verify the extra-turn / Ambush mechanism in isolation. No card or
// ability AST in the engine grants extra turns yet — we synthesize
// state directly. The Ambush keyword resolver will wire the same
// helpers once the AST resolver lands.

describe('extra-turn plumbing', () => {
  it('newGame seeds extraTurnsPending to {} and ambushGrantedThisTurn to false', () => {
    const state = newGameInActionPhase(basicGameInput({ seed: 'extra-init' }));
    expect(state.extraTurnsPending).toEqual({});
    expect(state.ambushGrantedThisTurn).toBe(false);
  });

  it('grantExtraTurn increments the player counter without touching anyone else', () => {
    const initial = newGameInActionPhase(basicGameInput({ seed: 'extra-grant' }));
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;

    const after = grantExtraTurn(initial, active);
    expect(after.extraTurnsPending[active]).toBe(1);
    expect(after.extraTurnsPending[opponent]).toBeUndefined();

    // Stacks across calls.
    const after2 = grantExtraTurn(after, active);
    expect(after2.extraTurnsPending[active]).toBe(2);
  });

  it('an action with extraTurnsPending keeps the same player active', () => {
    const initial = newGameInActionPhase(basicGameInput({ seed: 'extra-keep' }));
    const active = initial.activePlayerId!;
    const charId = initial.players[active]!.characterOrder[0]!;

    const withExtra = grantExtraTurn(initial, active);
    const after = applyAction(withExtra, { type: 'activate', playerId: active, cardId: charId });

    // Same player still active.
    expect(after.state.activePlayerId).toBe(active);
    // Extra was consumed.
    expect(after.state.extraTurnsPending[active]).toBe(0);
    // Turn index advanced (so per-turn seeded RNG forks stay distinct).
    expect(after.state.turnIndex).toBe(withExtra.turnIndex + 1);
  });

  it('extras are consumed one at a time across chained actions', () => {
    // Use endTurn directly to isolate the extra-turn mechanism from
    // pass-action upkeep / cascade logic (which has its own all-passed
    // threshold the card calls out as out of scope to interact with).
    let state = newGameInActionPhase(basicGameInput({ seed: 'extra-chain' }));
    const active = state.activePlayerId!;
    const opponent = state.playerOrder.find((id) => id !== active)!;
    state = grantExtraTurn(state, active);
    state = grantExtraTurn(state, active);
    expect(state.extraTurnsPending[active]).toBe(2);

    // First endTurn: keeps player, decrements to 1.
    state = endTurn(state, active, []).state;
    expect(state.activePlayerId).toBe(active);
    expect(state.extraTurnsPending[active]).toBe(1);

    // Second endTurn: keeps player, decrements to 0.
    state = endTurn(state, active, []).state;
    expect(state.activePlayerId).toBe(active);
    expect(state.extraTurnsPending[active]).toBe(0);

    // Third endTurn: no extras left, rotates to the opponent.
    state = endTurn(state, active, []).state;
    expect(state.activePlayerId).toBe(opponent);
  });

  it('ambushGrantedThisTurn resets on every turn boundary (rotation and extra consumption)', () => {
    const initial = newGameInActionPhase(basicGameInput({ seed: 'ambush-reset' }));
    const active = initial.activePlayerId!;

    // Synthesize "Ambush already fired this turn" and end the turn via
    // endTurn directly — the rotating path should clear the flag.
    const flagged = { ...initial, ambushGrantedThisTurn: true };
    const rotated = endTurn(flagged, active, []);
    expect(rotated.state.ambushGrantedThisTurn).toBe(false);

    // Same on the extra-turn path: flag clears when a player keeps acting.
    const flaggedWithExtra = grantExtraTurn(
      { ...initial, ambushGrantedThisTurn: true },
      active,
    );
    const sameSeat = endTurn(flaggedWithExtra, active, []);
    expect(sameSeat.state.activePlayerId).toBe(active);
    expect(sameSeat.state.ambushGrantedThisTurn).toBe(false);
  });

  it('ambushGrantedThisTurn resets at round start', () => {
    const initial = newGameInActionPhase(basicGameInput({ seed: 'ambush-round' }));
    const flagged = { ...initial, ambushGrantedThisTurn: true };
    const first = flagged.activePlayerId!;
    const second = flagged.playerOrder.find((id) => id !== first)!;

    const final = applyAction(
      applyAction(flagged, { type: 'pass', playerId: first }).state,
      { type: 'pass', playerId: second },
    );

    expect(final.state.roundNumber).toBe(2);
    expect(final.state.ambushGrantedThisTurn).toBe(false);
  });

  it('chained extra turns across two turns work (Ambush chains across, not within)', () => {
    // Same isolation as the previous test: drive endTurn directly so
    // we exercise the chain logic without pass-action side effects.
    let state = newGameInActionPhase(basicGameInput({ seed: 'ambush-chain' }));
    const active = state.activePlayerId!;
    const opponent = state.playerOrder.find((id) => id !== active)!;

    // Turn 1: player gets Ambush mid-turn (synthesize), then turn ends.
    state = grantExtraTurn({ ...state, ambushGrantedThisTurn: true }, active);
    state = endTurn(state, active, []).state;
    // Extra consumed → same player still active, fresh Ambush budget.
    expect(state.activePlayerId).toBe(active);
    expect(state.ambushGrantedThisTurn).toBe(false);
    expect(state.extraTurnsPending[active]).toBe(0);

    // Turn 2: Ambush fires again because the flag reset.
    state = grantExtraTurn({ ...state, ambushGrantedThisTurn: true }, active);
    state = endTurn(state, active, []).state;
    expect(state.activePlayerId).toBe(active);
    expect(state.ambushGrantedThisTurn).toBe(false);

    // Turn 3: no extras left → rotates.
    state = endTurn(state, active, []).state;
    expect(state.activePlayerId).toBe(opponent);
  });
});
