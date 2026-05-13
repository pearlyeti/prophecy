// Core type definitions for the rules engine.
// These mirror the abstract game system in docs/rules-reference.md.
// Implementation comes incrementally; this file exists so dependent
// packages can refer to the public surface.

export type Faction = 'light' | 'shadow' | 'neutral';

export type Color = 'red' | 'blue' | 'yellow' | 'gray';

export type CardType = 'character' | 'upgrade' | 'support' | 'event' | 'plot' | 'battlefield';

export type DieSymbol =
  | 'melee'
  | 'ranged'
  | 'indirect'
  | 'shield'
  | 'resource'
  | 'disrupt'
  | 'discard'
  | 'focus'
  | 'special'
  | 'blank';

export type Keyword = 'ambush' | 'guardian' | 'modify' | 'redeploy';

export interface DieFace {
  readonly symbol: DieSymbol;
  readonly value: number;
  readonly cost: number;
  readonly modifier: boolean;
}

export interface DieDefinition {
  readonly id: string;
  readonly faces: readonly [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace];
}

/** A die attached to a card (character / upgrade / support). */
export interface CardDie {
  /** Stable instance id, unique per game. */
  readonly instanceId: string;
  /** Catalog card this die belongs to. */
  readonly cardId: string;
  /** Six faces, indexed 0..5. */
  readonly faces: readonly [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace];
}

export interface CardId {
  readonly id: string;
}

export interface Damage {
  readonly amount: number;
  readonly kind: 'melee' | 'ranged' | 'indirect' | 'unspecified';
  readonly unblockable?: boolean;
}

/**
 * A die currently in a player's dice pool. The face is snapshotted at
 * roll time (and may be mutated by focus / turn / reroll actions); the
 * faceIndex points back into the parent CardDie's faces array so the
 * engine can replay deterministic rolls.
 */
export interface DieInPool {
  readonly instanceId: string;
  readonly cardId: string;
  readonly faceIndex: number;
  readonly face: DieFace;
}

/**
 * A character on the table. Distinct from the catalog card it was
 * minted from — multiple non-unique copies of the same card can be on
 * a team and need separate damage / shield tracking.
 */
export interface CharacterState {
  /** Stable instance id, unique per game. */
  readonly id: string;
  /** Reference to the catalog row in the cards table. */
  readonly cardId: string;
  readonly elite: boolean;
  /** Max damage the character can absorb before defeat. */
  readonly health: number;
  readonly damage: number;
  /** 0..3 per the rules. */
  readonly shields: number;
  readonly exhausted: boolean;
  /** 1 die for non-elite, 2 for elite. */
  readonly dice: readonly CardDie[];
  /** Upgrade instance ids attached to this character. */
  readonly upgradeIds: readonly string[];
}

export interface PlayerState {
  readonly id: string;
  /** Card instance ids currently in the player's hand, in seating order. */
  readonly hand: readonly string[];
  /** Card instance ids remaining in the deck. Index 0 is the top of the deck (next to be drawn). */
  readonly deck: readonly string[];
  /** Card instance ids in the discard pile. */
  readonly discard: readonly string[];
  readonly resources: number;
  readonly handSize: number;
  readonly characters: Readonly<Record<string, CharacterState>>;
  /** The character instance ids in their seating/display order on the team. */
  readonly characterOrder: readonly string[];
  /** The battlefield card this player brought to the game. */
  readonly battlefieldCardId: string | null;
  readonly diceInPool: readonly DieInPool[];
}

export type Phase = 'setup' | 'action' | 'upkeep' | 'ended';

export type SetupStep =
  | 'choose-first-player'
  | 'choose-shield-recipient'
  | 'place-shields'
  | 'done';

/**
 * Substate that exists only while phase === 'setup'. The roll-off has
 * already happened (deterministically, at newGame time). The winner
 * then makes two independent decisions:
 *
 *   1. Who goes first. The chosen player's battlefield is in play and
 *      they get the first turn each round (= battlefield controller).
 *   2. Who gets shields. Independent of #1 — the winner can hand
 *      shields to either themselves or the opponent.
 *
 * The shield recipient distributes 2 shields freely across their own
 * characters (1+1 split or 2 on a single character). When `step`
 * reaches 'done', the engine transitions to phase = 'action'.
 */
export interface SetupContext {
  readonly step: SetupStep;
  /** Each player's roll-off total. */
  readonly rollOffValues: Readonly<Record<string, number>>;
  /** Winner of the roll-off — the player who makes both setup choices. */
  readonly rollOffWinnerId: string;
  /** How many shields are still to be distributed. Starts at 2. */
  readonly shieldsRemaining: number;
  /**
   * Whichever player the winner chose to act first. Null until the
   * choice has been made. Determines battlefield controller too.
   */
  readonly firstPlayerId: string | null;
  /**
   * Whichever player the winner chose to receive shields. Null until
   * the choice has been made.
   */
  readonly shieldRecipientId: string | null;
}

export interface GameState {
  readonly seed: string;
  readonly turnIndex: number;
  readonly roundNumber: number;
  readonly phase: Phase;
  /**
   * The player whose battlefield is in play (= the controller of the
   * battlefield, who acts first each round). Null during setup until
   * the roll-off winner chooses.
   */
  readonly battlefieldControllerId: string | null;
  readonly playerOrder: readonly string[];
  readonly activePlayerId: string | null;
  readonly players: Readonly<Record<string, PlayerState>>;
  readonly consecutivePasses: number;
  /**
   * The player who claimed the battlefield this round, or null if no one
   * has claimed yet. Once set, that player's subsequent turns this round
   * are auto-passed by the engine. Reset to null at the start of each
   * new round (in the upkeep transition).
   */
  readonly playerWhoClaimedThisRound: string | null;
  /** Setup substate; null when phase !== 'setup'. */
  readonly setup: SetupContext | null;
  readonly winnerId: string | null;
  /**
   * Per-card-instance cost lookup keyed by instance id. Cards whose id
   * is not present here are treated as cost 0. This will grow into a
   * fuller per-instance card-data map (kind, ability AST, etc.) when
   * the AST resolver lands.
   */
  readonly cardCosts: Readonly<Record<string, number>>;
}
