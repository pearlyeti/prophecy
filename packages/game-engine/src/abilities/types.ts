// Ability AST types for the Prophecy engine.
// These are pure TypeScript — no Zod. Matching Zod schemas live in
// @prophecy/protocol/src/catalog.ts (which imports the engine and
// re-exports these types).
//
// All op names are camelCase. Stub effect types (schema-defined but
// not yet dispatched) accept arbitrary extra fields via index
// signatures so card authors can prototype content before an op ships.

// ────────────────────────────────────────────────────────────────────
// Building blocks
// ────────────────────────────────────────────────────────────────────

export type TargetSpec =
  | { kind: 'opponent' }
  | { kind: 'self' }
  | { kind: 'ownCharacter' }
  | { kind: 'opponentCharacter' }
  | { kind: 'anyCharacter' }
  | { kind: 'eachOpponentCharacter' }
  | { kind: 'eachCharacter' }
  | { kind: 'attachedCharacter' }
  | { kind: 'thisCharacter' };

export type PlayCondition =
  | { kind: 'controlsBattlefield' }
  | { kind: 'spotCharacter'; color?: string; unique?: boolean; count?: number }
  | { kind: 'spotCard'; cardId: string }
  | { kind: 'moreReadyCharacters' }
  | { kind: 'firstActionOfRound' }
  | { kind: 'opponentHasNoCards' }
  | { kind: 'haveNCharactersInPlay'; count: number }
  | { kind: 'opponentHasNCharacters'; count: number };

export type TriggerEvent =
  | { kind: 'afterActivateCharacter'; ownOnly?: boolean }
  | { kind: 'afterActivateSupport'; ownOnly?: boolean }
  | { kind: 'afterPlayCard'; cardType?: string; color?: string }
  | { kind: 'afterPlayUpgrade' }
  | { kind: 'afterCharacterDefeated'; whose?: 'own' | 'opponent' | 'any' }
  | { kind: 'afterDieRolledSymbol'; symbol: string }
  | { kind: 'afterResolveDie' }
  | { kind: 'afterClaimBattlefield' }
  | { kind: 'afterRemoveDice' }
  | { kind: 'afterDealDamage' }
  | { kind: 'afterTakeDamage' }
  | { kind: 'beforeCharacterDefeated'; whose?: 'own' | 'opponent' | 'any' }
  | { kind: 'beforeTakeDamage' }
  | { kind: 'beforeActivate' }
  | { kind: 'beforeResolve' }
  | { kind: 'setup' };

export type ActionCost =
  | { kind: 'exhaust' }
  | { kind: 'removeDie'; [k: string]: unknown }
  | { kind: 'spendResources'; amount: number }
  | { kind: 'discardCard' }
  | { kind: 'dealDamageToSelf'; amount: number };

export type ValueRef =
  | { kind: 'literal'; value: number }
  | { kind: 'countDice'; [k: string]: unknown }
  | { kind: 'countCharacters'; [k: string]: unknown }
  | { kind: 'countCards'; [k: string]: unknown }
  | { kind: 'dieValue' };

export type CardDisposition = 'discard' | 'setAside' | 'returnToDeckBottom';

// ────────────────────────────────────────────────────────────────────
// Effect — discriminated on `op`
// ────────────────────────────────────────────────────────────────────

// First-wave ops: fully typed, dispatched in ENGINE-6.

export type DealDamageEffect = {
  op: 'dealDamage';
  amount: number;
  damageType?: 'melee' | 'ranged' | 'indirect' | 'unspecified';
  target: TargetSpec;
  /** Additional criteria the targeted character must meet. */
  criteria?: CardCriteria;
  unblockable?: boolean;
  optional?: boolean;
};

export type AddShieldsEffect = {
  op: 'addShields';
  amount: number;
  target: TargetSpec;
  /** Additional criteria the targeted character must meet. */
  criteria?: CardCriteria;
  optional?: boolean;
};

export type RemoveShieldsEffect = {
  op: 'removeShields';
  amount: number | 'all';
  target: TargetSpec;
  /** Additional criteria the targeted character must meet. */
  criteria?: CardCriteria;
  optional?: boolean;
};

export type DrawCardsEffect = {
  op: 'drawCards';
  player: 'self' | 'eachPlayer' | 'opponent';
  amount?: number | null;
  toHandSize?: boolean;
  optional?: boolean;
};

export type GainResourcesEffect = {
  op: 'gainResources';
  amount: number;
  optional?: boolean;
};

export type LoseResourcesEffect = {
  op: 'loseResources';
  amount: number | 'all';
  target: 'opponent' | 'self';
  optional?: boolean;
};

