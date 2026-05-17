import { describe, expect, it } from 'vitest';

import { getLegalActions, playConditionMet } from '../state/legal-actions.js';
import { applyAction } from '../reducers/apply-action.js';
import { newGame, newGameInActionPhase } from '../state/new-game.js';
import type { Ability, PlayCondition } from '../abilities/types.js';
import type { GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

describe('getLegalActions', () => {
  describe('setup phase', () => {
    it('roll-off winner can choose the first player', () => {
      const state = newGame(basicGameInput({ seed: 'la-1' }));
      const winner = state.setup!.rollOffWinnerId;
      const loser = state.playerOrder.find((id) => id !== winner)!;

      const winnerActions = getLegalActions(state, winner);
      expect(winnerActions.canChooseFirstPlayer).toBe(true);
      expect(winnerActions.canConcede).toBe(true);
      expect(winnerActions.canPass).toBe(false);
      expect(winnerActions.activatableCharacterIds).toEqual([]);

      const loserActions = getLegalActions(state, loser);
      expect(loserActions.canChooseFirstPlayer).toBe(false);
      expect(loserActions.canPlaceShield).toBe(false);
    });

    it('after first-player chosen, the non-first player can place shields', () => {
      const initial = newGame(basicGameInput({ seed: 'la-2' }));
      const winner = initial.setup!.rollOffWinnerId;
      const loser = initial.playerOrder.find((id) => id !== winner)!;
      const state = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;

      // Loser became the shield recipient automatically.
      expect(getLegalActions(state, loser).canPlaceShield).toBe(true);
      // Winner can no longer pick first player (step has advanced) and is not the recipient.
      expect(getLegalActions(state, winner).canChooseFirstPlayer).toBe(false);
      expect(getLegalActions(state, winner).canPlaceShield).toBe(false);
    });
  });

  describe('action phase', () => {
    it('the active player gets the full action menu; opponent gets concede only', () => {
      const state = newGameInActionPhase(basicGameInput({ seed: 'la-3' }));
      const active = state.activePlayerId!;
      const opponent = state.playerOrder.find((id) => id !== active)!;

      const a = getLegalActions(state, active);
      expect(a.canPass).toBe(true);
      expect(a.canClaim).toBe(true);
      expect(a.canConcede).toBe(true);
      expect(a.activatableCharacterIds.length).toBe(1);

      const o = getLegalActions(state, opponent);
      expect(o.canPass).toBe(false);
      expect(o.canClaim).toBe(false);
      expect(o.canConcede).toBe(true);
      expect(o.activatableCharacterIds).toEqual([]);
    });

    it('exhausted character is not in the activatable list', () => {
      const state = newGameInActionPhase(basicGameInput({ seed: 'la-4' }));
      const active = state.activePlayerId!;
      const characterId = state.players[active]!.characterOrder[0]!;
      const after = applyAction(state, {
        type: 'activate',
        playerId: active,
        cardId: characterId,
      }).state;

      // Active player just activated → no more activatable, no longer their turn.
      const opponent = after.activePlayerId!;
      const actions = getLegalActions(after, opponent);
      // Opponent's turn now; opponent has their own ready character.
      expect(actions.activatableCharacterIds).toHaveLength(1);
    });

    it('claim flag prevents claim button on subsequent turns this round', () => {
      const state = newGameInActionPhase(basicGameInput({ seed: 'la-5' }));
      const active = state.activePlayerId!;
      const claimed = applyAction(state, {
        type: 'claim-battlefield',
        playerId: active,
      }).state;

      // The other player now goes; claim is disabled because someone
      // already claimed this round.
      const opponent = claimed.activePlayerId!;
      const o = getLegalActions(claimed, opponent);
      expect(o.canClaim).toBe(false);
      expect(o.canPass).toBe(true);
    });

    it('resolvable symbols reflect the pool, skipping modifiers and blanks', () => {
      // Synthesize a state with a custom pool.
      const initial = newGameInActionPhase(basicGameInput({ seed: 'la-6' }));
      const active = initial.activePlayerId!;
      const state = {
        ...initial,
        players: {
          ...initial.players,
          [active]: {
            ...initial.players[active]!,
            diceInPool: [
              { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: { symbol: 'melee' as const, value: 1, cost: 0, modifier: false } },
              { instanceId: 'd2', cardId: 'X', faceIndex: 0, face: { symbol: 'melee' as const, value: 2, cost: 0, modifier: true } },
              { instanceId: 'd3', cardId: 'X', faceIndex: 0, face: { symbol: 'blank' as const, value: 0, cost: 0, modifier: false } },
              { instanceId: 'd4', cardId: 'X', faceIndex: 0, face: { symbol: 'resource' as const, value: 1, cost: 0, modifier: false } },
              { instanceId: 'd5', cardId: 'X', faceIndex: 0, face: { symbol: 'ranged' as const, value: 0, cost: 0, modifier: true } },
            ],
          },
        },
      };

      const actions = getLegalActions(state, active);
      expect([...actions.resolvableSymbols].sort()).toEqual(['melee', 'resource']);
      // blank excluded (cannot resolve), ranged excluded (only the
      // modifier face present), modifier melee doesn't add melee
      // again — but the non-modifier melee does.
    });

    it('canReroll requires both a card in hand and a die in the pool', () => {
      const state = newGameInActionPhase(basicGameInput({ seed: 'la-7' }));
      const active = state.activePlayerId!;
      const noPool = getLegalActions(state, active);
      expect(noPool.canReroll).toBe(false);

      const withPool = {
        ...state,
        players: {
          ...state.players,
          [active]: {
            ...state.players[active]!,
            diceInPool: [
              { instanceId: 'd1', cardId: 'X', faceIndex: 0, face: { symbol: 'melee' as const, value: 1, cost: 0, modifier: false } },
            ],
          },
        },
      };
      expect(getLegalActions(withPool, active).canReroll).toBe(true);

      const noHand = {
        ...withPool,
        players: {
          ...withPool.players,
          [active]: { ...withPool.players[active]!, hand: [] },
        },
      };
      expect(getLegalActions(noHand, active).canReroll).toBe(false);
    });
  });

  describe('ended game', () => {
    it('returns the all-disabled struct', () => {
      const state = newGameInActionPhase(basicGameInput({ seed: 'la-8' }));
      const playerId = state.activePlayerId!;
      const ended = applyAction(state, { type: 'concede', playerId }).state;
      const actions = getLegalActions(ended, playerId);
      expect(actions.canPass).toBe(false);
      expect(actions.canClaim).toBe(false);
      expect(actions.canConcede).toBe(false);
      expect(actions.canReroll).toBe(false);
      expect(actions.activatableCharacterIds).toEqual([]);
      expect(actions.resolvableSymbols).toEqual([]);
      expect(actions.canPlayCard).toBe(false);
    });
  });

  describe('play condition gating on actionableCardIds', () => {
    function withActionAbility(state: GameState, condition: PlayCondition): GameState {
      const charId = state.players[state.activePlayerId!]!.characterOrder[0]!;
      const ability: Ability = {
        kind: 'action',
        costs: [],
        playCondition: condition,
        steps: [{ effects: [{ op: 'gainResources', amount: 1 }] }],
      };
      return { ...state, cardAbilities: { ...state.cardAbilities, [charId]: [ability] } };
    }

    it('excludes character from actionableCardIds when play condition is unmet', () => {
      const base = newGameInActionPhase(basicGameInput({ seed: 'la-pc-1' }));
      const active = base.activePlayerId!;
      const opp = base.playerOrder.find((id) => id !== active)!;
      // controlsBattlefield fails when not the controller
      const state = withActionAbility(
        { ...base, battlefieldControllerId: opp },
        { kind: 'controlsBattlefield' },
      );
      expect(getLegalActions(state, active).actionableCardIds).toHaveLength(0);
    });

    it('includes character in actionableCardIds when play condition is met', () => {
      const base = newGameInActionPhase(basicGameInput({ seed: 'la-pc-2' }));
      const active = base.activePlayerId!;
      const state = withActionAbility(
        { ...base, battlefieldControllerId: active },
        { kind: 'controlsBattlefield' },
      );
      expect(getLegalActions(state, active).actionableCardIds).toHaveLength(1);
    });
  });
});

// ── playConditionMet unit tests ───────────────────────────────────────────────

describe('playConditionMet', () => {
  function baseState() {
    return newGameInActionPhase(basicGameInput({ seed: 'pc-unit' }));
  }

  function check(state: GameState, condition: PlayCondition): boolean {
    return playConditionMet(state, state.activePlayerId!, condition);
  }

  it('controlsBattlefield: true when player is the battlefield controller', () => {
    const state = baseState();
    const active = state.activePlayerId!;
    const controlled = { ...state, battlefieldControllerId: active };
    expect(check(controlled, { kind: 'controlsBattlefield' })).toBe(true);
  });

  it('controlsBattlefield: false when opponent controls the battlefield', () => {
    const state = baseState();
    const active = state.activePlayerId!;
    const opp = state.playerOrder.find((id) => id !== active)!;
    const oppControlled = { ...state, battlefieldControllerId: opp };
    expect(check(oppControlled, { kind: 'controlsBattlefield' })).toBe(false);
  });

  it('spotCharacter: true when player has a matching character (no filter)', () => {
    const state = baseState();
    expect(check(state, { kind: 'spotCharacter' })).toBe(true);
  });

  it('spotCharacter: false when count exceeds characters in play', () => {
    const state = baseState();
    expect(check(state, { kind: 'spotCharacter', count: 99 })).toBe(false);
  });

  it('spotCharacter: true when color filter matches via cardMeta', () => {
    const state = baseState();
    const active = state.activePlayerId!;
    const charId = state.players[active]!.characterOrder[0]!;
    const withMeta = {
      ...state,
      cardMeta: { ...state.cardMeta, [charId]: { type: 'character' as const, color: 'red' as const, subtypes: [], isUnique: false } },
    };
    expect(playConditionMet(withMeta, active, { kind: 'spotCharacter', color: 'red' })).toBe(true);
  });

  it('spotCharacter: false when color filter does not match', () => {
    const state = baseState();
    const active = state.activePlayerId!;
    const charId = state.players[active]!.characterOrder[0]!;
    const withMeta = {
      ...state,
      cardMeta: { ...state.cardMeta, [charId]: { type: 'character' as const, color: 'red' as const, subtypes: [], isUnique: false } },
    };
    expect(playConditionMet(withMeta, active, { kind: 'spotCharacter', color: 'blue' })).toBe(false);
  });

  it('spotCard: true when player has a character with that catalog card ID', () => {
    const state = baseState();
    // basicGameInput uses cardId 'CHAR_TEST_001' for all characters
    expect(check(state, { kind: 'spotCard', cardId: 'CHAR_TEST_001' })).toBe(true);
  });

  it('spotCard: false when player has no character with that catalog card ID', () => {
    const state = baseState();
    expect(check(state, { kind: 'spotCard', cardId: 'NONEXISTENT_CARD' })).toBe(false);
  });

  it('moreReadyCharacters: true when active player has more ready characters than opponent', () => {
    const state = baseState();
    const active = state.activePlayerId!;
    const opp = state.playerOrder.find((id) => id !== active)!;
    const oppCharId = state.players[opp]!.characterOrder[0]!;
    // Exhaust the opponent's character so the active player has more ready.
    const oppChar = state.players[opp]!.characters[oppCharId]!;
    const withExhausted = {
      ...state,
      players: {
        ...state.players,
        [opp]: {
          ...state.players[opp]!,
          characters: { ...state.players[opp]!.characters, [oppCharId]: { ...oppChar, exhausted: true } },
        },
      },
    };
    expect(check(withExhausted, { kind: 'moreReadyCharacters' })).toBe(true);
  });

  it('moreReadyCharacters: false when counts are equal', () => {
    const state = baseState();
    expect(check(state, { kind: 'moreReadyCharacters' })).toBe(false);
  });

  it('firstActionOfRound: true when player has not yet acted this round', () => {
    const state = baseState();
    expect(check(state, { kind: 'firstActionOfRound' })).toBe(true);
  });

  it('firstActionOfRound: false after the player has taken an action', () => {
    const state = baseState();
    const active = state.activePlayerId!;
    const withAction = {
      ...state,
      actionsThisRound: { [active]: 1 },
    };
    expect(check(withAction, { kind: 'firstActionOfRound' })).toBe(false);
  });

  it('opponentHasNoCards: true when opponent has no cards in hand', () => {
    const state = baseState();
    const active = state.activePlayerId!;
    const opp = state.playerOrder.find((id) => id !== active)!;
    const withEmptyHand = {
      ...state,
      players: { ...state.players, [opp]: { ...state.players[opp]!, hand: [] } },
    };
    expect(check(withEmptyHand, { kind: 'opponentHasNoCards' })).toBe(true);
  });

  it('opponentHasNoCards: false when opponent has cards in hand', () => {
    const state = baseState();
    expect(check(state, { kind: 'opponentHasNoCards' })).toBe(false);
  });

  it('haveNCharactersInPlay: true when player has enough characters', () => {
    const state = baseState();
    expect(check(state, { kind: 'haveNCharactersInPlay', count: 1 })).toBe(true);
  });

  it('haveNCharactersInPlay: false when player does not have enough characters', () => {
    const state = baseState();
    expect(check(state, { kind: 'haveNCharactersInPlay', count: 5 })).toBe(false);
  });

  it('opponentHasNCharacters: true when opponent has enough characters', () => {
    const state = baseState();
    expect(check(state, { kind: 'opponentHasNCharacters', count: 1 })).toBe(true);
  });

  it('opponentHasNCharacters: false when opponent does not have enough characters', () => {
    const state = baseState();
    expect(check(state, { kind: 'opponentHasNCharacters', count: 5 })).toBe(false);
  });
});
