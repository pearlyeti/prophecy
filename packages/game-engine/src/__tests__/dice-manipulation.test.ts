import { describe, expect, it } from 'vitest';

import { applyEffects } from '../abilities/dispatch.js';
import type { DispatchContext } from '../abilities/dispatch.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { DieFace, DieInPool, GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'dice-manip-test' }));
}

function activeId(state: GameState) {
  return state.activePlayerId!;
}

function opponentId(state: GameState, playerId: string) {
  return state.playerOrder.find((id) => id !== playerId)!;
}

function addDie(state: GameState, playerId: string, face: DieFace, instanceId: string): GameState {
  const p = state.players[playerId]!;
  const die: DieInPool = { instanceId, cardId: 'test', faceIndex: 0, face };
  return { ...state, players: { ...state.players, [playerId]: { ...p, diceInPool: [...p.diceInPool, die] } } };
}

function ctx(state: GameState, playerId: string): DispatchContext {
  return { playerId, characterTargets: [] };
}

const meleeFace: DieFace = { symbol: 'melee', value: 2, cost: 0, modifier: false };
const resourceFace: DieFace = { symbol: 'resource', value: 1, cost: 0, modifier: false };
const blankFace: DieFace = { symbol: 'blank', value: 0, cost: 0, modifier: false };

// ── removeDie ─────────────────────────────────────────────────────────────

describe('removeDie effect', () => {
  it('removes one die from own pool when no symbol filter', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(initial, active, meleeFace, 'die-1');

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'removeDie', from: 'ownPool', count: 1 },
    ]);

    expect(after.players[active]!.diceInPool.find((d) => d.instanceId === 'die-1')).toBeUndefined();
  });

  it('removes one die from opponent pool filtered by symbol', () => {
    const initial = setup();
    const active = activeId(initial);
    const opp = opponentId(initial, active);
    const state = addDie(
      addDie(initial, opp, meleeFace, 'opp-melee'),
      opp, resourceFace, 'opp-res',
    );

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'removeDie', from: 'opponentPool', symbol: 'melee', count: 1 },
    ]);

    const pool = after.players[opp]!.diceInPool;
    expect(pool.find((d) => d.instanceId === 'opp-melee')).toBeUndefined();
    expect(pool.find((d) => d.instanceId === 'opp-res')).toBeDefined();
  });

  it('emits die.removed event for each removed die', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(addDie(initial, active, meleeFace, 'die-a'), active, meleeFace, 'die-b');

    const { events } = applyEffects(state, ctx(state, active), [
      { op: 'removeDie', from: 'ownPool', symbol: 'melee', count: 2 },
    ]);

    const removed = events.filter((e) => e.type === 'die.removed');
    expect(removed).toHaveLength(2);
  });

  it('removes nothing if symbol filter matches nothing', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(initial, active, meleeFace, 'die-1');

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'removeDie', from: 'ownPool', symbol: 'ranged', count: 1 },
    ]);

    expect(after.players[active]!.diceInPool.find((d) => d.instanceId === 'die-1')).toBeDefined();
  });
});

// ── turnDie ───────────────────────────────────────────────────────────────

describe('turnDie effect', () => {
  it('turns a die in own pool to the target symbol', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(initial, active, meleeFace, 'die-1');

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'turnDie', from: 'ownPool', toSymbol: 'resource', count: 1 },
    ]);

    const die = after.players[active]!.diceInPool.find((d) => d.instanceId === 'die-1')!;
    expect(die.face.symbol).toBe('resource');
    expect(die.face.value).toBe(meleeFace.value);
  });

  it('turns an opponent die when fromSymbol filter matches', () => {
    const initial = setup();
    const active = activeId(initial);
    const opp = opponentId(initial, active);
    const state = addDie(
      addDie(initial, opp, meleeFace, 'opp-melee'),
      opp, resourceFace, 'opp-res',
    );

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'turnDie', from: 'opponentPool', toSymbol: 'blank', fromSymbol: 'melee', count: 1 },
    ]);

    const pool = after.players[opp]!.diceInPool;
    expect(pool.find((d) => d.instanceId === 'opp-melee')!.face.symbol).toBe('blank');
    expect(pool.find((d) => d.instanceId === 'opp-res')!.face.symbol).toBe('resource');
  });

  it('emits die.turned event', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(initial, active, meleeFace, 'die-1');

    const { events } = applyEffects(state, ctx(state, active), [
      { op: 'turnDie', from: 'ownPool', toSymbol: 'resource' },
    ]);

    const turned = events.find((e) => e.type === 'die.turned');
    expect(turned).toBeDefined();
    expect((turned as any).payload.fromSymbol).toBe('melee');
    expect((turned as any).payload.toSymbol).toBe('resource');
  });

  it('does not turn die if fromSymbol filter does not match', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(initial, active, meleeFace, 'die-1');

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'turnDie', from: 'ownPool', toSymbol: 'blank', fromSymbol: 'ranged' },
    ]);

    expect(after.players[active]!.diceInPool.find((d) => d.instanceId === 'die-1')!.face.symbol).toBe('melee');
  });
});

// ── modifyDieValue ────────────────────────────────────────────────────────

describe('modifyDieValue effect', () => {
  it('increases a die value by delta', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(initial, active, meleeFace, 'die-1');

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'modifyDieValue', from: 'ownPool', delta: 2 },
    ]);

    const die = after.players[active]!.diceInPool.find((d) => d.instanceId === 'die-1')!;
    expect(die.face.value).toBe(meleeFace.value + 2);
  });

  it('decreases a die value, clamped at 0', () => {
    const initial = setup();
    const active = activeId(initial);
    const face: DieFace = { symbol: 'melee', value: 1, cost: 0, modifier: false };
    const state = addDie(initial, active, face, 'die-1');

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'modifyDieValue', from: 'ownPool', delta: -5 },
    ]);

    const die = after.players[active]!.diceInPool.find((d) => d.instanceId === 'die-1')!;
    expect(die.face.value).toBe(0);
  });

  it('emits die.value-modified event', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(initial, active, meleeFace, 'die-1');

    const { events } = applyEffects(state, ctx(state, active), [
      { op: 'modifyDieValue', from: 'ownPool', delta: 1 },
    ]);

    const mod = events.find((e) => e.type === 'die.value-modified');
    expect(mod).toBeDefined();
    expect((mod as any).payload.delta).toBe(1);
    expect((mod as any).payload.newValue).toBe(meleeFace.value + 1);
  });

  it('skips blank dice', () => {
    const initial = setup();
    const active = activeId(initial);
    const state = addDie(initial, active, blankFace, 'blank-die');

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'modifyDieValue', from: 'ownPool', delta: 3 },
    ]);

    const die = after.players[active]!.diceInPool.find((d) => d.instanceId === 'blank-die')!;
    expect(die.face.value).toBe(0);
  });

  it('modifies opponent dice when from=opponentPool', () => {
    const initial = setup();
    const active = activeId(initial);
    const opp = opponentId(initial, active);
    const state = addDie(initial, opp, meleeFace, 'opp-die');

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'modifyDieValue', from: 'opponentPool', delta: -1 },
    ]);

    const die = after.players[opp]!.diceInPool.find((d) => d.instanceId === 'opp-die')!;
    expect(die.face.value).toBe(meleeFace.value - 1);
  });
});
