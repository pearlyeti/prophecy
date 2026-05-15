// Full-screen physics dice roll overlay — the "Results Cam".
//
// Built entirely in Three.js (r3f + drei) — same stack as the board dice.
// Uses a useFrame-based physics sim (gravity, floor bounce, angular damping)
// so no extra package is needed. Die faces use the same canvas textures as
// the board dice, showing the correct Prophecy symbol + value from the
// server-authoritative character.activated event.
//
// Architecture: "sports camera cut".
//   1. Player commits Roll Dice → activate dispatches to server simultaneously.
//   2. This overlay fires immediately, dice fall with real-feeling physics.
//   3. character.activated arrives (usually <100 ms) with the rolled faces.
//   4. Textures update; when dice settle the face overlay appears.
//   5. Player taps to dismiss → board already shows correct dice.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import type { DieFace } from '@prophecy/game-engine';
import { useApp } from '../store.js';
import { CARD_COLORS, FALLBACK_COLOR, makeFaceTexture, symLabel } from '../lib/dieFaceTexture.js';

// ── Physics constants ─────────────────────────────────────────────────────────
// All damping is time-based (per second) so behaviour is frame-rate independent.
const GRAVITY         = -22;   // m/s²  — strong pull so dice hit floor fast
const RESTITUTION     = 0.52;  // bounce fraction on floor/wall impact
const FLOOR_FRICTION  = 0.60;  // lateral speed retained on floor bounce
const WALL_RESTITUTION = 0.45; // wall bounce fraction
const ANG_DAMP_S      = 0.18;  // fraction of angular speed retained per second
const LIN_DAMP_S      = 0.82;  // fraction of linear speed retained per second (air)
const DIE_HALF        = 0.42;  // half-width of die body
const FLOOR_Y         = -1.8;  // world-space Y of floor surface
const WALL_X          =  4.2;  // ±X walls
const WALL_Z          =  3.5;  // ±Z walls
const SETTLE_VEL      = 0.06;  // combined speed threshold for "settled"
const SETTLE_SECS     = 0.5;   // must stay below threshold for this long
const FORCE_SETTLE_MS = 3000;  // hard cap — results in ≤3 s no matter what

// ── Camera ────────────────────────────────────────────────────────────────────
// Slightly cinematic: above and in front, looking down at the floor.
const CAM_POS: [number, number, number] = [0, 5, 4];

function CameraLookAt() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(0, FLOOR_Y + 0.5, 0); }, [camera]);
  return null;
}

// ── Die physics state ─────────────────────────────────────────────────────────
interface DiePhysState {
  pos:    [number, number, number];
  vel:    [number, number, number];
  rot:    [number, number, number];
  angVel: [number, number, number];
  settledFrames: number;
  settled: boolean;
}

function randomAngVel(scale: number): [number, number, number] {
  return [
    (Math.random() - 0.5) * scale,
    (Math.random() - 0.5) * scale,
    (Math.random() - 0.5) * scale,
  ];
}

