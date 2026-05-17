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
      /**
       * Multi-target shape: each entry groups dice resolved against one target.
       * Takes precedence over the legacy flat fields when present.
       *
       * Melee/ranged/shield: each group's dice value is applied to that group's
       * targetCharacterId. For Shield/Disrupt/Discard targeting a support, use
       * targetSupportId instead. Resource/disrupt/discard without a support target:
       * single entry, no targetCharacterId. Focus: single entry, no targetCharacterId;
       * use focusFlips for face choices.
       */
      targets?: readonly {
        readonly dieInstanceIds: readonly string[];
        readonly targetCharacterId?: string;
        /** Support instance id — when set, this group applies to a support (stability reduction or shield). */
        readonly targetSupportId?: string;
      }[];
      /** @deprecated Use targets instead. Kept for backward compatibility. */
      dieInstanceIds?: readonly string[];
      /** @deprecated Use targets[n].targetCharacterId instead. Kept for backward compatibility. */
      targetCharacterId?: string;
      /**
       * Required when resolving focus dice. Ordered list of face-flip operations.
       * Each focuser die is in dieInstanceIds / targets[0].dieInstanceIds (removed
       * from pool on resolve). Target dice are not in the focuser list — they stay
       * in pool with their faces updated.
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
  | {
      type: 'use-card-action';
      playerId: string;
      cardId: string;
      abilityIndex: number;
      /** Pre-resolved character instance IDs consumed by targeting effects in order. */
      targetCharacterIds?: readonly string[];
    }
  | {
      /**
       * Resolve the pending Guardian intercept decision. `dieInstanceId` is
       * the opponent die to remove (dealing its value as damage to the
       * Guardian character), or null to skip and proceed with activation.
       */
      type: 'guardian.intercept';
      playerId: string;
      dieInstanceId: string | null;
    }
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
    }
  | {
      /**
       * Resolve a pending searchDeck effect. The player chooses which
       * revealed cards to keep (per each SearchChoice) and the engine
       * applies dispositions to all revealed cards then resumes the
       * ability sequence.
       */
      type: 'resolve-search';
      playerId: string;
      selections: readonly { readonly choiceIndex: number; readonly cardIds: readonly string[] }[];
    }
  | {
      /**
       * Resolve a pending choose effect. `picks` is an ordered list of
       * branch indices (0-based). The engine runs the chosen branches in
       * the given order, then resumes any remainingSteps.
       */
      type: 'resolve-choice';
      playerId: string;
      picks: readonly number[];
    };
