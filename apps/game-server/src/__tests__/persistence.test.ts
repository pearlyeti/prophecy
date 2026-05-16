import { createDb, schema } from '@prophecy/db';
import { applyAction, newGameInActionPhase } from '@prophecy/game-engine';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { GameWriter } from '../persistence.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgres://prophecy:prophecy@localhost:5432/prophecy';

const db = createDb(DB_URL);

const PLAYER_A = 'player-a';
const PLAYER_B = 'player-b';

describe('GameWriter end-to-end', () => {
  let sessionId: string;

  afterAll(async () => {
    // Clean up test rows
    if (sessionId) {
      await db.delete(schema.gameSessions).where(eq(schema.gameSessions.id, sessionId));
    }
  });

  it('persists game_sessions and game_events rows after a concede', async () => {
    const seed = 'persistence-test-seed';
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
    sessionId = writer.sessionId;

    const activePlayer = game.activePlayerId!;
    const result = applyAction(game, { type: 'concede', playerId: activePlayer });

    writer.append(result.events);
    await writer.flush(result.state.winnerId);

    // Assert game_sessions row
    const [session] = await db
      .select()
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.id, sessionId));

    expect(session).toBeDefined();
    expect(session!.playerIds).toEqual(expect.arrayContaining([PLAYER_A, PLAYER_B]));
    expect(session!.winnerId).not.toBeNull();
    expect(session!.seed).toBe(seed);
    expect(session!.durationMs).toBeGreaterThanOrEqual(0);

    // Assert game_events rows
    const events = await db
      .select()
      .from(schema.gameEvents)
      .where(eq(schema.gameEvents.sessionId, sessionId));

    expect(events.length).toBe(result.events.length);
    expect(events.length).toBeGreaterThan(0);

    // Events are in sequence order
    const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    expect(sorted[sorted.length - 1]!.eventType).toBe('game.ended');
  });
});
