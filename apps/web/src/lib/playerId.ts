// Stable per-browser identity. Real auth comes with better-auth; until
// then this lets two testers play without creating accounts.

const KEY = 'prophecy.playerId';

export function getOrCreatePlayerId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    // Some private-mode browsers throw on storage access — fall through.
  }
  if (!id) {
    id = generateUuid();
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Storage may be unavailable; the id is still valid for this session.
    }
  }
  return id;
}

// crypto.randomUUID requires a secure context (HTTPS or localhost).
// iOS Safari over plain HTTP on a LAN IP doesn't qualify, so we fall
// back to a getRandomValues-based UUID v4 builder.
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Some browsers expose the function but throw outside secure contexts.
    }
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 v4: set version + variant bits.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
