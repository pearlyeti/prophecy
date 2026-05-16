import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    server: {
      deps: {
        inline: ['@prophecy/db', '@prophecy/game-engine', '@prophecy/protocol'],
      },
    },
  },
});
