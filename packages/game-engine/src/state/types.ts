// Core type definitions for the rules engine.
import type { Ability, Effect, SearchChoice, SearchDisposition } from '../abilities/types.js';
import type { Queue, PendingTriggers } from '../queue/types.js';
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
  | 'draw'
  | 'focus'
  | 'special'
  // Symbolless modifier face — a "wild" +N that resolves alongside any
  // non-modifier die with a value (not blank, not special). Faces with
  // this symbol MUST have modifier=true; the engine treats them as the
  // symbolless case of the modifier-needs-parent rule.
  | 'modifier'
  | 'blank';

export type Keyword = 'ambush' | 'guardian' | 'modify' | 'redeploy';

/**
 * Lightweight card metadata stored on GameState for targeting criteria checks.
 * Populated by newGameFromDecks for all card instances; test games pass it
 * via NewGameInput.cardMeta.
 */
export interface CardMeta {
  readonly type: CardType;
  readonly color: Color;
  readonly subtypes: readonly string[];
  readonly isUnique: boolean;
}

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
  readonly transient?: boolean;
  /** Character instance id that rolled this die. Absent for transient/event dice. */
  readonly ownerInstanceId?: string;
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
  /**
   * True if this character's power action has been used this round.
   * Reset to false at the start of each round by runUpkeepAndStartRound.
   * Authoritative — the client reads this field; it never tracks it locally.
   */
  readonly powerActionUsedThisRound: boolean;
  /** 1 die for non-elite, 2 for elite. */
  readonly dice: readonly CardDie[];
  /** Upgrade instance ids attached to this character. */
  readonly upgradeIds: readonly string[];
}

/**
 * A support card currently in play. Supports have Stability instead of
 * Health — only Disrupt and Discard dice sides reduce it; shields block
 * Stability loss the same way they block character damage. When Stability
 * reaches 0 the support is immediately discarded and its dice removed.
 */
export interface SupportState {
  readonly id: string;
  readonly cardId: string;
  readonly stability: number;
  readonly maxStability: number;
  readonly shields: number;
  readonly exhausted: boolean;
  readonly dice: readonly CardDie[];
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
  /** Support cards currently in play, keyed by instance id. */
  readonly supports: Readonly<Record<string, SupportState>>;
  /** Support instance ids in their display order. */
  readonly supportOrder: readonly string[];
  /** The battlefield card this player brought to the game. */
  readonly battlefieldCardId: string | null;
  readonly diceInPool: readonly DieInPool[];
}

export type Phase = 'setup' | 'action' | 'upkeep' | 'ended';

export type SetupStep = 'choose-first-player' | 'place-shields' | 'done';

/**
 * Substate that exists only while phase === 'setup'. The roll-off has
 * already happened (deterministically, at newGame time). The winner
 * makes a single choice — who goes first — and the rest of setup
 * follows automatically:
 *
 *   - The first player is the battlefield controller (their battlefield
 *     is in play, they act first each round).
 *   - The OTHER player automatically becomes the shield recipient and
 *     distributes 2 starting shields across their own characters
 *     (1+1 split or both on one character).
 *
 * When `step` reaches 'done', the engine transitions to phase =
 * 'action' and seats the battlefield controller as active player.
 */
export interface SetupContext {
  readonly step: SetupStep;
  /** Each player's roll-off total. */
  readonly rollOffValues: Readonly<Record<string, number>>;
  /** Winner of the roll-off — the player who picks who goes first. */
  readonly rollOffWinnerId: string;
  /** How many shields are still to be distributed. Starts at 2. */
  readonly shieldsRemaining: number;
  /**
   * Whichever player the winner chose to act first. Null until the
   * choice has been made. Determines battlefield controller too.
   */
  readonly firstPlayerId: string | null;
  /**
   * The non-first player. Set automatically when firstPlayerId is
   * chosen. They place the 2 starting shields on their own team.
   */
  readonly shieldRecipientId: string | null;
}

/**
 * Mid-action pause state set while a searchDeck effect is waiting for the
 * player to select cards from the revealed set. All other actions are blocked
 * for the waiting player until resolve-search is submitted.
 */
