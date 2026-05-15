import { describe, expect, it } from 'vitest';

import type { CatalogDieEntry } from '../abilities/dispatch.js';
import type { Ability } from '../abilities/types.js';
import { applyAction } from '../reducers/apply-action.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { DieFace, GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

// Six faces used by the mock rollEventDie event card.
const EVENT_DIE_FACES: [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace] = [
  { symbol: 'melee', value: 2, cost: 0, modifier: false },
  { symbol: 'melee', value: 3, cost: 0, modifier: false },
  { symbol: 'ranged', value: 2, cost: 0, modifier: false },
  { symbol: 'resource', value: 1, cost: 0, modifier: false },
  { symbol: 'disrupt', value: 1, cost: 0, modifier: false },
  { symbol: 'blank', value: 0, cost: 0, modifier: false },
];

// War Hound die faces (mirrors CHAR_003 in cards.json — used by rollCardDie test).
const WAR_HOUND_FACES: [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace] = [
  { symbol: 'melee', value: 2, cost: 0, modifier: false },
  { symbol: 'melee', value: 2, cost: 0, modifier: false },
  { symbol: 'melee', value: 3, cost: 0, modifier: false },
  { symbol: 'resource', value: 0, cost: 0, modifier: false },
  { symbol: 'disrupt', value: 1, cost: 0, modifier: false },
  { symbol: 'special', value: 0, cost: 1, modifier: false },
];

const MOCK_CATALOG: CatalogDieEntry[] = [
  { id: 'EVT_ROLL_TEST', dieFaces: EVENT_DIE_FACES },
  { id: 'CHAR_003', dieFaces: WAR_HOUND_FACES },
];

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'roll-die-test' }));
}

/** Add an event card (instance + abilities + catalog mapping + cost) to a player's hand. */
function withEventInHand(
  state: GameState,
  playerId: string,
  instanceId: string,
  catalogId: string,
  ability: Ability,
): GameState {
  const player = state.players[playerId]!;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, hand: [...player.hand, instanceId] },
    },
    cardAbilities: { ...state.cardAbilities, [instanceId]: [ability] },
    cardCatalogIds: { ...state.cardCatalogIds, [instanceId]: catalogId },
    cardCosts: { ...state.cardCosts, [instanceId]: 0 },
  };
}

// ────────────────────────────────────────────────────────────────────
// (a) rollEventDie — die from the event card's own dieFaces
// ────────────────────────────────────────────────────────────────────

describe('rollEventDie op', () => {
  it('rolls the event card\'s own die into the pool (transient: true, face from dieFaces)', () => {
    const initial = setup();
    const active = initial.activePlayerId!;

    const state = withEventInHand(initial, active, 'roll-evt-1', 'EVT_ROLL_TEST', {
      kind: 'immediate',
      effects: [{ op: 'rollEventDie' }],
    } as Ability);

    const { state: out } = applyAction(
      state,
      { type: 'play-card', playerId: active, cardId: 'roll-evt-1' },
      { catalog: MOCK_CATALOG },
    );

    const pool = out.players[active]!.diceInPool;
    expect(pool).toHaveLength(1);
    const die = pool[0]!;
    expect(die.transient).toBe(true);
    expect(die.cardId).toBe('EVT_ROLL_TEST');
    // Face must be one of the six event die faces.
    expect(EVENT_DIE_FACES).toContainEqual(die.face);
  });

  it('transient die is removed from pool when any resolve-dice action fires', () => {
    const initial = setup();
    const active = initial.activePlayerId!;

    // Inject a transient die + a regular resource die directly into the pool.
    const stateWithDice: GameState = {
      ...initial,
      players: {
        ...initial.players,
        [active]: {
          ...initial.players[active]!,
          diceInPool: [
            {
              instanceId: 'transient-x',
              cardId: 'EVT_ROLL_TEST',
              faceIndex: 0,
              face: EVENT_DIE_FACES[0]!,
              transient: true,
            },
            {
              instanceId: 'regular-r',
              cardId: 'SOME_CARD',
              faceIndex: 0,
              face: { symbol: 'resource', value: 1, cost: 0, modifier: false },
            },
          ],
        },
      },
    };

    const { state: out } = applyAction(stateWithDice, {
      type: 'resolve-dice',
      playerId: active,
      targets: [{ dieInstanceIds: ['regular-r'] }],
    });

    // Transient die cleaned up by resolve-dice regardless of which die was resolved.
    expect(out.players[active]!.diceInPool.find((d) => d.instanceId === 'transient-x')).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// (b) rollCardDie — die from a referenced catalog card
// ────────────────────────────────────────────────────────────────────

describe('rollCardDie op', () => {
  it('rolls the referenced catalog card\'s die into the pool (transient: true, face from that card)', () => {
    const initial = setup();
    const active = initial.activePlayerId!;

    const state = withEventInHand(initial, active, 'call-hound-1', 'EVT_CALL_HOUND', {
      kind: 'immediate',
      effects: [{ op: 'rollCardDie', cardId: 'CHAR_003' }],
    } as Ability);

    // Add the event to the catalog (no dieFaces needed for rollCardDie events).
    const catalog: CatalogDieEntry[] = [
      ...MOCK_CATALOG,
      { id: 'EVT_CALL_HOUND', dieFaces: null },
    ];

    const { state: out } = applyAction(
      state,
      { type: 'play-card', playerId: active, cardId: 'call-hound-1' },
      { catalog },
    );

    const pool = out.players[active]!.diceInPool;
    expect(pool).toHaveLength(1);
    const die = pool[0]!;
    expect(die.transient).toBe(true);
    expect(die.cardId).toBe('CHAR_003');
    // Face must be one of the six War Hound faces.
    expect(WAR_HOUND_FACES).toContainEqual(die.face);
  });
});

// ────────────────────────────────────────────────────────────────────
// (c) rollCardDie with unknown cardId throws a descriptive error
// ────────────────────────────────────────────────────────────────────

describe('rollCardDie error handling', () => {
  it('throws a descriptive error when cardId is not in the catalog', () => {
    const initial = setup();
    const active = initial.activePlayerId!;

    const state = withEventInHand(initial, active, 'bad-event-1', 'EVT_BAD', {
      kind: 'immediate',
      effects: [{ op: 'rollCardDie', cardId: 'DOES_NOT_EXIST' }],
    } as Ability);

    const catalog: CatalogDieEntry[] = [
      { id: 'EVT_BAD', dieFaces: null },
    ];

    expect(() =>
      applyAction(
        state,
        { type: 'play-card', playerId: active, cardId: 'bad-event-1' },
        { catalog },
      ),
    ).toThrow(/DOES_NOT_EXIST/);
  });
});
