import { describe, expect, it } from 'vitest';
import { applyAction } from '../reducers/apply-action.js';
import { getLegalActions } from '../state/legal-actions.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { DieInPool, GameState, SupportState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

// Six-face die used for the test support card.
const SUPPORT_DIE_FACES = [
  { symbol: 'melee' as const, value: 2, cost: 0, modifier: false },
  { symbol: 'ranged' as const, value: 2, cost: 0, modifier: false },
  { symbol: 'resource' as const, value: 1, cost: 0, modifier: false },
  { symbol: 'shield' as const, value: 1, cost: 0, modifier: false },
  { symbol: 'disrupt' as const, value: 1, cost: 0, modifier: false },
  { symbol: 'blank' as const, value: 0, cost: 0, modifier: false },
] as const;

const SUPPORT_ID = 'test.support.0';

/** Base game with cardTypes/stability/dieFaces set up for SUPPORT_ID. */
function baseGame() {
  return newGameInActionPhase(
    basicGameInput({
      cardTypes: { [SUPPORT_ID]: 'support' },
      cardStability: { [SUPPORT_ID]: 4 },
      cardDieFaces: { [SUPPORT_ID]: SUPPORT_DIE_FACES },
      cardCosts: { [SUPPORT_ID]: 2 },
      cardCatalogIds: { [SUPPORT_ID]: 'SUP_001' },
    }),
  );
}

/** Inject a card ID into a player's hand. */
function withHand(state: GameState, playerId: string, cardId: string): GameState {
  const p = state.players[playerId]!;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...p, hand: [cardId, ...p.hand], resources: Math.max(p.resources, 10) },
    },
  };
}

/** Inject dice into a player's pool. */
function withPool(state: GameState, playerId: string, dice: readonly DieInPool[]): GameState {
  const p = state.players[playerId]!;
  return { ...state, players: { ...state.players, [playerId]: { ...p, diceInPool: [...dice] } } };
}

/** Inject a support into a player's supports map. */
function withSupport(state: GameState, playerId: string, support: SupportState): GameState {
  const p = state.players[playerId]!;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...p,
        supports: { ...p.supports, [support.id]: support },
        supportOrder: [...p.supportOrder, support.id],
      },
    },
  };
}

/** Return the active player's id. */
function active(state: GameState): string {
  return state.activePlayerId!;
}

/** Return the non-active player's id. */
function opp(state: GameState): string {
  return state.playerOrder.find((id) => id !== active(state))!;
}

describe('support card: play into play', () => {
  it('playing a support card adds it to player.supports, not discard', () => {
    let state = baseGame();
    const alice = active(state);
    state = withHand(state, alice, SUPPORT_ID);

    state = applyAction(state, { type: 'play-card', playerId: alice, cardId: SUPPORT_ID }).state;

    const player = state.players[alice]!;
    expect(player.supports[SUPPORT_ID]).toBeDefined();
    expect(player.supports[SUPPORT_ID]!.stability).toBe(4);
    expect(player.supports[SUPPORT_ID]!.maxStability).toBe(4);
    expect(player.supports[SUPPORT_ID]!.shields).toBe(0);
    expect(player.supports[SUPPORT_ID]!.exhausted).toBe(false);
    expect(player.supports[SUPPORT_ID]!.dice).toHaveLength(1);
    expect(player.supportOrder).toContain(SUPPORT_ID);
    expect(player.hand).not.toContain(SUPPORT_ID);
    expect(player.discard).not.toContain(SUPPORT_ID);
  });

  it('emits card.played event when support is played', () => {
    let state = baseGame();
    const alice = active(state);
    state = withHand(state, alice, SUPPORT_ID);

    const { events } = applyAction(state, { type: 'play-card', playerId: alice, cardId: SUPPORT_ID });
    expect(events.some((e) => e.type === 'card.played')).toBe(true);
  });
});

