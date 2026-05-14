import type { GameState, PlayerState } from './types.js';

/**
 * Draw up to `n` cards from the top of the player's deck into their
 * hand. If the deck has fewer than `n` cards, draws whatever is left.
 * Returns the new state and the number of cards actually drawn.
 *
 * Pure: does not consult RNG (the deck is already shuffled at game
 * start), does not emit events. Call sites that want events emit them
 * themselves.
 */
export function drawCards(
  state: GameState,
  playerId: string,
  n: number,
): { state: GameState; drawn: number } {
  if (n <= 0) return { state, drawn: 0 };

  const player = state.players[playerId];
  if (!player) throw new Error(`player ${playerId} not in state.players`);

  const take = Math.min(n, player.deck.length);
  if (take === 0) return { state, drawn: 0 };

  const drawn = player.deck.slice(0, take);
  const next: PlayerState = {
    ...player,
    hand: [...player.hand, ...drawn],
    deck: player.deck.slice(take),
  };

  return {
    state: {
      ...state,
      players: { ...state.players, [playerId]: next },
    },
    drawn: take,
  };
}
