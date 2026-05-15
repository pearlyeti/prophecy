// Full-screen physics dice roll overlay — the "Results Cam".
//
// Architecture: "sports camera cut" pattern.
//   1. Player commits Roll Dice → activate action dispatches to server simultaneously.
//   2. This overlay appears and runs real Ammo.js physics with matching die color.
//   3. Server processes the action, broadcasts character.activated with rolledDice.
//   4. Once dice settle, actual Prophecy face results overlay the cam.
//   5. Player taps to dismiss → board already shows server-authoritative faces.

import DiceBox from '@3d-dice/dice-box';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DieFace } from '@prophecy/game-engine';
import { useApp } from '../store.js';

// ── card color → dice-box themeColor ────────────────────────────────────────
const THEME_COLORS: Record<string, string> = {
  red:    '#ef4444',
  blue:   '#3b82f6',
  yellow: '#facc15',
  gray:   '#9ca3af',
};

function symShort(s: string): string {
  switch (s) {
    case 'melee':    return 'MEL';
    case 'ranged':   return 'RNG';
    case 'indirect': return 'IND';
    case 'shield':   return 'SHD';
    case 'resource': return 'RES';
    case 'disrupt':  return 'DSR';
    case 'discard':  return 'DSC';
    case 'draw':     return 'DRW';
    case 'focus':    return 'FOC';
    case 'special':  return 'S';
    case 'modifier': return 'MOD';
    case 'blank':    return '—';
    default:         return s.slice(0, 3).toUpperCase();
  }
}

interface Props {
  diceCount: number;
  cardColor?: string | null;
  charId: string;
  onDismiss: () => void;
}

export default function ResultsCam({ diceCount, cardColor, charId, onDismiss }: Props) {
  const [settled, setSettled] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const boxRef = useRef<DiceBox | null>(null);

  // Watch recentEvents for the character.activated result matching our roll.
  const recentEvents = useApp((s) => s.recentEvents);
  const rolledFaces = useMemo<DieFace[]>(() => {
    for (let i = recentEvents.length - 1; i >= 0; i--) {
      const e = recentEvents[i]!;
      if (e.type === 'character.activated' && e.payload.characterId === charId) {
        return e.payload.rolledDice.map((d) => d.face);
      }
    }
    return [];
  }, [recentEvents, charId]);

  const dismiss = () => {
    if (!settled || dismissing) return;
    setDismissing(true);
    setTimeout(onDismiss, 280);
  };

  const themeColor = THEME_COLORS[cardColor ?? ''] ?? '#9ca3af';

  useEffect(() => {
    let cancelled = false;

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .dice-box-canvas {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 51 !important;
        pointer-events: none;
      }
    `;
    document.head.appendChild(styleEl);

    const run = async () => {
      const box = new DiceBox('body', {
        assetPath: '/assets/dice-box/',
        id: 'results-cam-canvas',
        offscreen: false,
        scale: 7,
        gravity: 2.5,
        startingHeight: 9,
        spinForce: 5,
        throwForce: 5,
        lightIntensity: 1.2,
        settleTimeout: 5000,
        themeColor,
        onRollComplete: () => { if (!cancelled) setSettled(true); },
      });

      await box.init();
      if (cancelled) { try { box.clear(); } catch {} return; }

      boxRef.current = box;
      await box.roll(`${diceCount}d6`);
    };

    run().catch(console.error);

    return () => {
      cancelled = true;
      document.head.removeChild(styleEl);
      try { boxRef.current?.clear(); } catch {}
      boxRef.current = null;
    };
  }, [diceCount, themeColor]);

  const touchStartY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = (e.changedTouches[0]?.clientY ?? 0) - touchStartY.current;
    if (dy < -40) dismiss();
    touchStartY.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-end"
      style={{
        background: 'rgba(0,0,0,0.88)',
        transition: dismissing ? 'opacity 0.28s ease-out, transform 0.28s ease-out' : 'none',
        opacity: dismissing ? 0 : 1,
        transform: dismissing ? 'translateY(-32px)' : 'none',
      }}
      onClick={dismiss}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Actual Prophecy die results — appear once server event arrives and dice settle */}
      {settled && rolledFaces.length > 0 && (
        <div className="relative z-60 mb-8 flex gap-3">
          {rolledFaces.map((face, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-center rounded-xl border-2 px-4 py-3"
              style={{ borderColor: themeColor, background: 'rgba(0,0,0,0.75)', minWidth: 64 }}
            >
              <span className="text-2xl font-bold font-mono text-white">
                {face.modifier ? '+' : ''}{face.value > 0 ? face.value : ''}
              </span>
              <span className="text-xs text-white/70 tracking-wider mt-0.5">
                {symShort(face.symbol)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Dismiss hint */}
      <div
        className="relative z-60 mb-10 text-center transition-opacity duration-500"
        style={{ opacity: settled ? 1 : 0, pointerEvents: 'none' }}
      >
        <p className="text-sm font-medium text-white/60 tracking-wide">
          Tap to continue
        </p>
      </div>
    </div>
  );
}
