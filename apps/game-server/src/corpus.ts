// Loads the original-IP card / deck catalog at startup. The committed
// files under `packages/db/seed/cards/` (one JSON per card) and
// `packages/db/seed/decks.json` are the canonical catalog.
//
// When object storage is configured (S3_* env vars), a combined
// `catalog/cards.json` is also persisted to the bucket so the cloud
// server picks up changes without reading individual files.

import { cardCatalogSchema, deckCatalogSchema, type Card, type Deck } from '@prophecy/protocol';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCatalogFromStorage, writeCatalogToStorage } from './storage.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(here, '..', '..', '..', 'packages', 'db', 'seed');

/** Disk directory where card art files live. Created on startup if absent. */
export const artDir = resolve(seedDir, 'card-art');
mkdirSync(artDir, { recursive: true });

/** Per-card JSON directory. */
const cardsDir = resolve(seedDir, 'cards');
mkdirSync(cardsDir, { recursive: true });

const decksPath = resolve(seedDir, 'decks.json');

function loadCardsFromDisk(): Card[] {
  const files = readdirSync(cardsDir).filter((f) => f.endsWith('.json'));

  // Auto-migrate from legacy cards.json on first run after this change.
  if (files.length === 0) {
    const legacyPath = resolve(seedDir, 'cards.json');
    if (existsSync(legacyPath)) {
      const raw = JSON.parse(readFileSync(legacyPath, 'utf8'));
      const parsed = cardCatalogSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`cards.json failed schema validation: ${parsed.error.message}`);
      for (const card of parsed.data.cards) {
        writeFileSync(resolve(cardsDir, `${card.id}.json`), JSON.stringify(card, null, 2) + '\n');
      }
      console.log(`[corpus] auto-migrated ${parsed.data.cards.length} cards to cards/`);
      return parsed.data.cards;
    }
    return [];
  }

  const rawCards = files.map((f) => JSON.parse(readFileSync(resolve(cardsDir, f), 'utf8')) as unknown);
  const parsed = cardCatalogSchema.safeParse({ cards: rawCards });
  if (!parsed.success) throw new Error(`cards/ directory failed schema validation: ${parsed.error.message}`);
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
 * catalog from object storage; falls back to the per-card disk files.
 *
 * Stale-storage guard: if object storage has cards that are missing abilities
 * present in the disk seed files (e.g. from a pre-abilities schema), we
 * discard the stale storage data and reload from disk, then update storage.
 */
export async function initialize(): Promise<void> {
  cachedDecks = loadDecks();
  const diskCards = loadCardsFromDisk();

  const json = await readCatalogFromStorage();
  if (json) {
    const parsed = cardCatalogSchema.safeParse(JSON.parse(json));
    if (parsed.success) {
      const storageById = new Map(parsed.data.cards.map((c) => [c.id, c]));
      const stale = diskCards.some((dc) => {
        const sc = storageById.get(dc.id);
        return dc.abilities.length > 0 && (!sc || sc.abilities.length === 0);
      });
      if (!stale) {
        cachedCards = parsed.data.cards;
        console.log('[corpus] cards loaded from object storage');
        return;
      }
      console.warn('[corpus] object storage cards missing abilities — reloading from disk');
    } else {
      console.warn('[corpus] object storage catalog failed validation — falling back to disk');
    }
  }

  cachedCards = diskCards;

  // Seed storage so the next cold start doesn't need to read per-card files.
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

/** Replace the catalog. Writes each card to its own file and syncs to object storage. */
export function writeCards(cards: readonly Card[]): void {
  const parsed = cardCatalogSchema.parse({ cards: [...cards] });
  const newIds = new Set(parsed.cards.map((c) => c.id));

  // Remove files for deleted cards
  for (const file of readdirSync(cardsDir)) {
    if (!file.endsWith('.json')) continue;
    const id = file.slice(0, -5);
    if (!newIds.has(id)) unlinkSync(resolve(cardsDir, `${id}.json`));
  }

  // Write / update individual card files
  for (const card of parsed.cards) {
    writeFileSync(resolve(cardsDir, `${card.id}.json`), JSON.stringify(card, null, 2) + '\n');
  }

  cachedCards = [...parsed.cards];

  // Still write combined JSON to object storage so the cloud server can load
  // the catalog without making N individual file reads.
  const combinedJson = JSON.stringify({ cards: cachedCards }, null, 2) + '\n';
  writeCatalogToStorage(combinedJson).catch((e) =>
    console.warn('[corpus] storage write failed:', (e as Error).message),
  );
}

export function writeDecks(decks: readonly Deck[]): void {
  const parsed = deckCatalogSchema.parse({ decks: [...decks] });
  writeFileSync(decksPath, JSON.stringify(parsed, null, 2) + '\n');
  cachedDecks = [...parsed.decks];
}
