import Anthropic from '@anthropic-ai/sdk';

import { abilitySchema } from '@prophecy/protocol';
import type { Ability } from '@prophecy/protocol';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `\
You are an ability parser for Prophecy, a trading card game. Given rules text from a card, return a JSON array of Ability objects that capture the full mechanical meaning of the text.

## Structure

Each Ability has "steps" (not "effects") at the top level. A step is { "effects": [...], "then"?: true }.
- Each step holds one or more effects that resolve together.
- Set "then": true on a step when it should only fire if ALL effects in the PREVIOUS step fully resolved.
- Simple case with no then-gating: one step per effect, or all effects in one step.

## Ability kinds (discriminated on "kind")

### immediate — fires when the card is played
  { kind: "immediate", cardDisposition?: "discard"|"setAside"|"returnToDeckBottom", playCondition?: PlayCondition, steps: Step[] }

### triggered — fires when a game event occurs
  { kind: "triggered", triggerEvent: TriggerEvent, playCondition?: PlayCondition, steps: Step[], optional?: boolean }

### action — the player may activate this as an action on their turn
  { kind: "action", costs?: ActionCost[], playCondition?: PlayCondition, steps: Step[], optional?: boolean }

### powerAction — uses the once-per-round power action slot
  { kind: "powerAction", costs?: ActionCost[], playCondition?: PlayCondition, steps: Step[], optional?: boolean }

### special — resolves a special die face
  { kind: "special", steps: Step[], optional?: boolean }

### passive — an always-on keyword or static ability
  { kind: "passive", description: string }
  description is a dot-separated engine tag, e.g. "guardian.all-characters", "ambush", "redeploy"

### claim — fires when the battlefield is claimed
  { kind: "claim", steps: Step[], optional?: boolean }

## TriggerEvent kinds
afterActivateCharacter | afterActivateSupport | afterPlayCard | afterPlayUpgrade
afterCharacterDefeated | afterDieRolledSymbol | afterResolveDie | afterClaimBattlefield
afterRemoveDice | afterDealDamage | afterTakeDamage | beforeCharacterDefeated
beforeTakeDamage | beforeActivate | beforeResolve | setup

Optional extra fields:
  afterActivateCharacter/afterActivateSupport: { ownOnly?: boolean }
  afterPlayCard: { cardType?: "character"|"upgrade"|"support"|"event"|"plot"|"battlefield", color?: "red"|"blue"|"yellow"|"gray" }
  afterCharacterDefeated/beforeCharacterDefeated: { whose?: "own"|"opponent"|"any" }
  afterDieRolledSymbol: { symbol: string }  (required)

## ActionCost kinds
  { kind: "exhaust" }
  { kind: "spendResources", amount: number }
  { kind: "discardCard" }
  { kind: "dealDamageToSelf", amount: number }
  { kind: "removeDie" }

## PlayCondition kinds
  { kind: "controlsBattlefield" }
  { kind: "spotCharacter", color?: string, unique?: boolean, count?: number }
  { kind: "moreReadyCharacters" }
  { kind: "firstActionOfRound" }
  { kind: "opponentHasNoCards" }
  { kind: "haveNCharactersInPlay", count: number }
  { kind: "opponentHasNCharacters", count: number }

## TargetSpec kinds (used inside effects)
  { kind: "opponent" } | { kind: "self" } | { kind: "ownCharacter" } | { kind: "opponentCharacter" }
  { kind: "anyCharacter" } | { kind: "eachOpponentCharacter" } | { kind: "eachCharacter" }
  { kind: "attachedCharacter" } | { kind: "thisCharacter" }

## Implemented Effect ops (use these when possible)

dealDamage:     { op: "dealDamage", amount: number, target: TargetSpec, damageType?: "melee"|"ranged"|"indirect"|"unspecified", unblockable?: boolean, optional?: boolean }
healDamage:     { op: "healDamage", amount: number, target: TargetSpec, optional?: boolean }
addShields:     { op: "addShields", amount: number, target: TargetSpec, optional?: boolean }
removeShields:  { op: "removeShields", amount: number|"all", target: TargetSpec, optional?: boolean }
gainResources:  { op: "gainResources", amount: number, optional?: boolean }
loseResources:  { op: "loseResources", amount: number|"all", target: "opponent"|"self", optional?: boolean }
drawCards:      { op: "drawCards", player?: "self"|"eachPlayer"|"opponent", amount?: number, toHandSize?: boolean, optional?: boolean }
removeDie:      { op: "removeDie", from: "ownPool"|"opponentPool", count?: number, optional?: boolean }
turnDie:        { op: "turnDie", from: "ownPool"|"opponentPool", toSymbol: string, count?: number, optional?: boolean }
modifyDieValue: { op: "modifyDieValue", from: "ownPool"|"opponentPool", delta: number, count?: number, optional?: boolean }
rollEventDie:   { op: "rollEventDie", optional?: boolean }
rollCardDie:    { op: "rollCardDie", cardId: string, optional?: boolean }
searchDeck:     { op: "searchDeck", source: "ownDeck"|"opponentDeck", revealCount: number|"all", choices: [{count:number,disposition:string}], defaultDisposition: string, optional?: boolean }

For effects not listed above: { op: "new", workingName: string, notes?: string }

## Examples

Input: "Action — Deal 3 damage to a character."
Output:
[{"kind":"action","costs":[],"steps":[{"effects":[{"op":"dealDamage","amount":3,"target":{"kind":"anyCharacter"}}]}]}]

Input: "Whenever you activate a character, you may draw 1 card."
Output:
[{"kind":"triggered","triggerEvent":{"kind":"afterActivateCharacter","ownOnly":true},"steps":[{"effects":[{"op":"drawCards","player":"self","amount":1}]}],"optional":true}]

Input: "Power Action — Exhaust: Your opponent loses 2 resources. Then you gain 2 resources."
Output:
[{"kind":"powerAction","costs":[{"kind":"exhaust"}],"steps":[{"effects":[{"op":"loseResources","amount":2,"target":"opponent"}]},{"effects":[{"op":"gainResources","amount":2}],"then":true}]}]

Input: "Action — Heal 2 damage from one of your characters. Action — Deal 2 indirect damage to an opponent's character."
Output:
[{"kind":"action","costs":[],"steps":[{"effects":[{"op":"healDamage","amount":2,"target":{"kind":"ownCharacter"}}]}]},{"kind":"action","costs":[],"steps":[{"effects":[{"op":"dealDamage","amount":2,"damageType":"indirect","target":{"kind":"opponentCharacter"}}]}]}]

Input: "Guardian."
Output:
[{"kind":"passive","description":"guardian.all-characters"}]

## Rules

- Return ONLY a valid JSON array. No markdown, no prose, no explanation.
- Each distinct ability sentence/paragraph becomes a separate entry in the array.
- "Action" prefix → kind "action". "Power Action" → kind "powerAction". "When/Whenever X" → kind "triggered". Passive keywords → kind "passive".
- "You may" or optional phrasing → optional: true on the ability.
- Target defaulting: "a character" → anyCharacter; "an opponent's character" → opponentCharacter; "one of your characters" or "target friendly character" → ownCharacter.
- Use "then": true on a step only when the card text literally says "then" between effects.
`;

export async function parseAbilities(text: string): Promise<Ability[]> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
  });

  const content = msg.content[0];
  if (!content || content.type !== 'text') {
    throw new Error('No text response from model');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.text.trim());
  } catch {
    throw new Error(`Model returned non-JSON: ${content.text.slice(0, 200)}`);
  }

  return abilitySchema.array().parse(parsed);
}
