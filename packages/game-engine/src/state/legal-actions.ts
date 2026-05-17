// Pure inspector over GameState — answers "what can this player do
// right now?" The result is consumed by both UI (to render which
// action buttons are active) and tests (to assert legality without
// trying every action).
//
// This module never mutates state. It encodes the same guards each
// action handler enforces, hoisted into a single struct.

import type { ActionAbility, PlayCondition, PowerActionAbility } from '../abilities/types.js';
import type { DieSymbol, GameState, PlayerState } from './types.js';

export interface LegalActions {
  /**
   * The player must submit a trigger ordering before normal actions resume.
   * When true, only 'order-triggers' is legal for this player.
   */
  readonly canOrderTriggers: boolean;
  /** The player can press "Pass" (active player's turn in action phase). */
  readonly canPass: boolean;
  /** The player can press "Claim battlefield". */
  readonly canClaim: boolean;
  /**
   * The player can press "Concede". Allowed from any phase except
   * ended; doesn't require being the active player.
   */
  readonly canConcede: boolean;
  /**
   * The player can press "Reroll dice" — has at least one card in
   * hand to discard and at least one die in the pool to reroll.
   */
  readonly canReroll: boolean;
  /** Character instance ids that can be activated. */
  readonly activatableCharacterIds: readonly string[];
  /**
   * Support instance ids that can be activated (non-exhausted, has at
   * least one die). Supports without a die cannot be activated per rules.
   */
  readonly activatableSupportIds: readonly string[];
  /**
   * Die symbols currently resolvable from the player's pool. A symbol
   * shows up here only if there's at least one non-modifier face of
   * that symbol in the pool (rules: modifiers can't resolve alone).
   * Blank is never resolvable. Special / focus / indirect not yet
   * implemented and therefore excluded.
   */
  readonly resolvableSymbols: readonly DieSymbol[];
  /**
   * The player can press "Play card" — placeholder until per-card
   * hand tracking lands. Currently just "has at least one card in
   * hand AND is the active player in the action phase."
   */
  readonly canPlayCard: boolean;
  /**
   * Character instance ids that have at least one usable Action ability
   * (costs can be met, not counting power-action gate).
   */
  readonly actionableCardIds: readonly string[];
  /**
   * Character instance ids that have at least one usable Power Action ability
   * (costs can be met and not yet used this round).
   */
  readonly powerActionableCardIds: readonly string[];
  /** Setup-phase availability. */
  readonly canChooseFirstPlayer: boolean;
  readonly canPlaceShield: boolean;
  /**
   * Non-empty while a Guardian intercept is pending for this player.
   * Contains the instance IDs of opponent dice showing melee/ranged/indirect
   * that the player may remove. Empty when no intercept is pending.
   * While non-empty, all other actions are blocked.
   */
  readonly guardianInterceptableDieIds: readonly string[];
  /**
   * True when a Guardian intercept is pending for this player, allowing
   * them to send guardian.intercept with dieInstanceId = null to skip.
   */
  readonly canSkipGuardian: boolean;
  /**
   * True when a searchDeck effect is waiting for this player to resolve it.
   * While true, only resolve-search (+ concede) is legal.
   */
  readonly canResolveSearch: boolean;
}

/** Returns true if all costs of an action/powerAction ability can currently be paid. */
function costsCanBeMet(
  ability: ActionAbility | PowerActionAbility,
  player: PlayerState,
  charId: string,
): boolean {
  if (!ability.costs) return true;
  for (const cost of ability.costs) {
    if (cost.kind === 'exhaust' && player.characters[charId]?.exhausted) return false;
    if (cost.kind === 'spendResources' && player.resources < cost.amount) return false;
  }
  return true;
}

/**
 * Returns true if the given play condition is currently satisfied for `playerId`.
 *
 * Per the rules: "spot" checks the player's own characters/cards in play. A player
 * cannot spot an opponent's characters unless the card explicitly says so.
 */
