import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal.js';
import { applyAction } from '../reducers/apply-action.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { DieFace, DieInPool, GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

function face(
  symbol: DieFace['symbol'],
  value = 1,
  cost = 0,
  modifier = false,
): DieFace {
  return { symbol, value, cost, modifier };
}

function withPool(state: GameState, playerId: string, dice: readonly DieInPool[]): GameState {
  const p = state.players[playerId]!;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...p, diceInPool: [...dice] },
    },
  };
}

function clearShields(state: GameState, playerId: string, characterId: string): GameState {
  const player = state.players[playerId]!;
  const c = player.characters[characterId]!;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        characters: { ...player.characters, [characterId]: { ...c, shields: 0 } },
      },
    },
  };
}

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'rd-test' }));
}

describe('applyAction({ type: "resolve-dice" })', () => {
  it('resolves a single resource die: player gains resources, die leaves pool, turn rotates', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('resource', 2) },
    ]);

    const { state: out, events } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: ['d1'],
    });

    expect(out.players[active]!.resources).toBe(state.players[active]!.resources + 2);
    expect(out.players[active]!.diceInPool).toEqual([]);
    expect(out.activePlayerId).toBe(opponent); // resolve-dice ends the turn

    const types = events.map((e) => e.type);
    expect(types).toContain('dice.resolved');
    expect(types).toContain('resources.gained');
  });

  it('sums values across multiple same-symbol dice', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('resource', 1) },
      { instanceId: 'd2', cardId: 'X', faceIndex: 0, face: face('resource', 2) },
    ]);

    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: ['d1', 'd2'],
    });
    expect(out.players[active]!.resources).toBe(state.players[active]!.resources + 3);
  });

  it('rejects mixed-symbol selection', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('resource', 1) },
      { instanceId: 'd2', cardId: 'X', faceIndex: 0, face: face('melee', 1) },
    ]);
    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: ['d1', 'd2'],
      }),
    ).toThrow(/share a symbol/);
  });

  it('rejects a modifier-only selection (needs a non-modifier of same symbol)', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('melee', 2, 0, true) },
    ]);
    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: ['d1'],
      }),
    ).toThrow(/modifier/);
  });

  it('rejects blank, special, indirect, discard, draw (focus is now implemented)', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    for (const symbol of [
      'blank',
      'special',
      'indirect',
      'discard',
      'draw',
    ] as const) {
      const state = withPool(initial, active, [
        { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face(symbol) },
      ]);
      expect(() =>
        applyAction(state, {
          type: 'resolve-dice',
          playerId: active,
          dieInstanceIds: ['d1'],
        }),
      ).toThrow();
    }
  });

  describe('modifier-with-parent rule', () => {
    it('resolves melee 2 + melee modifier +1 as combined value 3', () => {
      const initial = setup();
      const active = initial.activePlayerId!;
      const opp = initial.playerOrder.find((id) => id !== active)!;
      const targetId = initial.players[opp]!.characterOrder[0]!;
      // Strip starting shields so damage.dealt reports the raw combined
      // value rather than post-shield-block.
      const noShields = clearShields(initial, opp, targetId);
      const state = withPool(noShields, active, [
        { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('melee', 2) },
        { instanceId: 'd2', cardId: 'X', faceIndex: 0, face: face('melee', 1, 0, true) },
      ]);

      const { state: out, events } = applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: ['d1', 'd2'],
        targetCharacterId: targetId,
      });

      const resolved = events.find((e) => e.type === 'dice.resolved');
      expect((resolved?.payload as { totalValue: number }).totalValue).toBe(3);
      const damage = events.find((e) => e.type === 'damage.dealt');
      expect((damage?.payload as { amount: number }).amount).toBe(3);
      expect(out.players[opp]?.characters[targetId]?.damage).toBe(3);
    });

    it('rejects cross-symbol modifier (e.g., melee 2 + ranged modifier +1)', () => {
      const initial = setup();
      const active = initial.activePlayerId!;
      const state = withPool(initial, active, [
        { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('melee', 2) },
        { instanceId: 'd2', cardId: 'X', faceIndex: 0, face: face('ranged', 1, 0, true) },
      ]);
      expect(() =>
        applyAction(state, {
          type: 'resolve-dice',
          playerId: active,
          dieInstanceIds: ['d1', 'd2'],
        }),
      ).toThrow(/modifier/);
    });

    it('resolves a symbolless modifier alongside a valued non-modifier (any symbol)', () => {
      const initial = setup();
      const active = initial.activePlayerId!;
      const opp = initial.playerOrder.find((id) => id !== active)!;
      const targetId = initial.players[opp]!.characterOrder[0]!;
      const noShields = clearShields(initial, opp, targetId);
      const state = withPool(noShields, active, [
        { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('melee', 2) },
        { instanceId: 'd2', cardId: 'X', faceIndex: 0, face: face('modifier', 1, 0, true) },
      ]);

      const { events } = applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: ['d1', 'd2'],
        targetCharacterId: targetId,
      });

      const resolved = events.find((e) => e.type === 'dice.resolved');
      expect((resolved?.payload as { totalValue: number }).totalValue).toBe(3);
      const damage = events.find((e) => e.type === 'damage.dealt');
      expect((damage?.payload as { amount: number }).amount).toBe(3);
    });

    it('rejects a lone symbolless modifier (no parent in selection)', () => {
      const initial = setup();
      const active = initial.activePlayerId!;
      const state = withPool(initial, active, [
        { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('modifier', 1, 0, true) },
      ]);
      expect(() =>
        applyAction(state, {
          type: 'resolve-dice',
          playerId: active,
          dieInstanceIds: ['d1'],
        }),
      ).toThrow(/modifier/);
    });

    it('rejects a symbolless modifier paired with a special parent (value 0 doesn\'t qualify)', () => {
      // Special is rejected with "not yet implemented" before the
      // value-zero parent check even fires — either rejection is
      // acceptable, and the engine throws.
      const initial = setup();
      const active = initial.activePlayerId!;
      const state = withPool(initial, active, [
        { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('special', 0) },
        { instanceId: 'd2', cardId: 'X', faceIndex: 0, face: face('modifier', 1, 0, true) },
      ]);
      expect(() =>
        applyAction(state, {
          type: 'resolve-dice',
          playerId: active,
          dieInstanceIds: ['d1', 'd2'],
        }),
      ).toThrow();
    });
  });

  it('pays per-die resource cost from the player', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const before = initial.players[active]!.resources;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('resource', 3, 1) },
    ]);
    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: ['d1'],
    });
    // Gained 3, paid 1.
    expect(out.players[active]!.resources).toBe(before + 3 - 1);
  });

  it('rejects if the player can\'t pay total cost', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('resource', 5, 99) },
    ]);
    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: ['d1'],
      }),
    ).toThrow(/resources/);
  });

  it('deals melee damage to a target character', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;
    const targetId = initial.players[opponent]!.characterOrder[0]!;
    // Strip the setup-placed shields so we measure damage cleanly here.
    const cleared = clearShields(initial, opponent, targetId);
    const state = withPool(cleared, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('melee', 3) },
    ]);
    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: ['d1'],
      targetCharacterId: targetId,
    });
    expect(out.players[opponent]!.characters[targetId]!.damage).toBe(3);
  });

  it('shields block damage 1-for-1; excess hits health', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;
    const targetId = initial.players[opponent]!.characterOrder[0]!;
    // Give target 2 shields.
    const withShields: GameState = {
      ...initial,
      players: {
        ...initial.players,
        [opponent]: {
          ...initial.players[opponent]!,
          characters: {
            ...initial.players[opponent]!.characters,
            [targetId]: {
              ...initial.players[opponent]!.characters[targetId]!,
              shields: 2,
            },
          },
        },
      },
    };
    const state = withPool(withShields, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('ranged', 3) },
    ]);
    const { state: out, events } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: ['d1'],
      targetCharacterId: targetId,
    });
    expect(out.players[opponent]!.characters[targetId]!.shields).toBe(0);
    expect(out.players[opponent]!.characters[targetId]!.damage).toBe(1);
    const dd = events.find((e) => e.type === 'damage.dealt');
    expect(dd?.payload).toMatchObject({ amount: 1, shieldsBlocked: 2 });
  });

  it('places shields on own character, capped at 3', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const myCharId = initial.players[active]!.characterOrder[0]!;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('shield', 2) },
      { instanceId: 'd2', cardId: 'X', faceIndex: 0, face: face('shield', 3) },
    ]);
    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: ['d1', 'd2'],
      targetCharacterId: myCharId,
    });
    expect(out.players[active]!.characters[myCharId]!.shields).toBe(3); // capped
  });

  it('refuses shield placement on the opponent\'s character', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;
    const opponentCharId = initial.players[opponent]!.characterOrder[0]!;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('shield', 1) },
    ]);
    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: ['d1'],
        targetCharacterId: opponentCharId,
      }),
    ).toThrow(/your own/);
  });

  it('disrupt: opponent loses resources, clamped to 0', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;
    const state = withPool(initial, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('disrupt', 99) },
    ]);
    const { state: out } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: ['d1'],
    });
    expect(out.players[opponent]!.resources).toBe(0);
  });

  it('lethal damage defeats the character; if it was the last one, opponent wins', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;
    const targetId = initial.players[opponent]!.characterOrder[0]!;
    const targetHealth = initial.players[opponent]!.characters[targetId]!.health;
    const cleared = clearShields(initial, opponent, targetId);
    const state = withPool(cleared, active, [
      { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: face('melee', targetHealth) },
    ]);
    const { state: out, events } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      dieInstanceIds: ['d1'],
      targetCharacterId: targetId,
    });
    expect(out.players[opponent]!.characterOrder).not.toContain(targetId);
    expect(out.players[opponent]!.characters[targetId]).toBeUndefined();
    expect(out.winnerId).toBe(active);
    expect(out.phase).toBe('ended');
    expect(events.find((e) => e.type === 'character.defeated')).toBeDefined();
    expect(events.find((e) => e.type === 'game.ended')?.payload).toMatchObject({
      winnerId: active,
      reason: 'all-characters-defeated',
    });
  });

  it('throws when the die is not in the player\'s pool', () => {
    const initial = setup();
    const active = initial.activePlayerId!;
    expect(() =>
      applyAction(initial, {
        type: 'resolve-dice',
        playerId: active,
        dieInstanceIds: ['ghost-die'],
      }),
    ).toThrow(IllegalActionError);
  });
});
