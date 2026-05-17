import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action.js';
import { applySteps } from '../abilities/dispatch.js';
import type { DispatchContext } from '../abilities/dispatch.js';
import { newGameInActionPhase } from '../state/new-game.js';
import { getLegalActions } from '../state/legal-actions.js';
import type { GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function setup(overrides: Parameters<typeof basicGameInput>[0] = {}) {
  return newGameInActionPhase(basicGameInput({ seed: 'choose-test', ...overrides }));
}

function ctx(state: GameState, playerId: string): DispatchContext {
  return { playerId, characterTargets: [] };
}

function activeAndOpp(state: GameState) {
  const active = state.activePlayerId!;
  const opp = state.playerOrder.find((id) => id !== active)!;
  return { active, opp };
}

// ── choose sets pendingChoice ──────────────────────────────────────────────

describe('choose effect — suspension', () => {
  it('sets pendingChoice with branches and count', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    const { state: after } = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [
            { label: 'A', steps: [{ effects: [{ op: 'gainResources', amount: 2 }] }] },
            { label: 'B', steps: [{ effects: [{ op: 'gainResources', amount: 5 }] }] },
            { label: 'C', steps: [{ effects: [{ op: 'drawCards', player: 'self', amount: 1 }] }] },
          ],
        }],
      },
    ]);

    expect(after.pendingChoice).not.toBeNull();
    expect(after.pendingChoice!.playerId).toBe(active);
    expect(after.pendingChoice!.count).toBe(1);
    expect(after.pendingChoice!.branches).toHaveLength(3);
  });

  it('suspends remaining steps until resolve-choice is called', () => {
    const state = setup();
    const { active } = activeAndOpp(state);
    const resourcesBefore = state.players[active]!.resources;

    const { state: after } = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [{ steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] }],
        }],
      },
      { effects: [{ op: 'gainResources', amount: 10 }] },
    ]);

    // gainResources:10 must not have run yet
    expect(after.players[active]!.resources).toBe(resourcesBefore);
    expect(after.pendingChoice!.remainingSteps).toHaveLength(1);
    expect(after.pendingChoice!.remainingSteps[0]).toMatchObject({
      effects: [{ op: 'gainResources', amount: 10 }],
    });
  });
});

// ── resolve-choice: count=1 ────────────────────────────────────────────────

describe('resolve-choice — count=1', () => {
  it('runs only the chosen branch (branch 0)', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [
            { steps: [{ effects: [{ op: 'gainResources', amount: 2 }] }] },
            { steps: [{ effects: [{ op: 'gainResources', amount: 5 }] }] },
            { steps: [{ effects: [{ op: 'gainResources', amount: 99 }] }] },
          ],
        }],
      },
    ]).state;

    const resourcesBefore = s.players[active]!.resources;
    const result = applyAction(s, { type: 'resolve-choice', playerId: active, picks: [0] });

    expect(result.state.pendingChoice).toBeNull();
    expect(result.state.players[active]!.resources).toBe(resourcesBefore + 2);
  });

  it('runs only the chosen branch (branch 2)', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [
            { steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] },
            { steps: [{ effects: [{ op: 'gainResources', amount: 2 }] }] },
            { steps: [{ effects: [{ op: 'gainResources', amount: 7 }] }] },
          ],
        }],
      },
    ]).state;

    const resourcesBefore = s.players[active]!.resources;
    const result = applyAction(s, { type: 'resolve-choice', playerId: active, picks: [2] });

    expect(result.state.players[active]!.resources).toBe(resourcesBefore + 7);
  });

  it('clears pendingChoice after resolution', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [{ steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] }],
        }],
      },
    ]).state;

    const result = applyAction(s, { type: 'resolve-choice', playerId: active, picks: [0] });
    expect(result.state.pendingChoice).toBeNull();
  });
});

// ── resolve-choice: count=2 ────────────────────────────────────────────────

describe('resolve-choice — count=2', () => {
  it('runs two chosen branches in chosen order', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 2,
          branches: [
            { steps: [{ effects: [{ op: 'gainResources', amount: 3 }] }] },
            { steps: [{ effects: [{ op: 'gainResources', amount: 5 }] }] },
            { steps: [{ effects: [{ op: 'gainResources', amount: 11 }] }] },
          ],
        }],
      },
    ]).state;

    const resourcesBefore = s.players[active]!.resources;
    // Pick branches 2 then 0 (order matters for any stateful effects)
    const result = applyAction(s, { type: 'resolve-choice', playerId: active, picks: [2, 0] });

    expect(result.state.players[active]!.resources).toBe(resourcesBefore + 11 + 3);
  });

  it('does NOT run the unchosen branch', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 2,
          branches: [
            { steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] },
            { steps: [{ effects: [{ op: 'gainResources', amount: 2 }] }] },
            { steps: [{ effects: [{ op: 'gainResources', amount: 100 }] }] },
          ],
        }],
      },
    ]).state;

    const resourcesBefore = s.players[active]!.resources;
    // Pick branches 0 and 1 only — branch 2 (100 resources) must not run
    const result = applyAction(s, { type: 'resolve-choice', playerId: active, picks: [0, 1] });

    expect(result.state.players[active]!.resources).toBe(resourcesBefore + 1 + 2);
  });
});

