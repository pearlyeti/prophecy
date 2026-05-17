// REST helpers for the /designer endpoints on the game-server.

import type { AttributeCatalog, Card, Deck } from '@prophecy/protocol';

// ── Schema migration shim ─────────────────────────────────────────────
// ENGINE-ST1 replaced `effects: Effect[]` with `steps: EffectStep[]` on
// every ability kind. If the game-server is still running pre-migration
// code it returns abilities with `effects` instead of `steps`. Normalize
// on the way in so the designer never sees `ability.steps === undefined`.
type RawAbility = { kind: string; effects?: unknown[]; steps?: unknown[]; [k: string]: unknown };

function normalizeCard(card: unknown): Card {
  const c = card as Record<string, unknown>;
  const abilities = (Array.isArray(c.abilities) ? c.abilities : []).map((ab: RawAbility) => {
    if (!ab.steps && Array.isArray(ab.effects)) {
      const { effects, ...rest } = ab;
      return { ...rest, steps: effects.map((e) => ({ effects: [e] })) };
    }
    return ab;
  });
  return { ...c, abilities } as Card;
}

function serverUrl(): string {
  return (
    import.meta.env.VITE_GAME_SERVER_URL ??
    `${window.location.protocol}//${window.location.hostname}:3001`
  );
}

function authHeaders(): Record<string, string> {
  const s = import.meta.env.VITE_DESIGNER_SECRET;
  return s ? { Authorization: `Bearer ${s}` } : {};
}

export async function fetchCards(): Promise<Card[]> {
  const r = await fetch(`${serverUrl()}/designer/cards`);
  if (!r.ok) throw new Error(`GET /designer/cards failed: ${r.status}`);
  const body = (await r.json()) as { cards: unknown[] };
  return body.cards.map(normalizeCard);
}

export async function saveCards(cards: readonly Card[]): Promise<void> {
  const r = await fetch(`${serverUrl()}/designer/cards`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
    headers: { 'Content-Type': file.type, ...authHeaders() },
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
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ decks }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({ error: r.statusText }))) as {
      error?: string;
    };
    throw new Error(body.error ?? `PUT /designer/decks failed: ${r.status}`);
  }
}

export interface CommittedCatalog {
  enabled: boolean;
  cards: Card[];
  decks: Deck[];
  attributes: AttributeCatalog;
}

export async function fetchCommitted(): Promise<CommittedCatalog> {
  const r = await fetch(`${serverUrl()}/designer/committed`);
  if (!r.ok) throw new Error(`GET /designer/committed failed: ${r.status}`);
  const body = (await r.json()) as Omit<CommittedCatalog, 'cards'> & { cards: unknown[] };
  return { ...body, cards: body.cards.map(normalizeCard) };
}

// ── GitHub sync ───────────────────────────────────────────────────────

export interface ChangeSet {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface PendingChanges {
  enabled: boolean;
  cards: ChangeSet;
  decks: ChangeSet;
  attributes: { modified: boolean };
}

export async function fetchPending(): Promise<PendingChanges> {
  const r = await fetch(`${serverUrl()}/designer/pending`);
  if (!r.ok) throw new Error(`GET /designer/pending failed: ${r.status}`);
  return (await r.json()) as PendingChanges;
}

export interface CommitSelection {
  cardIds?: string[];
  deckIds?: string[];
  includeAttributes?: boolean;
}

export async function commitChanges(
  message: string,
  selection?: CommitSelection,
): Promise<{ sha: string; url: string }> {
  const r = await fetch(`${serverUrl()}/designer/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(selection ? { message, selection } : { message }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({ error: r.statusText }))) as { error?: string };
    throw new Error(body.error ?? `POST /designer/commit failed: ${r.status}`);
  }
  return (await r.json()) as { sha: string; url: string };
}

// ── History / diff ────────────────────────────────────────────────────

export interface CommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
}

export interface CommitReport {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  cards: Array<{ id: string; status: 'added' | 'modified' | 'removed' }>;
  decksChanged: boolean;
  attributesChanged: boolean;
}

export async function fetchCardHistory(cardId: string): Promise<CommitSummary[]> {
  const r = await fetch(`${serverUrl()}/designer/cards/${encodeURIComponent(cardId)}/history`);
  if (!r.ok) throw new Error(`GET /designer/cards/${cardId}/history failed: ${r.status}`);
  return (await r.json()) as CommitSummary[];
}

export async function fetchCardAtSha(cardId: string, sha: string): Promise<Card> {
  const r = await fetch(`${serverUrl()}/designer/cards/${encodeURIComponent(cardId)}/at/${encodeURIComponent(sha)}`);
  if (!r.ok) throw new Error(`GET /designer/cards/${cardId}/at/${sha} failed: ${r.status}`);
  return normalizeCard(await r.json());
}

export async function fetchCommitReport(sha: string): Promise<CommitReport> {
  const r = await fetch(`${serverUrl()}/designer/commits/${encodeURIComponent(sha)}`);
  if (!r.ok) throw new Error(`GET /designer/commits/${sha} failed: ${r.status}`);
  return (await r.json()) as CommitReport;
}
