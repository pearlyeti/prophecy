# Prophecy — Rules Reference

> **Status:** v0.1 (initial port). Adapted from a dice-and-card dueling system. All names, art, characters, factions, and lore are original to Prophecy. This document describes the abstract game system only and is the binding spec for the engine in `packages/game-engine`.
>
> **Source of truth.** When the rules of the game change, update this document in the same change. The engine implements what is written here.

---

## Intro

This document contains the complete rules for **Prophecy**, as well as frequently asked questions and specific card clarifications. It is not meant to teach the game, but rather serve as a comprehensive reference for rules questions and card interactions.

How to navigate:

- **I want to learn the basics.** Read the starter rulesheet (TBD).
- **I have a question about playing the game.** Use the index at the end of this document.
- **I have a question about a specific card.** Check [Errata](#errata) and [Card Clarifications](#card-clarifications). Otherwise, find the relevant ability words in the [Rules](#rules).
- **I want to learn the finer points of the rules.** Read the [Rules](#rules) section start to finish, or jump to a topic.
- **I want to know what to expect in a tournament.** Consult the tournament rules document (TBD).

### Table of contents

- [Rules](#rules)
  - [Part 1. Card Types & Colors](#part-1-card-types--colors)
  - [Part 2. Dice & Dice Symbols](#part-2-dice--dice-symbols)
  - [Part 3. Areas of Play](#part-3-areas-of-play)
  - [Part 4. Customization](#part-4-customization)
  - [Part 5. Game Structure](#part-5-game-structure)
  - [Part 6. Game Concepts](#part-6-game-concepts)
  - [Part 7. Abilities](#part-7-abilities)
  - [Part 8. Terms](#part-8-terms) *(pending)*
  - [Part 9. Multiplayer Rules](#part-9-multiplayer-rules) *(pending)*
- [Errata](#errata) *(pending)*
- [Card Clarifications](#card-clarifications) *(pending)*
- [FAQ](#faq) *(pending)*
- [Index](#index) *(pending)*

---

## Rules

### The Golden Rule

If the text of a card directly contradicts the rules of the game, the text of the card takes precedence. If you can follow both the rules of the game and the text of the card, do so.

---

### Part 1. Card Types & Colors

All cards may have the following components: **faction, color, type, subtype, title, ability, uniqueness, flavor, identification, rarity,** and **dice reference**.

#### Faction

There are three factions: **Light**, **Shadow**, and **Neutral**. The faction of each card is shown on the bottom of the card.

#### Colors

Each card is associated with a specific color, shown on the bottom of the card.

- **Red** is **Command**, and represents military and logistical endeavors and characters.
- **Blue** is **Mystic**, and represents characters with mystic or arcane abilities and their varied powers.
- **Yellow** is **Rogue**, and represents rogues, outlaws, spies, and smugglers.
- **Gray** is **General**, and represents everything that does not fall under one of the other three colors.

#### Type & subtype

Each card is one of six types: **battlefield, character, event, upgrade, support,** or **plot**. The type is listed above a card's abilities, except on battlefields, where it does not appear. Some cards have one or more subtypes listed after the type.

#### Title

A card's title identifies and describes what it represents in Prophecy's setting.

#### Abilities

Most cards have one or more abilities listed on them.

#### Uniqueness

Each card is either unique or non-unique. Unique cards are marked by a diamond (*) before their titles. All other cards are non-unique.

A player cannot have more than one copy of a unique card in play at the same time. There cannot be more than one copy of a unique character on a team, and a player cannot play a unique support or unique upgrade if they already have another copy of that card in play.

- The unique restriction applies to each player individually. Players can each have one copy of a unique card in play at the same time.
- If a player ever controls more than one copy of a unique card, they must immediately discard one of those cards from play.
- The unique restriction does not apply to dice. A player can have multiples of the same die in play at the same time.
- Characters with the same title but a different subtitle are still considered to be the same character for determining uniqueness.

> **Example.** A player cannot use *Character A, the Adept* and *Character A, the Master* on the same team — both share the title "Character A."

#### Flavor text

Flavor text has no in-game application when present.

#### Identification (ID)

A card's ID contains a set symbol followed by a number. These help identify cards and match them to dice.

#### Rarity

There are five levels of rarity. The rarity of a card is shown by a color behind the collector's info. A die that comes with a card shares its rarity with that card.

- **Fixed (Gray):** non-random distribution; always come in the same product.
- **Common (Blue):** three commons per booster pack.
- **Uncommon (Yellow):** one uncommon per booster pack.
- **Rare (Green):** one rare card and its matching die per booster pack.
- **Legendary (Purple):** one in six packs replaces the rare with a legendary card and its die.

#### Dice reference

A card that comes with a die has reference boxes that show all six sides of that die.

#### Card anatomy

A typical card shows: title, subtitle, type, ability text, flavor, faction, color, rarity, ID, and (if applicable) dice reference and point value(s).

---

#### Battlefields

Battlefields represent locations players face off in. One battlefield is chosen at the beginning of the game; the other is not used.

- One player at a time controls the battlefield, and places it next to their deck — either because they started the game with it or were the last person to claim it.
- Battlefields may have **claim** abilities. These may be used when the **Claim the Battlefield** action is taken.
- The player who controls the battlefield takes the first action each round.
- All battlefields are considered Gray.

**Subtitle (also appears on characters).** A subtitle defines the location of a battlefield, and helps distinguish different versions of characters from each other.

#### Plots

Plots represent schemes and strategies a player can begin the game with. Players may optionally include one plot (no more than one) when building their team. Each plot has a point value that counts toward the 30-point limit, just like characters. Plots start the game in play and remain in play.

- A Light or Shadow plot can only be selected if there is a character of that faction on the team. A Blue, Red, or Yellow plot can only be selected if there is a character of that color on the team.
- Some plots have a negative point value, increasing the team's point limit. A −1 plot allows 31 points for characters on that team.

**Point value.** A card's point value is how many points it costs to include it on a team.

#### Characters

Characters represent notable individuals. Each player spends up to 30 points on characters during customization. Characters start the game in play and remain in play until defeated. Each character has one or two matching dice that are rolled when activated.

**Health.** A character's health is how much damage it can take before being defeated.

**Point value(s).** How many points it costs to include the character on a team. If two values are listed, the smaller is for one die and the larger for two. A character with two of its dice is **elite**.

- Point value cannot be changed during gameplay. If a character becomes elite mid-game (via card effect), its point value does not change.

#### Events

Events represent tactical actions, schemes, twists of fate, and other unexpected developments. When played, follow the card's instructions and discard it.

- Provided any [play restrictions](#play-restrictions) are met, an event can be played even if it has no effect.

**Cost (also on supports and upgrades).** The cost is in the upper-left corner. A player must spend resources equal to the cost to play the card.

#### Supports

Support cards represent vehicles, connections, and forms of logistical aid. When played, place the card faceup in the play area and, if it has a matching die, place its die on the card. Supports have repeatable or ongoing effects and stay in play unless an effect or ability discards them.

- Support cards cannot take damage.
- If a support has a matching die, that die is rolled when the support is activated.
- There is no limit to the number of supports a player can have.

**Subtypes (also on characters and upgrades).** Some cards have subtypes listed after the type, such as "Vehicle" or "Weapon." Subtypes have no inherent rules associated with them, but other cards may reference them. When a card refers to a subtype in its text, the subtype is **bold**.

#### Upgrades

Upgrades represent weapons, gear, and abilities. When played, attach the card faceup to one of your characters (or supports if it has **Modify**) and, if it has a matching die, place its die on the card. Upgrades have repeatable or ongoing abilities and stay in play unless an effect or ability discards them, or the card they are attached to leaves play.

- A player may **discard an upgrade already on a card** to decrease the cost of a new upgrade being played on that card by the cost of the discarded one. This is "replacing an upgrade," and each player can only do this once per round.
- Each card cannot have more than 3 upgrades. If a card ever has more than 3, the controller must choose and discard upgrades until it has 3. (Playing an upgrade on a card with 3 upgrades and then discarding one is **not** the same as replacing — the new upgrade's cost is not reduced.)
- The color of a card and its upgrades do not have to match, provided all deckbuilding and play restrictions were followed.
- There is no limit to the number of weapons, equipment, or abilities a card can have within its 3 upgrades.
- A card can have multiple copies of the same non-unique upgrade.
- If an upgrade has a matching die, that die is rolled when the attached card is activated. It does not matter if the upgrade is ready or exhausted; the upgrade does not exhaust along with the card.

---

### Part 2. Dice & Dice Symbols

All dice have a matching card and may have the following components: **value, symbol, cost, modifier, identification, rarity, faction, color, type, subtype, title,** and **uniqueness**.

**Value.** A number listed above the symbol.
- Blanks and specials have no printed value, and thus a value of 0.

**Symbol.** Each side of a die may have a symbol on it. When resolved, an effect is carried out based on the showing symbol.
- Some dice have one or more sides with no symbol.

**Resource cost.** Some sides have a resource cost (yellow box at the bottom). A player must spend resources equal to the cost in order to resolve that side. If they cannot pay, they cannot resolve it.

**Modifier.** Some dice have one or more blue sides with a plus sign (+) before the value. Modifier sides can only be resolved at the same time as another die showing the same symbol without a plus. The plus value is added to the other die to create a new value.

> **Example.** You roll a +2 ranged. You also roll a 1 ranged, so you can resolve them together to deal 3 ranged damage to a single character. Without the 1 ranged, you could not have resolved the +2 by itself.

- A modifier cannot be resolved by itself.

**Identification (ID).** Set symbol followed by a number. Each ID matches a card.

**Rarity, faction, color, type, subtype, title, uniqueness.** Same as the matching card.
- A player can have multiple unique dice with the same title in their pool.

#### Dice symbols

Activating various cards rolls dice into a player's dice pool. Dice can then be resolved for their symbol's effect as a later action.

- **MD — Melee Damage.** Deals damage to a character equal to the value. All damage from a single die (including modified) must go to one character. Across multiple dice resolved in the same action, each die may target a different character.
- **RD — Ranged Damage.** Same rules as melee damage.
- **ID — Indirect Damage.** Deals damage to an opponent's character(s) equal to the value, distributed as that opponent wishes. May be split among multiple characters.
- **SH — Shield.** Gives shields equal to the value to a single character. Each character may have at most 3 shields; excess shields are ignored.
- **R — Resource.** Gain resources equal to the value.
- **DR — Disrupt.** Forces an opponent to lose resources equal to the value. If they have fewer, they lose all of their remaining resources. A player cannot have fewer than zero resources.
- **DC — Discard.** Discards random cards from an opponent's hand equal to the value. If they have fewer, they discard all remaining cards.
- **F — Focus.** Turns a number of dice in the player's pool to sides of their choice. The number is equal to or less than the value.
  - A player cannot turn an opponent's dice.
- **SP — Special.** Uses the special ability marked by the special symbol on that die's card. Specials have a value of 0 that cannot be changed.
  - A player cannot use a special on a different card; the special triggers the matching card's ability.
  - A player can use multiple specials in the same action and chooses the resolution order.
  - A special ability that rerolls its die cannot be resolved a second time during the same action.
- **Blank.** Blank symbols have no effect and cannot be resolved. Value is 0 and cannot be changed.

#### Resolving dice through cards

Many cards allow resolving one or more dice. The normal die effect is used, plus any extra instructions on the card.

- A player must still pay any resource cost on that die.
- A player cannot resolve a modifier by itself.
- A player cannot use modifiers when resolving a die through a card effect, unless the card allows resolving multiple dice of the same symbol.

#### Dice leaving play

- If a card with a matching die leaves play, the matching die is also immediately returned to the set-aside zone. The die can re-enter play when its card does.
- If a player has two copies of the same upgrade on a single character, they need not track which die belongs to which copy unless something forces them to (e.g., an ability that targets one specific instance). When both dice are in the pool and an ability targets one card, the resolving player chooses which die is affected.
- If a player has two copies of the same upgrade on different characters (one each), they must track each die separately.

---

### Part 3. Areas of Play

Each player has their own in-play and out-of-play areas.

#### In-play

**Characters, plots, & played cards.** After an upgrade or support is played, it is added to the in-play area. Characters and plots start the game in play.

- The abilities on cards in play can be used.
- A card **enters play** when it transitions from an out-of-play area to the in-play area.
- "From play" is short for "from the in-play area."
- If a card leaves play and re-enters play, it is considered a new instance and there is no memory of having used its abilities.

**Dice pool.** Where dice are rolled. Each player has their own pool. Dice are always placed on their matching cards when not in a pool.

- A player can only resolve dice in their own pool.
- Dice in a player's pool can be manipulated (removed, turned, rerolled, resolved) or used as a reference for card effects that require a specific side to be showing.

**Resources.** Kept next to a player's cards. The number a player has is open information.

**Battlefield (if controlled).** Kept in the controller's in-play area.

#### Out-of-play

Cards in a player's hand, deck, discard pile, and set-aside zone are out of play and their abilities cannot be used until they are played, return to play, or a card says otherwise.

- A card **leaves play** when it transitions from the play area to an out-of-play area. Remove all tokens from that card.
- A player cannot have an opponent's card in their own out-of-play area.

**Hand.** Each player has a hand of cards. As an action, they may play a card from their hand by paying its resource cost.

- Each player has a **hand size**. Hand size determines how many cards they draw up to during the upkeep phase (after discarding any cards they want). Default is 5. A player does not have to discard when they have more than their hand size.
- The number of cards in a player's hand is open information; the actual cards are hidden.

**Deck.** Each player brings a 30-card deck. During the game, the deck refers to the stack of facedown cards a player has not yet drawn.

- After being shuffled, the deck is kept facedown; players cannot look through it or change its order except through game abilities.
- The number of cards in a player's deck is open information.

**Discard pile.** A faceup pile near the player's deck.

- Cards in a discard pile are open information. All players can look through any discard pile whenever they wish.
- The order is irrelevant; a player can adjust the order of their own discard pile freely.

**Queue.** When a card is played, it is placed faceup on the table in the queue until it resolves. After resolving, it is either discarded (events) or put into play (non-events).

**Dice on cards.** When dice are not in a pool, they are placed on their matching card. These dice are not active, cannot be manipulated, and none of their sides are considered to be showing.

**Set-aside zone.** Each player has a set-aside zone. At the start of the game, some dice are set aside — dice that can enter play via cards. Players can set aside any number of dice that match cards in their deck or are referenced by cards in their deck. Players may hide these dice using a tray or bag.

Cards can also enter or leave the set-aside zone. Cards there are open knowledge unless otherwise noted. Defeated characters go to the set-aside zone, and some cards or unselected battlefields also use this zone.

**Supply.** Where game tokens are kept. Tokens are taken from the supply when gained (resources), dealt (damage), or given (shields). They are returned to the supply when spent (resources), lost (resources), healed (damage), or removed (shields). If players run out, use a proxy.

---

### Part 4. Customization

Customization happens before playing a game.

#### 1. Building a team

To build a team, a player chooses up to 30 points of characters and up to one plot.

- Light and Shadow characters cannot be on the same team. Neutral characters can be on any team.
- A player can select only one copy of each unique (*) character but any number of copies of non-unique characters. When selecting a unique character, the player must choose elite (larger point value, two dice) or non-elite (smaller point value, one die).
- A player must choose at least one character.
- There are no restrictions based on a character's color. A team may mix colors.

> **Example.** A player chooses an elite version of Character A (16 points) and a non-elite version of Character B (14 points). Their two characters total 30 points — the maximum.
>
> Since both are Light, the deck cannot include Shadow cards. Because no Blue character is on the team, the deck cannot include Blue cards. The player picks 30 Red, Yellow, and Gray cards. They include at least 10 cards with dice — drawing dice cards is important.
>
> Finally, they select a battlefield that grants free use of certain dice resource costs.

#### 2. Building a deck

- A deck contains exactly 30 cards. No more than 2 copies of the same card.
- If a team has Light characters, its deck cannot contain Shadow cards. If the team has Shadow characters, its deck cannot contain Light cards. If a team has all Neutral characters, its deck cannot contain Light or Shadow cards. Neutral cards can go in any deck.
- Blue, Red, and Yellow cards can only be in the deck if the team includes a character of the matching color. Gray cards can go in any deck.
- A deck can contain events, upgrades, and supports. Characters, plots, and battlefields are not in the deck and don't count toward the 30.

#### 3. Selecting a battlefield

In addition to characters and a deck, each player selects one battlefield to bring to the game.

---

### Part 5. Game Structure

#### Setup

1. Each player places character and plot cards faceup in front of them, along with matching dice.
2. Each player sets their battlefield faceup aside.
3. Each player shuffles their 30-card deck and draws 5 cards.
4. Each player may shuffle any number of cards from their hand back into their deck and redraw until they have 5 cards.
   - Players should choose simultaneously. If there's a disagreement, randomly determine who chooses first.
5. Sort game tokens (damage, shields, resources) into piles near the play area. Each player gains 2 resources from the supply.
6. Each player rolls their starting character dice and adds the values (white numbers). Ties reroll. The winner of the roll-off chooses **who goes first**. The first player's battlefield is in play (they are its controller) and they take the first turn each round; the other battlefield is set aside. The non-first player automatically receives the 2 starting shields and distributes them freely across their own characters (1+1 across two, or 2 on a single character). Then return all character dice to their cards.
7. "After setup" abilities trigger.

#### Rounds

Each game is played over a series of rounds. Each round has two phases: an **action phase** and an **upkeep phase**.

##### Action phase

Players alternate taking turns. The battlefield controller takes the first turn. On a player's turn, they perform one **action** or **pass**. When both players pass consecutively, the action phase ends.

##### Upkeep phase

Each player, in turn:

1. Readies their exhausted cards.
2. Returns all dice still in their pool to their matching cards.
3. Gains 2 resources.
4. Discards any number of cards from their hand, then draws up to their hand size.
   - If after discarding the player has cards equal to or more than their hand size, they don't draw.
   - If a player can't draw enough cards, they draw as many as they can.

#### Actions

On their turn, a player must take an action or pass. They first declare intent (and show the card if needed). The actions are:

- Play a card
- Activate a card
- Resolve dice
- Reroll dice
- Use a card action
- Claim the battlefield

##### Play a card

1. Declare intent by showing the card and add it to the queue.
2. Check play restrictions. If they cannot be met, the action is illegal.
3. If the card is an upgrade, choose a target to attach it to. If there are no eligible targets, the action is illegal.
4. Determine the cost(s). If they cannot be paid (taking modifiers into account), the action is illegal.
5. Apply modifiers to the cost(s). Replacing an upgrade and "before you play" abilities may be triggered at this time.
6. Pay the cost(s).
7. If the card is next in line in the queue, resolve its effects. After resolving, the card is either discarded (events) or put into play (non-events).

##### Activate a card

To activate a character or support, exhaust that card and roll all of its dice (character or support) and all of its upgrade dice into the pool. Any of its dice already in the pool are not rerolled. Supports without a die cannot be activated.

- An exhausted character or support cannot be activated.

##### Resolve dice

Resolve one or more dice in your pool showing the same symbol, one at a time (unless adding a modified die, in which case those dice resolve simultaneously). To resolve a die, pay any costs and carry out the symbol's effect, then return the die to its card.

- A player can only resolve dice in their own pool.
- A player can resolve dice with different values during the same action, provided they share a symbol.
- A player cannot choose to resolve dice symbols if they have no symbols of that type to resolve. At least one die must be resolved when taking this action.
- A player can resolve any dice showing the same symbol, even if those dice were not showing that symbol when the player started resolving.
- A player cannot resolve the same die more than once per action.
- If a player's effect would resolve an opponent's die, that die is resolved as if it were in that player's pool instead.

##### Reroll dice

A player can discard one card of their choice from their hand to reroll any number of their dice in their pool. They must choose all the dice they want to reroll before rerolling.

##### Use a card action

Some cards have actions listed on them, preceded by the bold word "Action." Follow the card's instructions.

- **Power Actions.** A power action can only be used once per round, even if the card changes control. Each card's power action can be used once even if other cards have the same title.

##### Claim the battlefield

When a player claims the battlefield, if they don't already control it, they take control and move the battlefield card to their in-play area. Then they may use its **Claim** ability. For the rest of the round, that player automatically passes all future turns and declines to act if given the opportunity. Their opponent continues taking turns until they also pass. Only one player can claim the battlefield each round.

- Using the claim ability is optional.
- A player can claim the battlefield even if they already control it, in order to keep control and use the claim ability.
- The battlefield controller takes the first turn each round.
- Players can still use card abilities after they claim.

##### Illegal actions

If a player takes an illegal action or attempts an action that cannot be completed, the entire action is reversed. No abilities trigger and no effects resolve as a result. Then that player takes an action or passes. Actions that shuffle a deck, reveal cards from a deck, or move cards to or from a deck cannot be reversed.

##### Undoable vs. committed actions

Some actions can be previewed and cancelled before they take effect; others are committed the moment they begin because they reveal hidden information or introduce randomness that cannot be unseen.

**Undoable (can preview and cancel):**
- Dealing damage, healing damage
- Adding or removing shields
- Exhausting a card
- Changing resources
- Turning a die face via Focus

**Committed before executing (cannot be undone once begun):**
- Deck searches and card reveals — once you see which cards are in the deck, that information cannot be forgotten
- Dice rolls and rerolls — once a die lands on a face, the result stands

The client enforces this boundary. Cards whose first step contains a deck search, event-die roll, or card-die roll are dispatched immediately on drag-drop; all others enter a preview state where the player can inspect the effect and confirm or cancel.

##### Extra actions

When a player is allowed to take additional actions on their turn, they must immediately take them following the resolution of the current action, or decline to act (this is **not** the same as passing). If they are allowed to take an action outside their turn, they also must take it immediately or decline.

Each action, and any abilities its resolution triggers, must fully resolve before an additional action is taken. Actions wait to resolve in the order they were created. They do **not** enter the queue.

> **Example.** A player plays an upgrade with **Ambush** on Character A while their opponent has Character X (with an "after Character A activates" ability) ready. They now have two additional actions — one from Ambush and one from another ability. They use one of the additional actions to activate Character A. As a consequence, Character X's after ability meets its trigger and is added to the queue. Because additional actions exist outside the queue, that ability resolves before the second additional action is spent.

##### Passing

If a player does not wish to take an action on their turn, they may **pass**. They do nothing but retain the option to act after their opponent. After both players pass consecutively, the round proceeds to the upkeep phase.

If a player takes an action that does nothing, they are considered to have passed instead.

> **Example 1.** A player uses an action ability that removes one of their own dice from the pool, but they have no such dice. Nothing happens, so they are considered to have passed.
>
> **Example 2.** A player uses an action ability on a ready support that exhausts it and moves damage off it, but there is no damage on it. Since the support exhausts, *something* happened, so the action does not count as a pass.

##### Changing card types

When a card becomes a new card type, it is no longer its previous type, all tokens on it are removed, and all upgrades on it are discarded. The card remains exhausted or ready, and all of its dice are returned to its card. If a character becomes a new card type, it no longer has health or point values.

##### Reminder text

Reminder text is text in parentheses that clarifies game text. It reminds players of rules and does not supersede them.

#### Winning the game

There are two ways for a game to end:

- If a player controls no characters, the game ends immediately and the other player wins.
- If a player has no cards in their hand and deck at the end of a round (after the upkeep phase), they lose. If both players would lose this way, the player who controls the battlefield at the end of the round wins.

---

### Part 6. Game Concepts

#### Damage

When a character is dealt damage, place that much damage on the character. When a character has damage equal to its health, it is immediately defeated.

- **Unblockable damage** cannot be blocked by shields or card effects. Any shields on a character dealt unblockable damage remain; the shields are ignored for the purpose of dealing the unblockable damage.
- Unless specified, damage is neither ranged nor melee. "That damage" is short for "that amount of damage."

> **Example.** A player uses an event to remove a die showing ranged damage and deal 2 damage to a character. The damage just dealt is **not** considered ranged.

- 0 damage means no damage was considered to have been dealt.
- Damage dealt during the same action is usually dealt at different times since dice resolve one at a time. The only time multiple dice deal damage at the exact same time is when a die is being modified by other dice.
- Any excess damage above a character's health is ignored.
- When a player distributes damage "as they wish:"
  1. The player assigns characters the amount of damage they will be dealt. A player cannot assign more damage than the character's remaining health plus shields, **unless** they cannot assign any more damage to other characters and there is still damage remaining — then the remainder must be assigned as they choose.
  2. Once all damage is assigned, it is dealt simultaneously.

> **Example.** A player has two characters with 1 remaining health each. They are forced to distribute 2 damage. They must deal each character 1 damage, instead of dealing one character 2 damage. If one of those characters had 1 shield, both points of damage could have been dealt to that character.

#### Defeated characters

When a character has damage equal to its health, it is immediately defeated. Set aside its character card and all of its dice (character and upgrade dice), and discard all upgrades on it. While set aside, the character and its dice are no longer in play and cannot be used.

- When a player controls no characters, they lose.

#### Stability

Support cards have **Stability** instead of Health. Stability represents how resilient a support is against interference; it can only be reduced by **Disrupt** or **Discard** dice sides resolved against it (not by Melee, Ranged, or Indirect damage). Shields on a support block Stability loss the same way they block damage on characters.

- Each support card lists its Stability value. Place Stability tokens on the card to track the current value.
- When Stability is reduced to 0 the support is immediately discarded and its dice (including any upgrade dice) are removed from the pool.
- Supports are **not** characters. Effects that reference "characters" do not affect supports unless they explicitly say "or support."
- A player cannot lose the game from losing supports alone — only losing all characters causes defeat.

#### Resources

Resources are the game's currency, used to pay for cards, abilities, and dice resolutions. Resource tokens represent how many a player currently has. Resources begin in the supply. Gaining takes from the supply; spending or losing returns to the supply.

- Each player gains 2 resources during the upkeep phase.
- If the supply runs out, substitute a different token or track resources another way.

#### Shields

Shields block damage. Each shield blocks 1 damage dealt to the character. After blocking, the shield is removed.

- Shields block damage **before** it is taken. Shields must be used to block damage if possible. Other effects that block damage do so at the same time and can be used before or after shields, like any simultaneous abilities.
- Each character can have at most 3 shields. Excess shields are ignored.
- If the supply runs out, substitute or track another way.

#### Draw

Whenever a player draws a card, they take the top card of their deck and add it to their hand.

- When players draw multiple cards, the cards are drawn simultaneously.
- If a player does not have enough cards left, they draw as many as they can. If they cannot draw any, nothing happens.

#### Ready

A card is **ready** when in an upright position. Ready cards can be exhausted (turned sideways).

- A card already ready cannot be readied.
- Ready supports and characters can exhaust to activate. Ready upgrades can only be exhausted through card effects.

#### Exhausted

A card is **exhausted** when turned sideways. Exhausted cards can be readied (turned upright).

- A card already exhausted cannot be exhausted again.

---

### Part 7. Abilities

An ability is the special game text that a card contributes to the game. There are five types of abilities: **action abilities**, **claim abilities**, **ongoing abilities**, **special abilities**, and **triggered abilities**. There are also **keywords** — shorthands for abilities that appear on multiple cards. Cards can have more than one ability; each ability is its own paragraph.

> **Example.** Character F has two different abilities, separated into paragraphs.

An ability becomes usable as soon as its card enters play and remains usable as long as that card is in play. An ability from an event is resolved when that event is played.

Players must resolve as much of an ability as they are able to, unless it includes the word "may" or explicitly gives a choice. Special abilities are mandatory if that side of the die is resolved.

#### The queue

The queue is an imaginary line that most game effects and abilities enter and leave in chronological order, on a "first in, first out" principle. Each effect must fully resolve before the next. If during the resolution of something in the queue another effect is added, it goes to the end of the queue.

- **After** abilities enter the queue.
- **Before** abilities do **not** enter the queue, but interrupt it.
- **Additional actions** that are gained do not enter the queue, but instead wait their turn since a player can only resolve one action at a time.

> **Example 1.** A player resolves one of their dice to deal 2 damage. The 2 damage enters the queue, and since nothing else is in the queue, it resolves.
>
> **Example 2.** A player plays an event that activates two of their characters. Their first character has Guardian and an attached upgrade with Redeploy. Since "before" abilities interrupt, Guardian resolves first (does not enter the queue). The first character is defeated by the damage it takes from Guardian; Redeploy interrupts being defeated and moves the upgrade to the second character (does not enter the queue). The event then activates the second character, rolling its die plus the moved upgrade die into the pool. The second character has an "after activates" triggered ability that enters the queue, and since nothing else is queued, it resolves.

#### Action abilities

Some support, upgrade, and character cards have unique actions, preceded by the bold word "Action" or "Power Action." To resolve, a player must spend one action on it during their turn and follow the card's instructions.

> **Example.** A support has the action ability "**Action** — Exhaust this support to gain 1 resource."

#### Claim abilities

Battlefields may have claim abilities, preceded by the bold word "Claim." These are optional and may be resolved by the player who claims the battlefield.

#### Ongoing abilities

Any non-keyword ability whose text contains no trigger condition and does not have a bold prefix word (like "Action" or "Claim") is an **ongoing** ability.

> **Example.** An upgrade has the ongoing ability "Attached character has the **Guardian** keyword."

#### Inherent dice abilities

Some cards have ongoing abilities that are considered inherent to the die. They always affect how the die resolves, independent of whether the card is in play. Inherent dice abilities (other than specials) never use the words "before," "after," or "while."

> **Example.** A card says "The shields from this die can be given to any of your characters, distributed as you wish." The shields from this die can be split regardless of whether the card is in play, such as when resolved through another card's special ability.

#### Special abilities

A type of inherent dice ability marked by the special symbol. When a die showing the special symbol is resolved, the special ability on its matching card resolves.

- The special symbol cannot be resolved to use a different card's special.
- If a card has more than one special ability, the resolving player chooses which to use.

#### Keywords

Keywords are shorthands for abilities that appear on multiple cards.

- A card cannot gain another copy of a keyword; it either has it or does not.
- If a card loses a keyword, it loses it no matter how many times it would gain it.
- The italicized text that explains keywords on cards is reminder text only, and is overridden by the full rules below.

##### Ambush

After playing (and resolving) a card with **Ambush**, the player may take another action.

- If a player is allowed to take an action outside of their turn, they immediately take it.

##### Guardian

Before a character with **Guardian** activates, its owner may remove one die showing damage (melee, ranged, or indirect) from their opponent's pool to deal damage equal to the value showing on the removed die to the activating Guardian character.

##### Modify

Some upgrades have the keyword **Modify** and the subtype **mod**. When playing a card with Modify, a player must choose an eligible target under their control. The target is defined by the Modify keyword. A mod that has "Modify vehicle support" can only be played on a vehicle support; it cannot be played on a vehicle upgrade.

- Modify is **not** a play restriction.
- A card cannot have more than 3 upgrades.

##### Redeploy

This keyword only appears on upgrades. Before this upgrade would be discarded by its character being defeated, you may instead move it to one of your other characters. The upgrade die moves to the new character card, even if it was in the dice pool.

- The Redeploy keyword ignores play restrictions when attaching to a new character.

#### Triggered abilities

A triggered ability has a **trigger condition** and an **effect**. When a triggered ability meets its trigger condition, the ability resolves. There are two types: **after** and **before** abilities.

- Triggered abilities exist independently of their source. Once triggered, the entire ability resolves, even if the card it was on leaves play.

##### Trigger condition

A trigger condition indicates the timing point at which an ability may be used, and always follows either "after" or "before." A trigger condition matches a specific occurrence in the game.

> **Example.** A character is about to gain a shield, which is the trigger condition for an ability that says "Before this character gains 1 or more shields, you may remove 1 of his shields to deal 1 damage to a character."

##### Before abilities

If a before ability meets its trigger condition during the game, immediately resolve the before ability prior to resolving the rest of the effect. Before abilities can interrupt the flow of the game and ignore the queue.

> **Example.** An upgrade says "Before attached character is defeated, this card becomes a support for the rest of the game." The trigger condition is "attached character is defeated," and "before" tells you to resolve the rest of the effect before the trigger condition resolves.

##### After abilities

If an after ability meets its trigger condition during the game, it resolves following the resolution of the trigger condition. Unlike before abilities, after abilities do not interrupt the flow of the game; they wait their turn in the queue.

> **Example.** An upgrade says "After you play this upgrade, you may reroll any number of your dice or any number of your opponent's dice." The effect of playing the card must fully resolve (paying the cost, choosing a character to attach it to), and then the after ability resolves.

- If the trigger condition of an after ability was part of another ability, that entire ability is completed before the new after ability resolves.

#### Simultaneous abilities

When two or more triggered abilities meet their trigger conditions at the same time, the player who is resolving them chooses the order they resolve in (for before abilities) or enter the queue in (for after abilities). If more than one player has simultaneous abilities, the battlefield controller chooses the order in which each player resolves their own abilities or has them enter the queue.

> **Example.** Two characters, controlled by different players, both have an after ability that triggers on the same activation. The battlefield controller decides which player resolves theirs first.

#### Effects

An effect is anything that results from an ability. An effect lasts for as long as the action described in it.

##### Delayed effects

Some abilities contain delayed effects. They specify a future timing point or condition, and contain an effect that happens at that time.

##### Delayed effects

Some abilities contain delayed effects. They specify a future timing point or condition, and contain an effect that happens at that time.

> **Example.** An event says "You may pay 5 resources to choose a character. That character is defeated after this round ends." The character being defeated is a delayed effect because it does not fully resolve until a future point in time.

- An event with a delayed effect creates the effect, and then the event is discarded.

##### Replacement effects

A replacement effect uses the word "instead" somewhere in its text. If a replacement effect resolves, the original effect is considered to have not resolved, and no abilities can be triggered off of it. (Abilities can be triggered off of the replacement effect.)

> **Example.** Upgrade A says "Before attached character would be defeated, instead heal 5 damage from it and discard this upgrade." Because this prevents the character from being defeated, the character is never considered to have been defeated.

Some replacement effects that are part of before abilities use the words "would be" in their text. These effects are faster than other before abilities, and no abilities can be triggered off of the original effect.

> **Example.** Upgrade A (above) resolves before another character's "before this character is defeated" ability. Since the affected character is no longer defeated, that other ability cannot be triggered.

- When two or more replacement effects are trying to replace the same thing, the player who is resolving those abilities chooses the order they resolve in (or enter the queue in). If more than one player has simultaneous abilities, the battlefield controller chooses the order. The other replacement effects no longer resolve, since the thing they are replacing no longer exists.

##### Self-referential effects

When a card's ability text refers to its own card type, such as "this upgrade" or "this character," it refers to itself only — not to other copies (by title) of the card.

##### Negative effects

Negative effects take precedence over positive effects. If an effect says a player cannot do something, then they cannot do it, even if another effect says they can.

##### "Then" effects

To resolve an effect that is preceded by the word "then," the previous effects on the card must have fully resolved (i.e., the game state changes to reflect the intent of the effect in its entirety). If the part of an ability that precedes "then" does not successfully resolve in full, the part that follows "then" does not attempt to resolve.

> **Example.** An event says "Discard the top 3 cards of your deck. Then you may add an upgrade or a support from your discard pile to your hand." If fewer than 3 cards remain in your deck, you cannot add a card to your hand because the previous effect did not fully resolve.

---

### Part 8. Terms

Definitions of important terms, in alphabetical order.

**Character die.** A die that matches a character. Upgrade dice are not character dice, even though characters also use them when activating.

**Cheapest.** Has the lowest cost. Any effect modifying the cost should be taken into account.

**Choose — either.** If an ability uses "choose" and "either," the player using it may choose either option, even if the chosen one will have no effect. Once chosen, the player must resolve as much of it as possible.
- Some cards force an opponent to make a choice; the opponent can also choose either option.

**Choose — target.** A target is a card or die to which an effect will happen. "Choose" indicates a target must be chosen for the ability to resolve. The resolving player must choose a game element meeting the targeting requirements of the ability.
- A player cannot choose invalid targets — e.g., they cannot deal damage to a defeated character. If there are no valid targets, the card does nothing.
- If multiple targets must be chosen by the same player, they are chosen simultaneously.
- An effect that can choose "any number" of targets can resolve with zero chosen, though it may have no effect.

**Combined value.** The sum of the values showing on all the dice being referenced.

> **Example.** The combined value of two ranged damage dice showing 2 and 1 is 3.

**Controller.** The player who has a card or die in their in-play area. By default, players control all cards and dice they own.
- "Your" card or die refers to a card or die under your control.

**Copy (of a card).** Defined by title. Any other card with the same title is a copy, regardless of card type, text, artwork, or any other characteristic.

**Decreases.** Effects that decrease something only last for the duration of the effect. Some effects have an ongoing duration.

> **Example.** A support says "Before you play a Blue upgrade, you may exhaust this support to decrease its cost by 1." This only applies while paying the cost; once the upgrade is played, its cost returns to its normal value.

**Free.** When something is played or resolved for free, the player does not pay any cost for the card or die.

**Heal.** When damage is healed from a character, remove that amount of damage. Heal as much damage as possible. Excess healing is ignored. If no damage was removed by the healing effect, the character is not considered to have been healed.

**Increases.** Effects that increase something only last for the duration of the effect. Some effects have an ongoing duration.

> **Example.** A plot says "Your hand size is increased by 1." Because this effect has no duration, the increase is constantly applied.

**Look at.** Sometimes an effect allows a player to look at cards in a player's hand or deck. Looking at a card does not change its position; after being looked at, the card returns to its previous location.

**Move.** Some effects allow players to move cards or tokens.
- Something cannot move to its current placement. If there is no valid destination, the move cannot resolve.
- When an upgrade moves to a new character, its die returns to the matching card.
- When an upgrade moves to a new character, it maintains its state (ready or exhausted).
- An upgrade with a play restriction can be moved to any character, since it is not being played.
- When damage is moved to a new character, it ignores shields and the character is not considered to have taken damage.

**Owner.** The player who brought the card or die to the game. A player can own a card or die but lose control of it (such as losing control of the battlefield).

**Play restrictions.** Sometimes appear on a card and are marked by the word "only." A player cannot play the card unless the play restriction is met. Upgrade cards sometimes say "(Color) character only" — without a character of that color to attach to, the upgrade cannot be played.
- Upgrades do not get removed if the play restriction is no longer fulfilled. The character must only fulfill the restriction when the card is first played.

**Remaining health.** A character's health minus the amount of damage on it.

**Removing dice.** Moves them from a player's pool back to their matching card.
- A die cannot be removed unless it is in a player's pool.
- If dice of a specific symbol must be removed to trigger an effect, it does not matter if those dice can currently be resolved. Symbols that are modifiers or require a resource match still count as that symbol.

**Replace.** When an upgrade is discarded to decrease the cost of another upgrade, the new upgrade replaces the old one. Each player can only replace an upgrade once per round.

**Rolling.** When a card refers to rolling a die, this applies to both rolling it into your pool and rerolling it (if it was already in your pool).

**Search.** When a player searches for a card, they may look at all cards in the searched area without revealing them to opponents.
- A player does not have to find the object of a search effect.

**Showing.** A die side is showing if it is the faceup side after being rolled into a dice pool.
- Sides that are not faceup cannot be referenced when a card requires a symbol to be showing.
- Effects that reference a symbol showing on a die work with any side showing that symbol, even modified sides.
- "Showing damage" includes ranged, melee, and indirect damage.
- Dice on cards do not have any sides showing. A die can only show a side once it has been rolled into a player's pool.

**Spotting.** Some cards require a player to spot a specific game element to use an ability. To spot an element, a player must have it in play. Most cards require spotting a character of a specific color.

> **Example.** An event says "Spot a Blue character to turn a die to any side." You must have an undefeated Blue character on your team, or the card does nothing.

- A player cannot spot opponents' characters or cards unless the card explicitly says so.
- If a player cannot spot the required element, the card does nothing.

**Taking damage.** Damage is taken only when one or more damage tokens are placed on a character. If all damage was blocked by shields or some other ability, no damage was taken.
- Damage not taken is still **dealt**.

> **Example.** An upgrade says "After this character takes melee damage, discard this upgrade." If 2 melee damage is dealt to the character but blocked by 2 shields, no damage was taken and the upgrade is not discarded.

**Turn (die).** When a player turns a die, they rotate it so that side is faceup (showing).
- A turn must result in a different side. A player cannot turn a die to the same side it was on before. (If the die has the same symbol and value on multiple sides, it can be turned to an identical side.)

**Unblockable damage.** Cannot be blocked by shields or card effects. Any shields on a character dealt unblockable damage remain on that character.
- All modifiers added to a die that deals unblockable damage will also be unblockable.

**X as a variable.** Some cards refer to X as a variable. X is always a number defined by the card and does not have a standard value.

---

### Part 9. Multiplayer Rules

In addition to playing against one opponent, players can play against more than one in a multiplayer game. There is one official format: **free-for-all**.

#### Free-for-all

More than two players can participate in a free-for-all game; 3–4 is the recommended number. Players follow all of the normal rules of the game, with the following exceptions and additions.

##### Setup

1. Randomly seat the players at the table.
2. All players roll off for the battlefield. The player with the highest value wins the roll-off and chooses a battlefield to use for the game. Each player whose battlefield was not chosen gets 1 shield to give to one of their characters and sets their battlefield aside. If players tie during the roll-off, only the tied players reroll to break the tie.

##### Actions

Players take actions clockwise around the play area, starting with the battlefield controller. All players must consecutively pass to end the round. Only one person can claim the battlefield.

##### Choosing opponents

When an ability refers to an opponent, the player using the ability chooses which opponent it affects.

##### Player elimination

If a player controls no characters, or has no cards in their deck and hand at the end of the round, that player is immediately eliminated. Their cards and dice are removed from the game, except for cards they no longer control or their battlefield if it is active. If the eliminated player controlled the battlefield, no one controls the battlefield until someone else claims it (and if it has already been claimed this round, players must wait until the next round). The player to the eliminated player's left decides how simultaneous abilities controlled by more than one player are resolved until someone else controls the battlefield. The remaining players continue until one player remains; that player wins.

---

## Errata

This section will list changes made to Prophecy's printed cards as they are issued. Empty until Prophecy ships its first set.

When a card needs erratum, add a subsection per set, with the card's title, ID, and the corrected text. Errata applies retroactively unless otherwise noted.

## Card Clarifications

This section will hold per-card rulings as Prophecy's card pool grows. Empty until Prophecy ships its first set.

When a card has a non-obvious interaction worth documenting, add it here under the relevant set, with the card's title and one or more bullet points clarifying the ruling.

## FAQ

Common rules questions. Examples below use abstract names; specific Prophecy card interactions will be added under [Card Clarifications](#card-clarifications) as they ship.

**Q. Can I play with my friend if we are both using Shadow (or Light) decks?**
Yes. You can play against anyone, regardless of faction. You could even use the same characters they are using.

**Q. When one of my characters is about to take damage, do I have to use their shields?**
Yes, if able.

**Q. If I play an upgrade on an exhausted character, can I immediately roll its die into my pool?**
No. You must wait until the character readies again to roll the new die into your pool, along with the rest of the character's dice.

**Q. Can I redeploy an upgrade to a character who already has the maximum number of upgrades?**
Yes, but you would have to discard one of the character's upgrades to make room.

**Q. What is the difference between ranged, melee, and indirect damage?**
The only difference between ranged and melee damage is the cards that interact with them and that you cannot resolve them as part of the same action. Indirect damage differs in the same ways and, in addition, the opponent deals damage to their characters, distributed as they wish.

**Q. Can I use the special ability on an exhausted card?**
Yes, provided the ability does not require you to exhaust the card to use it.

**Q. Can I have more than five cards in my hand?**
Yes. You can have more cards in your hand than your hand size. You would not draw more cards during the upkeep phase, though, if you have more cards in hand than your hand size after discarding.

**Q. Can I discard a Gray upgrade to decrease the cost of a non-Gray upgrade, and vice versa?**
Yes. You can discard an upgrade of any color to decrease the cost of another upgrade, regardless of its color.

**Q. Do I have to resolve all of my dice of the same symbol at once?**
No. You resolve only as many dice of one symbol as you wish while taking the Resolve Dice action.

**Q. What happens if I play a support card that has "Action" listed on it?**
You now have a new action that you can take. You do not resolve the action when you play the card.

**Q. What happens if I want to play a copy of a unique card but my opponent has one in play?**
Each player can have one copy of a unique card in play (you can still have two in your deck). So you can play your copy, but once you have a copy in play, you cannot play another one.

**Q. If I am using multiples of the same character, do I have to remember which dice came from which character?**
Yes. Position each character's dice so it is obvious which character they came from. If a character is defeated, its specific dice must be removed from the pool, if they are there.

**Q. What happens if I replace an upgrade with another upgrade that costs fewer resources?**
You play the new upgrade for free.

**Q. Is a character die any die that the character has?**
No. A character die is a die that corresponds to the character card. An upgrade is never a character die and is always called out by card text as an upgrade die.

**Q. What is the difference between a turn and a round?**
A turn is one player's action. A round consists of an action phase and an upkeep phase.

**Q. What happens when an after ability triggers off of a before ability, and there is another after ability in the queue?**
After abilities enter a queue and wait their turn to resolve. If an after ability triggers during the resolution of any other ability, it resolves after that ability and any other after ability already in the queue.

**Q. After I claim the battlefield, can I still take an extra action granted by an Ambush upgrade or similar effect?**
No. You must pass all future actions once you claim the battlefield, including any additional actions granted by Ambush, Rey-style abilities, etc.

**Q. Can I exhaust or play a card that has an action that I cannot fully resolve, in order to stall the round?**
Yes. Playing a card from your hand, even if it has no effect, removes a card from your hand and does not count as doing nothing. The same applies to exhausting a card or rerolling a die to its same side.

**Q. What happens to a character's dice that are still in the pool when they are readied again? Are they removed? Are they rerolled when the character activates again?**
If a character is readied, none of their dice are removed. If they activate again, any dice that have been returned to the character are rolled in like normal, but nothing happens to dice already in the pool.

**Q. For game effects, is zero considered an odd or even number?**
Zero is an even number.

**Q. Can a power action be used to no effect? If so, does it count as a pass?**
Yes — a power action can be used to no effect. **No** — it does not count as a pass, since using a power action is considered to have changed the game state (that power action can no longer be used for the round).

> *[The remainder of the source dump was truncated mid-FAQ. Continue from this point in the next paste.]*

---

## Index

*Will be populated once Errata, Card Clarifications, and FAQ are finalized.*
