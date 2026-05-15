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
const GRAVITY     = -14;   // world units / s²
const RESTITUTION = 0.42;  // bounciness
const FRICTION    = 0.78;  // how much lateral velocity is kept on bounce
const ANG_DAMP    = 0.88;  // angular velocity multiplier per frame (at 60 fps)
const LIN_DAMP    = 0.995; // linear velocity air resistance per frame
const DIE_HALF    = 0.42;  // half-width of die (die is 0.84 units)
const FLOOR_Y     = -1.8;  // where the floor sits in world space
const SETTLE_VEL  = 0.04;  // speed threshold below which die is considered settled
const SETTLE_FRAMES = 40;  // consecutive frames below threshold before settled

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
}: {
  index: number;
  total: number;
  face: DieFace | null;
  cardColor: string | null;
  onSettled: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const settled = useRef(false);

  // Spread dice horizontally so they don't start in the same spot.
  const xOffset = total === 1 ? 0 : (index - (total - 1) / 2) * 1.4;

  const state = useRef<DiePhysState>({
    pos: [xOffset, 5 + index * 0.6, (Math.random() - 0.5) * 0.4],
    vel: [(Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 1],
    rot: [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, 0],
    angVel: randomAngVel(18),
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
    if (settled.current || !meshRef.current) return;
    const s = state.current;

    // Gravity
    s.vel[1] += GRAVITY * dt;

    // Linear damping (air resistance)
    s.vel[0] *= LIN_DAMP;
    s.vel[2] *= LIN_DAMP;

    // Update position
    s.pos[0] += s.vel[0] * dt;
    s.pos[1] += s.vel[1] * dt;
    s.pos[2] += s.vel[2] * dt;

    // Floor collision
    if (s.pos[1] < FLOOR_Y + DIE_HALF) {
      s.pos[1] = FLOOR_Y + DIE_HALF;
      s.vel[1] = Math.abs(s.vel[1]) * RESTITUTION;
      s.vel[0] *= FRICTION;
      s.vel[2] *= FRICTION;
      // Impact randomises angular velocity slightly for visual variety
      s.angVel[0] += (Math.random() - 0.5) * 2;
      s.angVel[2] += (Math.random() - 0.5) * 2;
    }

    // Update rotation
    s.rot[0] += s.angVel[0] * dt;
    s.rot[1] += s.angVel[1] * dt;
    s.rot[2] += s.angVel[2] * dt;

    // Angular damping
    s.angVel[0] *= ANG_DAMP;
    s.angVel[1] *= ANG_DAMP;
    s.angVel[2] *= ANG_DAMP;

    // Apply to mesh
    meshRef.current.position.set(...s.pos);
    meshRef.current.rotation.set(...s.rot);

    // Settle detection
    const speed = Math.hypot(...s.vel) + Math.hypot(...s.angVel);
    if (speed < SETTLE_VEL) {
      s.settledFrames += 1;
      if (s.settledFrames >= SETTLE_FRAMES) {
        settled.current = true;
        onSettled();
      }
    } else {
      s.settledFrames = 0;
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
  const [dismissing, setDismissing] = useState(false);
  const settledCount = useRef(0);

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
