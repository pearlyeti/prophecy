import type { AttributeCatalog, Card, Deck } from '@prophecy/protocol';
import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CommitSelection, PendingChanges } from './api.js';
import { commitChanges, fetchPending, saveAttributes, saveCards, saveDecks } from './api.js';

interface Props {
  cards: readonly Card[];
  decks: readonly Deck[];
  committedCards?: readonly Card[];
  committedDecks?: readonly Deck[];
  committedAttributes?: AttributeCatalog;
  onReload: () => void;
  onViewCommit?: (sha: string) => void;
}

interface CommitItem {
  badge: 'new' | 'modified' | 'deleted';
  label: string;
}

interface CommitTarget {
  selection?: CommitSelection;
  items: CommitItem[];
  count: number;
}

export function ChangesTab({
  cards,
  decks,
  committedCards,
  committedDecks,
  committedAttributes,
  onReload,
  onViewCommit,
}: Props) {
  const [pending, setPending] = useState<PendingChanges | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set<string>());
  const [commitTarget, setCommitTarget] = useState<CommitTarget | null>(null);
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

  const selectAllIndeterminate = totalSelected > 0 && totalSelected < totalPending;

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

  // Build the list of CommitItems for the modal summary
  const buildItems = (keys: Iterable<string>): CommitItem[] => {
    const items: CommitItem[] = [];
    for (const key of keys) {
      if (key.startsWith('card:')) {
        const [, badge, id] = key.split(':') as [string, 'added' | 'modified' | 'deleted', string];
        const name = cardsById.get(id)?.name ?? committedCardsById.get(id)?.name ?? id;
        items.push({ badge: badge === 'added' ? 'new' : badge, label: name });
      } else if (key.startsWith('deck:')) {
        const [, badge, id] = key.split(':') as [string, 'added' | 'modified' | 'deleted', string];
        const name = decksById.get(id)?.name ?? committedDecksById.get(id)?.name ?? id;
        items.push({ badge: badge === 'added' ? 'new' : badge, label: name });
      } else if (key === 'attributes') {
        items.push({ badge: 'modified', label: 'Attribute catalog' });
      }
    }
    return items;
  };

  const openCommitAll = () => {
    setCommitTarget({ items: buildItems(allKeys), count: totalPending });
  };

  const openCommitSelected = () => {
    const items = buildItems(selected);
    const cardIds = [...selected].filter((k) => k.startsWith('card:')).map((k) => k.split(':')[2]!);
    const deckIds = [...selected].filter((k) => k.startsWith('deck:')).map((k) => k.split(':')[2]!);
    const includeAttributes = selected.has('attributes');
    setCommitTarget({ selection: { cardIds, deckIds, includeAttributes }, items, count: totalSelected });
  };

  const handleCommit = async (message: string) => {
    if (!commitTarget) return;
    setCommitting(true);
    setError(null);
    setCommitResult(null);
    try {
      const r = await commitChanges(message, commitTarget.selection);
      setCommitTarget(null);
      setCommitResult(r);
      setSelected(new Set<string>());
      await refresh();
      onReload();
    } catch (e) {
      setCommitTarget(null);
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  const handleRevertSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Revert ${selected.size} selected change${selected.size !== 1 ? 's' : ''} to committed state?`)) return;

    setReverting(true);
    setError(null);
    try {
      const addedCards = (pending?.cards.added ?? []).filter((id) => selected.has(`card:added:${id}`));
      const modifiedCards = (pending?.cards.modified ?? []).filter((id) => selected.has(`card:modified:${id}`));
      const deletedCards = (pending?.cards.deleted ?? []).filter((id) => selected.has(`card:deleted:${id}`));
      if (addedCards.length > 0 || modifiedCards.length > 0 || deletedCards.length > 0) {
        const modSet = new Set(modifiedCards);
        const newCards = cards
          .filter((c) => !addedCards.includes(c.id))
          .map((c) => (modSet.has(c.id) ? (committedCardsById.get(c.id) ?? c) : c));
        for (const id of deletedCards) {
          const committed = committedCardsById.get(id);
          if (committed) newCards.push(committed);
        }
        await saveCards(newCards);
      }

      const addedDecks = (pending?.decks.added ?? []).filter((id) => selected.has(`deck:added:${id}`));
      const modifiedDecks = (pending?.decks.modified ?? []).filter((id) => selected.has(`deck:modified:${id}`));
      const deletedDecks = (pending?.decks.deleted ?? []).filter((id) => selected.has(`deck:deleted:${id}`));
      if (addedDecks.length > 0 || modifiedDecks.length > 0 || deletedDecks.length > 0) {
        const modSet = new Set(modifiedDecks);
        const newDecks = decks
          .filter((d) => !addedDecks.includes(d.id))
          .map((d) => (modSet.has(d.id) ? (committedDecksById.get(d.id) ?? d) : d));
        for (const id of deletedDecks) {
          const committed = committedDecksById.get(id);
          if (committed) newDecks.push(committed);
        }
        await saveDecks(newDecks);
      }

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

  if (pending === null) {
    return <div className="text-sm text-muted-foreground">Loading changes…</div>;
  }

  if (!pending.enabled) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-6 text-sm text-muted-foreground">
        GitHub sync is not configured. Set{' '}
        <code className="text-foreground">GITHUB_TOKEN</code>,{' '}
        <code className="text-foreground">GITHUB_REPO</code>, and{' '}
        <code className="text-foreground">GITHUB_BRANCH</code> on the game server to enable committing from the designer.
      </div>
    );
  }

  const busy = committing || reverting;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {totalPending === 0
              ? 'No uncommitted changes'
              : `${totalPending} uncommitted change${totalPending !== 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="ml-auto min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>

        {totalPending === 0 && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/20 px-4 py-10 text-center text-sm text-muted-foreground">
            Catalog is up to date — no uncommitted changes.
          </div>
        )}

        {totalPending > 0 && (
          <>
            {/* Select all */}
            <div className="flex items-center gap-3">
              <Label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={selectAllIndeterminate ? 'indeterminate' : selected.size === allKeys.length && allKeys.length > 0}
                  onCheckedChange={toggleAll}
                />
                {selected.size === allKeys.length ? 'Deselect all' : 'Select all'}
              </Label>
              {totalSelected > 0 && (
                <span className="text-xs text-muted-foreground">{totalSelected} selected</span>
              )}
            </div>

            {/* Cards */}
            {(pending.cards.added.length > 0 ||
              pending.cards.modified.length > 0 ||
              pending.cards.deleted.length > 0) && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
            <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-4">
              {totalSelected > 0 && (
                <button
                  type="button"
                  onClick={openCommitSelected}
                  disabled={busy}
                  className="min-h-[44px] rounded-lg border border-emerald-800 bg-emerald-900/60 px-4 text-sm font-medium text-emerald-100 hover:bg-emerald-900 disabled:opacity-50"
                >
                  Commit selected ({totalSelected})
                </button>
              )}
              <button
                type="button"
                onClick={openCommitAll}
                disabled={busy}
                className="min-h-[44px] rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Commit all ({totalPending})
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
                {onViewCommit ? (
                  <button
                    type="button"
                    onClick={() => onViewCommit(commitResult.sha)}
                    className="underline hover:text-emerald-200"
                  >
                    {commitResult.sha}
                  </button>
                ) : (
                  <a href={commitResult.url} target="_blank" rel="noreferrer" className="underline">
                    {commitResult.sha}
                  </a>
                )}{' '}
                to main.
              </div>
            )}
          </>
        )}
      </div>

      {commitTarget && (
        <CommitModal
          items={commitTarget.items}
          count={commitTarget.count}
          busy={committing}
          onConfirm={(msg) => void handleCommit(msg)}
          onCancel={() => setCommitTarget(null)}
        />
      )}
    </>
  );
}

