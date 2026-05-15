// Full-screen physics dice roll overlay — the "Results Cam".
//
// Walls are derived from the camera frustum at floor level so they line up
// with the actual screen edges. Dice enter from just outside those bounds
// already spinning at full speed — no stationary start.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import type { CardDie, DieFace } from '@prophecy/game-engine';
import { useApp } from '../store.js';
import { CARD_COLORS, FALLBACK_COLOR, makeFaceTexture, symLabel } from '../lib/dieFaceTexture.js';

// ── Physics (all damping per-second, frame-rate independent) ──────────────────
const GRAVITY         = -24;
const RESTITUTION     = 0.52;
const FLOOR_FRICTION  = 0.55;
const WALL_RESTITUTION= 0.50;
const ANG_DAMP_S      = 0.12;   // retain 12% angular speed per second → full stop ~3s
const LIN_DAMP_S      = 0.82;
const DIE_HALF        = 0.42;
const FLOOR_Y         = -1.8;
const SETTLE_VEL      = 0.07;
const SETTLE_SECS     = 0.45;
const FORCE_SETTLE_MS = 3000;

// ── Camera ────────────────────────────────────────────────────────────────────
const CAM_POS: [number, number, number] = [0, 5, 4];
const CAM_TARGET = new THREE.Vector3(0, FLOOR_Y + 0.4, 0);

function CameraLookAt() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(CAM_TARGET); }, [camera]);
  return null;
}

// ── Frustum bounds at floor level ─────────────────────────────────────────────
// Projects screen corners through the camera onto the floor plane (y = FLOOR_Y)
// so wall collisions line up with the physical screen edges.
interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

function getFloorBounds(camera: THREE.Camera): Bounds {
  const ndcCorners = [
    new THREE.Vector3(-1, -1, 0.5),
    new THREE.Vector3( 1, -1, 0.5),
    new THREE.Vector3( 1,  1, 0.5),
    new THREE.Vector3(-1,  1, 0.5),
  ];
  const camPos = camera.position;
  const pts = ndcCorners.map((ndc) => {
    const world = ndc.clone().unproject(camera);
    const dir   = world.sub(camPos.clone()).normalize();
    if (Math.abs(dir.y) < 0.0001) return new THREE.Vector3(0, FLOOR_Y, 0);
    const t = (FLOOR_Y - camPos.y) / dir.y;
    return camPos.clone().addScaledVector(dir, t);
  });
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minZ: Math.min(...pts.map((p) => p.z)),
    maxZ: Math.max(...pts.map((p) => p.z)),
  };
}

// ── Face up rotations ─────────────────────────────────────────────────────────
// Euler that puts BoxGeometry material face k onto +Y (visible from above).
// Material order: +X=0, -X=1, +Y=2, -Y=3, +Z=4, -Z=5
const FACE_UP_EULER: [number, number, number][] = [
  [ 0,           0, -Math.PI / 2],
  [ 0,           0,  Math.PI / 2],
  [ 0,           0,  0          ],
  [ Math.PI,     0,  0          ],
  [-Math.PI / 2, 0,  0          ],
  [ Math.PI / 2, 0,  0          ],
];