describe('support card: activation', () => {
  it('activating a support exhausts it and adds its die to the pool', () => {
    let state = baseGame();
    const alice = active(state);
    const bob = opp(state);
    state = withHand(state, alice, SUPPORT_ID);

    // Play the support first.
    state = applyAction(state, { type: 'play-card', playerId: alice, cardId: SUPPORT_ID }).state;

    // Pass through opponent so it's alice's turn again.
    state = applyAction(state, { type: 'pass', playerId: bob }).state;

    expect(state.activePlayerId).toBe(alice);
    const { state: afterActivate, events } = applyAction(state, {
      type: 'activate',
      playerId: alice,
      cardId: SUPPORT_ID,
    });

    const player = afterActivate.players[alice]!;
    expect(player.supports[SUPPORT_ID]!.exhausted).toBe(true);
    expect(player.diceInPool.some((d) => d.ownerInstanceId === SUPPORT_ID)).toBe(true);
    expect(events.some((e) => e.type === 'support.activated')).toBe(true);
  });

  it('activating a support reports it in activatableSupportIds before activation', () => {
    let state = baseGame();
    const alice = active(state);
    const bob = opp(state);
    state = withHand(state, alice, SUPPORT_ID);

    state = applyAction(state, { type: 'play-card', playerId: alice, cardId: SUPPORT_ID }).state;
    state = applyAction(state, { type: 'pass', playerId: bob }).state;

    const legal = getLegalActions(state, alice);
    expect(legal.activatableSupportIds).toContain(SUPPORT_ID);
  });

  it('exhausted support is not in activatableSupportIds', () => {
    let state = baseGame();
    const alice = active(state);
    const bob = opp(state);
    state = withHand(state, alice, SUPPORT_ID);

    state = applyAction(state, { type: 'play-card', playerId: alice, cardId: SUPPORT_ID }).state;
    state = applyAction(state, { type: 'pass', playerId: bob }).state;
    state = applyAction(state, { type: 'activate', playerId: alice, cardId: SUPPORT_ID }).state;

    // bob's turn — support is exhausted; then alice's turn.
    state = applyAction(state, { type: 'pass', playerId: bob }).state;
    const legal = getLegalActions(state, alice);
    expect(legal.activatableSupportIds).not.toContain(SUPPORT_ID);
  });
});

describe('support card: stability reduction via Disrupt', () => {
  const DISRUPT_DIE: DieInPool = {
    instanceId: 'disrupt.die.test',
    cardId: 'CHAR_TEST_001',
    faceIndex: 0,
    face: { symbol: 'disrupt', value: 3, cost: 0, modifier: false },
    ownerInstanceId: 'test.char',
  };

  const BOB_SUPPORT: SupportState = {
    id: 'bob.support.test',
    cardId: 'SUP_001',
    stability: 4,
    maxStability: 4,
    shields: 0,
    exhausted: false,
    dice: [],
    upgradeIds: [],
  };

  it('disrupt targeting a support reduces stability', () => {
    let state = baseGame();
    const alice = active(state);
    const bob = opp(state);
    state = withPool(state, alice, [DISRUPT_DIE]);
    state = withSupport(state, bob, BOB_SUPPORT);

    const { state: after, events } = applyAction(state, {
      type: 'resolve-dice',
      playerId: alice,
      targets: [{ dieInstanceIds: [DISRUPT_DIE.instanceId], targetSupportId: BOB_SUPPORT.id }],
    });

    expect(after.players[bob]!.supports[BOB_SUPPORT.id]!.stability).toBe(1); // 4 - 3 = 1
    expect(events.some((e) => e.type === 'stability.lost')).toBe(true);
  });

  it('disrupt reducing stability to 0 discards the support and removes its dice', () => {
    const lowSupport: SupportState = { ...BOB_SUPPORT, stability: 3, maxStability: 3 };
    let state = baseGame();
    const alice = active(state);
    const bob = opp(state);
    state = withPool(state, alice, [DISRUPT_DIE]);
    state = withSupport(state, bob, lowSupport);

    const { state: after, events } = applyAction(state, {
      type: 'resolve-dice',
      playerId: alice,
      targets: [{ dieInstanceIds: [DISRUPT_DIE.instanceId], targetSupportId: lowSupport.id }],
    });

    expect(after.players[bob]!.supports[lowSupport.id]).toBeUndefined();
    expect(after.players[bob]!.supportOrder).not.toContain(lowSupport.id);
    expect(events.some((e) => e.type === 'support.discarded')).toBe(true);
  });

  it('shields on a support block stability loss', () => {
    const shieldedSupport: SupportState = { ...BOB_SUPPORT, shields: 2 };
    let state = baseGame();
    const alice = active(state);
    const bob = opp(state);
    state = withPool(state, alice, [DISRUPT_DIE]);
    state = withSupport(state, bob, shieldedSupport);

    const { state: after, events } = applyAction(state, {
      type: 'resolve-dice',
      playerId: alice,
      targets: [{ dieInstanceIds: [DISRUPT_DIE.instanceId], targetSupportId: shieldedSupport.id }],
    });

    // 3 disrupt, 2 shields block → 1 stability lost. 4 - 1 = 3.
    expect(after.players[bob]!.supports[shieldedSupport.id]!.stability).toBe(3);
    expect(after.players[bob]!.supports[shieldedSupport.id]!.shields).toBe(0);
    expect(events.some((e) => e.type === 'shields.removed')).toBe(true);
    expect(events.some((e) => e.type === 'stability.lost')).toBe(true);
  });
});

