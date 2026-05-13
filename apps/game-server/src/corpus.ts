// Loads the committed testing-set fixtures (cards + decks) at startup
// so room creation can spin a real game from real decks. In production
// these come from the database; for now they're files committed under
// the game-engine package.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RawDeck {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly faction: 'light' | 'shadow' | 'neutral';
  readonly characters: readonly { cardId: string; elite: boolean }[];
  readonly battlefieldCardId: string;
  readonly plotCardId?: string | null;
  readonly cards: readonly { cardId: string; count: number }[];
}

interface RawCard {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly faction: string;
  readonly color: string;
  // Plus many other fields; only the ones the engine reads matter
  // here. The shape is validated by the engine's own Zod schema when
  // newGameFromDecks looks up each id.
  readonly [key: string]: unknown;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'game-engine',
  'src',
  '__fixtures__',
  'synthetic-set',
);

const cardSet = JSON.parse(readFileSync(resolve(fixtureDir, 'cards.json'), 'utf8')) as {
  cards: RawCard[];
};
const deckSet = JSON.parse(readFileSync(resolve(fixtureDir, 'decks.json'), 'utf8')) as {
  decks: RawDeck[];
};

export const TESTING_CARDS = cardSet.cards;
export const TESTING_DECKS = deckSet.decks;

if (TESTING_DECKS.length < 2) {
  throw new Error(
    `decks.json must contain at least 2 decks for 1v1; found ${TESTING_DECKS.length}`,
  );
}
