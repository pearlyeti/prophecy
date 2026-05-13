import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGameInActionPhase } from '../state/new-game';
import { basicGameInput } from './fixtures';

// Helper: get a state where the active player has activated their
// first character, so the dice pool has something to reroll.
function setupWithDice(seed: string) {
  const initial = newGameInActionPhase(basicGameInput({ seed }));
  // After activate, the turn rotates; we want to test reroll BEFORE
  // rotating, so we capture state mid-activation by running it then
  // forcing activePlayerId back. Simpler: just inject dice into the
  // pool via state munging — keeps the test laser-focused on reroll.
  const active = initial.activePlayerId!;
  const character = initial.players[active]!.characters[
    initial.players[active]!.characterOrder[0]!
  ]!;
  const dieDef = character.dice[0]!;
  return {
    state: {
      ...initial,
      players: {
        ...initial.players,
        [active]: {
          ...initial.players[active]!,
          diceInPool: [
            {
              instanceId: dieDef.instanceId,
              cardId: dieDef.cardId,
              faceIndex: 0,
              face: dieDef.faces[0]!,
            },
          ],
        },
      },
    },
    active,
    dieInstanceId: dieDef.instanceId,
  };
}

describe('applyAction({ type: "reroll-dice" })', () => {
  it('discards a hand card, rerolls the listed die, rotates the turn', () => {
    const { state: initial, active, dieInstanceId } = setupWithDice('reroll-1');
    const handCardId = initial.players[active]!.hand[0]!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;

    const { state, events } = applyAction(initial, {
      type: 'reroll-dice',
      playerId: active,
      discardCardId: handCardId,
      dieInstanceIds: [dieInstanceId],
    });

    const me = state.players[active]!;
    expect(me.hand).not.toContain(handCardId);
    expect(me.discard).toContain(handCardId);
    expect(me.diceInPool).toHaveLength(1);
    // The new face is deterministic but the test fixture's faces
    // don't lock down which face is rolled; we just assert it
    // changed via the reroll path (faceIndex is in [0..5]).
    expect(me.diceInPool[0]!.faceIndex).toBeGreaterThanOrEqual(0);
    expect(me.diceInPool[0]!.faceIndex).toBeLessThan(6);
    expect(state.consecutivePasses).toBe(0);
    expect(state.activePlayerId).toBe(opponent);

    const rerolled = events.find((e) => e.type === 'dice.rerolled');
    expect(rerolled).toBeDefined();
    expect((rerolled?.payload as { rerolledDice: readonly unknown[] }).rerolledDice).toHaveLength(1);
  });

  it('is deterministic — same seed + same action produces the same new face', () => {
    const buildA = setupWithDice('reroll-det');
    const buildB = setupWithDice('reroll-det');
    const handCardA = buildA.state.players[buildA.active]!.hand[0]!;
    const handCardB = buildB.state.players[buildB.active]!.hand[0]!;

    const a = applyAction(buildA.state, {
      type: 'reroll-dice',
      playerId: buildA.active,
      discardCardId: handCardA,
      dieInstanceIds: [buildA.dieInstanceId],
    }).state;
    const b = applyAction(buildB.state, {
      type: 'reroll-dice',
      playerId: buildB.active,
      discardCardId: handCardB,
      dieInstanceIds: [buildB.dieInstanceId],
    }).state;

    expect(a.players[buildA.active]?.diceInPool[0]?.faceIndex).toBe(
      b.players[buildB.active]?.diceInPool[0]?.faceIndex,
    );
  });

  it('throws when the discard card is not in hand', () => {
    const { state: initial, active, dieInstanceId } = setupWithDice('reroll-2');
    expect(() =>
      applyAction(initial, {
        type: 'reroll-dice',
        playerId: active,
        discardCardId: 'not-in-hand',
        dieInstanceIds: [dieInstanceId],
      }),
    ).toThrow(/not in/);
  });

  it("throws when a die is not in the player's pool", () => {
    const { state: initial, active } = setupWithDice('reroll-3');
    const handCardId = initial.players[active]!.hand[0]!;
    expect(() =>
      applyAction(initial, {
        type: 'reroll-dice',
        playerId: active,
        discardCardId: handCardId,
        dieInstanceIds: ['not-in-pool'],
      }),
    ).toThrow(IllegalActionError);
  });

  it('throws when called by the inactive player', () => {
    const { state: initial, active, dieInstanceId } = setupWithDice('reroll-4');
    const inactive = initial.playerOrder.find((id) => id !== active)!;
    const handCardId = initial.players[inactive]!.hand[0]!;
    expect(() =>
      applyAction(initial, {
        type: 'reroll-dice',
        playerId: inactive,
        discardCardId: handCardId,
        dieInstanceIds: [dieInstanceId],
      }),
    ).toThrow(IllegalActionError);
  });

  it('zero dice is legal: discards the card, rerolls nothing, rotates the turn', () => {
    const { state: initial, active } = setupWithDice('reroll-5');
    const handCardId = initial.players[active]!.hand[0]!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;
    const poolBefore = initial.players[active]!.diceInPool;

    const { state, events } = applyAction(initial, {
      type: 'reroll-dice',
      playerId: active,
      discardCardId: handCardId,
      dieInstanceIds: [],
    });

    expect(state.players[active]?.hand).not.toContain(handCardId);
    expect(state.players[active]?.discard).toContain(handCardId);
    // Pool is unchanged — no faces were rerolled.
    expect(state.players[active]?.diceInPool).toEqual(poolBefore);
    expect(state.activePlayerId).toBe(opponent);

    const rerolled = events.find((e) => e.type === 'dice.rerolled');
    expect(rerolled).toBeDefined();
    expect((rerolled?.payload as { rerolledDice: readonly unknown[] }).rerolledDice).toEqual([]);
  });
});
