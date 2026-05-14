// Loads the original-IP card / deck catalog at startup. The committed
// files at `packages/db/seed/{cards,decks}.json` are the canonical
// catalog — the `/admin` endpoints in this same server read / write
// them, and once the DB lands, `pnpm db:seed` will import them too.
//
// When object storage is configured (S3_* env vars), the card catalog
// is also persisted to `catalog/cards.json` in the bucket so Railway
// picks up changes without a redeploy.

import { cardCatalogSchema, deckCatalogSchema, type Card, type Deck } from '@prophecy/protocol';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCatalogFromStorage, writeCatalogToStorage } from './storage.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(here, '..', '..', '..', 'packages', 'db', 'seed');

/** Disk directory where card art files live. Created on startup if absent. */
export const artDir = resolve(seedDir, 'card-art');
mkdirSync(artDir, { recursive: true });

const cardsPath = resolve(seedDir, 'cards.json');
const decksPath = resolve(seedDir, 'decks.json');

function loadCardsFromDisk(): Card[] {
  const raw = JSON.parse(readFileSync(cardsPath, 'utf8'));
  const parsed = cardCatalogSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`cards.json failed schema validation: ${parsed.error.message}`);
  return parsed.data.cards;
}

function loadDecks(): Deck[] {
  const raw = JSON.parse(readFileSync(decksPath, 'utf8'));
  const parsed = deckCatalogSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`decks.json failed schema validation: ${parsed.error.message}`);
  return parsed.data.decks;
}

let cachedCards: Card[] | null = null;
let cachedDecks: Deck[] | null = null;

/**
 * Call once at startup (before httpServer.listen). Tries to load the card
 * catalog from object storage; falls back to the committed cards.json on
 * disk. If storage is configured and the catalog wasn't there yet, seeds it
 * from disk so future startups skip the fallback.
 */
export async function initialize(): Promise<void> {
  // Decks are always loaded from disk (they don't change at runtime).
  cachedDecks = loadDecks();

  const json = await readCatalogFromStorage();
  if (json) {
    const parsed = cardCatalogSchema.safeParse(JSON.parse(json));
    if (parsed.success) {
      cachedCards = parsed.data.cards;
      console.log('[corpus] cards loaded from object storage');
      return;
    }
    console.warn('[corpus] object storage catalog failed validation — falling back to disk');
  }

  cachedCards = loadCardsFromDisk();

  // Seed storage so the next cold start doesn't need to fall back.
  const diskJson = JSON.stringify({ cards: cachedCards }, null, 2) + '\n';
  writeCatalogToStorage(diskJson).catch((e) =>
    console.warn('[corpus] could not seed catalog to storage:', (e as Error).message),
  );
}

export function getCards(): readonly Card[] {
  if (!cachedCards) cachedCards = loadCardsFromDisk();
  return cachedCards;
}

export function getDecks(): readonly Deck[] {
  if (!cachedDecks) cachedDecks = loadDecks();
  return cachedDecks;
}

/** Replace the catalog wholesale (admin PUT). Writes to disk and storage. */
export function writeCards(cards: readonly Card[]): void {
  const parsed = cardCatalogSchema.parse({ cards: [...cards] });
  const json = JSON.stringify(parsed, null, 2) + '\n';
  writeFileSync(cardsPath, json);
  cachedCards = [...parsed.cards];
  writeCatalogToStorage(json).catch((e) =>
    console.warn('[corpus] storage write failed:', (e as Error).message),
  );
}

export function writeDecks(decks: readonly Deck[]): void {
  const parsed = deckCatalogSchema.parse({ decks: [...decks] });
  writeFileSync(decksPath, JSON.stringify(parsed, null, 2) + '\n');
  cachedDecks = [...parsed.decks];
}
