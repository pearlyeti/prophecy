import type { CardFixture, DeckFixture } from '../__fixtures__/synthetic-set/schema';
import { applyAction } from '../reducers/apply-action';
import { createRng } from '../rng/seeded-rng';
import type {
  CardDie,
  CharacterState,
  DieFace,
  GameState,
  PlayerState,
  SetupContext,
} from './types';

export interface CharacterInput {
  /** Stable instance id; unique per game. */
  readonly id: string;
  /** Catalog card id this character was minted from. */
  readonly cardId: string;
  readonly elite: boolean;
  /**
   * The six die faces this character's die shows. Optional — if absent,
   * the engine uses DEFAULT_TEST_FACES so callers can spin up games
   * without authoring full card data yet.
   */
  readonly dieFaces?: readonly DieFace[];
  /** Max damage before defeat. Defaults to DEFAULT_TEST_HEALTH if absent. */
  readonly health?: number;
}

export interface NewGameInput {
  readonly seed: string;
  /** Two player IDs in seating order. v1 is 1v1; FFA comes post-v1. */
  readonly playerIds: readonly [string, string];
  /** Each player's team. Each must include at least one character. */
  readonly playerCharacters: Readonly<Record<string, readonly CharacterInput[]>>;
  /** Each player's chosen battlefield card id. */
  readonly playerBattlefieldCardIds: Readonly<Record<string, string>>;
  /** Per-player overrides for testing (starting resources, hand, etc.). */
  readonly playerOverrides?: Readonly<Record<string, Partial<PlayerState>>>;
}

const DEFAULT_HAND_SIZE = 5;
const DEFAULT_DECK_SIZE = 30;
const STARTING_HAND = 5;
const STARTING_RESOURCES = 2;
const SHIELDS_TO_DISTRIBUTE = 2;
const DEFAULT_TEST_HEALTH = 10;

/**
 * Stand-in die profile used when a character is created without an
 * explicit `dieFaces`. Real card data replaces this when the deckbuilder
 * + card catalog land. Roughly balanced: damage, shields, resource,
 * blank — enough surface area to exercise the dice-resolution actions.
 */
export const DEFAULT_TEST_FACES: readonly [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace] = [
  { symbol: 'melee', value: 1, cost: 0, modifier: false },
  { symbol: 'melee', value: 2, cost: 0, modifier: false },
  { symbol: 'ranged', value: 1, cost: 0, modifier: false },
  { symbol: 'shield', value: 1, cost: 0, modifier: false },
  { symbol: 'resource', value: 1, cost: 0, modifier: false },
  { symbol: 'blank', value: 0, cost: 0, modifier: false },
];

/**
 * Build the initial GameState. The roll-off runs here deterministically
 * via the seeded RNG; ties re-roll until broken. The result is a
 * setup-phase state — the roll-off winner's next move is choosing the
 * battlefield.
 *
 * Roll-off stand-in: each player's roll is the sum of one d6 per starting
 * die across their team. The "real" rules sum the white numbers on each
 * character's actual starting dice — that lands when card data flows in.
 */
export function newGame(input: NewGameInput): GameState {
  const { seed, playerIds, playerCharacters, playerBattlefieldCardIds, playerOverrides } = input;

  for (const id of playerIds) {
    const team = playerCharacters[id];
    if (!team || team.length === 0) {
      throw new Error(`player ${id} has no characters; each player needs at least one`);
    }
    if (!playerBattlefieldCardIds[id]) {
      throw new Error(`player ${id} did not bring a battlefield`);
    }
  }

  const players: Record<string, PlayerState> = {};
  for (const id of playerIds) {
    const team = playerCharacters[id]!;
    const characters: Record<string, CharacterState> = {};
    const order: string[] = [];
    for (const c of team) {
      const diceCount: 1 | 2 = c.elite ? 2 : 1;
      const faces = (c.dieFaces ?? DEFAULT_TEST_FACES) as CardDie['faces'];
      if (faces.length !== 6) {
        throw new Error(
          `character ${c.id} has ${faces.length} die faces; expected exactly 6`,
        );
      }
      const dice: CardDie[] = [];
      for (let i = 0; i < diceCount; i++) {
        dice.push({
          instanceId: `${c.id}.die.${i}`,
          cardId: c.cardId,
          faces,
        });
      }
      characters[c.id] = {
        id: c.id,
        cardId: c.cardId,
        elite: c.elite,
        health: c.health ?? DEFAULT_TEST_HEALTH,
        damage: 0,
        shields: 0,
        exhausted: false,
        dice,
        upgradeIds: [],
      };
      order.push(c.id);
    }

    const base: PlayerState = {
      id,
      handCount: STARTING_HAND,
      deckCount: DEFAULT_DECK_SIZE - STARTING_HAND,
      discardIds: [],
      resources: STARTING_RESOURCES,
      handSize: DEFAULT_HAND_SIZE,
      characters,
      characterOrder: order,
      battlefieldCardId: playerBattlefieldCardIds[id]!,
      diceInPool: [],
    };
    players[id] = { ...base, ...(playerOverrides?.[id] ?? {}) };
  }

  const setup = runRollOff(seed, playerIds, playerCharacters);

  return {
    seed,
    turnIndex: 0,
    roundNumber: 1,
    phase: 'setup',
    battlefieldControllerId: null,
    playerOrder: playerIds,
    activePlayerId: null,
    players,
    consecutivePasses: 0,
    playerWhoClaimedThisRound: null,
    setup,
    winnerId: null,
  };
}

