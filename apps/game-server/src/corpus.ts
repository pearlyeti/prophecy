// Loads the original-IP card / deck catalog at startup. The committed
// files at `packages/db/seed/{cards,decks}.json` are the canonical
// catalog — the `/admin` endpoints in this same server read / write
// them, and once the DB lands, `pnpm db:seed` will import them too.
//
// We validate against the catalog schemas in `@prophecy/protocol` so a
// hand-edited file with a typo fails fast at boot rather than at the
// first lobby join.

import { cardCatalogSchema, deckCatalogSchema, type Card, type Deck } from '@prophecy/protocol';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(here, '..', '..', '..', 'packages', 'db', 'seed');

const cardsPath = resolve(seedDir, 'cards.json');
const decksPath = resolve(seedDir, 'decks.json');

function loadCards(): Card[] {
  const raw = JSON.parse(readFileSync(cardsPath, 'utf8'));
  const parsed = cardCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `cards.json failed schema validation: ${parsed.error.message}`,
    );
  }
  return parsed.data.cards;
}

function loadDecks(): Deck[] {
  const raw = JSON.parse(readFileSync(decksPath, 'utf8'));
  const parsed = deckCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `decks.json failed schema validation: ${parsed.error.message}`,
    );
  }
  return parsed.data.decks;
}

let cachedCards: Card[] | null = null;
let cachedDecks: Deck[] | null = null;

export function getCards(): readonly Card[] {
  if (!cachedCards) cachedCards = loadCards();
  return cachedCards;
}

export function getDecks(): readonly Deck[] {
  if (!cachedDecks) cachedDecks = loadDecks();
  return cachedDecks;
}

/** Replace the catalog wholesale (admin PUT). Writes to disk, validates first. */
export function writeCards(cards: readonly Card[]): void {
  // Re-parse so callers can't sneak in unknown fields.
  const parsed = cardCatalogSchema.parse({ cards: [...cards] });
  writeFileSync(cardsPath, JSON.stringify(parsed, null, 2) + '\n');
  cachedCards = [...parsed.cards];
}

export function writeDecks(decks: readonly Deck[]): void {
  const parsed = deckCatalogSchema.parse({ decks: [...decks] });
  writeFileSync(decksPath, JSON.stringify(parsed, null, 2) + '\n');
  cachedDecks = [...parsed.decks];
}


if (getDecks().length < 2) {
  throw new Error(
    `decks.json must contain at least 2 decks for 1v1; found ${getDecks().length}`,
  );
}
