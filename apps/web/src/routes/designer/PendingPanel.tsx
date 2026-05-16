import { useEffect, useState } from 'react';
import { type ChangeSet, type PendingChanges, commitChanges, fetchPending } from './api.js';

export function PendingPanel({ onCommitSuccess }: { onCommitSuccess: () => void }) {
  const [pending, setPending] = useState<PendingChanges | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ sha: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalCount =
    pending && pending.enabled
      ? pending.cards.added.length +
        pending.cards.modified.length +
        pending.cards.deleted.length +
        pending.decks.added.length +
        pending.decks.modified.length +
        pending.decks.deleted.length +
        (pending.attributes.modified ? 1 : 0)
      : 0;

  const refresh = async () => {
    setLoading(true);
    try {
      const p = await fetchPending();
      setPending(p);
    } catch {
      // silently ignore refresh errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Poll every 30 seconds while the panel is expanded
  useEffect(() => {
    if (!expanded) return;
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [expanded]);

  const handleCommit = async () => {
    if (!message.trim() || totalCount === 0) return;
    if (!confirm(`Commit ${totalCount} change${totalCount !== 1 ? 's' : ''} to ${pending?.enabled ? 'main' : 'repo'}?`))
      return;
    setCommitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await commitChanges(message.trim());
      setResult(r);
      setMessage('');
      await refresh();
      onCommitSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  // Don't render until we know the sync state; hide if GitHub sync disabled
  if (pending === null) return null;
  if (!pending.enabled) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-700 bg-neutral-900">
      {/* Header row — always visible */}
      <button
        type="button"
        className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-sm font-medium text-neutral-300">Uncommitted changes</span>
        {totalCount > 0 ? (
          <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white">
            {totalCount}
          </span>
        ) : (
          <span className="text-xs text-neutral-600">up to date</span>
        )}
        <span className="ml-auto text-xs text-neutral-600">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="space-y-3 border-t border-neutral-800 px-4 py-3">
          {/* Change summary grid */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <ChangeSection title="Cards" changes={pending.cards} />
            <ChangeSection title="Decks" changes={pending.decks} />
            <div>
              <div className="mb-1 font-medium text-neutral-400">Attributes</div>
              {pending.attributes.modified ? (
                <div className="text-amber-400">Modified</div>
              ) : (
                <div className="text-neutral-600">No changes</div>
              )}
            </div>
          </div>

          {/* Commit row */}
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              className="min-h-[44px] flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder-neutral-600"
              placeholder="Commit message…"
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !committing) void handleCommit();
              }}
              disabled={committing}
            />
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
            >
              {loading ? '…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => void handleCommit()}
              disabled={committing || !message.trim() || totalCount === 0}
              className="min-h-[44px] rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {committing ? 'Committing…' : 'Commit to GitHub'}
            </button>
          </div>

          {error && (
            <div className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
              Committed{' '}
              <a href={result.url} target="_blank" rel="noreferrer" className="underline">
                {result.sha}
              </a>{' '}
              to main.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeSection({ title, changes }: { title: string; changes: ChangeSet }) {
  const total = changes.added.length + changes.modified.length + changes.deleted.length;
  return (
    <div>
      <div className="mb-1 font-medium text-neutral-400">{title}</div>
      {total === 0 ? (
        <div className="text-neutral-600">No changes</div>
      ) : (
        <div className="space-y-0.5">
          {changes.added.length > 0 && <div className="text-green-400">+{changes.added.length} added</div>}
          {changes.modified.length > 0 && <div className="text-amber-400">{changes.modified.length} modified</div>}
          {changes.deleted.length > 0 && <div className="text-red-400">−{changes.deleted.length} deleted</div>}
        </div>
      )}
    </div>
  );
}