// ── then-gated step after choose ──────────────────────────────────────────

describe('choose + then-gated step', () => {
  it('then-gated step runs after all chosen branches resolve', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [
            { steps: [{ effects: [{ op: 'gainResources', amount: 2 }] }] },
          ],
        }],
      },
      { effects: [{ op: 'gainResources', amount: 7 }], then: true },
    ]).state;

    const resourcesBefore = s.players[active]!.resources;
    const result = applyAction(s, { type: 'resolve-choice', playerId: active, picks: [0] });

    // Both the chosen branch (2) and the then-step (7) should have applied
    expect(result.state.players[active]!.resources).toBe(resourcesBefore + 2 + 7);
  });
});

// ── remainingSteps resume after resolve ───────────────────────────────────

describe('choose mid-ability — remainingSteps resume', () => {
  it('resumes step after choose with correct state', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      { effects: [{ op: 'gainResources', amount: 1 }] },
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [{ steps: [{ effects: [{ op: 'gainResources', amount: 10 }] }] }],
        }],
      },
      { effects: [{ op: 'gainResources', amount: 3 }] },
    ]).state;

    // gainResources:1 ran before the choose, gainResources:3 is in remainingSteps
    const resourcesBefore = s.players[active]!.resources;
    expect(s.pendingChoice!.remainingSteps).toHaveLength(1);

    const result = applyAction(s, { type: 'resolve-choice', playerId: active, picks: [0] });

    // Branch +10, then remaining +3
    expect(result.state.players[active]!.resources).toBe(resourcesBefore + 10 + 3);
  });
});

// ── getLegalActions blocks while pendingChoice is set ─────────────────────

describe('getLegalActions while pendingChoice is set', () => {
  it('blocks pass/activate for the choosing player', () => {
    const state = setup();
    const { active, opp } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [{ steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] }],
        }],
      },
    ]).state;

    const legal = getLegalActions(s, active);
    expect(legal.canResolveChoice).toBe(true);
    expect(legal.canPass).toBe(false);
    expect(legal.activatableCharacterIds).toHaveLength(0);
    expect(legal.canConcede).toBe(true);
  });

  it('opponent cannot resolve-choice', () => {
    const state = setup();
    const { active, opp } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [{ steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] }],
        }],
      },
    ]).state;

    const oppLegal = getLegalActions(s, opp);
    expect(oppLegal.canResolveChoice).toBe(false);
    expect(oppLegal.canConcede).toBe(true);
  });
});

// ── Validation errors ──────────────────────────────────────────────────────

describe('resolve-choice validation', () => {
  it('throws when no pendingChoice', () => {
    const state = setup();
    const { active } = activeAndOpp(state);
    expect(() =>
      applyAction(state, { type: 'resolve-choice', playerId: active, picks: [0] }),
    ).toThrow();
  });

  it('throws when wrong player tries to resolve', () => {
    const state = setup();
    const { active, opp } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [{ steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }] }],
        }],
      },
    ]).state;

    expect(() =>
      applyAction(s, { type: 'resolve-choice', playerId: opp, picks: [0] }),
    ).toThrow();
  });

  it('throws when pick count does not match required count', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 2,
          branches: [
            { steps: [] },
            { steps: [] },
            { steps: [] },
          ],
        }],
      },
    ]).state;

    // Should require exactly 2 picks
    expect(() =>
      applyAction(s, { type: 'resolve-choice', playerId: active, picks: [0] }),
    ).toThrow();
  });

  it('throws when pick index is out of range', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 1,
          branches: [{ steps: [] }, { steps: [] }],
        }],
      },
    ]).state;

    expect(() =>
      applyAction(s, { type: 'resolve-choice', playerId: active, picks: [5] }),
    ).toThrow();
  });

  it('throws when picks contain duplicates', () => {
    const state = setup();
    const { active } = activeAndOpp(state);

    let s = applySteps(state, ctx(state, active), [
      {
        effects: [{
          op: 'choose',
          count: 2,
          branches: [{ steps: [] }, { steps: [] }, { steps: [] }],
        }],
      },
    ]).state;

    expect(() =>
      applyAction(s, { type: 'resolve-choice', playerId: active, picks: [0, 0] }),
    ).toThrow();
  });
});
