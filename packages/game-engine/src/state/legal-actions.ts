// Pure inspector over GameState — answers "what can this player do
// right now?" The result is consumed by both UI (to render which
// action buttons are active) and tests (to assert legality without
// trying every action).
//
// This module never mutates state. It encodes the same guards each
// action handler enforces, hoisted into a single struct.

import type { ActionAbility, PowerActionAbility } from '../abilities/types.js';
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

const RESOLVABLE_SYMBOLS_V1: readonly DieSymbol[] = [
  'melee',
  'ranged',
  'shield',
  'resource',
  'disrupt',
  'discard',
  'focus',
];

export function getLegalActions(state: GameState, playerId: string): LegalActions {
  // No legal actions after the game has ended.
  if (state.winnerId !== null || state.phase === 'ended') {
    return EMPTY;
  }

  const player = state.players[playerId];
  if (!player) return EMPTY;

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
        if (ability.kind === 'action' && costsCanBeMet(ability, player, charId)) {
          actionable.push(charId);
          break;
        }
      }
      const char = player.characters[charId];
      if (char && !char.powerActionUsedThisRound) {
        for (const ability of abilities) {
          if (ability.kind === 'powerAction' && costsCanBeMet(ability, player, charId)) {
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
};