export function playConditionMet(
  state: GameState,
  playerId: string,
  condition: PlayCondition,
): boolean {
  const player = state.players[playerId];
  if (!player) return false;

  switch (condition.kind) {
    case 'controlsBattlefield':
      return state.battlefieldControllerId === playerId;

    case 'spotCharacter': {
      const needed = condition.count ?? 1;
      let found = 0;
      for (const charId of player.characterOrder) {
        const char = player.characters[charId];
        if (!char) continue;
        if (condition.color !== undefined) {
          const meta = state.cardMeta[charId];
          if (!meta || meta.color !== condition.color) continue;
        }
        if (condition.unique !== undefined) {
          const meta = state.cardMeta[charId];
          if (!meta || meta.isUnique !== condition.unique) continue;
        }
        found++;
        if (found >= needed) return true;
      }
      return false;
    }

    case 'spotCard': {
      for (const charId of player.characterOrder) {
        const char = player.characters[charId];
        if (char && char.cardId === condition.cardId) return true;
      }
      for (const supportId of player.supportOrder) {
        const support = player.supports[supportId];
        if (support && support.cardId === condition.cardId) return true;
      }
      return false;
    }

    case 'moreReadyCharacters': {
      const myReady = player.characterOrder.filter(
        (id) => !player.characters[id]?.exhausted,
      ).length;
      const oppId = state.playerOrder.find((id) => id !== playerId);
      const opp = oppId ? state.players[oppId] : undefined;
      const oppReady = opp
        ? opp.characterOrder.filter((id) => !opp.characters[id]?.exhausted).length
        : 0;
      return myReady > oppReady;
    }

    case 'firstActionOfRound':
      return (state.actionsThisRound[playerId] ?? 0) === 0;

    case 'opponentHasNoCards': {
      const oppId = state.playerOrder.find((id) => id !== playerId);
      const opp = oppId ? state.players[oppId] : undefined;
      return !opp || opp.hand.length === 0;
    }

    case 'haveNCharactersInPlay':
      return player.characterOrder.length >= condition.count;

    case 'opponentHasNCharacters': {
      const oppId = state.playerOrder.find((id) => id !== playerId);
      const opp = oppId ? state.players[oppId] : undefined;
      return (opp?.characterOrder.length ?? 0) >= condition.count;
    }
  }
}

const RESOLVABLE_SYMBOLS_V1: readonly DieSymbol[] = [
  'melee',
  'ranged',
  'shield',
  'resource',
  'disrupt',
  'discard',
  'focus',
  'special',
];

const GUARDIAN_DAMAGE_SYMBOLS = new Set(['melee', 'ranged', 'indirect']);

