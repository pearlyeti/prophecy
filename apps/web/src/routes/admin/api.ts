// REST helpers for the /admin endpoints on the game-server. Resolves
// the server URL the same way the socket client does so dev across
// localhost and LAN IPs Just Works without re-baking the bundle.

import type { Card, Deck } from '@prophecy/protocol';

function serverUrl(): string {
  return (
    import.meta.env.VITE_GAME_SERVER_URL ??
    `${window.location.protocol}//${window.location.hostname}:3001`
  );
}

export async function fetchCards(): Promise<Card[]> {
  const r = await fetch(`${serverUrl()}/admin/cards`);
  if (!r.ok) throw new Error(`GET /admin/cards failed: ${r.status}`);
  const body = (await r.json()) as { cards: Card[] };
  return body.cards;
}

export async function saveCards(cards: readonly Card[]): Promise<void> {
  const r = await fetch(`${serverUrl()}/admin/cards`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({ error: r.statusText }))) as {
      error?: string;
    };
    throw new Error(body.error ?? `PUT /admin/cards failed: ${r.status}`);
  }
}

export async function fetchDecks(): Promise<Deck[]> {
  const r = await fetch(`${serverUrl()}/admin/decks`);
  if (!r.ok) throw new Error(`GET /admin/decks failed: ${r.status}`);
  const body = (await r.json()) as { decks: Deck[] };
  return body.decks;
}

export async function saveDecks(decks: readonly Deck[]): Promise<void> {
  const r = await fetch(`${serverUrl()}/admin/decks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decks }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({ error: r.statusText }))) as {
      error?: string;
    };
    throw new Error(body.error ?? `PUT /admin/decks failed: ${r.status}`);
  }
}