// ── Single rolling die ────────────────────────────────────────────────────────
function RollingDie({
  index,
  total,
  face,
  cardColor,
  onSettled,
  forceSettle,
}: {
  index: number;
  total: number;
  face: DieFace | null;
  cardColor: string | null;
  onSettled: () => void;
  forceSettle: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const settled = useRef(false);
  const settledTime = useRef(0);

  // Throw dice from the upper-left at an angle toward the floor center.
  // Stagger slightly so 2-die rolls don't overlap.
  const stagger = (index - (total - 1) / 2) * 0.8;
  const state = useRef<DiePhysState>({
    pos: [-3.5 + stagger * 0.4, 4.5 + index * 0.5, -2 + stagger * 0.3],
    vel: [
      5.5 + (Math.random() - 0.5) * 1.5 + stagger * 0.5,  // rightward
      -4  + (Math.random() - 0.5) * 1,                     // downward
       3  + (Math.random() - 0.5) * 1,                     // toward camera
    ],
    rot: [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI],
    angVel: randomAngVel(26),
    settledFrames: 0,
    settled: false,
  });

  const { bg, text } = CARD_COLORS[cardColor ?? ''] ?? FALLBACK_COLOR;

  const texture = useMemo(() => {
    if (!face) return makeFaceTexture('blank', 0, false, bg, text);
    return makeFaceTexture(face.symbol, face.value, face.modifier, bg, text);
  }, [face, bg, text]);

  useEffect(() => () => { texture.dispose(); }, [texture]);

  // Update material texture when face info arrives.
  useEffect(() => {
    const mat = meshRef.current?.material;
    if (mat && mat instanceof THREE.MeshStandardMaterial) {
      mat.map = texture;
      mat.needsUpdate = true;
    }
  }, [texture]);

  useFrame((_, dt) => {
    if (!meshRef.current) return;

    // Force-settle snaps the die to floor level and stops it.
    if (forceSettle && !settled.current) {
      settled.current = true;
      state.current.pos[1] = FLOOR_Y + DIE_HALF;
      meshRef.current.position.set(...state.current.pos);
      onSettled();
      return;
    }
    if (settled.current) return;

    const s = state.current;
    const safeDt = Math.min(dt, 0.05); // cap dt so a tab-wake spike doesn't explode physics

    // Gravity + air damping (dt-based — frame-rate independent)
    s.vel[1] += GRAVITY * safeDt;
    const linRetain = Math.pow(LIN_DAMP_S, safeDt);
    s.vel[0] *= linRetain;
    s.vel[2] *= linRetain;

    // Integrate position
    s.pos[0] += s.vel[0] * safeDt;
    s.pos[1] += s.vel[1] * safeDt;
    s.pos[2] += s.vel[2] * safeDt;

    // Floor
    if (s.pos[1] < FLOOR_Y + DIE_HALF) {
      s.pos[1] = FLOOR_Y + DIE_HALF;
      s.vel[1] = Math.abs(s.vel[1]) * RESTITUTION;
      s.vel[0] *= FLOOR_FRICTION;
      s.vel[2] *= FLOOR_FRICTION;
      s.angVel[0] += (Math.random() - 0.5) * 3;
      s.angVel[2] += (Math.random() - 0.5) * 3;
    }

    // Side walls — bounce dice back into view
    if (s.pos[0] < -WALL_X + DIE_HALF) {
      s.pos[0] = -WALL_X + DIE_HALF;
      s.vel[0] = Math.abs(s.vel[0]) * WALL_RESTITUTION;
    }
    if (s.pos[0] > WALL_X - DIE_HALF) {
      s.pos[0] = WALL_X - DIE_HALF;
      s.vel[0] = -Math.abs(s.vel[0]) * WALL_RESTITUTION;
    }
    if (s.pos[2] < -WALL_Z + DIE_HALF) {
      s.pos[2] = -WALL_Z + DIE_HALF;
      s.vel[2] = Math.abs(s.vel[2]) * WALL_RESTITUTION;
    }
    if (s.pos[2] > WALL_Z - DIE_HALF) {
      s.pos[2] = WALL_Z - DIE_HALF;
      s.vel[2] = -Math.abs(s.vel[2]) * WALL_RESTITUTION;
    }

    // Angular damping (dt-based)
    const angRetain = Math.pow(ANG_DAMP_S, safeDt);
    s.angVel[0] *= angRetain;
    s.angVel[1] *= angRetain;
    s.angVel[2] *= angRetain;

    // Integrate rotation
    s.rot[0] += s.angVel[0] * safeDt;
    s.rot[1] += s.angVel[1] * safeDt;
    s.rot[2] += s.angVel[2] * safeDt;

    meshRef.current.position.set(...s.pos);
    meshRef.current.rotation.set(...s.rot);

    // Settle detection: combined speed below threshold for SETTLE_SECS
    const speed = Math.hypot(...s.vel) + Math.hypot(...s.angVel);
    if (speed < SETTLE_VEL) {
      settledTime.current += safeDt;
      if (settledTime.current >= SETTLE_SECS) {
        settled.current = true;
        onSettled();
      }
    } else {
      settledTime.current = 0;
    }
  });

  return (
    <RoundedBox
      ref={meshRef}
      args={[0.84, 0.84, 0.84]}
      radius={0.12}
      smoothness={3}
      position={state.current.pos}
    >
      <meshStandardMaterial map={texture} roughness={0.45} metalness={0.05} />
    </RoundedBox>
  );
}

// ── Floor ─────────────────────────────────────────────────────────────────────
function Floor() {
  return (
    <mesh position={[0, FLOOR_Y, 0]} receiveShadow={false}>
      <boxGeometry args={[24, 0.15, 24]} />
      <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
    </mesh>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  diceCount: number;
  cardColor?: string | null;
  charId: string;
  onDismiss: () => void;
}

export default function ResultsCam({ diceCount, cardColor, charId, onDismiss }: Props) {
  const [settled, setSettled] = useState(false);
  const [forceSettle, setForceSettle] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const settledCount = useRef(0);

  // Hard 3-second cap — whatever state the dice are in, show results.
  useEffect(() => {
    const t = setTimeout(() => {
      setForceSettle(true);
      setSettled(true);
    }, FORCE_SETTLE_MS);
    return () => clearTimeout(t);
  }, []);

  // Watch for the character.activated event carrying the real rolled faces.
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

  const handleDieSettled = () => {
    settledCount.current += 1;
    if (settledCount.current >= diceCount) setSettled(true);
  };

  const dismiss = () => {
    if (!settled || dismissing) return;
    setDismissing(true);
    setTimeout(onDismiss, 300);
  };

  const touchStartY = useRef<number | null>(null);

  const { bg: themeColor } = CARD_COLORS[cardColor ?? ''] ?? FALLBACK_COLOR;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-end justify-end"
      style={{
        transition: dismissing ? 'opacity 0.3s ease-out, transform 0.3s ease-out' : 'none',
        opacity: dismissing ? 0 : 1,
        transform: dismissing ? 'translateY(-24px)' : 'none',
      }}
      onClick={dismiss}
      onTouchStart={(e) => { touchStartY.current = e.touches[0]?.clientY ?? null; }}
      onTouchEnd={(e) => {
        if (touchStartY.current === null) return;
        if ((e.changedTouches[0]?.clientY ?? 0) - touchStartY.current < -40) dismiss();
        touchStartY.current = null;
      }}
    >
      {/* 3D roll cam — fills the whole screen */}
      <Canvas
        className="absolute inset-0"
        camera={{ position: CAM_POS, fov: 45, near: 0.1, far: 60 }}
        gl={{ alpha: false, antialias: true }}
        style={{ background: '#0d0d0d' }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <CameraLookAt />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 8, 4]} intensity={1.1} castShadow={false} />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />

        <Floor />

        {Array.from({ length: diceCount }).map((_, i) => (
          <RollingDie
            key={i}
            index={i}
            total={diceCount}
            face={rolledFaces[i] ?? null}
            cardColor={cardColor ?? null}
            onSettled={handleDieSettled}
            forceSettle={forceSettle}
          />
        ))}
      </Canvas>

      {/* Results overlay — fades in once all dice settle */}
      {settled && rolledFaces.length > 0 && (
        <div className="relative z-10 mb-12 flex w-full justify-center gap-4 px-8">
          {rolledFaces.map((face, i) => (
            <div
              key={i}
              className="flex min-w-[72px] flex-col items-center justify-center rounded-2xl border-2 px-5 py-4 backdrop-blur-sm"
              style={{ borderColor: themeColor, background: 'rgba(0,0,0,0.72)' }}
            >
              <span className="font-mono text-3xl font-bold text-white">
                {face.modifier ? '+' : ''}{face.value > 0 ? face.value : '—'}
              </span>
              <span className="mt-1 text-xs tracking-widest text-white/60">
                {symLabel(face.symbol)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Dismiss hint */}
      <div
        className="relative z-10 mb-8 w-full text-center transition-opacity duration-700"
        style={{ opacity: settled ? 1 : 0, pointerEvents: 'none' }}
      >
        <p className="text-sm font-medium tracking-widest text-white/50">TAP TO CONTINUE</p>
      </div>
    </div>
  );
}