function CommitModal({
  items,
  count,
  busy,
  onConfirm,
  onCancel,
}: {
  items: CommitItem[];
  count: number;
  busy: boolean;
  onConfirm: (message: string) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-foreground">
          Commit {count} change{count !== 1 ? 's' : ''} to main
        </h2>

        {/* Summary list */}
        <ul className="max-h-60 space-y-1 overflow-y-auto">
          {items.map((item, i) => {
            const badgeCls =
              item.badge === 'new'
                ? 'border-green-800 bg-green-900 text-green-300'
                : item.badge === 'deleted'
                  ? 'border-red-800 bg-red-900 text-red-300'
                  : 'border-amber-800 bg-amber-900 text-amber-300';
            return (
              <li key={i} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-foreground">
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase ${badgeCls}`}>
                  {item.badge}
                </span>
                {item.label}
              </li>
            );
          })}
        </ul>

        {/* Commit message */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Commit message</Label>
          <Textarea
            rows={3}
            autoFocus
            value={message}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
            placeholder="Describe what changed…"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm text-foreground hover:border-neutral-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(message.trim())}
            disabled={busy || !message.trim()}
            className="min-h-[44px] rounded-lg bg-emerald-700 px-5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? 'Committing…' : 'Commit'}
          </button>
        </div>
      </div>
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
      <Label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 hover:border-neutral-700">
        <Checkbox checked={checked} onCheckedChange={onToggle} className="shrink-0" />
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase ${badgeCls}`}>
          {badge}
        </span>
        <span className="flex-1 text-sm text-foreground">{name}</span>
        {subtext && <span className="font-mono text-xs text-muted-foreground">{subtext}</span>}
      </Label>
    </li>
  );
}
