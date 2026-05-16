import { createDb, schema } from '@prophecy/db';
import type { EngineEvent } from '@prophecy/game-engine';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

type Db = ReturnType<typeof createDb>;

const DB_URL =
  process.env.DATABASE_URL ?? 'postgres://prophecy:prophecy@localhost:5432/prophecy';

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = createDb(DB_URL);
  return _db;
}

/**
 * On boot, any game_sessions left with status='active' belong to a previous
 * server process that crashed or was killed. Mark them abandoned.
 */
export async function markAbandonedSessions(db: Db): Promise<void> {
  const rows = await db
    .update(schema.gameSessions)
    .set({ status: 'abandoned', endedAt: new Date() })
    .where(eq(schema.gameSessions.status, 'active'))
    .returning({ id: schema.gameSessions.id });
  if (rows.length > 0) {
    console.log(`[persistence] marked ${rows.length} session(s) abandoned on boot`);
  }
}

/**
 * Streams game events to the DB as they are produced.
 *
 * - open()   — inserts the game_sessions row with status='active'
 * - append() — enqueues incremental game_events writes (fire-and-forget)
 * - close()  — enqueues the final status update to 'completed'
 *
 * Writes are serialized per room via a promise chain so sequence numbers
 * stay consistent even under rapid action throughput.
 */
export class GameWriter {
  readonly sessionId: string;
  private readonly startedAt: number;
  private seq = 0;
  // Internal promise chain — each write is appended to the tail.
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: Db,
    readonly playerIds: string[],
    readonly seed: string,
  ) {
    this.sessionId = randomUUID();
    this.startedAt = Date.now();
  }

  /** Insert the session row. Called once when the game starts. */
  async open(): Promise<void> {
    await this.db.insert(schema.gameSessions).values({
      id: this.sessionId,
      status: 'active',
      playerIds: this.playerIds,
      seed: this.seed,
      startedAt: new Date(this.startedAt),
    });
  }

  /** Enqueue incremental event writes. Returns immediately. */
  append(events: readonly EngineEvent[]): void {
    if (events.length === 0) return;
    const seq = this.seq;
    this.seq += events.length;
    this.queue = this.queue
      .then(() => this.writeEvents(events, seq))
      .catch((err) => console.error('[persistence] event write failed:', err));
  }

  /** Enqueue the final status update. Awaitable for graceful shutdown. */
  async close(winnerId: string | null): Promise<void> {
    const endedAt = new Date();
    const durationMs = Date.now() - this.startedAt;
    const sessionId = this.sessionId;
    const db = this.db;
    // Chain onto the queue so this always runs after pending event writes.
    this.queue = this.queue
      .then(() =>
        db
          .update(schema.gameSessions)
          .set({
            status: 'completed',
            winnerId: winnerId ?? null,
            durationMs,
            endedAt,
          })
          .where(eq(schema.gameSessions.id, sessionId)),
      )
      .then(() => {})
      .catch((err) => console.error('[persistence] session close failed:', err));
    await this.queue;
  }

  private async writeEvents(events: readonly EngineEvent[], startSeq: number): Promise<void> {
    const now = new Date();
    await this.db.insert(schema.gameEvents).values(
      events.map((event, i) => ({
        sessionId: this.sessionId,
        sequenceNumber: startSeq + i,
        eventType: event.type,
        payload: event.payload as Record<string, unknown>,
        occurredAt: now,
      })),
    );
  }
}
