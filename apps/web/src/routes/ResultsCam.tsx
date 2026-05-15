// Full-screen physics dice roll overlay — the "Results Cam".
//
// Each die has 6 different face textures (the actual Prophecy faces for that
// character's die). Physics rolls freely showing all 6 faces. When the die
// settles, it slerps to the correct Euler rotation so the server-determined
// face lands on top — matching what the board shows after the cut.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import type { CardDie, DieFace } from '@prophecy/game-engine';
import { useApp } from '../store.js';
import { CARD_COLORS, FALLBACK_COLOR, makeFaceTexture, symLabel } from '../lib/dieFaceTexture.js';

// ── Physics constants (all damping is per-second, frame-rate independent) ─────
const GRAVITY          = -22;
const RESTITUTION      = 0.50;
const FLOOR_FRICTION   = 0.58;
const WALL_RESTITUTION = 0.42;
const ANG_DAMP_S       = 0.15;   // fraction of angular speed retained per second
const LIN_DAMP_S       = 0.80;   // fraction of linear speed retained per second
const DIE_HALF         = 0.42;
const FLOOR_Y          = -1.8;
const WALL_X           = 4.2;
const WALL_Z           = 3.5;
const SETTLE_VEL       = 0.06;
const SETTLE_SECS      = 0.5;
const FORCE_SETTLE_MS  = 3000;

// ── Euler rotation that puts each Box material face on top (+Y world-space) ───
// Three.js BoxGeometry material order: +X=0, -X=1, +Y=2, -Y=3, +Z=4, -Z=5
// We map Prophecy face index k → material index k, so face k is on material k.
const FACE_UP_EULER: [number, number, number][] = [
  [ 0,             0, -Math.PI / 2],  // mat 0 (+X) → top
  [ 0,             0,  Math.PI / 2],  // mat 1 (-X) → top
  [ 0,             0,  0          ],  // mat 2 (+Y) → top (identity)
  [ Math.PI,       0,  0          ],  // mat 3 (-Y) → top
  [-Math.PI / 2,   0,  0          ],  // mat 4 (+Z) → top
  [ Math.PI / 2,   0,  0          ],  // mat 5 (-Z) → top
];

// ── Camera ────────────────────────────────────────────────────────────────────
const CAM_POS: [number, number, number] = [0, 5, 4];

function CameraLookAt() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(0, FLOOR_Y + 0.5, 0); }, [camera]);
  return null;
}