export type HealDamageEffect = {
  op: 'healDamage';
  amount: number;
  target: TargetSpec;
  /** Additional criteria the targeted character must meet. */
  criteria?: CardCriteria;
  optional?: boolean;
};

// ENGINE-6b: event-owned and cross-card die roll ops.

export type RollEventDieEffect = {
  op: 'rollEventDie';
  optional?: boolean;
};

export type RollCardDieEffect = {
  op: 'rollCardDie';
  /** Catalog card ID whose die faces to roll. */
  cardId: string;
  optional?: boolean;
};

// ENGINE-TF1: targeting criteria for dice and card effects.

/**
 * Criteria that a die in a pool must meet to be selected by a die-targeting
 * effect. All present fields must match (AND semantics). Array fields use OR
 * semantics within the set (e.g. symbol: ['melee', 'ranged'] matches either).
 */
export type DieCriteria = {
  /** Current face symbol must be in this set. */
  symbol?: string | string[];
  /** Current face value must be ≥ this. */
  minValue?: number;
  /** Current face value must be ≤ this. */
  maxValue?: number;
  /** Must (true) or must not (false) be a modifier face. */
  modifier?: boolean;
  /** Owning card's type must be in this set. */
  ownerCardType?: string | string[];
  /** Owning card's color must be in this set. */
  ownerColor?: string | string[];
  /** Owning card must have this subtype. */
  ownerSubtype?: string;
};

/**
 * Criteria that a character (or support) must meet to be selected by a
 * character-targeting effect. All present fields must match (AND semantics).
 * Array fields use OR semantics within the set.
 */
export type CardCriteria = {
  /** Card must have at least one subtype in this set. */
  subtype?: string | string[];
  /** Card color must be in this set. */
  color?: string | string[];
  /** Card isUnique flag must match. */
  unique?: boolean;
  /** Card must be exhausted (true) or ready (false). */
  exhausted?: boolean;
  /** Character must (true) or must not (false) have at least one upgrade attached. */
  hasUpgrade?: boolean;
  /** Remaining health (health − damage) must be ≥ this. */
  minHealth?: number;
  /** Current damage must be ≤ this. */
  maxDamage?: number;
};

// ENGINE-D1: dice pool manipulation ops (fully typed, dispatched).

/** Which player's pool an op targets. */
export type DiePoolSide = 'ownPool' | 'opponentPool';

export type RemoveDieEffect = {
  op: 'removeDie';
  from: DiePoolSide;
  /** Criteria a die must meet to be removed. If absent, any non-blank die qualifies. */
  criteria?: DieCriteria;
  /** Number of dice to remove (default 1). */
  count?: number;
  optional?: boolean;
};

export type TurnDieEffect = {
  op: 'turnDie';
  from: DiePoolSide;
  /** Symbol to turn the matched die to (replaces face.symbol, keeps value/cost). */
  toSymbol: string;
  /** Criteria a die must meet to be turned. If absent, any die qualifies. */
  criteria?: DieCriteria;
  /** Number of dice to turn (default 1). */
  count?: number;
  optional?: boolean;
};

export type ModifyDieValueEffect = {
  op: 'modifyDieValue';
  from: DiePoolSide;
  /** Value delta (positive = increase, negative = decrease), clamped at 0. */
  delta: number;
  /** Criteria a die must meet. If absent, any non-blank die qualifies. */
  criteria?: DieCriteria;
  /** Number of dice to modify (default 1). */
  count?: number;
  optional?: boolean;
};

// ENGINE-DS1: deck search / reveal op.

/** Where a revealed card ends up after a search resolves. */
export type SearchDisposition = 'toHand' | 'toTopOfDeck' | 'toBottomOfDeck' | 'shuffleIntoDeck' | 'discard';

/**
 * One pick the searching player makes from the revealed set.
 * `count` is the maximum number of cards they may take with this disposition.
 * `filter` optionally restricts which revealed cards qualify for this pick.
 */
export interface SearchChoice {
  readonly count: number;
  readonly filter?: { readonly type?: string; readonly color?: string };
  readonly disposition: SearchDisposition;
}

export type SearchDeckEffect = {
  op: 'searchDeck';
  /** Which player's deck to draw from. */
  source: 'ownDeck' | 'opponentDeck';
  /** How many cards to reveal from the top. 'all' picks up the whole deck. */
  revealCount: number | 'all';
  /**
   * Stop early once this many cards matching the filter are among the revealed
   * set (even if revealCount is higher). e.g. "reveal until you find 3 upgrades".
   */
  revealUntil?: { readonly type?: string; readonly color?: string; readonly count: number };
  /** Ordered pick choices the player must resolve. */
  choices: readonly SearchChoice[];
  /** Disposition for any revealed cards not covered by a selection. */
  defaultDisposition: SearchDisposition;
  optional?: boolean;
};

