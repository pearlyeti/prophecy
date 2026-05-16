import type { AttributeCatalog, Card, Deck } from '@prophecy/protocol';
import { useEffect, useMemo, useState } from 'react';

import type { CommitSelection, PendingChanges } from './api.js';
import { commitChanges, fetchPending, saveAttributes, saveCards, saveDecks } from './api.js';

interface Props {
  cards: readonly Card[];
  decks: readonly Deck[];
  attributes: AttributeCatalog;
  committedCards?: readonly Card[];
  committedDecks?: readonly Deck[];
  committedAttributes?: AttributeCatalog;
  onReload: () => void;
}

export function ChangesTab({
  cards,
  decks,
  attributes,
  committedCards,
  committedDecks,
  committedAttributes,
  onReload,
}: Props) {
  const [pending, setPending] = useState<PendingChanges | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set<string>());
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ sha: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const decksById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);
  const committedCardsById = useMemo(
    () => new Map((committedCards ?? []).map((c) => [c.id, c])),
    [committedCards],
  );
  const committedDecksById = useMemo(
    () => new Map((committedDecks ?? []).map((d) => [d.id, d])),
    [committedDecks],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const p = await fetchPending();
      setPending(p);
    } catch {
      // ignore network errors on refresh
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const allKeys = useMemo(() => {
    if (!pending?.enabled) return [] as string[];
    const keys: string[] = [];
    for (const id of pending.cards.added) keys.push(`card:added:${id}`);
    for (const id of pending.cards.modified) keys.push(`card:modified:${id}`);
    for (const id of pending.cards.deleted) keys.push(`card:deleted:${id}`);
    for (const id of pending.decks.added) keys.push(`deck:added:${id}`);
    for (const id of pending.decks.modified) keys.push(`deck:modified:${id}`);
    for (const id of pending.decks.deleted) keys.push(`deck:deleted:${id}`);
    if (pending.attributes.modified) keys.push('attributes');
    return keys;
  }, [pending]);

  const totalPending = allKeys.length;
  const totalSelected = selected.size;

  const toggleKey = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === allKeys.length) setSelected(new Set<string>());
    else setSelected(new Set(allKeys));
  };

  const handleRevertSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Revert ${selected.size} selected change${selected.size !== 1 ? 's' : ''} to committed state?`)) return;

    setReverting(true);
    setError(null);
    try {
      // Cards
      const addedCards = (pending?.cards.added ?? []).filter((id) => selected.has(`card:added:${id}`));
      const modifiedCards = (pending?.cards.modified ?? []).filter((id) => selected.has(`card:modified:${id}`));
      const deletedCards = (pending?.cards.deleted ?? []).filter((id) => selected.has(`card:deleted:${id}`));
      if (addedCards.length > 0 || modifiedCards.length > 0 || deletedCards.length > 0) {
        const modSet = new Set(modifiedCards);
        let newCards = cards
          .filter((c) => !addedCards.includes(c.id))
          .map((c) => (modSet.has(c.id) ? (committedCardsById.get(c.id) ?? c) : c));
        for (const id of deletedCards) {
          const committed = committedCardsById.get(id);
          if (committed) newCards.push(committed);
        }
        await saveCards(newCards);
      }

      // Decks
      const addedDecks = (pending?.decks.added ?? []).filter((id) => selected.has(`deck:added:${id}`));
      const modifiedDecks = (pending?.decks.modified ?? []).filter((id) => selected.has(`deck:modified:${id}`));
      const deletedDecks = (pending?.decks.deleted ?? []).filter((id) => selected.has(`deck:deleted:${id}`));
      if (addedDecks.length > 0 || modifiedDecks.length > 0 || deletedDecks.length > 0) {
        const modSet = new Set(modifiedDecks);
        let newDecks = decks
          .filter((d) => !addedDecks.includes(d.id))
          .map((d) => (modSet.has(d.id) ? (committedDecksById.get(d.id) ?? d) : d));
        for (const id of deletedDecks) {
          const committed = committedDecksById.get(id);
          if (committed) newDecks.push(committed);
        }
        await saveDecks(newDecks);
      }

      // Attributes
      if (selected.has('attributes') && committedAttributes) {
        await saveAttributes(committedAttributes);
      }

      setSelected(new Set<string>());
      await refresh();
      onReload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReverting(false);
    }
  };

  const handleCommit = async (sel?: CommitSelection) => {
    if (!message.trim()) return;
    const count = sel
      ? (sel.cardIds?.length ?? 0) + (sel.deckIds?.length ?? 0) + (sel.includeAttributes ? 1 : 0)
      : totalPending;
    if (count === 0) return;
    if (!confirm(`Commit ${count} change${count !== 1 ? 's' : ''} to main?`)) return;

    setCommitting(true);
    setError(null);
    setCommitResult(null);
    try {
      const r = await commitChanges(message.trim(), sel);
      setCommitResult(r);
      setMessage('');
      setSelected(new Set<string>());
      await refresh();
      onReload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  const handleCommitSelected = () => {
    const cardIds = [...selected].filter((k) => k.startsWith('card:')).map((k) => k.split(':')[2]!);
    const deckIds = [...selected].filter((k) => k.startsWith('deck:')).map((k) => k.split(':')[2]!);
    const includeAttributes = selected.has('attributes');
    void handleCommit({ cardIds, deckIds, includeAttributes });
  };

  if (pending === null) {
    return <div className="text-sm text-neutral-500">Loading changes…</div>;
  }

  if (!pending.enabled) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-6 text-sm text-neutral-500">
        GitHub sync is not configured. Set{' '}
        <code className="text-neutral-300">GITHUB_TOKEN</code>,{' '}
        <code className="text-neutral-300">GITHUB_REPO</code>, and{' '}
        <code className="text-neutral-300">GITHUB_BRANCH</code> on the game server to enable committing from the designer.
      </div>
    );
  }

  const busy = committing || reverting;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-neutral-300">
          {totalPending === 0
            ? 'No uncommitted changes'
            : `${totalPending} uncommitted change${totalPending !== 1 ? 's' : ''}`}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="ml-auto min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {totalPending > 0 && (
        <>
          {/* Select all */}
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={selected.size === allKeys.length && allKeys.length > 0}
                onChange={toggleAll}
              />
              {selected.size === allKeys.length ? 'Deselect all' : 'Select all'}
            </label>
            {totalSelected > 0 && (
              <span className="text-xs text-neutral-500">{totalSelected} selected</span>
            )}
          </div>

          {/* Cards */}
          {(pending.cards.added.length > 0 ||
            pending.cards.modified.length > 0 ||
            pending.cards.deleted.length > 0) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Cards
              </h3>
              <ul className="space-y-1">
                {pending.cards.added.map((id) => (
                  <ChangeItem
                    key={`card:added:${id}`}
                    badge="new"
                    name={cardsById.get(id)?.name ?? id}
                    subtext={id}
                    checked={selected.has(`card:added:${id}`)}
                    onToggle={() => toggleKey(`card:added:${id}`)}
                  />
                ))}
                {pending.cards.modified.map((id) => (
                  <ChangeItem
                    key={`card:modified:${id}`}
                    badge="modified"
                    name={cardsById.get(id)?.name ?? committedCardsById.get(id)?.name ?? id}
                    subtext={id}
                    checked={selected.has(`card:modified:${id}`)}
                    onToggle={() => toggleKey(`card:modified:${id}`)}
                  />
                ))}
                {pending.cards.deleted.map((id) => (
                  <ChangeItem
                    key={`card:deleted:${id}`}
                    badge="deleted"
                    name={committedCardsById.get(id)?.name ?? id}
                    subtext={id}
                    checked={selected.has(`card:deleted:${id}`)}
                    onToggle={() => toggleKey(`card:deleted:${id}`)}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Decks */}
          {(pending.decks.added.length > 0 ||
            pending.decks.modified.length > 0 ||
            pending.decks.deleted.length > 0) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Decks
              </h3>
              <ul className="space-y-1">
                {pending.decks.added.map((id) => (
                  <ChangeItem
                    key={`deck:added:${id}`}
                    badge="new"
                    name={decksById.get(id)?.name ?? id}
                    subtext={id}
                    checked={selected.has(`deck:added:${id}`)}
                    onToggle={() => toggleKey(`deck:added:${id}`)}
                  />
                ))}
                {pending.decks.modified.map((id) => (
                  <ChangeItem
                    key={`deck:modified:${id}`}
                    badge="modified"
                    name={decksById.get(id)?.name ?? committedDecksById.get(id)?.name ?? id}
                    subtext={id}
                    checked={selected.has(`deck:modified:${id}`)}
                    onToggle={() => toggleKey(`deck:modified:${id}`)}
                  />
                ))}
                {pending.decks.deleted.map((id) => (
                  <ChangeItem
                    key={`deck:deleted:${id}`}
                    badge="deleted"
                    name={committedDecksById.get(id)?.name ?? id}
                    subtext={id}
                    checked={selected.has(`deck:deleted:${id}`)}
                    onToggle={() => toggleKey(`deck:deleted:${id}`)}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Attributes */}
          {pending.attributes.modified && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Attributes
              </h3>
              <ul className="space-y-1">
                <ChangeItem
                  badge="modified"
                  name="Attribute catalog"
                  checked={selected.has('attributes')}
                  onToggle={() => toggleKey('attributes')}
                />
              </ul>
            </section>
          )}

          {/* Actions */}
          <div className="space-y-3 border-t border-neutral-800 pt-4">
            <textarea
              rows={2}
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              placeholder="Commit message…"
              className="min-h-[60px] w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCommitSelected}
                disabled={busy || !message.trim() || totalSelected === 0}
                className="min-h-[44px] rounded-lg border border-emerald-800 bg-emerald-900/60 px-4 text-sm font-medium text-emerald-100 hover:bg-emerald-900 disabled:opacity-50"
              >
                {committing ? 'Committing…' : `Commit selected (${totalSelected})`}
              </button>
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={busy || !message.trim()}
                className="min-h-[44px] rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {committing ? 'Committing…' : `Commit all (${totalPending})`}
              </button>
              {totalSelected > 0 && committedCards !== undefined && (
                <button
                  type="button"
                  onClick={() => void handleRevertSelected()}
                  disabled={busy}
                  className="min-h-[44px] rounded-lg border border-red-900 bg-red-950/40 px-4 text-sm text-red-200 hover:border-red-700 disabled:opacity-50"
                >
                  {reverting ? 'Reverting…' : `Revert selected (${totalSelected})`}
                </button>
              )}
            </div>

            {error && (
              <div className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}
            {commitResult && (
              <div className="rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
                Committed{' '}
                <a href={commitResult.url} target="_blank" rel="noreferrer" className="underline">
                  {commitResult.sha}
                </a>{' '}
                to main.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ChangeItem({
  badge,
  name,
  subtext,
  checked,
  onToggle,
}: {
  badge: 'new' | 'modified' | 'deleted';
  name: string;
  subtext?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const badgeCls =
    badge === 'new'
      ? 'border-green-800 bg-green-900 text-green-300'
      : badge === 'deleted'
        ? 'border-red-800 bg-red-900 text-red-300'
        : 'border-amber-800 bg-amber-900 text-amber-300';

  return (
    <li>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 hover:border-neutral-700">
        <input type="checkbox" checked={checked} onChange={onToggle} className="shrink-0" />
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeCls}`}>
          {badge}
        </span>
        <span className="flex-1 text-sm text-neutral-200">{name}</span>
        {subtext && <span className="font-mono text-[10px] text-neutral-500">{subtext}</span>}
      </label>
    </li>
  );
}
