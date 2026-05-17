import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action.js';
import { getLegalActions } from '../state/legal-actions.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { Ability } from '../abilities/types.js';
import type { DieFace, DieInPool, GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'special-claim-test' }));
}

function activeId(state: GameState) {
  return state.activePlayerId!;
}

function withPoolDie(state: GameState, playerId: string, face: DieFace, instanceId: string, ownerInstanceId?: string): GameState {
  const die: DieInPool = ownerInstanceId
    ? { instanceId, cardId: 'test', faceIndex: 0, face, ownerInstanceId }
    : { instanceId, cardId: 'test', faceIndex: 0, face };
  const p = state.players[playerId]!;
  return { ...state, players: { ...state.players, [playerId]: { ...p, diceInPool: [...p.diceInPool, die] } } };
}

const SPECIAL_FACE: DieFace = { symbol: 'special', value: 0, cost: 0, modifier: false };

// ── Special ability dispatcher ─────────────────────────────────────────────

describe('Special ability dispatcher', () => {
  it('special die appears in resolvableSymbols', () => {
    const initial = setup();
    const active = activeId(initial);
    const charId = initial.players[active]!.characterOrder[0]!;
    const state = withPoolDie(initial, active, SPECIAL_FACE, 'sp-die', charId);

    const legal = getLegalActions(state, active);
    expect(legal.resolvableSymbols).toContain('special');
  });

  it('resolving a special die with no special ability is a no-op (no error)', () => {
    const initial = setup();
    const active = activeId(initial);
    const charId = initial.players[active]!.characterOrder[0]!;
    const state = withPoolDie(initial, active, SPECIAL_FACE, 'sp-die', charId);

    // cardAbilities[charId] is empty — should succeed without throwing.
    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        targets: [{ dieInstanceIds: ['sp-die'] }],
      }),
    ).not.toThrow();
  });

  it('resolving a special die fires the special ability effects', () => {
    const initial = setup();
    const active = activeId(initial);
    const charId = initial.players[active]!.characterOrder[0]!;
    const resourcesBefore = initial.players[active]!.resources;

    const specialAbility: Ability = {
      kind: 'special',
      steps: [{ effects: [{ op: 'gainResources', amount: 3 }] }],
    };
    const state = {
      ...withPoolDie(initial, active, SPECIAL_FACE, 'sp-die', charId),
      cardAbilities: { ...initial.cardAbilities, [charId]: [specialAbility] },
    };

    const { state: after } = applyAction(state, {
      type: 'resolve-dice',
      playerId: active,
      targets: [{ dieInstanceIds: ['sp-die'] }],
    });

    expect(after.players[active]!.resources).toBe(resourcesBefore + 3);
    // Die removed from pool.
    expect(after.players[active]!.diceInPool.find((d) => d.instanceId === 'sp-die')).toBeUndefined();
  });

  it('resolving a special die on a transient die (no ownerInstanceId) is a no-op', () => {
    const initial = setup();
    const active = activeId(initial);
    // Transient die: no ownerInstanceId
    const state = withPoolDie(initial, active, SPECIAL_FACE, 'sp-transient');

    expect(() =>
      applyAction(state, {
        type: 'resolve-dice',
        playerId: active,
        targets: [{ dieInstanceIds: ['sp-transient'] }],
      }),
    ).not.toThrow();
  });
});

// ── Claim ability dispatcher ───────────────────────────────────────────────

describe('Claim ability dispatcher', () => {
  it('claiming a battlefield with no claim ability has no effect (no regression)', () => {
    const initial = setup();
    const active = activeId(initial);

    const { state } = applyAction(initial, { type: 'claim-battlefield', playerId: active });

    expect(state.playerWhoClaimedThisRound).toBe(active);
    expect(state.battlefieldControllerId).toBe(active);
  });

  it('claiming fires a gainResources claim ability on the battlefield card', () => {
    const initial = setup();
    const active = activeId(initial);
    const battlefieldId = initial.players[active]!.battlefieldCardId!;
    const resourcesBefore = initial.players[active]!.resources;

    const claimAbility: Ability = {
      kind: 'claim',
      steps: [{ effects: [{ op: 'gainResources', amount: 2 }] }],
    };
    const state = {
      ...initial,
      cardAbilities: { ...initial.cardAbilities, [battlefieldId]: [claimAbility] },
    };

    const { state: after } = applyAction(state, { type: 'claim-battlefield', playerId: active });

    expect(after.players[active]!.resources).toBe(resourcesBefore + 2);
  });

  it('claiming fires a loseResources claim ability against the opponent', () => {
    const initial = setup();
    const active = activeId(initial);
    const opp = initial.playerOrder.find((id) => id !== active)!;
    const battlefieldId = initial.players[active]!.battlefieldCardId!;
    const oppResourcesBefore = initial.players[opp]!.resources;

    const claimAbility: Ability = {
      kind: 'claim',
      steps: [{ effects: [{ op: 'loseResources', target: 'opponent', amount: 1 }] }],
    };
    const state = {
      ...initial,
      cardAbilities: { ...initial.cardAbilities, [battlefieldId]: [claimAbility] },
    };

    const { state: after } = applyAction(state, { type: 'claim-battlefield', playerId: active });

    expect(after.players[opp]!.resources).toBe(Math.max(0, oppResourcesBefore - 1));
  });

  it('multiple claim abilities on the same battlefield all fire', () => {
    const initial = setup();
    const active = activeId(initial);
    const battlefieldId = initial.players[active]!.battlefieldCardId!;
    const resourcesBefore = initial.players[active]!.resources;

    const state = {
      ...initial,
      cardAbilities: {
        ...initial.cardAbilities,
        [battlefieldId]: [
          { kind: 'claim' as const, steps: [{ effects: [{ op: 'gainResources' as const, amount: 1 }] }] },
          { kind: 'claim' as const, steps: [{ effects: [{ op: 'gainResources' as const, amount: 2 }] }] },
        ],
      },
    };

    const { state: after } = applyAction(state, { type: 'claim-battlefield', playerId: active });

    expect(after.players[active]!.resources).toBe(resourcesBefore + 3);
  });
});