// ENGINE-CH1: modal choice op.
// ChooseEffect.branches reference EffectStep (defined below) — TypeScript
// handles the mutual recursion because type aliases are fully hoisted.
export type ChooseEffect = {
  op: 'choose';
  count: number;
  branches: readonly { readonly label?: string; readonly steps: readonly EffectStep[] }[];
  optional?: boolean;
};

// Stub ops: schema-defined, dispatcher throws NotImplementedError.
// Index signature lets card authors add fields before the op ships.
type StubEffect<Op extends string> = { op: Op; optional?: boolean; [k: string]: unknown };

export type Effect =
  | DealDamageEffect
  | AddShieldsEffect
  | RemoveShieldsEffect
  | DrawCardsEffect
  | GainResourcesEffect
  | LoseResourcesEffect
  | HealDamageEffect
  | RollEventDieEffect
  | RollCardDieEffect
  | RemoveDieEffect
  | TurnDieEffect
  | ModifyDieValueEffect
  | SearchDeckEffect
  | ChooseEffect
  | StubEffect<'rerollDice'>
  | StubEffect<'resolveDie'>
  | StubEffect<'resolveWithoutRemoving'>
  | StubEffect<'rollDie'>
  | StubEffect<'activateCharacter'>
  | StubEffect<'exhaustCard'>
  | StubEffect<'readyCard'>
  | StubEffect<'moveDamage'>
  | StubEffect<'moveShields'>
  | StubEffect<'discardCards'>
  | StubEffect<'discardFromDeck'>
  | StubEffect<'lookAtCards'>
  | StubEffect<'revealTopCard'>
  | StubEffect<'playCard'>
  | StubEffect<'returnToHand'>
  | StubEffect<'takeBattlefieldControl'>
  | StubEffect<'claimBattlefield'>
  | StubEffect<'endActionPhase'>
  | StubEffect<'takeAdditionalActions'>
  | StubEffect<'forceActivate'>
  | StubEffect<'grantKeyword'>
  | StubEffect<'setAsideDie'>
  | StubEffect<'placeDamageOnCard'>
  | StubEffect<'placeResourceOnCard'>
  | StubEffect<'returnDefeatedCharacter'>
  | StubEffect<'new'>;

// ────────────────────────────────────────────────────────────────────
// EffectStep — the unit of "then" gating (ENGINE-ST1)
// ────────────────────────────────────────────────────────────────────

/**
 * A step groups one or more effects that share a single "fully resolved"
 * status (AND of their individual statuses). Setting `then: true` on a step
 * gates it on the previous step fully resolving — this is the "Then" keyword
 * from the rules reference.
 *
 * Examples:
 *   { effects: [dealDamage] }                     — a simple single-effect step
 *   { effects: [removeDie, loseResources] }        — implicit AND step
 *   { effects: [addShields], then: true }          — only runs if previous step resolved
 */
export type EffectStep = {
  readonly effects: readonly Effect[];
  readonly then?: boolean;
};

// ────────────────────────────────────────────────────────────────────
// Ability — discriminated on `kind`
// ────────────────────────────────────────────────────────────────────

export type ImmediateAbility = {
  kind: 'immediate';
  playCondition?: PlayCondition;
  steps: readonly EffectStep[];
  cardDisposition?: CardDisposition;
};

export type TriggeredAbility = {
  kind: 'triggered';
  triggerEvent: TriggerEvent;
  playCondition?: PlayCondition;
  steps: readonly EffectStep[];
  optional?: boolean;
};

export type ActionAbility = {
  kind: 'action';
  costs?: readonly ActionCost[];
  playCondition?: PlayCondition;
  steps: readonly EffectStep[];
  optional?: boolean;
};

export type PowerActionAbility = {
  kind: 'powerAction';
  costs?: readonly ActionCost[];
  playCondition?: PlayCondition;
  steps: readonly EffectStep[];
  optional?: boolean;
};

export type SpecialAbility = {
  kind: 'special';
  steps: readonly EffectStep[];
  optional?: boolean;
};

export type PassiveAbility = {
  kind: 'passive';
  description: string;
  [k: string]: unknown;
};

export type ClaimAbility = {
  kind: 'claim';
  steps: readonly EffectStep[];
  optional?: boolean;
};

export type Ability =
  | ImmediateAbility
  | TriggeredAbility
  | ActionAbility
  | PowerActionAbility
  | SpecialAbility
  | PassiveAbility
  | ClaimAbility;
