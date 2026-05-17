// Converts camelCase identifiers to sentence-case labels (Google Developer's Style Guide).
// Only the first letter is capitalised; subsequent words stay lowercase.
// Example: afterActivateCharacter → "After activate character"
export function humanize(s: string): string {
  return s
    .replace(/([A-Z])/g, (m) => ` ${m.toLowerCase()}`)
    .replace(/^./, (m) => m.toUpperCase())
    .trim();
}

// Short italic descriptions shown below each action cost row.
export const COST_HELPER: Record<string, string> = {
  exhaust: 'Exhaust this card.',
  removeDie: 'Remove a die from your pool.',
  spendResources: 'Spend resources equal to the amount.',
  discardCard: 'Discard a card from your hand.',
  dealDamageToSelf: 'Deal damage to one of your own characters.',
};
