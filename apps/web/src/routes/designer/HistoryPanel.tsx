import type { Card } from '@prophecy/protocol';
import { useEffect, useState } from 'react';

import type { CommitSummary } from './api.js';
import { fetchCardAtSha, fetchCardHistory } from './api.js';
import { CardDiff } from './CardDiff.js';

interface Props {
  card: Card;
  onClose: () => void;
  onRestore: (historical: Card) => void;
  onViewCommit: (sha: string) => void;
}

export function HistoryPanel({ card, onClose, onRestore, onViewCommit }: Props) {
  const [commits, setCommits] = useState<CommitSummary[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [historical, setHistorical] = useState<Card | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCardHistory(card.id)
      .then((list) => { if (!cancelled) setCommits(list); })
      .catch((e: unknown) => { if (!cancelled) setHistoryError((e as Error).message); });
    return () => { cancelled = true; };
  }, [card.id]);

  const selectCommit = (sha: string) => {
    setSelectedSha(sha);
    setHistorical(null);
    setCardError(null);
    setLoadingCard(true);
    fetchCardAtSha(card.id, sha)
      .then((c) => { setHistorical(c); })
      .catch((e: unknown) => { setCardError((e as Error).message); })
      .finally(() => { setLoadingCard(false); });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-4xl flex-col rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <span className="text-sm font-semibold text-neutral-100">{card.name}</span>
            <span className="ml-2 font-mono text-xs text-neutral-500">{card.id}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
          >
            Close
          </button>
        </div>

        <div className="grid max-h-[70vh] overflow-hidden" style={{ gridTemplateColumns: '220px 1fr' }}>
          <div className="overflow-y-auto border-r border-neutral-800 p-2">
            {historyError && (
              <p className="text-xs text-red-400 p-2">{historyError}</p>
            )}
            {!historyError && commits === null && (
              <p className="text-xs text-neutral-500 p-2">Loading…</p>
            )}
            {commits !== null && commits.length === 0 && (
              <p className="text-xs text-neutral-500 p-2">No commit history found.</p>
            )}
            {commits !== null && commits.map((c) => (
              <button
                key={c.sha}
                type="button"
                onClick={() => selectCommit(c.sha)}
                className={`w-full rounded p-2 text-left transition ${
                  selectedSha === c.sha
                    ? 'bg-neutral-800'
                    : 'hover:bg-neutral-900'
                }`}
              >
                <div className="font-mono text-xs text-neutral-400">{c.shortSha}</div>
                <div className="mt-0.5 text-xs text-neutral-200 line-clamp-2">{c.message}</div>
                <div className="mt-0.5 text-xs text-neutral-600">
                  {c.author} · {new Date(c.date).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>

          <div className="overflow-y-auto p-4">
            {selectedSha === null && (
              <p className="text-xs text-neutral-500">Select a commit on the left to see what changed.</p>
            )}
            {selectedSha !== null && loadingCard && (
              <p className="text-xs text-neutral-500">Loading…</p>
            )}
            {selectedSha !== null && cardError && (
              <p className="text-xs text-red-400">{cardError}</p>
            )}
            {selectedSha !== null && historical !== null && (
              <>
                <CardDiff before={historical} after={card} />
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onRestore(historical)}
                    className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-4 text-xs text-neutral-200 hover:border-neutral-500"
                  >
                    Restore to this version
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewCommit(selectedSha)}
                    className="text-xs text-neutral-500 underline hover:text-neutral-300"
                  >
                    View full commit ↗
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
