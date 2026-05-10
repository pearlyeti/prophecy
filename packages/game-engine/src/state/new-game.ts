import { applyAction } from '../reducers/apply-action';
import { createRng } from '../rng/seeded-rng';
import type { CharacterState, GameState, PlayerState, SetupContext } from './types';

export interface CharacterInput {
  /** Stable instance id; unique per game. */
  readonly id: string;
  /** Catalog card id this character was minted from. */
  readonly cardId: string;
  readonly elite: boolean;
  /** Number of starting dice (1 for non-elite, 2 for elite). */
  readonly diceCount?: 1 | 2;
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
      characters[c.id] = {
        id: c.id,
        cardId: c.cardId,
        elite: c.elite,
        damage: 0,
        shields: 0,
        exhausted: false,
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
  // Deterministic roll-off. Re-roll on tie until broken; the seeded
  // RNG is forked per attempt so re-rolls are stable across runs.
  let attempt = 0;
  while (true) {
    const rng = createRng(seed).fork(`roll-off:${attempt}`);
    const values: Record<string, number> = {};
    for (const id of playerIds) {
      const team = playerCharacters[id]!;
      const diceCount = team.reduce((n, c) => n + (c.diceCount ?? (c.elite ? 2 : 1)), 0);
      let total = 0;
      for (let i = 0; i < diceCount; i++) total += rng.rollDie(6) + 1;
      values[id] = total;
    }

    const max = Math.max(...Object.values(values));
    const winners = playerIds.filter((id) => values[id] === max);
    if (winners.length === 1) {
      return {
        step: 'choose-battlefield',
        rollOffValues: values,
        rollOffWinnerId: winners[0]!,
        shieldsRemaining: SHIELDS_TO_DISTRIBUTE,
        shieldRecipientId: null,
      };
    }
    attempt++;
    if (attempt > 100) {
      // Shouldn't happen with a real RNG; guards against pathological seeds.
      throw new Error(`roll-off failed to break after ${attempt} attempts`);
    }
  }
}

/**
 * Test helper: produce a state that's already past the setup phase by
 * running roll-off, having the winner pick their own battlefield, and
 * having the loser place both shields on their first character. Useful
 * for tests that exercise action-phase behaviour and don't want to
 * drive setup themselves.
 *
 * Not exported from the engine entry point — tests import it directly.
 */
export function newGameInActionPhase(input: NewGameInput): GameState {
  let state = newGame(input);
  const winnerId = state.setup!.rollOffWinnerId;

  // Winner picks their own battlefield.
  state = applyAction(state, {
    type: 'setup.choose-battlefield',
    playerId: winnerId,
    battlefieldOwnerId: winnerId,
  }).state;

  // Loser distributes both shields onto their first character.
  const recipientId = state.setup!.shieldRecipientId!;
  const recipient = state.players[recipientId]!;
  const firstCharacterId = recipient.characterOrder[0]!;

  for (let i = 0; i < SHIELDS_TO_DISTRIBUTE; i++) {
    state = applyAction(state, {
      type: 'setup.place-shield',
      playerId: recipientId,
      characterId: firstCharacterId,
    }).state;
  }

  return state;
}
