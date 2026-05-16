import { createDb, schema } from '@prophecy/db';
import type { EngineEvent } from '@prophecy/game-engine';
import { randomUUID } from 'node:crypto';

type Db = ReturnType<typeof createDb>;

const DB_URL =
  process.env.DATABASE_URL ?? 'postgres://prophecy:prophecy@localhost:5432/prophecy';

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = createDb(DB_URL);
  return _db;
}

export class GameWriter {
  readonly sessionId: string;
  private readonly startedAt: number;
  private seq = 0;
  private buffered: Array<{ event: EngineEvent; seq: number }> = [];

  constructor(
    private readonly db: Db,
    readonly playerIds: string[],
    readonly seed: string,
  ) {
    this.sessionId = randomUUID();
    this.startedAt = Date.now();
  }

  append(events: readonly EngineEvent[]): void {
    for (const event of events) {
      this.buffered.push({ event, seq: this.seq++ });
    }
  }

  async flush(winnerId: string | null): Promise<void> {
    const endedAt = new Date();
    const durationMs = Date.now() - this.startedAt;
    const { sessionId, buffered } = this;

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.gameSessions).values({
        id: sessionId,
        playerIds: this.playerIds,
        winnerId: winnerId ?? null,
        durationMs,
        seed: this.seed,
        startedAt: new Date(this.startedAt),
        endedAt,
      });

      if (buffered.length > 0) {
        await tx.insert(schema.gameEvents).values(
          buffered.map(({ event, seq }) => ({
            sessionId,
            sequenceNumber: seq,
            eventType: event.type,
            payload: event.payload as Record<string, unknown>,
            occurredAt: endedAt,
          })),
        );
      }
    });
  }
}
