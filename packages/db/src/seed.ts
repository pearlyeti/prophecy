// Production seed loader. Loads original Prophecy cards from
// `seed/cards/` (not yet authored). Reference-set fixtures under
// packages/game-engine/__fixtures__/ are NEVER loaded here.

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

console.log('Seed runner: nothing to seed yet. Card pool authoring is post-bootstrap.');
