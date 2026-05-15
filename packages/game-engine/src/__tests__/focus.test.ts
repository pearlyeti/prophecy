import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal.js';
import { applyAction } from '../reducers/apply-action.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { DieFace, DieInPool, GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

function face(symbol: DieFace['symbol'], value = 1, cost = 0, modifier = false): DieFace {
  return { symbol, value, cost, modifier };
}

function withPool(state: GameState, playerId: string, dice: readonly DieInPool[]): GameState {
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...state.players[playerId]!, diceInPool: [...dice] } },
  };
}

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'focus-test' }));
}

/** Mint a pool die that points back to the first character's first die spec. */
function charDie(state: GameState, playerId: string, faceOverride: DieFace): DieInPool {
  const p = state.players[playerId]!;
  const charId = p.characterOrder[0]!;
  const dieSpec = p.characters[charId]!.dice[0]!;
  return {
    instanceId: dieSpec.instanceId,
    cardId: dieSpec.cardId,
    faceIndex: 0,
    face: faceOverride,
    ownerInstanceId: charId,
  };
}

/** A pool die with no ownerInstanceId (e.g., a transient die). */
function looseDie(instanceId: string, f: DieFace): DieInPool {
  return { instanceId, cardId: 'X', faceIndex: 0, face: f };
}

describe('applyAction({ type: "resolve-dice", symbol: "focus" })', () => {
  it('removes the focuser die from pool; target die stays with updated face', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const p = initial.players[active]!;
    const charId = p.characterOrder[0]!;
    const dieSpec = p.characters[charId]!.dice[0]!;

    const focuserFace = face('focus', 1);
    const focuserDie: DieInPool = {
      instanceId: 'focuser-1',
      cardId: 'FC',
      faceIndex: 0,
      face: focuserFace,
      ownerInstanceId: undefined,
    };
    const targetDie: DieInPool = {
      instanceId: dieSpec.instanceId,
      cardId: dieSpec.cardId,
      faceIndex: 0,
      face: dieSpec.faces[0]!,
      ownerInstanceId: charId,
    };

    const state = withPool(initial, active, [focuserDie, targetDie]);

    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: [focuserDie.instanceId],
      focusFlips: [{ targetDieInstanceId: dieSpec.instanceId, faceIndex: 2 }],
    });

    const pool = out.players[active]!.diceInPool;
    // Focuser removed
    expect(pool.find((d) => d.instanceId === focuserDie.instanceId)).toBeUndefined();
    // Target stays with chosen face
    const flipped = pool.find((d) => d.instanceId === dieSpec.instanceId);
    expect(flipped).toBeDefined();
    expect(flipped!.faceIndex).toBe(2);
    expect(flipped!.face).toEqual(dieSpec.faces[2]);
  });

  it('zero flips is legal — focuser removed, no target changes', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const focuserDie = looseDie('focuser-0', face('focus', 2));
    const state = withPool(initial, active, [focuserDie]);

    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: [focuserDie.instanceId],
      focusFlips: [],
    });

    expect(out.players[active]!.diceInPool).toHaveLength(0);
  });

  it('multiple flips apply in order; same target can be flipped twice', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const p = initial.players[active]!;
    const charId = p.characterOrder[0]!;
    const dieSpec = p.characters[charId]!.dice[0]!;

    const focuserDie = looseDie('focuser', face('focus', 3));
    const targetDie: DieInPool = {
      instanceId: dieSpec.instanceId,
      cardId: dieSpec.cardId,
      faceIndex: 0,
      face: dieSpec.faces[0]!,
      ownerInstanceId: charId,
    };

    const state = withPool(initial, active, [focuserDie, targetDie]);

    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: [focuserDie.instanceId],
      focusFlips: [
        { targetDieInstanceId: dieSpec.instanceId, faceIndex: 1 },
        { targetDieInstanceId: dieSpec.instanceId, faceIndex: 4 }, // overrides the first flip
      ],
    });

    const flipped = out.players[active]!.diceInPool.find((d) => d.instanceId === dieSpec.instanceId);
    expect(flipped?.faceIndex).toBe(4);
  });

  it('throws when focuser tries to target itself', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const p = initial.players[active]!;
    const charId = p.characterOrder[0]!;
    const dieSpec = p.characters[charId]!.dice[0]!;

    const selfDie: DieInPool = {
      instanceId: dieSpec.instanceId,
      cardId: dieSpec.cardId,
      faceIndex: 0,
      face: face('focus', 1),
      ownerInstanceId: charId,
    };
    const state = withPool(initial, active, [selfDie]);

    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: [dieSpec.instanceId],
        focusFlips: [{ targetDieInstanceId: dieSpec.instanceId, faceIndex: 0 }],
      }),
    ).toThrow(IllegalActionError);
  });

  it('throws when target die is not in pool', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const focuserDie = looseDie('focuser', face('focus', 1));
    const state = withPool(initial, active, [focuserDie]);

    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: [focuserDie.instanceId],
        focusFlips: [{ targetDieInstanceId: 'ghost-die', faceIndex: 0 }],
      }),
    ).toThrow(/not in the pool/);
  });

  it('throws on invalid faceIndex', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const p = initial.players[active]!;
    const charId = p.characterOrder[0]!;
    const dieSpec = p.characters[charId]!.dice[0]!;

    const focuserDie = looseDie('focuser', face('focus', 1));
    const targetDie: DieInPool = {
      instanceId: dieSpec.instanceId,
      cardId: dieSpec.cardId,
      faceIndex: 0,
      face: dieSpec.faces[0]!,
      ownerInstanceId: charId,
    };

    const state = withPool(initial, active, [focuserDie, targetDie]);

    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: [focuserDie.instanceId],
        focusFlips: [{ targetDieInstanceId: dieSpec.instanceId, faceIndex: 99 }],
      }),
    ).toThrow(/out of range/);
  });

  it('turn rotates after focus resolution', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const focuserDie = looseDie('focuser', face('focus', 1));
    const state = withPool(initial, active, [focuserDie]);

    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: [focuserDie.instanceId],
      focusFlips: [],
    });

    expect(out.activePlayerId).not.toBe(active);
  });
});
