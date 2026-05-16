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

// ── New exports ───────────────────────────────────────────────────────

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

async function fetchFileAtRef(path: string, ref: string): Promise<string> {
  const res = await ghFetch(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) throw new Error(`contents fetch failed for ${path}@${ref}: ${res.status}`);
  const data = (await res.json()) as { content: string; encoding: string };
  return data.encoding === 'base64' ? decodeBase64Content(data.content) : data.content;
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

// ── History / diff API ────────────────────────────────────────────────

export async function fetchCardHistory(cardId: string): Promise<CommitSummary[]> {
  const cfg = getConfig();
  if (!cfg) throw new Error('GitHub sync not configured');
  const path = `packages/db/seed/cards/${cardId}.json`;
  const res = await ghFetch(`/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(cfg.branch)}&per_page=30`);
  if (!res.ok) throw new Error(`commits fetch failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as Array<{
    sha: string;
    commit: { message: string; author: { name: string; date: string } };
  }>;
  return data.map((entry) => ({
    sha: entry.sha,
    shortSha: entry.sha.slice(0, 7),
    message: entry.commit.message.split('\n')[0]!,
    author: entry.commit.author.name,
    date: entry.commit.author.date,
  }));
}

export async function fetchCardAtSha(cardId: string, sha: string): Promise<Card> {
  if (!getConfig()) throw new Error('GitHub sync not configured');
  const path = `packages/db/seed/cards/${cardId}.json`;
  const raw = await fetchFileAtRef(path, sha);
  const parsed = JSON.parse(raw) as unknown;
  return cardCatalogSchema.parse({ cards: [parsed] }).cards[0]!;
}

export async function fetchCommitReport(sha: string): Promise<CommitReport> {
  if (!getConfig()) throw new Error('GitHub sync not configured');
  const res = await ghFetch(`/commits/${sha}`);
  if (!res.ok) throw new Error(`commit fetch failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    sha: string;
    commit: { message: string; author: { name: string; date: string } };
    files?: Array<{ filename: string; status: string }>;
  };
  const files = data.files ?? [];
  const cardPattern = /^packages\/db\/seed\/cards\/([A-Za-z0-9_-]+)\.json$/;
  const cards: Array<{ id: string; status: 'added' | 'modified' | 'removed' }> = [];
  let decksChanged = false;
  let attributesChanged = false;
  for (const f of files) {
    const m = cardPattern.exec(f.filename);
    if (m) {
      const status = f.status === 'added' ? 'added' : f.status === 'removed' ? 'removed' : 'modified';
      cards.push({ id: m[1]!, status });
    } else if (f.filename === 'packages/db/seed/decks.json') {
      decksChanged = true;
    } else if (f.filename === 'packages/db/seed/attributes.json') {
      attributesChanged = true;
    }
  }
  return {
    sha: data.sha,
    shortSha: data.sha.slice(0, 7),
    message: data.commit.message.split('\n')[0]!,
    author: data.commit.author.name,
    date: data.commit.author.date,
    cards,
    decksChanged,
    attributesChanged,
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

/** Optional filter for partial commits — omit a field to include all pending changes of that type. */
export interface CommitSelection {
  cardIds?: string[];
  deckIds?: string[];
  includeAttributes?: boolean;
}

export async function commitCatalog(
  message: string,
  selection?: CommitSelection,
): Promise<{ sha: string; url: string }> {
  if (!committedSnapshot) throw new Error('GitHub sync snapshot not loaded — restart the server');

  const pending = getPendingChanges();
  const currentCards = getCards();
  const currentDecks = getDecks();
  const currentAttrs = getAttributes();

  // Apply selection filter (undefined = include all)
  const sel = {
    cardIds: selection?.cardIds ?? null,
    deckIds: selection?.deckIds ?? null,
    includeAttributes: selection?.includeAttributes ?? null,
  };
  const filterCards = (ids: string[]) => (sel.cardIds ? ids.filter((id) => sel.cardIds!.includes(id)) : ids);
  const filterDecks = (ids: string[]) => (sel.deckIds ? ids.filter((id) => sel.deckIds!.includes(id)) : ids);

  const cardAdded = filterCards(pending.cards.added);
  const cardModified = filterCards(pending.cards.modified);
  const cardDeleted = filterCards(pending.cards.deleted);

  const deckAdded = filterDecks(pending.decks.added);
  const deckModified = filterDecks(pending.decks.modified);
  const deckDeleted = filterDecks(pending.decks.deleted);

  const includeAttrs = sel.includeAttributes !== null ? sel.includeAttributes : pending.attributes.modified;

  type TreeEntry = { path: string; mode: string; type: string; content?: string; sha?: null };
  const treeEntries: TreeEntry[] = [];

  // Card file changes (per-card files — each card is its own file so partial commit is exact)
  const currentCardMap = new Map(currentCards.map((c) => [c.id, c]));
  for (const id of [...cardAdded, ...cardModified]) {
    treeEntries.push({
      path: `packages/db/seed/cards/${id}.json`,
      mode: '100644',
      type: 'blob',
      content: JSON.stringify(currentCardMap.get(id), null, 2) + '\n',
    });
  }
  for (const id of cardDeleted) {
    treeEntries.push({ path: `packages/db/seed/cards/${id}.json`, mode: '100644', type: 'blob', sha: null });
  }

  // Decks (single file — partial commit merges selected changes onto the committed base)
  const hasDecksChanges = deckAdded.length > 0 || deckModified.length > 0 || deckDeleted.length > 0;
  if (hasDecksChanges) {
    const currentDeckMap = new Map(currentDecks.map((d) => [d.id, d]));
    const deletedSet = new Set(deckDeleted);
    const modifiedSet = new Set(deckModified);
    const mergedDecks = committedSnapshot.decks
      .filter((d) => !deletedSet.has(d.id))
      .map((d) => (modifiedSet.has(d.id) ? currentDeckMap.get(d.id)! : d));
    for (const id of deckAdded) mergedDecks.push(currentDeckMap.get(id)!);
    treeEntries.push({
      path: 'packages/db/seed/decks.json',
      mode: '100644',
      type: 'blob',
      content: JSON.stringify({ decks: mergedDecks }, null, 2) + '\n',
    });
  }

  // Attributes (single file)
  if (includeAttrs) {
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

  // Advance the branch ref. On 422 (stale SHA), re-sync and retry once.
  const tryUpdateRef = async (commitSha: string): Promise<void> => {
    const patchRes = await ghFetch(`/git/refs/heads/${getConfig()!.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitSha }),
    });
    if (patchRes.ok) return;
    const errText = await patchRes.text();
    if (patchRes.status === 422) throw new GitHubConflictError('stale');
    throw new Error(`Failed to update ref: ${patchRes.status} ${errText}`);
  };

  let finalCommitSha = newCommit.sha;
  try {
    await tryUpdateRef(finalCommitSha);
  } catch (e) {
    if (!(e instanceof GitHubConflictError)) throw e;
    // Branch moved — re-sync snapshot and rebuild the commit against the new HEAD
    committedSnapshot = await loadSnapshot();
    const freshHeadSha = committedSnapshot.headSha;
    const freshCommitRes = await ghFetch(`/git/commits/${freshHeadSha}`);
    if (!freshCommitRes.ok) throw new Error(`Failed to fetch fresh HEAD: ${freshCommitRes.status}`);
    const freshCommitData = (await freshCommitRes.json()) as { tree: { sha: string } };
    const retryTreeRes = await ghFetch('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: freshCommitData.tree.sha, tree: treeEntries }),
    });
    if (!retryTreeRes.ok) throw new Error(`Failed to create retry tree: ${retryTreeRes.status}`);
    const retryTree = (await retryTreeRes.json()) as { sha: string };
    const retryCommitRes = await ghFetch('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: retryTree.sha, parents: [freshHeadSha] }),
    });
    if (!retryCommitRes.ok) throw new Error(`Failed to create retry commit: ${retryCommitRes.status}`);
    const retryCommit = (await retryCommitRes.json()) as { sha: string; html_url: string };
    finalCommitSha = retryCommit.sha;
    await tryUpdateRef(finalCommitSha).catch(() => {
      throw new GitHubConflictError(
        `Branch ${getConfig()!.branch} is updating too fast — wait a moment and try again.`,
      );
    });
  }

  // Refresh the committed snapshot so the next diff is accurate
  committedSnapshot = await loadSnapshot();

  return { sha: finalCommitSha.slice(0, 7), url: newCommit.html_url };
}