describe('support card: discard die targeting support', () => {
  it('discard die targeting a support reduces its stability', () => {
    const DISCARD_DIE: DieInPool = {
      instanceId: 'discard.die.test',
      cardId: 'CHAR_TEST_001',
      faceIndex: 0,
      face: { symbol: 'discard', value: 2, cost: 0, modifier: false },
      ownerInstanceId: 'test.char',
    };
    const TARGET_SUPPORT: SupportState = {
      id: 'bob.support.test',
      cardId: 'SUP_001',
      stability: 5,
      maxStability: 5,
      shields: 0,
      exhausted: false,
      dice: [],
      upgradeIds: [],
    };

    let state = baseGame();
    const alice = active(state);
    const bob = opp(state);
    state = withPool(state, alice, [DISCARD_DIE]);
    state = withSupport(state, bob, TARGET_SUPPORT);

    const { state: after } = applyAction(state, {
      type: 'resolve-dice',
      playerId: alice,
      targets: [{ dieInstanceIds: [DISCARD_DIE.instanceId], targetSupportId: TARGET_SUPPORT.id }],
    });

    expect(after.players[bob]!.supports[TARGET_SUPPORT.id]!.stability).toBe(3); // 5 - 2 = 3
  });
});

describe('support card: upkeep readies exhausted supports', () => {
  it('exhausted support is readied at upkeep', () => {
    let state = baseGame();
    const alice = active(state);
    const bob = opp(state);
    state = withHand(state, alice, SUPPORT_ID);

    // Play the support (alice's turn → rotates to bob).
    state = applyAction(state, { type: 'play-card', playerId: alice, cardId: SUPPORT_ID }).state;
    // bob passes → back to alice.
    state = applyAction(state, { type: 'pass', playerId: bob }).state;
    // Activate (exhausts the support, alice's turn → rotates to bob).
    state = applyAction(state, { type: 'activate', playerId: alice, cardId: SUPPORT_ID }).state;
    expect(state.players[alice]!.supports[SUPPORT_ID]!.exhausted).toBe(true);

    // Both players pass to trigger upkeep (bob's turn first now).
    state = applyAction(state, { type: 'pass', playerId: bob }).state;
    state = applyAction(state, { type: 'pass', playerId: alice }).state;

    // After upkeep the support should be readied.
    expect(state.players[alice]!.supports[SUPPORT_ID]!.exhausted).toBe(false);
  });
});
