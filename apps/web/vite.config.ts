import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Read `.env` from the monorepo root so VITE_* vars line up with the
// shared dev config used by api / game-server. Without this, Vite
// looks in apps/web/ and silently falls back to the in-code defaults.
const monorepoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: monorepoRoot,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
