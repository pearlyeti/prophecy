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
      /**
       * Required when resolving focus dice. Ordered list of face-flip operations.
       * Each focuser die is in dieInstanceIds (removed from pool on resolve).
       * Target dice are not in dieInstanceIds — they stay in pool with updated faces.
       */
      focusFlips?: readonly { readonly targetDieInstanceId: string; readonly faceIndex: number }[];
    }
  | { type: 'reroll-dice'; playerId: string; discardCardId: string; dieInstanceIds: readonly string[] }
  | {
      type: 'play-card';
      playerId: string;
      cardId: string;
      /** Pre-resolved character instance IDs consumed by targeting effects in order. */
      characterTargets?: readonly string[];
    }
  | { type: 'use-card-action'; playerId: string; cardId: string; abilityIndex: number }
  | { type: 'claim-battlefield'; playerId: string }
  | { type: 'concede'; playerId: string }
  | {
      /**
       * Submit an ordering for pending simultaneous triggers.
       * phase 'orderPlayers': `order` is a list of player IDs (BC ordering groups).
       * phase 'orderEntries': `order` is a list of queue entry IDs (player ordering their own).
       */
      type: 'order-triggers';
      playerId: string;
      order: readonly string[];
    };
