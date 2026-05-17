import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action.js';
import { getLegalActions } from '../state/legal-actions.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { Ability } from '../abilities/types.js';
import type { GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'uca-effects-test' }));
}

function withCharAbilities(state: GameState, abilities: Ability[]): GameState {
  const charId = state.players[state.activePlayerId!]!.characterOrder[0]!;
  return { ...state, cardAbilities: { ...state.cardAbilities, [charId]: abilities } };
}

function activeCharId(state: GameState): string {
  return state.players[state.activePlayerId!]!.characterOrder[0]!;
}

function oppCharId(state: GameState): string {
  const oppId = state.playerOrder.find((id) => id !== state.activePlayerId)!;
  return state.players[oppId]!.characterOrder[0]!;
}

// ── actionableCardIds / powerActionableCardIds ────────────────────────────────

describe('getLegalActions: actionableCardIds / powerActionableCardIds', () => {
  it('actionableCardIds contains character with ready action ability', () => {
    const action: Ability = { kind: 'action', costs: [], steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] };
    const state = withCharAbilities(setup(), [action]);
    const active = state.activePlayerId!;
    const charId = activeCharId(state);

    const legal = getLegalActions(state, active);
    expect(legal.actionableCardIds).toContain(charId);
    expect(legal.powerActionableCardIds).not.toContain(charId);
  });

  it('powerActionableCardIds contains character with unused power action', () => {
    const pa: Ability = { kind: 'powerAction', costs: [], steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] };
    const state = withCharAbilities(setup(), [pa]);
    const active = state.activePlayerId!;
    const charId = activeCharId(state);

    const legal = getLegalActions(state, active);
    expect(legal.powerActionableCardIds).toContain(charId);
    expect(legal.actionableCardIds).not.toContain(charId);
  });

  it('actionableCardIds excludes character when exhaust cost cannot be met', () => {
    const action: Ability = { kind: 'action', costs: [{ kind: 'exhaust' }], steps: [] };
    let state = withCharAbilities(setup(), [action]);
    const active = state.activePlayerId!;
    const charId = activeCharId(state);

    // Exhaust the character manually.
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

    const legal = getLegalActions(state, active);
    expect(legal.actionableCardIds).not.toContain(charId);
  });

  it('powerActionableCardIds excludes character when power action already used', () => {
    const pa: Ability = { kind: 'powerAction', costs: [], steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] };
    const initial = withCharAbilities(setup(), [pa]);
    const active = initial.activePlayerId!;
    const charId = activeCharId(initial);

    const { state: afterUse } = applyAction(initial, {
      type: 'use-card-action',
      playerId: active,
      cardId: charId,
      abilityIndex: 0,
    });

    // Force active back to test the legal actions (power action used, turn rotated).
    const stateBack: GameState = { ...afterUse, activePlayerId: active };
    const legal = getLegalActions(stateBack, active);
    expect(legal.powerActionableCardIds).not.toContain(charId);
  });

  it('actionableCardIds excludes character when resources insufficient', () => {
    const action: Ability = {
      kind: 'action',
      costs: [{ kind: 'spendResources', amount: 10 }],
      steps: [],
    };
    let state = withCharAbilities(setup(), [action]);
    const active = state.activePlayerId!;

    // Zero out resources.
    state = {
      ...state,
      players: {
        ...state.players,
        [active]: { ...state.players[active]!, resources: 0 },
      },
    };

    const legal = getLegalActions(state, active);
    expect(legal.actionableCardIds).toHaveLength(0);
  });

  it('returns empty arrays for opponent (not their turn)', () => {
    const action: Ability = { kind: 'action', costs: [], steps: [] };
    const pa: Ability = { kind: 'powerAction', costs: [], steps: [] };
    const state = withCharAbilities(setup(), [action, pa]);
    const opp = state.playerOrder.find((id) => id !== state.activePlayerId)!;

    const legal = getLegalActions(state, opp);
    expect(legal.actionableCardIds).toHaveLength(0);
    expect(legal.powerActionableCardIds).toHaveLength(0);
  });
});

// ── targeted dealDamage via targetCharacterIds ────────────────────────────────

describe('use-card-action: targeted effects via targetCharacterIds', () => {
  it('dealDamage action with targetCharacterIds damages the target character', () => {
    // Deal 5 damage — setup places 2 shields on the loser's first character,
    // so 2 are absorbed by shields and 3 land as damage.
    const action: Ability = {
      kind: 'action',
      costs: [],
      steps: [{ effects: [{ op: 'dealDamage', target: { kind: 'opponentCharacter' }, amount: 5 }] }],
    };
    const initial = withCharAbilities(setup(), [action]);
    const active = initial.activePlayerId!;
    const charId = activeCharId(initial);
    const targetId = oppCharId(initial);
    const oppId = initial.playerOrder.find((id) => id !== active)!;

    const { state } = applyAction(initial, {
      type: 'use-card-action',
      playerId: active,
      cardId: charId,
      abilityIndex: 0,
      targetCharacterIds: [targetId],
    });

    // 5 damage − 2 shields = 3 net damage on the character.
    expect(state.players[oppId]!.characters[targetId]!.damage).toBe(3);
    expect(state.players[oppId]!.characters[targetId]!.shields).toBe(0);
  });

  it('addShields action with targetCharacterIds shields own character', () => {
    const action: Ability = {
      kind: 'action',
      costs: [],
      steps: [{ effects: [{ op: 'addShields', target: { kind: 'ownCharacter' }, amount: 1 }] }],
    };
    const initial = withCharAbilities(setup(), [action]);
    const active = initial.activePlayerId!;
    const charId = activeCharId(initial);
    const shieldsBefore = initial.players[active]!.characters[charId]!.shields;

    const { state } = applyAction(initial, {
      type: 'use-card-action',
      playerId: active,
      cardId: charId,
      abilityIndex: 0,
      targetCharacterIds: [charId],
    });

    expect(state.players[active]!.characters[charId]!.shields).toBe(shieldsBefore + 1);
  });
});
