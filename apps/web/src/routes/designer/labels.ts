// Converts camelCase identifiers to sentence-case labels (Google Developer's Style Guide).
// Only the first letter is capitalised; subsequent words stay lowercase.
export function humanize(s: string): string {
  return s
    .replace(/([A-Z])/g, (m) => ` ${m.toLowerCase()}`)
    .replace(/^./, (m) => m.toUpperCase())
    .trim();
}

// Overrides for identifiers where humanize() produces awkward output.
const LABEL_OVERRIDES: Record<string, string> = {
  // Costs — descriptive enough to stand alone
  exhaust: 'Exhaust this card',
  discardCard: 'Discard a card',
  // Play conditions — N is a number placeholder, not a word; moreReadyCharacters needs context
  haveNCharactersInPlay: 'Have N characters in play',
  opponentHasNCharacters: 'Opponent has N characters',
  moreReadyCharacters: 'More ready characters than opponent',
  // Trigger events — natural-language event descriptions
  afterActivateCharacter: 'After a character activates',
  afterActivateSupport: 'After a support activates',
  afterPlayCard: 'After a card is played',
  afterPlayUpgrade: 'After an upgrade is played',
  afterCharacterDefeated: 'After a character is defeated',
  afterDieRolledSymbol: 'After a die shows a symbol',
  afterResolveDie: 'After a die is resolved',
  afterClaimBattlefield: 'After the battlefield is claimed',
  afterRemoveDice: 'After dice are removed',
  afterDealDamage: 'After damage is dealt',
  afterTakeDamage: 'After damage is taken',
  beforeCharacterDefeated: 'Before a character is defeated',
  beforeTakeDamage: 'Before damage is taken',
  beforeActivate: 'Before a character activates',
  beforeResolve: 'Before a die resolves',
  // Effect ops — add article where English requires it
  removeDie: 'Remove a die',
  turnDie: 'Turn a die',
  rollDie: 'Roll a die',
  activateCharacter: 'Activate a character',
  exhaustCard: 'Exhaust a card',
  readyCard: 'Ready a card',
  playCard: 'Play a card',
  forceActivate: 'Force activation',
  placeDamageOnCard: 'Place damage on a card',
  placeResourceOnCard: 'Place a resource on a card',
  returnDefeatedCharacter: 'Return a defeated character',
  // Target kinds — possessive for opponent
  opponentCharacter: "Opponent's character",
};

// Returns the override label if one exists, otherwise falls back to humanize().
export function label(s: string): string {
  return LABEL_OVERRIDES[s] ?? humanize(s);
}
