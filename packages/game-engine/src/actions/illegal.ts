// Thrown by action handlers when an action cannot be applied (wrong
// turn, wrong phase, missing target, etc.). The game-server catches
// these and converts them into client-facing error events; the engine
// itself never partially mutates state.

export class IllegalActionError extends Error {
  override readonly name = 'IllegalActionError';
  constructor(readonly reason: string) {
    super(reason);
  }
}
