// Default (client-safe) entry. Type-only re-exports for the tRPC bits;
// the runtime router lives at '@prophecy/protocol/server'.
export type { AppRouter } from './router.js';
export type { Context } from './trpc.js';
export * from './catalog.js';
export * from './events.js';
export * from './schemas.js';
export type {
  Action,
  EngineEvent,
  GameState,
  ActionCost,
  CardDisposition,
  Effect,
  ImmediateAbility,
  PlayCondition,
  TargetSpec,
  TriggerEvent,
} from '@prophecy/game-engine';
