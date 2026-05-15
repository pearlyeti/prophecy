#!/bin/bash
# SessionStart hook for Prophecy.
#
# Runs in Claude Code on the web sessions only. Installs workspace deps,
# typechecks every package, and runs the web build — the two checks that
# would have caught the Vercel build failure on PR #1 (TS2375 from
# `exactOptionalPropertyTypes` in Game.tsx).
#
# Skipped locally so that pulling this repo on a dev machine doesn't trigger
# a multi-minute boot every time Claude Code starts.

set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[session-start] pnpm install"
pnpm install

echo "[session-start] pnpm typecheck"
pnpm typecheck

echo "[session-start] pnpm --filter @prophecy/web build"
pnpm --filter @prophecy/web build

echo "[session-start] ready"