export function getLegalActions(state: GameState, playerId: string): LegalActions {
  // No legal actions after the game has ended.
  if (state.winnerId !== null || state.phase === 'ended') {
    return EMPTY;
  }

  const player = state.players[playerId];
  if (!player) return EMPTY;

  // ---- Pending search ----
  // While a searchDeck effect is waiting, only resolve-search is legal
  // for the waiting player. The opponent may only concede.
  if (state.pendingSearch) {
    const isWaiting = state.pendingSearch.waitingForPlayerId === playerId;
    return { ...EMPTY, canConcede: true, canResolveSearch: isWaiting };
  }

  // ---- Pending Guardian intercept ----
  // While a Guardian intercept is waiting, only 'guardian.intercept' is
  // legal for the activating player. All other actions are blocked.
  if (state.pendingGuardian) {
    if (state.pendingGuardian.activatingPlayerId === playerId) {
      const oppId = state.playerOrder.find((id) => id !== playerId);
      const oppPool = oppId ? (state.players[oppId]?.diceInPool ?? []) : [];
      const interceptableIds = oppPool
        .filter((d) => GUARDIAN_DAMAGE_SYMBOLS.has(d.face.symbol))
        .map((d) => d.instanceId);
      return {
        ...EMPTY,
        canConcede: true,
        guardianInterceptableDieIds: interceptableIds,
        canSkipGuardian: true,
      };
    }
    // Opponent waits during the intercept decision.
    return { ...EMPTY, canConcede: true };
  }

  // ---- Pending trigger ordering ----
  // While simultaneous triggers are waiting for ordering, only the
  // designated player can act, and only via 'order-triggers'.
  if (state.pendingTriggers) {
    const isWaiting = state.pendingTriggers.waitingForPlayerId === playerId;
    return { ...EMPTY, canOrderTriggers: isWaiting, canConcede: true };
  }

  // ---- Setup phase ----
  if (state.phase === 'setup' && state.setup) {
    const isWinner = playerId === state.setup.rollOffWinnerId;
    const isRecipient = playerId === state.setup.shieldRecipientId;
    return {
      ...EMPTY,
      canConcede: true,
      canChooseFirstPlayer: isWinner && state.setup.step === 'choose-first-player',
      canPlaceShield:
        isRecipient && state.setup.step === 'place-shields' && state.setup.shieldsRemaining > 0,
      activatableSupportIds: [],
    };
  }

  // ---- Action phase ----
  if (state.phase !== 'action') {
    return { ...EMPTY, canConcede: true };
  }

  const isMyTurn = state.activePlayerId === playerId;
  const claimedThisRound = state.playerWhoClaimedThisRound !== null;

  // Activatable: my own characters that are ready, only when it's my turn.
  const activatable = isMyTurn
    ? player.characterOrder.filter((id) => {
        const c = player.characters[id];
        return c !== undefined && !c.exhausted;
      })
    : [];

  // Action/powerAction eligible characters.
  const actionable: string[] = [];
  const powerActionable: string[] = [];
  if (isMyTurn) {
    for (const charId of player.characterOrder) {
      const abilities = state.cardAbilities[charId] ?? [];
      for (const ability of abilities) {
        if (
          ability.kind === 'action' &&
          costsCanBeMet(ability, player, charId) &&
          (!ability.playCondition || playConditionMet(state, playerId, ability.playCondition))
        ) {
          actionable.push(charId);
          break;
        }
      }
      const char = player.characters[charId];
      if (char && !char.powerActionUsedThisRound) {
        for (const ability of abilities) {
          if (
            ability.kind === 'powerAction' &&
            costsCanBeMet(ability, player, charId) &&
            (!ability.playCondition || playConditionMet(state, playerId, ability.playCondition))
          ) {
            powerActionable.push(charId);
            break;
          }
        }
      }
    }
  }

  // Activatable supports: non-exhausted, has at least one die.
  const activatableSupports = isMyTurn
    ? player.supportOrder.filter((id) => {
        const s = player.supports[id];
        return s !== undefined && !s.exhausted && s.dice.length > 0;
      })
    : [];

  // Resolvable symbols: distinct symbols on non-modifier faces in my pool.
  // Excludes blank (cannot resolve) and unimplemented symbols.
  const resolvable = new Set<DieSymbol>();
  for (const d of player.diceInPool) {
    if (d.face.symbol === 'blank') continue;
    if (d.face.modifier) continue;
    if (!RESOLVABLE_SYMBOLS_V1.includes(d.face.symbol)) continue;
    resolvable.add(d.face.symbol);
  }

  return {
    canOrderTriggers: false,
    canPass: isMyTurn,
    canClaim: isMyTurn && !claimedThisRound,
    canConcede: true,
    canReroll: isMyTurn && player.hand.length > 0 && player.diceInPool.length > 0,
    activatableCharacterIds: activatable,
    activatableSupportIds: activatableSupports,
    resolvableSymbols: [...resolvable],
    canPlayCard:
      isMyTurn &&
      player.hand.some((cid) => (state.cardCosts[cid] ?? 0) <= player.resources),
    actionableCardIds: actionable,
    powerActionableCardIds: powerActionable,
    canChooseFirstPlayer: false,
    canPlaceShield: false,
    guardianInterceptableDieIds: [],
    canSkipGuardian: false,
    canResolveSearch: false,
  };
}

const EMPTY: LegalActions = {
  canOrderTriggers: false,
  canPass: false,
  canClaim: false,
  canConcede: false,
  canReroll: false,
  activatableCharacterIds: [],
  activatableSupportIds: [],
  resolvableSymbols: [],
  canPlayCard: false,
  actionableCardIds: [],
  powerActionableCardIds: [],
  canChooseFirstPlayer: false,
  canPlaceShield: false,
  guardianInterceptableDieIds: [],
  canSkipGuardian: false,
  canResolveSearch: false,
};
