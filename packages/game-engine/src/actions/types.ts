// Action intents that a client can send to the server. Validation and
// resolution happen entirely inside the engine.

export type Action =
  | { type: 'pass'; playerId: string }
  | { type: 'activate'; playerId: string; cardId: string }
  | { type: 'resolve-dice'; playerId: string; dieInstanceIds: readonly string[] }
  | { type: 'reroll-dice'; playerId: string; discardCardId: string; dieInstanceIds: readonly string[] }
  | { type: 'play-card'; playerId: string; cardId: string; targetId?: string }
  | { type: 'use-card-action'; playerId: string; cardId: string }
  | { type: 'claim-battlefield'; playerId: string }
  | { type: 'concede'; playerId: string };