// ── Single rolling die ────────────────────────────────────────────────────────
function RollingDie({
  index, total, die, cardColor, rolledFaceIndex, forceSettle, onSettled,
}: {
  index: number;
  total: number;
  die: CardDie;
  cardColor: string | null;
  rolledFaceIndex: number | null;
  forceSettle: boolean;
  onSettled: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const physActive   = useRef(true);
  const settling     = useRef(false);
  const doneRef      = useRef(false);
  const settledTime  = useRef(0);
  const targetQ      = useRef(new THREE.Quaternion());
  const targetSet    = useRef(false);

  const { bg, text } = CARD_COLORS[cardColor ?? ''] ?? FALLBACK_COLOR;

  // Six textures — one per die face. Prophecy face k → material slot k.
  const textures = useMemo(
    () => die.faces.map((f) => makeFaceTexture(f.symbol, f.value, f.modifier, bg, text)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bg, text, ...die.faces.map((f) => `${f.symbol}${f.value}${f.modifier}`)],
  );
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  // Compute target quaternion as soon as we know which face was rolled.
  useEffect(() => {
    if (rolledFaceIndex == null) return;
    const euler = FACE_UP_EULER[rolledFaceIndex] ?? FACE_UP_EULER[2]!;
    targetQ.current.setFromEuler(new THREE.Euler(...euler));
    targetSet.current = true;
    // If physics already stopped waiting for the face, start settling now.
    if (!physActive.current && !doneRef.current) settling.current = true;
  }, [rolledFaceIndex]);

  // Throw direction: from upper-left, aimed toward floor center.
  const stagger = (index - (total - 1) / 2) * 0.8;
  const phys = useRef({
    pos: [-3.5 + stagger * 0.4, 4.5 + index * 0.5, -2 + stagger * 0.3] as [number, number, number],
    vel: [
       5.5 + (Math.random() - 0.5) * 1.5 + stagger * 0.5,
      -4.0 + (Math.random() - 0.5) * 1.0,
       3.0 + (Math.random() - 0.5) * 1.0,
    ] as [number, number, number],
    rot:    [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI] as [number, number, number],
    angVel: [(Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26] as [number, number, number],
  });

  // Force-settle: stop physics, jump straight to settling slerp.
  useEffect(() => {
    if (!forceSettle || doneRef.current) return;
    physActive.current = false;
    if (targetSet.current) settling.current = true;
    else doneRef.current = true; // no face data — just stay wherever
  }, [forceSettle]);

  useFrame((_, dt) => {
    if (!meshRef.current || doneRef.current) return;
    const safe = Math.min(dt, 0.05);
    const s = phys.current;

    // ── Phase 1: physics ─────────────────────────────────────────────────
    if (physActive.current) {
      s.vel[1] += GRAVITY * safe;
      const linR = Math.pow(LIN_DAMP_S, safe);
      s.vel[0] *= linR; s.vel[2] *= linR;

      s.pos[0] += s.vel[0] * safe;
      s.pos[1] += s.vel[1] * safe;
      s.pos[2] += s.vel[2] * safe;

      // Floor
      if (s.pos[1] < FLOOR_Y + DIE_HALF) {
        s.pos[1] = FLOOR_Y + DIE_HALF;
        s.vel[1] = Math.abs(s.vel[1]) * RESTITUTION;
        s.vel[0] *= FLOOR_FRICTION; s.vel[2] *= FLOOR_FRICTION;
        s.angVel[0] += (Math.random() - 0.5) * 3;
        s.angVel[2] += (Math.random() - 0.5) * 3;
      }
      // Walls
      if (s.pos[0] < -WALL_X + DIE_HALF) { s.pos[0] = -WALL_X + DIE_HALF; s.vel[0] =  Math.abs(s.vel[0]) * WALL_RESTITUTION; }
      if (s.pos[0] >  WALL_X - DIE_HALF) { s.pos[0] =  WALL_X - DIE_HALF; s.vel[0] = -Math.abs(s.vel[0]) * WALL_RESTITUTION; }
      if (s.pos[2] < -WALL_Z + DIE_HALF) { s.pos[2] = -WALL_Z + DIE_HALF; s.vel[2] =  Math.abs(s.vel[2]) * WALL_RESTITUTION; }
      if (s.pos[2] >  WALL_Z - DIE_HALF) { s.pos[2] =  WALL_Z - DIE_HALF; s.vel[2] = -Math.abs(s.vel[2]) * WALL_RESTITUTION; }

      const angR = Math.pow(ANG_DAMP_S, safe);
      s.angVel[0] *= angR; s.angVel[1] *= angR; s.angVel[2] *= angR;

      s.rot[0] += s.angVel[0] * safe;
      s.rot[1] += s.angVel[1] * safe;
      s.rot[2] += s.angVel[2] * safe;

      meshRef.current.position.set(...s.pos);
      meshRef.current.rotation.set(...s.rot);

      // Settle check
      const speed = Math.hypot(...s.vel) + Math.hypot(...s.angVel);
      if (speed < SETTLE_VEL) {
        settledTime.current += safe;
        if (settledTime.current >= SETTLE_SECS) {
          physActive.current = false;
          if (targetSet.current) settling.current = true;
          else doneRef.current = true; // face not yet known; stay put
        }
      } else {
        settledTime.current = 0;
      }
    }

    // ── Phase 2: slerp to correct face orientation ───────────────────────
    if (settling.current) {
      meshRef.current.position.set(...s.pos); // keep position fixed
      meshRef.current.quaternion.slerp(targetQ.current, Math.min(1, safe * 7));
      if (meshRef.current.quaternion.angleTo(targetQ.current) < 0.01) {
        meshRef.current.quaternion.copy(targetQ.current);
        settling.current = false;
        doneRef.current  = true;
        onSettled();
      }
    }
  });

  return (
    <RoundedBox
      ref={meshRef}
      args={[0.84, 0.84, 0.84]}
      radius={0.12}
      smoothness={3}
      position={phys.current.pos}
    >
      {textures.map((tex, i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          map={tex}
          roughness={0.45}
          metalness={0.05}
        />
      ))}
    </RoundedBox>
  );
}

// ── Floor ─────────────────────────────────────────────────────────────────────
function Floor() {
  return (
    <mesh position={[0, FLOOR_Y, 0]}>
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
  dice: readonly CardDie[];
  onDismiss: () => void;
}

export default function ResultsCam({ diceCount, cardColor, charId, dice, onDismiss }: Props) {
  const [settled, setSettled]     = useState(false);
  const [forceSettle, setForceSettle] = useState(false);
  const [dismissing, setDismissing]   = useState(false);
  const settledCount = useRef(0);

  // Hard 3-second cap.
  useEffect(() => {
    const t = setTimeout(() => { setForceSettle(true); setSettled(true); }, FORCE_SETTLE_MS);
    return () => clearTimeout(t);
  }, []);

  // Read character.activated event for rolled face indices.
  const recentEvents = useApp((s) => s.recentEvents);
  const rolledDice = useMemo(() => {
    for (let i = recentEvents.length - 1; i >= 0; i--) {
      const e = recentEvents[i]!;
      if (e.type === 'character.activated' && e.payload.characterId === charId) {
        return e.payload.rolledDice; // [{ instanceId, faceIndex, face }]
      }
    }
    return null;
  }, [recentEvents, charId]);

  // Map instanceId → faceIndex for each die.
  const faceIndexByInstanceId = useMemo(() => {
    if (!rolledDice) return new Map<string, number>();
    return new Map(rolledDice.map((d) => [d.instanceId, d.faceIndex]));
  }, [rolledDice]);

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

  // Collect the rolled faces in order for the results overlay.
  const rolledFaces: DieFace[] = useMemo(
    () => dice.map((d) => {
      const fi = faceIndexByInstanceId.get(d.instanceId);
      return fi != null ? d.faces[fi]! : null!;
    }).filter(Boolean),
    [dice, faceIndexByInstanceId],
  );

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
      <Canvas
        className="absolute inset-0"
        camera={{ position: CAM_POS, fov: 45, near: 0.1, far: 60 }}
        gl={{ alpha: false, antialias: true }}
        style={{ background: '#0d0d0d' }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <CameraLookAt />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 8, 4]} intensity={1.1} />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />
        <Floor />
        {dice.slice(0, diceCount).map((d, i) => (
          <RollingDie
            key={d.instanceId}
            index={i}
            total={diceCount}
            die={d}
            cardColor={cardColor ?? null}
            rolledFaceIndex={faceIndexByInstanceId.get(d.instanceId) ?? null}
            forceSettle={forceSettle}
            onSettled={handleDieSettled}
          />
        ))}
      </Canvas>

      {/* Results — appear once all dice have settled to their correct face */}
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

      <div
        className="relative z-10 mb-8 w-full text-center transition-opacity duration-700"
        style={{ opacity: settled ? 1 : 0, pointerEvents: 'none' }}
      >
        <p className="text-sm font-medium tracking-widest text-white/50">TAP TO CONTINUE</p>
      </div>
    </div>
  );
}