function runRollOff(
  seed: string,
  playerIds: readonly string[],
  playerCharacters: Readonly<Record<string, readonly CharacterInput[]>>,
): SetupContext {
  // Per the rules document: each player rolls all of their starting
  // character dice and sums the values (the "white numbers") on the
  // faces that came up. Highest sum wins; ties re-roll.
  let attempt = 0;
  while (true) {
    const rng = createRng(seed).fork(`roll-off:${attempt}`);
    const values: Record<string, number> = {};
    for (const id of playerIds) {
      const team = playerCharacters[id]!;
      let total = 0;
      for (const c of team) {
        const diceCount = c.elite ? 2 : 1;
        const faces = c.dieFaces ?? DEFAULT_TEST_FACES;
        for (let i = 0; i < diceCount; i++) {
          const faceIndex = rng.rollDie(6);
          total += faces[faceIndex]?.value ?? 0;
        }
      }
      values[id] = total;
    }

    const max = Math.max(...Object.values(values));
    const winners = playerIds.filter((id) => values[id] === max);
    if (winners.length === 1) {
      return {
        step: 'choose-first-player',
        rollOffValues: values,
        rollOffWinnerId: winners[0]!,
        shieldsRemaining: SHIELDS_TO_DISTRIBUTE,
        firstPlayerId: null,
        shieldRecipientId: null,
      };
    }
    attempt++;
    if (attempt > 100) {
      throw new Error(`roll-off failed to break after ${attempt} attempts`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Deck-based game construction
// ────────────────────────────────────────────────────────────────────

export interface DeckAssignment {
  readonly playerId: string;
  readonly deck: DeckFixture;
}

export interface NewGameFromDecksInput {
  readonly seed: string;
  readonly catalog: readonly CardFixture[];
  readonly assignments: readonly [DeckAssignment, DeckAssignment];
}

/**
 * Compose a NewGameInput from two DeckFixtures resolved against the
 * card catalog, then call newGame. This is the path the game-server
 * uses to launch a real match: pick two decks, pair them with player
 * IDs, the rest of the setup is automatic.
 */
export function newGameFromDecks(input: NewGameFromDecksInput): GameState {
  const { seed, catalog, assignments } = input;
  const byId = new Map(catalog.map((c) => [c.id, c]));

  const playerIds: [string, string] = [assignments[0].playerId, assignments[1].playerId];
  const playerCharacters: Record<string, CharacterInput[]> = {};
  const playerBattlefieldCardIds: Record<string, string> = {};

  for (const a of assignments) {
    const team: CharacterInput[] = [];
    a.deck.characters.forEach((dc, i) => {
      const card = byId.get(dc.cardId);
      if (!card) throw new Error(`character ${dc.cardId} not in catalog`);
      if (card.type !== 'character') {
        throw new Error(`${dc.cardId} is type ${card.type}, not character`);
      }
      if (!card.dieFaces) {
        throw new Error(`${dc.cardId} has no dieFaces`);
      }
      team.push({
        id: `${a.playerId}.char.${i}`,
        cardId: dc.cardId,
        elite: dc.elite,
        dieFaces: card.dieFaces,
        health: card.health ?? DEFAULT_TEST_HEALTH,
      });
    });
    playerCharacters[a.playerId] = team;
    playerBattlefieldCardIds[a.playerId] = a.deck.battlefieldCardId;
  }

  return newGame({
    seed,
    playerIds,
    playerCharacters,
    playerBattlefieldCardIds,
  });
}

/**
 * Test helper: produce a state that's already past the setup phase by
 * driving the deterministic choices the engine expects in order —
 * winner picks self as first player, picks the loser as shield
 * recipient, loser stacks both shields on their first character.
 * Useful for tests that exercise action-phase behaviour and don't
 * want to drive setup themselves.
 *
 * Not exported from the engine entry point — tests import it directly.
 */
export function newGameInActionPhase(input: NewGameInput): GameState {
  let state = newGame(input);
  const winnerId = state.setup!.rollOffWinnerId;
  const loserId = state.playerOrder.find((id) => id !== winnerId)!;

  state = applyAction(state, {
    type: 'setup.choose-first-player',
    playerId: winnerId,
    firstPlayerId: winnerId,
  }).state;

  state = applyAction(state, {
    type: 'setup.choose-shield-recipient',
    playerId: winnerId,
    shieldRecipientId: loserId,
  }).state;

  const recipient = state.players[loserId]!;
  const firstCharacterId = recipient.characterOrder[0]!;
  for (let i = 0; i < SHIELDS_TO_DISTRIBUTE; i++) {
    state = applyAction(state, {
      type: 'setup.place-shield',
      playerId: loserId,
      characterId: firstCharacterId,
    }).state;
  }

  return state;
}
