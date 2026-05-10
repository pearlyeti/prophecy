// First-class queue mechanism. After-abilities enter the queue;
// before-abilities interrupt the queue; additional actions live
// outside the queue. See README "Engine implementation notes".

export interface QueueEntry {
  readonly id: string;
  readonly kind: 'after' | 'effect';
  readonly source: string;
  readonly payload: unknown;
}

export interface Queue {
  readonly pending: readonly QueueEntry[];
}

export const emptyQueue: Queue = { pending: [] };
