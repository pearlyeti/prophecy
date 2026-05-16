import type { Card } from '@prophecy/protocol';
import { useEffect, useState } from 'react';

import type { CommitReport } from './api.js';
import { fetchCommitReport } from './api.js';

interface Props {
  sha: string;
  cards: readonly Card[];
  onClose: () => void;
  onNavigateToCard: (cardId: string) => void;
  onNavigateToDecks: () => void;
  onNavigateToAttributes: () => void;
}

export function CommitReportModal({ sha, cards, onClose, onNavigateToCard, onNavigateToDecks, onNavigateToAttributes }: Props) {
  const [report, setReport] = useState<CommitReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCommitReport(sha)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((e: unknown) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [sha]);

  const cardsById = new Map(cards.map((c) => [c.id, c]));

  const badgeCls = (status: 'added' | 'modified' | 'removed') =>
    status === 'added'
      ? 'border-green-800 bg-green-900 text-green-300'
      : status === 'removed'
        ? 'border-red-800 bg-red-900 text-red-300'
        : 'border-amber-800 bg-amber-900 text-amber-300';

  const hasChanges = report
    ? report.cards.length > 0 || report.decksChanged || report.attributesChanged
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-neutral-400">{report?.shortSha ?? sha.slice(0, 7)}</span>
              <span className="text-sm font-semibold text-neutral-100 line-clamp-2">
                {report?.message ?? '…'}
              </span>
            </div>
            {report && (
              <div className="mt-0.5 text-xs text-neutral-500">
                {report.author} · {new Date(report.date).toLocaleString()}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 min-h-[44px] min-w-[44px] shrink-0 rounded border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
          >
            Close
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          {!error && report === null && (
            <p className="text-xs text-neutral-500">Loading…</p>
          )}

          {report !== null && !hasChanges && (
            <p className="text-xs text-neutral-500">No catalog changes in this commit.</p>
          )}

          {report !== null && report.cards.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Cards ({report.cards.length})
              </h3>
              <ul className="space-y-1">
                {report.cards.map(({ id, status }) => {
                  const name = cardsById.get(id)?.name;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onNavigateToCard(id)}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-left hover:border-neutral-700"
                      >
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeCls(status)}`}>
                          {status}
                        </span>
                        <span className="flex-1 text-xs text-neutral-200">{name ?? id}</span>
                        <span className="font-mono text-[10px] text-neutral-500">{id}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {report !== null && report.decksChanged && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Decks
              </h3>
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={onNavigateToDecks}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-left hover:border-neutral-700"
                  >
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeCls('modified')}`}>
                      modified
                    </span>
                    <span className="flex-1 text-xs text-neutral-200">decks.json</span>
                  </button>
                </li>
              </ul>
            </section>
          )}

          {report !== null && report.attributesChanged && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Attributes
              </h3>
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={onNavigateToAttributes}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-left hover:border-neutral-700"
                  >
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeCls('modified')}`}>
                      modified
                    </span>
                    <span className="flex-1 text-xs text-neutral-200">attributes.json</span>
                  </button>
                </li>
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
