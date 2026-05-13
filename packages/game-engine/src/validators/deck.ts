// Deck legality validator. Implements the deck-building rules from
// docs/rules-reference.md, Part 4. Used by tests against fixture decks
// and by the api / game-server before instantiating newGame on a
// player-submitted deck.

import type { DeckFixture } from '../__fixtures__/synthetic-set/schema';
import type { CardFixture } from '../__fixtures__/synthetic-set/schema';

export interface DeckValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Stats computed during validation, useful for UI display. */
  readonly stats: {
    readonly teamPointTotal: number;
    readonly deckCardTotal: number;
    readonly costCurve: Readonly<Record<number, number>>;
    readonly characterColors: readonly string[];
  };
}

const TEAM_POINT_LIMIT = 30;
const DECK_CARD_TOTAL = 30;
const MAX_PER_CARD = 2;

export function validateDeck(
  catalog: readonly CardFixture[],
  deck: DeckFixture,
): DeckValidationResult {
  const errors: string[] = [];
  const byId = new Map(catalog.map((c) => [c.id, c]));

  // --- Characters & team ---
  if (deck.characters.length < 1) {
    errors.push('a team must include at least one character');
  }
  let teamPointTotal = 0;
  const teamFactions = new Set<string>();
  const teamColors = new Set<string>();
  const seenUniqueCharacters = new Set<string>();
  for (const c of deck.characters) {
    const card = byId.get(c.cardId);
    if (!card) {
      errors.push(`character ${c.cardId} is not in the catalog`);
      continue;
    }
    if (card.type !== 'character') {
      errors.push(`${c.cardId} is type ${card.type}, not character`);
      continue;
    }
    if (c.elite && card.elitePointValue === null) {
      errors.push(`${c.cardId} has no elite point value (elite not allowed)`);
      continue;
    }
    if (c.elite && card.isUnique && seenUniqueCharacters.has(card.id)) {
      errors.push(`unique character ${card.id} appears more than once on the team`);
    }
    if (card.isUnique) seenUniqueCharacters.add(card.id);
    teamFactions.add(card.faction);
    teamColors.add(card.color);
    teamPointTotal += (c.elite ? card.elitePointValue : card.pointValue) ?? 0;
  }
  if (teamPointTotal > TEAM_POINT_LIMIT) {
    errors.push(`team is ${teamPointTotal} points; limit is ${TEAM_POINT_LIMIT}`);
  }
  // Faction rule: a team cannot mix light + shadow. Neutral combines with anything.
  if (teamFactions.has('light') && teamFactions.has('shadow')) {
    errors.push('a team cannot mix Light and Shadow characters');
  }
  // The team's faction (for deck-building) is the non-neutral faction, or
  // 'neutral' if all characters are neutral.
  const teamFaction =
    teamFactions.has('light') ? 'light'
    : teamFactions.has('shadow') ? 'shadow'
    : 'neutral';
  if (deck.faction !== teamFaction) {
    errors.push(`deck.faction is "${deck.faction}" but team is "${teamFaction}"`);
  }

  // --- Battlefield ---
  const battlefield = byId.get(deck.battlefieldCardId);
  if (!battlefield) {
    errors.push(`battlefield ${deck.battlefieldCardId} is not in the catalog`);
  } else if (battlefield.type !== 'battlefield') {
    errors.push(`${deck.battlefieldCardId} is type ${battlefield.type}, not battlefield`);
  }

  // --- Plot (optional) ---
  if (deck.plotCardId) {
    const plot = byId.get(deck.plotCardId);
    if (!plot) {
      errors.push(`plot ${deck.plotCardId} is not in the catalog`);
    } else if (plot.type !== 'plot') {
      errors.push(`${deck.plotCardId} is type ${plot.type}, not plot`);
    } else {
      if (plot.faction !== 'neutral' && plot.faction !== teamFaction) {
        errors.push(`plot ${plot.id} faction (${plot.faction}) does not match team (${teamFaction})`);
      }
      if (plot.color !== 'gray' && !teamColors.has(plot.color)) {
        errors.push(`plot ${plot.id} color (${plot.color}) requires a character of that color`);
      }
    }
  }

  // --- Deck cards ---
  let deckCardTotal = 0;
  const costCurve: Record<number, number> = {};
  const seenCardCounts = new Map<string, number>();
  for (const entry of deck.cards) {
    if (entry.count < 1 || entry.count > MAX_PER_CARD) {
      errors.push(`${entry.cardId} count is ${entry.count}; must be 1-${MAX_PER_CARD}`);
    }
    seenCardCounts.set(entry.cardId, (seenCardCounts.get(entry.cardId) ?? 0) + entry.count);
    const card = byId.get(entry.cardId);
    if (!card) {
      errors.push(`deck card ${entry.cardId} is not in the catalog`);
      continue;
    }
    if (card.type !== 'event' && card.type !== 'upgrade' && card.type !== 'support') {
      errors.push(`${entry.cardId} is type ${card.type}; only events, upgrades, and supports go in the deck`);
    }
    if (card.faction !== 'neutral' && card.faction !== teamFaction) {
      errors.push(`${entry.cardId} faction (${card.faction}) does not match team (${teamFaction})`);
    }
    if (card.color !== 'gray' && !teamColors.has(card.color)) {
      errors.push(`${entry.cardId} color (${card.color}) requires a team character of that color`);
    }
    deckCardTotal += entry.count;
    const cost = card.cost ?? 0;
    costCurve[cost] = (costCurve[cost] ?? 0) + entry.count;
  }
  for (const [cardId, total] of seenCardCounts) {
    if (total > MAX_PER_CARD) {
      errors.push(`${cardId} appears ${total} times; limit is ${MAX_PER_CARD}`);
    }
  }
  if (deckCardTotal !== DECK_CARD_TOTAL) {
    errors.push(`deck has ${deckCardTotal} cards; must be exactly ${DECK_CARD_TOTAL}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      teamPointTotal,
      deckCardTotal,
      costCurve,
      characterColors: [...teamColors],
    },
  };
}
