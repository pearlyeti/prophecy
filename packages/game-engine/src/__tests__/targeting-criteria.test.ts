import { describe, expect, it } from 'vitest';

import { applyEffects } from '../abilities/dispatch.js';
import { matchesCardCriteria, matchesDieCriteria } from '../abilities/dispatch.js';
import type { DispatchContext } from '../abilities/dispatch.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { CardMeta, DieFace, DieInPool, GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'criteria-test' }));
}

function activeId(state: GameState) {
  return state.activePlayerId!;
}

function opponentId(state: GameState, playerId: string) {
  return state.playerOrder.find((id) => id !== playerId)!;
}

function addDie(state: GameState, playerId: string, die: DieInPool): GameState {
  const p = state.players[playerId]!;
  return { ...state, players: { ...state.players, [playerId]: { ...p, diceInPool: [...p.diceInPool, die] } } };
}

function withMeta(state: GameState, instanceId: string, meta: CardMeta): GameState {
  return { ...state, cardMeta: { ...state.cardMeta, [instanceId]: meta } };
}

function ctx(state: GameState, playerId: string, targets: string[] = []): DispatchContext {
  return { playerId, characterTargets: targets };
}

const meleeFace: DieFace = { symbol: 'melee', value: 3, cost: 0, modifier: false };
const rangedFace: DieFace = { symbol: 'ranged', value: 2, cost: 0, modifier: false };
const resourceFace: DieFace = { symbol: 'resource', value: 1, cost: 0, modifier: true };

function makeDie(instanceId: string, face: DieFace, ownerInstanceId?: string): DieInPool {
  const base: DieInPool = { instanceId, cardId: 'test', faceIndex: 0, face };
  return ownerInstanceId !== undefined ? { ...base, ownerInstanceId } : base;
}

// ── matchesDieCriteria ────────────────────────────────────────────────────

describe('matchesDieCriteria', () => {
  it('returns true when criteria is undefined', () => {
    const state = setup();
    const die = makeDie('d1', meleeFace);
    expect(matchesDieCriteria(die, undefined, state)).toBe(true);
  });

  it('matches a single symbol', () => {
    const state = setup();
    const die = makeDie('d1', meleeFace);
    expect(matchesDieCriteria(die, { symbol: 'melee' }, state)).toBe(true);
    expect(matchesDieCriteria(die, { symbol: 'ranged' }, state)).toBe(false);
  });

  it('matches symbol array with OR semantics', () => {
    const state = setup();
    const die = makeDie('d1', meleeFace);
    expect(matchesDieCriteria(die, { symbol: ['melee', 'ranged'] }, state)).toBe(true);
    expect(matchesDieCriteria(die, { symbol: ['ranged', 'resource'] }, state)).toBe(false);
  });

  it('matches minValue and maxValue', () => {
    const state = setup();
    const die = makeDie('d1', meleeFace); // value=3
    expect(matchesDieCriteria(die, { minValue: 3 }, state)).toBe(true);
    expect(matchesDieCriteria(die, { minValue: 4 }, state)).toBe(false);
    expect(matchesDieCriteria(die, { maxValue: 3 }, state)).toBe(true);
    expect(matchesDieCriteria(die, { maxValue: 2 }, state)).toBe(false);
  });

  it('matches modifier flag', () => {
    const state = setup();
    const die = makeDie('d1', resourceFace); // modifier=true
    expect(matchesDieCriteria(die, { modifier: true }, state)).toBe(true);
    expect(matchesDieCriteria(die, { modifier: false }, state)).toBe(false);
  });

  it('matches ownerCardType via cardMeta', () => {
    let state = setup();
    const die = makeDie('d1', meleeFace, 'char-1');
    state = withMeta(state, 'char-1', { type: 'character', color: 'red', subtypes: ['warrior'], isUnique: true });
    expect(matchesDieCriteria(die, { ownerCardType: 'character' }, state)).toBe(true);
    expect(matchesDieCriteria(die, { ownerCardType: 'upgrade' }, state)).toBe(false);
  });

  it('matches ownerColor via cardMeta', () => {
    let state = setup();
    const die = makeDie('d1', meleeFace, 'char-1');
    state = withMeta(state, 'char-1', { type: 'character', color: 'red', subtypes: [], isUnique: false });
    expect(matchesDieCriteria(die, { ownerColor: 'red' }, state)).toBe(true);
    expect(matchesDieCriteria(die, { ownerColor: ['blue', 'yellow'] }, state)).toBe(false);
  });

  it('matches ownerSubtype via cardMeta', () => {
    let state = setup();
    const die = makeDie('d1', meleeFace, 'char-1');
    state = withMeta(state, 'char-1', { type: 'character', color: 'red', subtypes: ['warrior', 'trooper'], isUnique: false });
    expect(matchesDieCriteria(die, { ownerSubtype: 'warrior' }, state)).toBe(true);
    expect(matchesDieCriteria(die, { ownerSubtype: 'hero' }, state)).toBe(false);
  });

  it('returns false when ownerMeta required but die has no ownerInstanceId', () => {
    const state = setup();
    const die = makeDie('d1', meleeFace); // no ownerInstanceId
    expect(matchesDieCriteria(die, { ownerCardType: 'character' }, state)).toBe(false);
  });

  it('AND semantics: all fields must match', () => {
    const state = setup();
    const die = makeDie('d1', meleeFace); // symbol=melee, value=3
    expect(matchesDieCriteria(die, { symbol: 'melee', minValue: 3, maxValue: 3 }, state)).toBe(true);
    expect(matchesDieCriteria(die, { symbol: 'melee', minValue: 4 }, state)).toBe(false);
  });
});

