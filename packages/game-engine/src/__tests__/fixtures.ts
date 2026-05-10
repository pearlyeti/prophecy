import type { NewGameInput } from '../state/new-game';

/**
 * Minimal test input for two players, each with one non-elite character
 * and a battlefield. Used by every action-handler test that doesn't
 * care about specific character / dice content.
 */
export function basicGameInput(overrides: Partial<NewGameInput> = {}): NewGameInput {
  return {
    seed: 'test',
    playerIds: ['alice', 'bob'],
    playerCharacters: {
      alice: [{ id: 'alice.c1', cardId: 'CHAR_TEST_001', elite: false }],
      bob: [{ id: 'bob.c1', cardId: 'CHAR_TEST_001', elite: false }],
    },
    playerBattlefieldCardIds: {
      alice: 'BF_TEST_ALICE',
      bob: 'BF_TEST_BOB',
    },
    ...overrides,
  };
}
