// Action intents that a client can send to the server. Validation and
// resolution happen entirely inside the engine.

export type Action =
  | { type: 'setup.choose-first-player'; playerId: string; firstPlayerId: string }
  | { type: 'setup.place-shield'; playerId: string; characterId: string }
  | { type: 'pass'; playerId: string }
  | { type: 'activate'; playerId: string; cardId: string }
  | {
      type: 'resolve-dice';
      playerId: string;
      dieInstanceIds: readonly string[];
      /** Required when resolving damage / shields; ignored for resource / disrupt. */
      targetCharacterId?: string;
    }
  | { type: 'reroll-dice'; playerId: string; discardCardId: string; dieInstanceIds: readonly string[] }
  | {
      type: 'play-card';
      playerId: string;
      cardId: string;
      /** Pre-resolved character instance IDs consumed by targeting effects in order. */
      characterTargets?: readonly string[];
    }
  | { type: 'use-card-action'; playerId: string; cardId: string }
  | { type: 'claim-battlefield'; playerId: string }
  | { type: 'concede'; playerId: string };