// ── matchesCardCriteria ───────────────────────────────────────────────────

describe('matchesCardCriteria', () => {
  it('returns true when criteria is undefined', () => {
    const state = setup();
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;
    expect(matchesCardCriteria(charId, active, state, undefined)).toBe(true);
  });

  it('matches exhausted=true and exhausted=false', () => {
    let state = setup();
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;

    expect(matchesCardCriteria(charId, active, state, { exhausted: false })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { exhausted: true })).toBe(false);

    // Exhaust the character
    state = {
      ...state,
      players: {
        ...state.players,
        [active]: {
          ...state.players[active]!,
          characters: {
            ...state.players[active]!.characters,
            [charId]: { ...state.players[active]!.characters[charId]!, exhausted: true },
          },
        },
      },
    };
    expect(matchesCardCriteria(charId, active, state, { exhausted: true })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { exhausted: false })).toBe(false);
  });

  it('matches minHealth based on current health minus damage', () => {
    let state = setup();
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;
    // Default test health=10, damage=0 → health=10
    expect(matchesCardCriteria(charId, active, state, { minHealth: 10 })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { minHealth: 11 })).toBe(false);

    // Deal 3 damage
    state = {
      ...state,
      players: {
        ...state.players,
        [active]: {
          ...state.players[active]!,
          characters: {
            ...state.players[active]!.characters,
            [charId]: { ...state.players[active]!.characters[charId]!, damage: 3 },
          },
        },
      },
    };
    expect(matchesCardCriteria(charId, active, state, { minHealth: 7 })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { minHealth: 8 })).toBe(false);
  });

  it('matches maxDamage', () => {
    let state = setup();
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;
    expect(matchesCardCriteria(charId, active, state, { maxDamage: 0 })).toBe(true);

    state = {
      ...state,
      players: {
        ...state.players,
        [active]: {
          ...state.players[active]!,
          characters: {
            ...state.players[active]!.characters,
            [charId]: { ...state.players[active]!.characters[charId]!, damage: 4 },
          },
        },
      },
    };
    expect(matchesCardCriteria(charId, active, state, { maxDamage: 4 })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { maxDamage: 3 })).toBe(false);
  });

  it('matches color via cardMeta', () => {
    let state = setup();
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;
    state = withMeta(state, charId, { type: 'character', color: 'blue', subtypes: ['hero'], isUnique: true });
    expect(matchesCardCriteria(charId, active, state, { color: 'blue' })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { color: ['red', 'yellow'] })).toBe(false);
  });

  it('matches subtype with OR semantics', () => {
    let state = setup();
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;
    state = withMeta(state, charId, { type: 'character', color: 'red', subtypes: ['trooper', 'leader'], isUnique: false });
    expect(matchesCardCriteria(charId, active, state, { subtype: 'leader' })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { subtype: ['trooper', 'pilot'] })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { subtype: 'pilot' })).toBe(false);
  });

  it('matches unique flag', () => {
    let state = setup();
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;
    state = withMeta(state, charId, { type: 'character', color: 'red', subtypes: [], isUnique: true });
    expect(matchesCardCriteria(charId, active, state, { unique: true })).toBe(true);
    expect(matchesCardCriteria(charId, active, state, { unique: false })).toBe(false);
  });
});

