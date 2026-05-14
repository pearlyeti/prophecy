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
  unblockable?: boolean;
  optional?: boolean;
};

export type AddShieldsEffect = {
  op: 'addShields';
  amount: number;
  target: TargetSpec;
  optional?: boolean;
};

export type RemoveShieldsEffect = {
  op: 'removeShields';
  amount: number | 'all';
  target: TargetSpec;
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
  | StubEffect<'removeDie'>
  | StubEffect<'rerollDice'>
  | StubEffect<'turnDie'>
  | StubEffect<'resolveDie'>
  | StubEffect<'resolveWithoutRemoving'>
  | StubEffect<'rollDie'>
  | StubEffect<'rollCardDie'>
  | StubEffect<'activateCharacter'>
  | StubEffect<'exhaustCard'>
  | StubEffect<'readyCard'>
  | StubEffect<'moveDamage'>
  | StubEffect<'moveShields'>
  | StubEffect<'discardCards'>
  | StubEffect<'discardFromDeck'>
  | StubEffect<'lookAtCards'>
  | StubEffect<'revealTopCard'>
  | StubEffect<'searchDeck'>
  | StubEffect<'playCard'>
  | StubEffect<'returnToHand'>
  | StubEffect<'takeBattlefieldControl'>
  | StubEffect<'claimBattlefield'>
  | StubEffect<'endActionPhase'>
  | StubEffect<'takeAdditionalActions'>
  | StubEffect<'forceActivate'>
  | StubEffect<'grantKeyword'>
  | StubEffect<'modifyDieValue'>
  | StubEffect<'setAsideDie'>
  | StubEffect<'placeDamageOnCard'>
  | StubEffect<'placeResourceOnCard'>
  | StubEffect<'returnDefeatedCharacter'>
  | StubEffect<'choice'>
  | StubEffect<'new'>;

// ────────────────────────────────────────────────────────────────────
// Ability — discriminated on `kind`
// ────────────────────────────────────────────────────────────────────

export type ImmediateAbility = {
  kind: 'immediate';
  playCondition?: PlayCondition;
  effects: readonly Effect[];
  cardDisposition?: CardDisposition;
};

export type TriggeredAbility = {
  kind: 'triggered';
  triggerEvent: TriggerEvent;
  playCondition?: PlayCondition;
  effects: readonly Effect[];
  optional?: boolean;
};

export type ActionAbility = {
  kind: 'action';
  costs?: readonly ActionCost[];
  playCondition?: PlayCondition;
  effects: readonly Effect[];
  optional?: boolean;
};

export type PowerActionAbility = {
  kind: 'powerAction';
  costs?: readonly ActionCost[];
  playCondition?: PlayCondition;
  effects: readonly Effect[];
  optional?: boolean;
};

export type SpecialAbility = {
  kind: 'special';
  effects: readonly Effect[];
  optional?: boolean;
};

export type PassiveAbility = {
  kind: 'passive';
  description: string;
  [k: string]: unknown;
};

export type ClaimAbility = {
  kind: 'claim';
  effects: readonly Effect[];
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
