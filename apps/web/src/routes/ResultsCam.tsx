// Full-screen physics dice roll overlay — the "Results Cam".
//
// Lazy-loaded via React.lazy so the dice-box WASM (~2 MB) only enters the
// bundle when the game route is visited. The Game component kicks off the
// dynamic import at game-start (background) so the module is warm by the
// time the first Roll Dice commit fires.
//
// Architecture: "sports camera cut" pattern.
//   1. Player commits Roll Dice → activate action dispatches to server.
//   2. This overlay appears and runs real Ammo.js physics.
//   3. Server processes the action, broadcasts updated game state.
//   4. Player taps to dismiss → overlay sweeps away.
//   5. Board (WEB-3D-1 Three.js dice) already shows server-authoritative
//      faces. No result bridging needed — the cut handles the transition.

import DiceBox from '@3d-dice/dice-box';
import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Number of dice to roll (1 for non-elite, 2 for elite). */
  diceCount: number;
  onDismiss: () => void;
}

export default function ResultsCam({ diceCount, onDismiss }: Props) {
  const [settled, setSettled] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const boxRef = useRef<DiceBox | null>(null);

  const dismiss = () => {
    if (!settled || dismissing) return;
    setDismissing(true);
    // Brief sweep-out animation, then unmount.
    setTimeout(onDismiss, 280);
  };

  useEffect(() => {
    let box: DiceBox | null = null;

    const run = async () => {
      box = new DiceBox('#results-cam-canvas', {
        assetPath: '/assets/dice-box/',
        id: 'results-cam-canvas',
        offscreen: false,       // wider compatibility (iOS)
        scale: 7,
        gravity: 2.5,
        startingHeight: 9,
        spinForce: 5,
        throwForce: 5,
        lightIntensity: 1.2,
        settleTimeout: 5000,
        onRollComplete: () => setSettled(true),
      });

      await box.init();
      boxRef.current = box;

      // Roll one or two d6s — Prophecy dice are 6-sided.
      // Physics is purely cosmetic here; the server-authoritative result
      // already drives the board the moment the activate event arrives.
      await box.roll(`${diceCount}d6`);
    };

    run().catch(console.error);

    return () => {
      box?.clear();
      boxRef.current = null;
    };
  }, [diceCount]);

  // Swipe-up gesture: track touch start Y, dismiss on upward flick.
  const touchStartY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = (e.changedTouches[0]?.clientY ?? 0) - touchStartY.current;
    if (dy < -40) dismiss(); // upward flick ≥ 40px
    touchStartY.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-end"
      style={{
        background: 'rgba(0,0,0,0.92)',
        transition: dismissing ? 'opacity 0.28s ease-out, transform 0.28s ease-out' : 'none',
        opacity: dismissing ? 0 : 1,
        transform: dismissing ? 'translateY(-32px)' : 'none',
      }}
      onClick={dismiss}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* dice-box mounts its canvas inside this div */}
      <div id="results-cam-canvas" className="absolute inset-0" />

      {/* Dismiss hint — fades in once dice have settled */}
      <div
        className="relative z-10 mb-16 text-center transition-opacity duration-500"
        style={{ opacity: settled ? 1 : 0, pointerEvents: 'none' }}
      >
        <p className="text-sm font-medium text-white/70 tracking-wide">
          Tap to continue
        </p>
      </div>
    </div>
  );
}
