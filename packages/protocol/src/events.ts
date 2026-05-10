// Event types broadcast by the game-server over WebSocket.
// Clients subscribe to these and feed them into the animation pipeline.

export type GameServerEvent =
  | { type: 'room.joined'; roomId: string; playerId: string }
  | { type: 'room.left'; roomId: string; playerId: string }
  | { type: 'state.snapshot'; payload: unknown }
  | { type: 'engine.event'; payload: unknown }
  | { type: 'error'; message: string };

export type ClientIntent =
  | { type: 'room.join'; roomId: string }
  | { type: 'room.leave'; roomId: string }
  | { type: 'action'; payload: unknown };
