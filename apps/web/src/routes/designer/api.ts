// REST helpers for the /designer endpoints on the game-server.

import type { AttributeCatalog, Card, Deck } from '@prophecy/protocol';

function serverUrl(): string {
  return (
    import.meta.env.VITE_GAME_SERVER_URL ??
    `${window.location.protocol}//${window.location.hostname}:3001`
  );
}

export async function fetchCards(): Promise<Card[]> {
  const r = await fetch(`${serverUrl()}/designer/cards`);
  if (!r.ok) throw new Error(`GET /designer/cards failed: ${r.status}`);
  const body = (await r.json()) as { cards: Card[] };
  return body.cards;
}

export async function saveCards(cards: readonly Card[]): Promise<void> {
  const r = await fetch(`${serverUrl()}/designer/cards`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({ error: r.statusText }))) as {
      error?: string;
    };
    throw new Error(body.error ?? `PUT /designer/cards failed: ${r.status}`);
  }
}

export async function fetchDecks(): Promise<Deck[]> {
  const r = await fetch(`${serverUrl()}/designer/decks`);
  if (!r.ok) throw new Error(`GET /designer/decks failed: ${r.status}`);
  const body = (await r.json()) as { decks: Deck[] };
  return body.decks;
}

export async function uploadCardArt(cardId: string, file: File): Promise<string> {
  const r = await fetch(`${serverUrl()}/designer/card-art/${encodeURIComponent(cardId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({ error: r.statusText }))) as { error?: string };
    throw new Error(body.error ?? `Upload failed: ${r.status}`);
  }
  const body = (await r.json()) as { artUrl: string };
  return body.artUrl;
}

export async function fetchAttributes(): Promise<AttributeCatalog> {
  const r = await fetch(`${serverUrl()}/designer/attributes`);
  if (!r.ok) throw new Error(`GET /designer/attributes failed: ${r.status}`);
  return (await r.json()) as AttributeCatalog;
}

export async function saveAttributes(attrs: AttributeCatalog): Promise<void> {
  const r = await fetch(`${serverUrl()}/designer/attributes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attrs),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({ error: r.statusText }))) as { error?: string };
    throw new Error(body.error ?? `PUT /designer/attributes failed: ${r.status}`);
  }
}

export async function saveDecks(decks: readonly Deck[]): Promise<void> {
  const r = await fetch(`${serverUrl()}/designer/decks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decks }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({ error: r.statusText }))) as {
      error?: string;
    };
    throw new Error(body.error ?? `PUT /designer/decks failed: ${r.status}`);
  }
}
