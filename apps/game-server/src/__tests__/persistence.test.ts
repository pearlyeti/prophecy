import { createDb, schema } from '@prophecy/db';
import { applyAction, newGameInActionPhase } from '@prophecy/game-engine';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { GameWriter, markAbandonedSessions } from '../persistence.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgres://prophecy:prophecy@localhost:5432/prophecy';

const db = createDb(DB_URL);

const PLAYER_A = 'player-a';
const PLAYER_B = 'player-b';

describe('GameWriter end-to-end', () => {
  const sessionIds: string[] = [];

  afterAll(async () => {
    for (const id of sessionIds) {
      await db.delete(schema.gameSessions).where(eq(schema.gameSessions.id, id));
    }
  });

  it('writes session row on open, event rows incrementally, and completes on close', async () => {
    const seed = 'persistence-test-incremental';
    const game = newGameInActionPhase({
      seed,
      playerIds: [PLAYER_A, PLAYER_B],
      playerCharacters: {
        [PLAYER_A]: [{ id: 'charA', cardId: 'card-a', elite: false }],
        [PLAYER_B]: [{ id: 'charB', cardId: 'card-b', elite: false }],
      },
      playerBattlefieldCardIds: { [PLAYER_A]: 'bf-a', [PLAYER_B]: 'bf-b' },
    });

    const writer = new GameWriter(db, [PLAYER_A, PLAYER_B], seed);
    sessionIds.push(writer.sessionId);

    await writer.open();

    // Session should be 'active' immediately after open
    const [active] = await db
      .select({ status: schema.gameSessions.status })
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.id, writer.sessionId));
    expect(active?.status).toBe('active');

    const activePlayer = game.activePlayerId!;
    const result = applyAction(game, { type: 'concede', playerId: activePlayer });

    // append is fire-and-forget; close awaits the full queue
    writer.append(result.events);
    await writer.close(result.state.winnerId);

    // Assert game_sessions row is now completed
    const [session] = await db
      .select()
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.id, writer.sessionId));

    expect(session?.status).toBe('completed');
    expect(session?.playerIds).toEqual(expect.arrayContaining([PLAYER_A, PLAYER_B]));
    expect(session?.winnerId).not.toBeNull();
    expect(session?.seed).toBe(seed);
    expect(session?.durationMs).toBeGreaterThanOrEqual(0);

    // Assert all events landed with correct sequence numbers
    const events = await db
      .select()
      .from(schema.gameEvents)
      .where(eq(schema.gameEvents.sessionId, writer.sessionId));

    expect(events.length).toBe(result.events.length);
    expect(events.length).toBeGreaterThan(0);
    const seqs = events.map((e) => e.sequenceNumber).sort((a, b) => a - b);
    expect(seqs[seqs.length - 1]).toBe(result.events.length - 1);
    const lastEvent = events.find((e) => e.sequenceNumber === seqs[seqs.length - 1]);
    expect(lastEvent?.eventType).toBe('game.ended');
  });

  it('markAbandonedSessions updates active sessions on boot', async () => {
    // Insert a fake active session
    const fakeId = '00000000-0000-0000-0000-000000000001';
    sessionIds.push(fakeId);
    await db.insert(schema.gameSessions).values({
      id: fakeId,
      status: 'active',
      playerIds: ['x', 'y'],
      seed: 'boot-test',
      startedAt: new Date(),
    });

    await markAbandonedSessions(db);

    const [row] = await db
      .select({ status: schema.gameSessions.status })
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.id, fakeId));

    expect(row?.status).toBe('abandoned');
  });
});
