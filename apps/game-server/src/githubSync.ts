// GitHub sync module — optional integration that lets the designer commit
// card/deck/attribute changes directly to the repo via the GitHub REST API.
// Activate by setting GITHUB_TOKEN, GITHUB_REPO, and GITHUB_BRANCH.
// When those vars are absent the module is a no-op; the designer still works
// (saves go to disk/S3 as usual); pending/commit routes return 501.

import {
  attributeCatalogSchema,
  cardCatalogSchema,
  deckCatalogSchema,
  type AttributeCatalog,
  type Card,
  type Deck,
} from '@prophecy/protocol';

import { getAttributes } from './attributeCorpus.js';
import { getCards, getDecks } from './corpus.js';

// ── Config ────────────────────────────────────────────────────────────

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

function getConfig(): GitHubConfig | null {
  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) return null;
  const slash = GITHUB_REPO.indexOf('/');
  if (slash < 1) return null;
  return {
    token: GITHUB_TOKEN,
    owner: GITHUB_REPO.slice(0, slash),
    repo: GITHUB_REPO.slice(slash + 1),
    branch: GITHUB_BRANCH ?? 'main',
  };
}

export function isGitHubSyncEnabled(): boolean {
  return getConfig() !== null;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ChangeSet {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface PendingChanges {
  cards: ChangeSet;
  decks: ChangeSet;
  attributes: { modified: boolean };
}

export class GitHubConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubConflictError';
  }
}

// ── Committed snapshot cache ──────────────────────────────────────────

interface CommittedSnapshot {
  cards: Card[];
  decks: Deck[];
  attributes: AttributeCatalog;
  headSha: string;
}

let committedSnapshot: CommittedSnapshot | null = null;

// ── API helpers ───────────────────────────────────────────────────────

async function ghFetch(path: string, options?: RequestInit): Promise<Response> {
  const cfg = getConfig()!;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (options?.body) headers['Content-Type'] = 'application/json';
  return fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
  });
}

function decodeBase64Content(content: string): string {
  return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
}

// ── Fetching committed state ──────────────────────────────────────────