// ── Single die ────────────────────────────────────────────────────────────────
function RollingDie({
  index, total, die, cardColor, rolledFaceIndex, forceSettle, bounds, onSettled,
}: {
  index: number;
  total: number;
  die: CardDie;
  cardColor: string | null;
  rolledFaceIndex: number | null;
  forceSettle: boolean;
  bounds: Bounds;
  onSettled: () => void;
}) {
  const meshRef    = useRef<THREE.Mesh>(null);
  const physActive = useRef(true);
  const settling   = useRef(false);
  const doneRef    = useRef(false);
  const settledTime= useRef(0);
  const targetQ    = useRef(new THREE.Quaternion());
  const targetSet  = useRef(false);

  const { bg, text } = CARD_COLORS[cardColor ?? ''] ?? FALLBACK_COLOR;

  const textures = useMemo(
    () => die.faces.map((f) => makeFaceTexture(f.symbol, f.value, f.modifier, bg, text)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bg, text, ...die.faces.map((f) => `${f.symbol}${f.value}${f.modifier}`)],
  );
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  // Compute target quaternion when the rolled face is known.
  useEffect(() => {
    if (rolledFaceIndex == null) return;
    const euler = FACE_UP_EULER[rolledFaceIndex] ?? FACE_UP_EULER[2]!;
    targetQ.current.setFromEuler(new THREE.Euler(...euler));
    targetSet.current = true;
    if (!physActive.current && !doneRef.current) settling.current = true;
  }, [rolledFaceIndex]);

  useEffect(() => {
    if (!forceSettle || doneRef.current) return;
    physActive.current = false;
    if (targetSet.current) settling.current = true;
    else { doneRef.current = true; onSettled(); }
  }, [forceSettle, onSettled]);

  // Entry: from just off the left screen edge, already at speed + full spin.
  // Stagger multiple dice vertically so they don't stack exactly.
  const stagger = (index - (total - 1) / 2);
  const entryX  = bounds.minX - DIE_HALF - 0.2;
  const midZ    = (bounds.minZ + bounds.maxZ) / 2;

  const phys = useRef({
    pos: [
      entryX,
      FLOOR_Y + 1.2 + index * 0.4,
      midZ + stagger * 0.8 + (Math.random() - 0.5) * 0.4,
    ] as [number, number, number],
    vel: [
      13 + Math.random() * 5,                // fast entry rightward
      -2 + (Math.random() - 0.5) * 1.5,      // slight downward
      (Math.random() - 0.5) * 4,             // z variation
    ] as [number, number, number],
    rot: [
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    ] as [number, number, number],
    angVel: [
      (Math.random() - 0.5) * 38,
      (Math.random() - 0.5) * 38,
      (Math.random() - 0.5) * 38,
    ] as [number, number, number],
  });

  useFrame((_, dt) => {
    if (!meshRef.current || doneRef.current) return;
    const safe = Math.min(dt, 0.05);
    const s = phys.current;

    if (physActive.current) {
      // Gravity + air damping
      s.vel[1] += GRAVITY * safe;
      const lr = Math.pow(LIN_DAMP_S, safe);
      s.vel[0] *= lr; s.vel[2] *= lr;

      s.pos[0] += s.vel[0] * safe;
      s.pos[1] += s.vel[1] * safe;
      s.pos[2] += s.vel[2] * safe;

      // Floor
      if (s.pos[1] < FLOOR_Y + DIE_HALF) {
        s.pos[1] = FLOOR_Y + DIE_HALF;
        s.vel[1] = Math.abs(s.vel[1]) * RESTITUTION;
        s.vel[0] *= FLOOR_FRICTION;
        s.vel[2] *= FLOOR_FRICTION;
        s.angVel[0] += (Math.random() - 0.5) * 4;
        s.angVel[2] += (Math.random() - 0.5) * 4;
      }

      // Screen-edge walls (exact frustum bounds)
      if (s.pos[0] < bounds.minX + DIE_HALF) {
        s.pos[0] = bounds.minX + DIE_HALF;
        s.vel[0] =  Math.abs(s.vel[0]) * WALL_RESTITUTION;
        s.angVel[1] += (Math.random() - 0.5) * 5;
      }
      if (s.pos[0] > bounds.maxX - DIE_HALF) {
        s.pos[0] = bounds.maxX - DIE_HALF;
        s.vel[0] = -Math.abs(s.vel[0]) * WALL_RESTITUTION;
        s.angVel[1] += (Math.random() - 0.5) * 5;
      }
      if (s.pos[2] < bounds.minZ + DIE_HALF) {
        s.pos[2] = bounds.minZ + DIE_HALF;
        s.vel[2] =  Math.abs(s.vel[2]) * WALL_RESTITUTION;
        s.angVel[0] += (Math.random() - 0.5) * 5;
      }
      if (s.pos[2] > bounds.maxZ - DIE_HALF) {
        s.pos[2] = bounds.maxZ - DIE_HALF;
        s.vel[2] = -Math.abs(s.vel[2]) * WALL_RESTITUTION;
        s.angVel[0] += (Math.random() - 0.5) * 5;
      }

      // Angular damping
      const ar = Math.pow(ANG_DAMP_S, safe);
      s.angVel[0] *= ar; s.angVel[1] *= ar; s.angVel[2] *= ar;

      s.rot[0] += s.angVel[0] * safe;
      s.rot[1] += s.angVel[1] * safe;
      s.rot[2] += s.angVel[2] * safe;

      meshRef.current.position.set(...s.pos);
      meshRef.current.rotation.set(...s.rot);

      const speed = Math.hypot(...s.vel) + Math.hypot(...s.angVel);
      if (speed < SETTLE_VEL) {
        settledTime.current += safe;
        if (settledTime.current >= SETTLE_SECS) {
          physActive.current = false;
          if (targetSet.current) settling.current = true;
          else doneRef.current = true;
        }
      } else {
        settledTime.current = 0;
      }
    }

    // Slerp to correct face orientation
    if (settling.current) {
      meshRef.current.position.set(...s.pos);
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

// ── Scene — inside Canvas so it can call useThree for frustum bounds ──────────
function DiceScene({
  dice, diceCount, cardColor, faceIndexByInstanceId, forceSettle, onDieSettled,
}: {
  dice: readonly CardDie[];
  diceCount: number;
  cardColor: string | null;
  faceIndexByInstanceId: Map<string, number>;
  forceSettle: boolean;
  onDieSettled: () => void;
}) {
  const { camera, size } = useThree();

  // Recompute bounds when camera or canvas size changes.
  const bounds = useMemo(
    () => getFloorBounds(camera),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera, size.width, size.height],
  );

  return (
    <>
      <CameraLookAt />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 8, 4]} intensity={1.1} />
      <directionalLight position={[-3, 4, -2]} intensity={0.3} />

      {/* Floor */}
      <mesh position={[0, FLOOR_Y, 0]}>
        <boxGeometry args={[24, 0.15, 24]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
      </mesh>

      {dice.slice(0, diceCount).map((d, i) => (
        <RollingDie
          key={d.instanceId}
          index={i}
          total={diceCount}
          die={d}
          cardColor={cardColor}
          rolledFaceIndex={faceIndexByInstanceId.get(d.instanceId) ?? null}
          forceSettle={forceSettle}
          bounds={bounds}
          onSettled={onDieSettled}
        />
      ))}
    </>
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
  const [settled,     setSettled]     = useState(false);
  const [forceSettle, setForceSettle] = useState(false);
  const [dismissing,  setDismissing]  = useState(false);
  const settledCount = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setForceSettle(true); setSettled(true); }, FORCE_SETTLE_MS);
    return () => clearTimeout(t);
  }, []);

  const recentEvents = useApp((s) => s.recentEvents);
  const rolledDice = useMemo(() => {
    for (let i = recentEvents.length - 1; i >= 0; i--) {
      const e = recentEvents[i]!;
      if (e.type === 'character.activated' && e.payload.characterId === charId) {
        return e.payload.rolledDice;
      }
    }
    return null;
  }, [recentEvents, charId]);

  const faceIndexByInstanceId = useMemo(
    () => new Map((rolledDice ?? []).map((d) => [d.instanceId, d.faceIndex])),
    [rolledDice],
  );

  const rolledFaces: DieFace[] = useMemo(
    () => dice.map((d) => {
      const fi = faceIndexByInstanceId.get(d.instanceId);
      return fi != null ? d.faces[fi]! : null!;
    }).filter(Boolean),
    [dice, faceIndexByInstanceId],
  );

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
      <Canvas
        className="absolute inset-0"
        camera={{ position: CAM_POS, fov: 45, near: 0.1, far: 60 }}
        gl={{ alpha: false, antialias: true }}
        style={{ background: '#0d0d0d' }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <DiceScene
          dice={dice}
          diceCount={diceCount}
          cardColor={cardColor ?? null}
          faceIndexByInstanceId={faceIndexByInstanceId}
          forceSettle={forceSettle}
          onDieSettled={handleDieSettled}
        />
      </Canvas>

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
