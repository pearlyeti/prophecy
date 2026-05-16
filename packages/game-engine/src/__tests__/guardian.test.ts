import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action.js';
import { getLegalActions } from '../state/legal-actions.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { DieFace, DieInPool, GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'guardian-test' }));
}

function activeId(state: GameState) {
  return state.activePlayerId!;
}

function oppId(state: GameState) {
  return state.playerOrder.find((id) => id !== state.activePlayerId)!;
}

/** Give the active player's first character the guardian keyword. */
function withGuardian(state: GameState): GameState {
  const charId = state.players[activeId(state)]!.characterOrder[0]!;
  return { ...state, cardKeywords: { ...state.cardKeywords, [charId]: ['guardian'] } };
}

/** Place a die in the opponent's pool showing the given face. */
function withOppDie(state: GameState, face: DieFace, instanceId = 'opp-die-1'): GameState {
  const opp = oppId(state);
  const die: DieInPool = { instanceId, cardId: 'test', faceIndex: 0, face };
  const oppPlayer = state.players[opp]!;
  return {
    ...state,
    players: {
      ...state.players,
      [opp]: { ...oppPlayer, diceInPool: [...oppPlayer.diceInPool, die] },
    },
  };
}

const MELEE_3: DieFace = { symbol: 'melee', value: 3, cost: 0, modifier: false };
const RANGED_2: DieFace = { symbol: 'ranged', value: 2, cost: 0, modifier: false };
const SHIELD_1: DieFace = { symbol: 'shield', value: 1, cost: 0, modifier: false };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Guardian keyword', () => {
  it('activating a non-guardian character with opponent damage dice proceeds normally', () => {
    // No guardian keyword → activate flows straight through.
    const initial = withOppDie(setup(), MELEE_3);
    const charId = initial.players[activeId(initial)]!.characterOrder[0]!;

    const { state } = applyAction(initial, {
      type: 'activate',
      playerId: activeId(initial),
      cardId: charId,
    });

    expect(state.pendingGuardian).toBeNull();
    expect(state.players[activeId(initial)]!.diceInPool.length).toBeGreaterThan(0);
  });

  it('activating a guardian character with no opponent damage dice proceeds normally', () => {
    // Guardian keyword but opponent has only a shield die → no pause.
    let state = withGuardian(setup());
    state = withOppDie(state, SHIELD_1);
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;

    const { state: after } = applyAction(state, {
      type: 'activate',
      playerId: active,
      cardId: charId,
    });

    expect(after.pendingGuardian).toBeNull();
    expect(after.players[active]!.diceInPool.length).toBeGreaterThan(0);
  });

  it('activating a guardian character with opponent melee die sets pendingGuardian and does not roll', () => {
    let state = withGuardian(setup());
    state = withOppDie(state, MELEE_3);
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;
    const poolBefore = state.players[active]!.diceInPool.length;

    const { state: after, events } = applyAction(state, {
      type: 'activate',
      playerId: active,
      cardId: charId,
    });

    expect(after.pendingGuardian).not.toBeNull();
    expect(after.pendingGuardian!.activatingCharacterId).toBe(charId);
    expect(after.pendingGuardian!.activatingPlayerId).toBe(active);
    // No dice rolled yet.
    expect(after.players[active]!.diceInPool.length).toBe(poolBefore);
    // No events emitted yet.
    expect(events).toHaveLength(0);
  });

  it('activating a guardian character with opponent ranged die sets pendingGuardian', () => {
    let state = withGuardian(setup());
    state = withOppDie(state, RANGED_2);
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;

    const { state: after } = applyAction(state, {
      type: 'activate',
      playerId: active,
      cardId: charId,
    });

    expect(after.pendingGuardian).not.toBeNull();
  });

  it('getLegalActions: exposes guardianInterceptableDieIds and canSkipGuardian while pending', () => {
    let state = withGuardian(setup());
    state = withOppDie(state, MELEE_3, 'opp-die-melee');
    state = withOppDie(state, RANGED_2, 'opp-die-ranged');
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;

    const { state: pending } = applyAction(state, {
      type: 'activate',
      playerId: active,
      cardId: charId,
    });

    const legal = getLegalActions(pending, active);
    expect(legal.canSkipGuardian).toBe(true);
    expect(legal.guardianInterceptableDieIds).toContain('opp-die-melee');
    expect(legal.guardianInterceptableDieIds).toContain('opp-die-ranged');
    // All normal actions blocked.
    expect(legal.canPass).toBe(false);
    expect(legal.activatableCharacterIds).toHaveLength(0);
    expect(legal.resolvableSymbols).toHaveLength(0);
  });

  it('guardian.intercept with null skips intercept and completes activation', () => {
    let state = withGuardian(setup());
    state = withOppDie(state, MELEE_3);
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;

    const { state: pending } = applyAction(state, {
      type: 'activate',
      playerId: active,
      cardId: charId,
    });
    expect(pending.pendingGuardian).not.toBeNull();

    const { state: after } = applyAction(pending, {
      type: 'guardian.intercept',
      playerId: active,
      dieInstanceId: null,
    });

    // pendingGuardian cleared.
    expect(after.pendingGuardian).toBeNull();
    // Dice were rolled (activation completed).
    expect(after.players[active]!.diceInPool.length).toBeGreaterThan(0);
    // Character is exhausted.
    expect(after.players[active]!.characters[charId]?.exhausted).toBe(true);
    // Opponent die was NOT removed.
    expect(after.players[oppId(state)]!.diceInPool.some((d) => d.instanceId === 'opp-die-1')).toBe(true);
  });

  it('guardian.intercept removes opponent die and deals its value as damage to Guardian', () => {
    // Guardian character has 10 health, 0 shields (setup places 2 shields on
    // the loser's first character, and the active player is the winner).
    let state = withGuardian(setup());
    state = withOppDie(state, MELEE_3);
    const active = activeId(state);
    const opp = oppId(state);
    const charId = state.players[active]!.characterOrder[0]!;
    const shieldsBefore = state.players[active]!.characters[charId]!.shields;

    const { state: pending } = applyAction(state, {
      type: 'activate',
      playerId: active,
      cardId: charId,
    });

    const { state: after } = applyAction(pending, {
      type: 'guardian.intercept',
      playerId: active,
      dieInstanceId: 'opp-die-1',
    });

    // Opponent die removed.
    expect(after.players[opp]!.diceInPool.find((d) => d.instanceId === 'opp-die-1')).toBeUndefined();
    // Guardian took MELEE_3.value = 3 damage minus shields.
    const damageExpected = Math.max(0, 3 - shieldsBefore);
    expect(after.players[active]!.characters[charId]!.damage).toBe(damageExpected);
    // Activation completed — dice rolled.
    expect(after.players[active]!.diceInPool.length).toBeGreaterThan(0);
    // pendingGuardian cleared.
    expect(after.pendingGuardian).toBeNull();
  });

  it('guardian self-defeat by intercept triggers character.defeated and game may end', () => {
    // Give the Guardian character 1 health so the intercept kills it.
    let state = withGuardian(setup());
    state = withOppDie(state, MELEE_3);
    const active = activeId(state);
    const charId = state.players[active]!.characterOrder[0]!;

    // Override health to 1 (die immediately to 3 damage).
    state = {
      ...state,
      players: {
        ...state.players,
        [active]: {
          ...state.players[active]!,
          characters: {
            ...state.players[active]!.characters,
            [charId]: { ...state.players[active]!.characters[charId]!, health: 1, shields: 0 },
          },
        },
      },
    };

    const { state: pending } = applyAction(state, {
      type: 'activate',
      playerId: active,
      cardId: charId,
    });

    const { state: after, events } = applyAction(pending, {
      type: 'guardian.intercept',
      playerId: active,
      dieInstanceId: 'opp-die-1',
    });

    // Character is gone.
    expect(after.players[active]!.characters[charId]).toBeUndefined();
    // A defeat event was emitted.
    expect(events.some((e) => e.type === 'character.defeated')).toBe(true);
  });
});