async function fetchHeadSha(): Promise<string> {
  const cfg = getConfig()!;
  const res = await ghFetch(`/git/ref/heads/${cfg.branch}`);
  if (!res.ok) throw new Error(`git/ref fetch failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { object: { sha: string } };
  return data.object.sha;
}

async function fetchFileContent(path: string): Promise<string> {
  const cfg = getConfig()!;
  const res = await ghFetch(`/contents/${path}?ref=${cfg.branch}`);
  if (!res.ok) throw new Error(`contents fetch failed for ${path}: ${res.status}`);
  const data = (await res.json()) as { content: string; encoding: string };
  return data.encoding === 'base64' ? decodeBase64Content(data.content) : data.content;
}

async function fetchCardsDirListing(): Promise<Array<{ name: string; sha: string }>> {
  const cfg = getConfig()!;
  const res = await ghFetch(`/contents/packages/db/seed/cards?ref=${cfg.branch}`);
  if (res.status === 404) return []; // empty / doesn't exist yet
  if (!res.ok) throw new Error(`cards dir listing failed: ${res.status} ${await res.text()}`);
  const files = (await res.json()) as Array<{ name: string; sha: string; type: string }>;
  return files.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
}

async function fetchBlobContent(sha: string): Promise<string> {
  const res = await ghFetch(`/git/blobs/${sha}`);
  if (!res.ok) throw new Error(`blob fetch failed (${sha}): ${res.status}`);
  const data = (await res.json()) as { content: string; encoding: string };
  return data.encoding === 'base64' ? decodeBase64Content(data.content) : data.content;
}

async function loadSnapshot(): Promise<CommittedSnapshot> {
  const [headSha, cardFiles, decksRaw, attrsRaw] = await Promise.all([
    fetchHeadSha(),
    fetchCardsDirListing(),
    fetchFileContent('packages/db/seed/decks.json'),
    fetchFileContent('packages/db/seed/attributes.json'),
  ]);

  // Fetch all card blobs in parallel
  const cardContents = await Promise.all(cardFiles.map((f) => fetchBlobContent(f.sha)));
  const rawCards = cardContents.map((text) => JSON.parse(text) as unknown);

  const cardsParsed = cardCatalogSchema.parse({ cards: rawCards });
  const decksParsed = deckCatalogSchema.parse(JSON.parse(decksRaw));
  const attrsParsed = attributeCatalogSchema.parse(JSON.parse(attrsRaw));

  return {
    cards: cardsParsed.cards,
    decks: decksParsed.decks,
    attributes: attrsParsed,
    headSha,
  };
}

// ── Public API ────────────────────────────────────────────────────────

export function getCommittedSnapshot(): CommittedSnapshot | null {
  return committedSnapshot;
}

export async function initializeGitHubSync(): Promise<void> {
  if (!isGitHubSyncEnabled()) return;
  try {
    committedSnapshot = await loadSnapshot();
    console.log(
      `[githubSync] snapshot loaded — ${committedSnapshot.cards.length} cards, ` +
        `${committedSnapshot.decks.length} decks, head=${committedSnapshot.headSha.slice(0, 7)}`,
    );
  } catch (e) {
    console.warn('[githubSync] failed to load committed snapshot:', (e as Error).message);
  }
}

export function getPendingChanges(): PendingChanges {
  if (!committedSnapshot) {
    return {
      cards: { added: [], modified: [], deleted: [] },
      decks: { added: [], modified: [], deleted: [] },
      attributes: { modified: false },
    };
  }

  const currentCards = getCards();
  const currentDecks = getDecks();
  const currentAttrs = getAttributes();

  const committedCardMap = new Map(committedSnapshot.cards.map((c) => [c.id, c]));
  const currentCardMap = new Map(currentCards.map((c) => [c.id, c]));
  const committedDeckMap = new Map(committedSnapshot.decks.map((d) => [d.id, d]));
  const currentDeckMap = new Map(currentDecks.map((d) => [d.id, d]));

  const cards: ChangeSet = {
    added: [...currentCardMap.keys()].filter((id) => !committedCardMap.has(id)),
    deleted: [...committedCardMap.keys()].filter((id) => !currentCardMap.has(id)),
    modified: [...currentCardMap.keys()].filter((id) => {
      const committed = committedCardMap.get(id);
      return committed !== undefined && JSON.stringify(currentCardMap.get(id)) !== JSON.stringify(committed);
    }),
  };

  const decks: ChangeSet = {
    added: [...currentDeckMap.keys()].filter((id) => !committedDeckMap.has(id)),
    deleted: [...committedDeckMap.keys()].filter((id) => !currentDeckMap.has(id)),
    modified: [...currentDeckMap.keys()].filter((id) => {
      const committed = committedDeckMap.get(id);
      return committed !== undefined && JSON.stringify(currentDeckMap.get(id)) !== JSON.stringify(committed);
    }),
  };

  return {
    cards,
    decks,
    attributes: { modified: JSON.stringify(currentAttrs) !== JSON.stringify(committedSnapshot.attributes) },
  };
}

export async function commitCatalog(message: string): Promise<{ sha: string; url: string }> {
  if (!committedSnapshot) throw new Error('GitHub sync snapshot not loaded — restart the server');

  const pending = getPendingChanges();
  const currentCards = getCards();
  const currentDecks = getDecks();
  const currentAttrs = getAttributes();

  type TreeEntry = { path: string; mode: string; type: string; content?: string; sha?: null };
  const treeEntries: TreeEntry[] = [];

  // Card file changes (per-card files)
  const currentCardMap = new Map(currentCards.map((c) => [c.id, c]));
  for (const id of [...pending.cards.added, ...pending.cards.modified]) {
    treeEntries.push({
      path: `packages/db/seed/cards/${id}.json`,
      mode: '100644',
      type: 'blob',
      content: JSON.stringify(currentCardMap.get(id), null, 2) + '\n',
    });
  }
  for (const id of pending.cards.deleted) {
    treeEntries.push({ path: `packages/db/seed/cards/${id}.json`, mode: '100644', type: 'blob', sha: null });
  }

  // Decks (single file, committed whole)
  const hasDecksChanges =
    pending.decks.added.length > 0 || pending.decks.modified.length > 0 || pending.decks.deleted.length > 0;
  if (hasDecksChanges) {
    treeEntries.push({
      path: 'packages/db/seed/decks.json',
      mode: '100644',
      type: 'blob',
      content: JSON.stringify({ decks: [...currentDecks] }, null, 2) + '\n',
    });
  }

  // Attributes (single file, committed whole)
  if (pending.attributes.modified) {
    treeEntries.push({
      path: 'packages/db/seed/attributes.json',
      mode: '100644',
      type: 'blob',
      content: JSON.stringify(currentAttrs, null, 2) + '\n',
    });
  }

  if (treeEntries.length === 0) throw new Error('Nothing to commit');

  // Get the HEAD commit's tree SHA
  const headSha = committedSnapshot.headSha;
  const commitRes = await ghFetch(`/git/commits/${headSha}`);
  if (!commitRes.ok) throw new Error(`Failed to fetch HEAD commit: ${commitRes.status}`);
  const commitData = (await commitRes.json()) as { tree: { sha: string } };

  // Create new tree
  const newTreeRes = await ghFetch('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: commitData.tree.sha, tree: treeEntries }),
  });
  if (!newTreeRes.ok) throw new Error(`Failed to create tree: ${newTreeRes.status} ${await newTreeRes.text()}`);
  const newTree = (await newTreeRes.json()) as { sha: string };

  // Create commit object
  const newCommitRes = await ghFetch('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status} ${await newCommitRes.text()}`);
  const newCommit = (await newCommitRes.json()) as { sha: string; html_url: string };

  // Advance the branch ref (422 = SHA conflict — someone else pushed)
  const patchRes = await ghFetch(`/git/refs/heads/${getConfig()!.branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  if (!patchRes.ok) {
    const errText = await patchRes.text();
    if (patchRes.status === 422) {
      throw new GitHubConflictError(
        `Branch ${getConfig()!.branch} was updated since your last sync — refresh and try again.`,
      );
    }
    throw new Error(`Failed to update ref: ${patchRes.status} ${errText}`);
  }

  // Refresh the committed snapshot so the next diff is accurate
  committedSnapshot = await loadSnapshot();

  return { sha: newCommit.sha.slice(0, 7), url: newCommit.html_url };
}