// ── removeDie criteria integration ───────────────────────────────────────

describe('removeDie with DieCriteria', () => {
  it('removes only dice matching the criteria', () => {
    let state = setup();
    const active = activeId(state);
    const opp = opponentId(state, active);
    state = addDie(state, opp, makeDie('opp-melee', meleeFace));
    state = addDie(state, opp, makeDie('opp-ranged', rangedFace));

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'removeDie', from: 'opponentPool', criteria: { symbol: 'melee' } },
    ]);

    const pool = after.players[opp]!.diceInPool;
    expect(pool.find((d) => d.instanceId === 'opp-melee')).toBeUndefined();
    expect(pool.find((d) => d.instanceId === 'opp-ranged')).toBeDefined();
  });

  it('removes dice matching minValue', () => {
    let state = setup();
    const active = activeId(state);
    state = addDie(state, active, makeDie('high', meleeFace)); // value=3
    state = addDie(state, active, makeDie('low', rangedFace));  // value=2

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'removeDie', from: 'ownPool', criteria: { minValue: 3 } },
    ]);

    const pool = after.players[active]!.diceInPool;
    expect(pool.find((d) => d.instanceId === 'high')).toBeUndefined();
    expect(pool.find((d) => d.instanceId === 'low')).toBeDefined();
  });
});

// ── dealDamage criteria integration ──────────────────────────────────────

describe('dealDamage with CardCriteria', () => {
  it('deals damage to eachOpponentCharacter matching criteria', () => {
    // Use a 2-character opponent team so we can distinguish filtered vs. unfiltered
    const twoCharInput = basicGameInput({
      seed: 'criteria-two-char',
      playerCharacters: {
        alice: [
          { id: 'alice.c1', cardId: 'CHAR_TEST_001', elite: false },
          { id: 'alice.c2', cardId: 'CHAR_TEST_001', elite: false },
        ],
        bob: [
          { id: 'bob.c1', cardId: 'CHAR_TEST_001', elite: false },
          { id: 'bob.c2', cardId: 'CHAR_TEST_001', elite: false },
        ],
      },
    });
    let state = newGameInActionPhase(twoCharInput);
    const active = activeId(state);
    const opp = opponentId(state, active);
    const [char1, char2] = state.players[opp]!.characterOrder as [string, string];

    // Exhaust char1; char2 stays ready
    state = {
      ...state,
      players: {
        ...state.players,
        [opp]: {
          ...state.players[opp]!,
          characters: {
            ...state.players[opp]!.characters,
            [char1]: { ...state.players[opp]!.characters[char1]!, exhausted: true },
          },
        },
      },
    };

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'dealDamage', amount: 2, target: { kind: 'eachOpponentCharacter' }, criteria: { exhausted: false } },
    ]);

    // Only non-exhausted char2 should take damage
    expect(after.players[opp]!.characters[char1]!.damage).toBe(0);
    expect(after.players[opp]!.characters[char2]!.damage).toBe(2);
  });

  it('throws when pre-selected target does not meet criteria', () => {
    let state = setup();
    const active = activeId(state);
    const opp = opponentId(state, active);
    const [char1] = state.players[opp]!.characterOrder;
    // char1 has 0 damage; require maxDamage: 0 is fine, but unique: true should fail without meta
    state = withMeta(state, char1!, { type: 'character', color: 'red', subtypes: [], isUnique: false });

    expect(() =>
      applyEffects(state, ctx(state, active, [char1!]), [
        { op: 'dealDamage', amount: 1, target: { kind: 'opponentCharacter' }, criteria: { unique: true } },
      ])
    ).toThrow();
  });
});