export interface PendingSearch {
  readonly waitingForPlayerId: string;
  /** Cards drawn from the source deck and presented to the player, in draw order. */
  readonly revealedCardIds: readonly string[];
  readonly source: 'ownDeck' | 'opponentDeck';
  readonly choices: readonly SearchChoice[];
  readonly defaultDisposition: SearchDisposition;
  /**
   * Effects remaining in the ability sequence after the searchDeck op.
   * Applied automatically after resolve-search completes.
   */
  readonly remainingEffects: readonly Effect[];
  /** Player running the ability — used to resume remaining effects. */
  readonly resumePlayerId: string;
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
   * is not present here are treated as cost 0.
   */
  readonly cardCosts: Readonly<Record<string, number>>;
  /** After-ability queue. Drained after each action resolves. */
  readonly queue: Queue;
  /**
   * Non-null when simultaneous after-triggers are waiting for player
   * ordering before they enter the queue. While this is set, only the
   * 'order-triggers' action is legal for the waitingForPlayerId.
   */
  readonly pendingTriggers: PendingTriggers | null;
  /** Monotonic counter for generating stable queue entry IDs. */
  readonly nextQueueEntryId: number;
  /**
   * Per-card-instance ability AST keyed by instance id. Cards not listed
   * here have no abilities. Populated by newGameFromDecks (game-server
   * passes this from the corpus); tests set it directly on NewGameInput.
   */
  readonly cardAbilities: Readonly<Record<string, readonly Ability[]>>;
  /**
   * How many extra turns each player has banked. The turn-rotation
   * path consumes one before rotating; a count > 0 means the same
   * player acts again instead. Granted by Ambush and other ability
   * effects via `grantExtraTurn` (no callers in the engine yet — the
   * Ambush keyword wiring lands once the ability AST resolves).
   */
  readonly extraTurnsPending: Readonly<Record<string, number>>;
  /**
   * Per-turn flag: has Ambush already granted an extra action on the
   * current turn? Per the rules, Ambush doesn't stack within a turn
   * but chains across consecutive turns. Reset to false on every turn
   * boundary (rotation, extra-turn consumption, round start). The
   * Ambush trigger code reads this flag before calling
   * `grantExtraTurn`; nothing reads it yet — wiring is part of the
   * keyword resolver, not this card.
   */
  readonly ambushGrantedThisTurn: boolean;
  /**
   * Maps every card instance id (hand/deck/discard/character) to the
   * catalog card id it was minted from. Populated by newGameFromDecks;
   * empty for test games that use newGame directly. Used by the web
   * client to look up card names, ability text, and die face specs.
   */
  readonly cardCatalogIds: Readonly<Record<string, string>>;
  /**
   * Card type for each deck-card instance id. Used by applyPlayCard to
   * route support cards into player.supports instead of player.discard.
   * Populated by newGameFromDecks; tests set it directly via NewGameInput.
   */
  readonly cardTypes: Readonly<Record<string, CardType>>;
  /**
   * Stability value for support-card instances. Read by applyPlayCard when
   * creating the initial SupportState. Populated by newGameFromDecks.
   */
  readonly cardStability: Readonly<Record<string, number>>;
  /**
   * Six die faces for deck-card instances that carry a die (supports,
   * some upgrades). Read by applyPlayCard to create the support's CardDie.
   * Populated by newGameFromDecks; keyed by card instance id.
   */
  readonly cardDieFaces: Readonly<Record<string, readonly DieFace[]>>;
  /**
   * Keywords per card instance id. Populated by newGameFromDecks (or set
   * directly in tests via NewGameInput). Cards not listed have no keywords.
   */
  readonly cardKeywords: Readonly<Record<string, readonly Keyword[]>>;
  /**
   * Non-null while a Guardian character's owner is deciding whether to
   * intercept an opponent damage die before the activation completes.
   * Only the `guardian.intercept` action is legal while this is set.
   */
  readonly pendingGuardian: {
    readonly activatingCharacterId: string;
    readonly activatingPlayerId: string;
  } | null;
  /**
   * Non-null while a searchDeck effect is waiting for the player's picks.
   * While set, only `resolve-search` (+ concede) is legal for the waiting
   * player. The opponent may only concede.
   */
  readonly pendingSearch: PendingSearch | null;
  /**
   * Lightweight card metadata for targeting criteria resolution, keyed by
   * card instance id. Populated by newGameFromDecks; tests inject it via
   * NewGameInput.cardMeta. Cards not present here have no metadata for
   * criteria checks (owner-type/color/subtype criteria won't match them).
   */
  readonly cardMeta: Readonly<Record<string, CardMeta>>;
}
