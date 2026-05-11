// Persists the active room id + invite code in localStorage so a
// browser reload or brief network blip can rejoin the same lobby
// instead of dumping the player back to the splash. Cleared on
// "back to splash" / game reset.

const KEY = 'prophecy.activeLobby';

export interface CachedLobby {
  readonly roomId: string;
  readonly code: string;
}

export function loadCachedLobby(): CachedLobby | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedLobby>;
    if (typeof parsed.roomId === 'string' && typeof parsed.code === 'string') {
      return { roomId: parsed.roomId, code: parsed.code };
    }
  } catch {
    // ignore — bad JSON or storage unavailable
  }
  return null;
}

export function saveCachedLobby(lobby: CachedLobby): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lobby));
  } catch {
    // storage unavailable — fine, we just lose the rejoin convenience
  }
}

export function clearCachedLobby(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
