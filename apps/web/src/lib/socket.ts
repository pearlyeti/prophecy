import type { ClientToServerEvents, ServerToClientEvents } from '@prophecy/protocol';
import { io, type Socket } from 'socket.io-client';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let cached: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (cached) return cached;
  const url = import.meta.env.VITE_GAME_SERVER_URL ?? 'http://localhost:3001';
  // Default transports (polling → upgrade to websocket). Forcing
  // 'websocket' only made iOS Safari hang at CONNECTING when WS
  // couldn't open — polling fallback restores connectivity.
  cached = io(url, {
    autoConnect: true,
    timeout: 8000,
  });

  // Verbose client-side diagnostics. Remove or gate behind a flag once
  // multiplayer is settled.
  cached.on('connect', () => console.log('[socket] connect', cached?.id));
  cached.on('disconnect', (reason) => console.log('[socket] disconnect', reason));
  cached.on('connect_error', (err) => console.error('[socket] connect_error', err.message, err));
  cached.io.on('error', (err) => console.error('[socket.io engine] error', err));
  cached.io.on('reconnect_attempt', (n) => console.log('[socket] reconnect_attempt', n));
  cached.io.on('reconnect_failed', () => console.error('[socket] reconnect_failed'));

  // Expose for ad-hoc Console debugging.
  (window as unknown as { __sock?: typeof cached }).__sock = cached;

  return cached;
}
