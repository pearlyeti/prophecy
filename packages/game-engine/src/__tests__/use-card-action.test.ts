import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal.js';
import { applyAction } from '../reducers/apply-action.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { Ability } from '../abilities/types.js';
import type { GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'uca-test' }));
}

/** Inject abilities onto the active player's first character. */
function withCharAbilities(state: GameState, abilities: Ability[]): GameState {
  const charId = state.players[state.activePlayerId!]!.characterOrder[0]!;
  return {
    ...state,
    cardAbilities: { ...state.cardAbilities, [charId]: abilities },
  };
}

function activeCharId(state: GameState): string {
  return state.players[state.activePlayerId!]!.characterOrder[0]!;
}

const gainOneResource: Ability = {
  kind: 'action',
  costs: [{ kind: 'exhaust' }],
  steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }],
};

const drawOneCard: Ability = {
  kind: 'powerAction',
  costs: [],
  steps: [{ effects: [{ op: 'drawCards', player: 'self', amount: 1 }] }],
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('applyAction({ type: "use-card-action" })', () => {
  it('action: exhausts character, fires effect, rotates turn', () => {
    const initial = withCharAbilities(setup(), [gainOneResource]);
    const active = initial.activePlayerId!;
    const charId = activeCharId(initial);
    const resourcesBefore = initial.players[active]!.resources;

    const { state, events } = applyAction(initial, {
      type: 'use-card-action',
      playerId: active,
      cardId: charId,
      abilityIndex: 0,
    });

    // Character is exhausted after paying the exhaust cost.
    expect(state.players[active]!.characters[charId]!.exhausted).toBe(true);
    // Effect fired: +1 resource.
    expect(state.players[active]!.resources).toBe(resourcesBefore + 1);
    // Turn rotated to the other player.
    expect(state.activePlayerId).not.toBe(active);
    // Event emitted.
    expect(events.some((e) => e.type === 'card.action-used')).toBe(true);
  });

  it('powerAction: does not exhaust, marks powerActionUsedThisRound, fires effect', () => {
    const initial = withCharAbilities(setup(), [drawOneCard]);
    const active = initial.activePlayerId!;
    const charId = activeCharId(initial);
    const handBefore = initial.players[active]!.hand.length;

    const { state } = applyAction(initial, {
      type: 'use-card-action',
      playerId: active,
      cardId: charId,
      abilityIndex: 0,
    });

    // No exhaust cost — character stays ready.
    expect(state.players[active]!.characters[charId]!.exhausted).toBe(false);
    // Marked as used.
    expect(state.players[active]!.characters[charId]!.powerActionUsedThisRound).toBe(true);
    // Drew a card.
    expect(state.players[active]!.hand.length).toBe(handBefore + 1);
  });

  it('powerAction: throws when already used this round', () => {
    const initial = withCharAbilities(setup(), [drawOneCard]);
    const active = initial.activePlayerId!;
    const charId = activeCharId(initial);

    // Use it once (turn rotates to opponent; we need to get back to active player).
    const { state: afterFirst } = applyAction(initial, {
      type: 'use-card-action',
      playerId: active,
      cardId: charId,
      abilityIndex: 0,
    });

    // The power action was used, but since turn rotated, let's directly mutate
    // state back to that player to test the guard without a full round.
    const stateWithActiveBack: GameState = {
      ...afterFirst,
      activePlayerId: active,
      consecutivePasses: 0,
    };

    expect(() =>
      applyAction(stateWithActiveBack, {
        type: 'use-card-action',
        playerId: active,
        cardId: charId,
        abilityIndex: 0,
      }),
    ).toThrow(IllegalActionError);
  });

  it('powerActionUsedThisRound resets at start of each round', () => {
    const initial = withCharAbilities(setup(), [drawOneCard]);
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;
    const charId = activeCharId(initial);

    // Use it once.
    const { state: afterAction } = applyAction(initial, {
      type: 'use-card-action',
      playerId: active,
      cardId: charId,
      abilityIndex: 0,
    });
    expect(afterAction.players[active]!.characters[charId]!.powerActionUsedThisRound).toBe(true);

    // Both players pass to trigger upkeep.
    const { state: afterOppPass } = applyAction(afterAction, {
      type: 'pass',
      playerId: opponent,
    });
    const { state: afterNewRound } = applyAction(afterOppPass, {
      type: 'pass',
      playerId: active,
    });

    // New round started — flag cleared.
    expect(afterNewRound.players[active]!.characters[charId]!.powerActionUsedThisRound).toBe(false);
  });

  it('throws when cardId is not an in-play character', () => {
    const initial = setup();
    expect(() =>
      applyAction(initial, {
        type: 'use-card-action',
        playerId: initial.activePlayerId!,
        cardId: 'not-a-char',
        abilityIndex: 0,
      }),
    ).toThrow(/not an in-play character/);
  });

  it('throws when abilityIndex is out of range', () => {
    const initial = withCharAbilities(setup(), [gainOneResource]);
    const charId = activeCharId(initial);
    expect(() =>
      applyAction(initial, {
        type: 'use-card-action',
        playerId: initial.activePlayerId!,
        cardId: charId,
        abilityIndex: 5,
      }),
    ).toThrow(/out of range/);
  });

  it('throws when ability kind is not action or powerAction', () => {
    const triggered: Ability = {
      kind: 'triggered',
      triggerEvent: { kind: 'afterActivateCharacter' },
      steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }],
    };
    const initial = withCharAbilities(setup(), [triggered]);
    const charId = activeCharId(initial);
    expect(() =>
      applyAction(initial, {
        type: 'use-card-action',
        playerId: initial.activePlayerId!,
        cardId: charId,
        abilityIndex: 0,
      }),
    ).toThrow(/expected action or powerAction/);
  });

  it('action with spendResources cost: deducts resources', () => {
    const expensive: Ability = {
      kind: 'action',
      costs: [{ kind: 'spendResources', amount: 2 }],
      steps: [{ effects: [{ op: 'gainResources', amount: 5 }] }],
    };
    const initial = withCharAbilities(setup(), [expensive]);
    const active = initial.activePlayerId!;
    const charId = activeCharId(initial);
    const resourcesBefore = initial.players[active]!.resources;

    const { state } = applyAction(initial, {
      type: 'use-card-action',
      playerId: active,
      cardId: charId,
      abilityIndex: 0,
    });

    expect(state.players[active]!.resources).toBe(resourcesBefore - 2 + 5);
  });

  it('throws when spendResources cost cannot be paid', () => {
    const tooExpensive: Ability = {
      kind: 'action',
      costs: [{ kind: 'spendResources', amount: 999 }],
      steps: [],
    };
    const initial = withCharAbilities(setup(), [tooExpensive]);
    const charId = activeCharId(initial);
    expect(() =>
      applyAction(initial, {
        type: 'use-card-action',
        playerId: initial.activePlayerId!,
        cardId: charId,
        abilityIndex: 0,
      }),
    ).toThrow(/not enough resources/);
  });
});
