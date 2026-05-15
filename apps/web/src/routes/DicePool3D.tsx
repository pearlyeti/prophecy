// 3D dice pool rendered with Three.js (react-three-fiber + drei).
// Lazy-loaded — the bundle only loads when the game route is visited.
// Used as a drop-in replacement for the flat DiceStack component.
//
// Architecture: one Canvas per player zone (not per die) — a single
// WebGL context per zone keeps the context count low (browsers cap at ~16).

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { FacePickEvent } from '../store.js';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { DieInPool, DieSymbol } from '@prophecy/game-engine';
import { useApp, type SelectionMode } from '../store.js';
import { CARD_COLORS, FALLBACK_COLOR, makeFaceTexture } from '../lib/dieFaceTexture.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DIE_SIZE = 0.8;           // world units
const DIE_RADIUS = 0.12;        // chamfer radius — matches physical dice
const DIE_SPACING = 1.05;       // center-to-center spacing
const CANVAS_HEIGHT_PX = 64;    // px — overhead perspective needs a touch more vertical space

// Camera stays centered on X so the die row doesn't shift in screen space.
// Z=0.9 provides the overhead-with-depth look (bottom-of-screen tilt).
// The "left" component of the perspective comes from the die's rest rotation below.
const CAM_POS: [number, number, number] = [0, 2.5, 0.9];
const CAM_FOV = 40;

// Points the camera at the dice origin after mount.
// r3f positions the camera but doesn't auto-aim it for perspective cameras.
function CameraLookAt() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(0, 0, 0); }, [camera]);
  return null;
}


// ── Single die mesh ───────────────────────────────────────────────────────────

type DieState = 'default' | 'eligible' | 'selected-resolve' | 'selected-reroll' | 'dimmed';

function Die3D({
  die,
  position,
  baseColor,
  textColor,
  state,
  isTumbling,
  onClick,
}: {
  die: DieInPool;
  position: [number, number, number];
  baseColor: string;
  textColor: string;
  state: DieState;
  isTumbling: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Mario Party tumble: rapid multi-axis spin on pre-roll activation
  useFrame((_, dt) => {
    if (!isTumbling || !meshRef.current) return;
    meshRef.current.rotation.x += dt * 7.0;
    meshRef.current.rotation.y += dt * 5.3;
    meshRef.current.rotation.z += dt * 3.1;
  });

  const texture = useMemo(
    () => makeFaceTexture(die.face.symbol, die.face.value, die.face.modifier, baseColor, textColor),
    [die.face.symbol, die.face.value, die.face.modifier, baseColor, textColor],
  );
  useEffect(() => () => { texture.dispose(); }, [texture]);

  // Slight Y rotation shows the left face without shifting the die's screen position.
  // Camera stays centered (X=0); this rotation adds the "bottom-left" look per die.
  const rotation: [number, number, number] = isTumbling ? [0, 0, 0] : [0, -0.18, 0];

  // Emissive tint communicates selection / eligibility without changing geometry.
  const emissive =
    state === 'selected-resolve' ? '#064e3b' :
    state === 'selected-reroll'  ? '#451a03' :
    state === 'eligible'         ? '#052e16' :
    '#000000';
  const emissiveIntensity =
    state === 'selected-resolve' ? 0.9 :
    state === 'selected-reroll'  ? 0.9 :
    state === 'eligible'         ? 0.35 :
    0;
  // Dimmed dice get a dark color multiplier overtop of the texture
  const colorMultiplier = state === 'dimmed' ? '#2a2a2a' : '#ffffff';

  return (
    <RoundedBox
      ref={meshRef}
      args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]}
      radius={DIE_RADIUS}
      smoothness={3}
      position={position}
      rotation={rotation}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <meshStandardMaterial
        map={texture}
        color={colorMultiplier}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={0.45}
        metalness={0.05}
      />
    </RoundedBox>
  );
}

// ── Same canSelectDie / canRerollDie logic as Game.tsx ───────────────────────

function canSelectDie3D(d: DieInPool, lockedSymbol: DieSymbol | null): boolean {
  const s = d.face.symbol;
  if (s === 'blank') return false;
  if (s === 'special' || s === 'indirect' || s === 'discard' || s === 'draw') return false;
  if (s === 'focus') return lockedSymbol === null; // focuser only as first tap
  if (lockedSymbol === null) return !d.face.modifier;
  return s === lockedSymbol || s === 'modifier';
}

function canRerollDie3D(d: DieInPool): boolean {
  return d.face.symbol !== 'blank';
}

// ── Public component ─────────────────────────────────────────────────────────

export interface DicePool3DProps {
  dice: DieInPool[];
  diceInteractive: boolean;
  selectionMode: SelectionMode | null;
  horizontal?: boolean;
  eligibleSymbols?: readonly string[];
  /** Card color for die face color. */
  cardColor?: string | null;
  /**
   * Character instance id currently in the activate flow.
   * Dice owned by this character tumble (pre-roll anticipation).
   */
  tumblingCharId?: string | null;
}

export default function DicePool3D({
  dice,
  diceInteractive,
  selectionMode,
  eligibleSymbols,
  cardColor,
  tumblingCharId,
}: DicePool3DProps) {
  const activeFlow    = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);
  const toggleSelectedDie = useApp((s) => s.toggleSelectedDie);

  const inRerollPickDice = activeFlow?.kind === 'reroll' && activeFlow.step === 'pick-dice';
  const inRerollMode     = selectionMode?.kind === 'reroll';
  const inResolveFlow    = activeFlow?.kind === 'resolve';

  const handleTap = (d: DieInPool) => {
    if (inRerollPickDice && activeFlow?.kind === 'reroll') {
      const isSelected = activeFlow.selectedDieIds.includes(d.instanceId);
      const next = isSelected
        ? activeFlow.selectedDieIds.filter((id) => id !== d.instanceId)
        : [...activeFlow.selectedDieIds, d.instanceId];
      setActiveFlow({ ...activeFlow, selectedDieIds: next });
      return;
    }
    if (inRerollMode) { toggleSelectedDie(d.instanceId); return; }
    if (inResolveFlow) {
      const flow = activeFlow!;
      if (flow.kind !== 'resolve') return;
      const isSelected = flow.selectedDieIds.includes(d.instanceId);
      if (isSelected) {
        const next = flow.selectedDieIds.filter((id) => id !== d.instanceId);
        setActiveFlow(next.length === 0 ? null : { ...flow, selectedDieIds: next });
      } else {
        if (canSelectDie3D(d, flow.symbol as DieSymbol)) {
          setActiveFlow({ ...flow, selectedDieIds: [...flow.selectedDieIds, d.instanceId] });
        }
      }
      return;
    }
    // ── Face-pick flow ────────────────────────────────────────────────────
    if (activeFlow?.kind === 'face-pick') {
      const flow = activeFlow;
      const isFocuser = flow.focuserDieIds.includes(d.instanceId);

      if (!isFocuser && flow.budget > 0 && flow.pickingForDieId !== d.instanceId) {
        // Tap a non-focuser die to open its face picker.
        setActiveFlow({ ...flow, pickingForDieId: d.instanceId });
        return;
      }

      if (!isFocuser && flow.pickingForDieId === d.instanceId) {
        // Tap again to close the picker without selecting.
        setActiveFlow({ ...flow, pickingForDieId: null });
        return;
      }

      // Tap a die that was flipped to a focus face to chain it as a new focuser.
      const lastFlip = [...flow.history].reverse().find(
        (e): e is Extract<FacePickEvent, { kind: 'flip' }> =>
          e.kind === 'flip' && e.targetDieId === d.instanceId,
      );
      const currentFaceIndex = lastFlip ? lastFlip.faceIndex : d.faceIndex;
      const currentSymbol = d.face.symbol === 'focus' && !lastFlip
        ? 'focus'
        : lastFlip && d.ownerInstanceId
          ? 'unknown' // will be resolved by engine; we check the flipped face value
          : d.face.symbol;

      // Check if the current effective face is a focus face and this die isn't already a focuser.
      const effectiveFaceIsFocus =
        !isFocuser &&
        lastFlip &&
        (d.face.symbol === 'focus' || currentFaceIndex === lastFlip.faceIndex);

      if (!isFocuser && (d.face.symbol === 'focus' || effectiveFaceIsFocus)) {
        const budgetAdded = d.face.value;
        const chainEvent: FacePickEvent = {
          kind: 'chain',
          chainedFocuserId: d.instanceId,
          budgetAdded,
        };
        setActiveFlow({
          ...flow,
          focuserDieIds: [...flow.focuserDieIds, d.instanceId],
          budget: flow.budget + budgetAdded,
          history: [...flow.history, chainEvent],
          pickingForDieId: null,
        });
        return;
      }
      return;
    }

    if (diceInteractive && activeFlow === null && !d.face.modifier) {
      if (!eligibleSymbols?.includes(d.face.symbol)) return;
      // Focus dice skip the resolve step — go straight to face-pick.
      if (d.face.symbol === 'focus') {
        setActiveFlow({ kind: 'face-pick', focuserDieIds: [d.instanceId], budget: d.face.value, history: [], pickingForDieId: null });
        return;
      }
      setActiveFlow({ kind: 'resolve', symbol: d.face.symbol, selectedDieIds: [d.instanceId], targetCharacterId: null });
    }
  };

  const { bg: baseColor, text: textColor } = CARD_COLORS[cardColor ?? ''] ?? FALLBACK_COLOR;

  // Horizontal centering: spread dice around origin.
  const xStart = -((dice.length - 1) * DIE_SPACING) / 2;

  // Empty pool — render a spacer that matches DiceStack min-h.
  if (dice.length === 0) {
    return <div style={{ minHeight: 40 }} className="w-full" />;
  }

  return (
    <div style={{ width: '100%', height: CANVAS_HEIGHT_PX }}>
      <Canvas
        camera={{ position: CAM_POS, fov: CAM_FOV, near: 0.1, far: 50 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ alpha: true, antialias: true }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <CameraLookAt />
        {/* Lighting: ambient fill + directional from upper-left-front to match camera angle */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[0, 5, 2]} intensity={0.9} castShadow={false} />

        {dice.map((d, i) => {
          const isTumbling = tumblingCharId != null && d.ownerInstanceId === tumblingCharId;

          // Determine visual state
          let dieState: DieState = 'default';
          if (inRerollPickDice && activeFlow?.kind === 'reroll') {
            dieState = activeFlow.selectedDieIds.includes(d.instanceId) ? 'selected-reroll'
                     : canRerollDie3D(d)                                ? 'default'
                     : 'dimmed';
          } else if (inResolveFlow && activeFlow?.kind === 'resolve') {
            const flow = activeFlow;
            const isSelected = flow.selectedDieIds.includes(d.instanceId);
            const canAdd = !isSelected && canSelectDie3D(d, flow.symbol as DieSymbol);
            dieState = isSelected ? 'selected-resolve'
                     : canAdd    ? 'eligible'
                     : 'dimmed';
          } else if (inRerollMode) {
            const isSelected = selectionMode!.selectedDieIds.includes(d.instanceId);
            dieState = isSelected       ? 'selected-resolve'
                     : canRerollDie3D(d) ? 'default'
                     : 'dimmed';
          } else if (activeFlow?.kind === 'face-pick') {
            const flow = activeFlow;
            const isFocuser = flow.focuserDieIds.includes(d.instanceId);
            const isPickingTarget = flow.pickingForDieId === d.instanceId;
            const hasBeenFlipped = flow.history.some(
              (e) => e.kind === 'flip' && e.targetDieId === d.instanceId,
            );
            if (isFocuser) dieState = 'dimmed';                        // focuser is "spent"
            else if (isPickingTarget) dieState = 'selected-resolve';   // open picker
            else if (hasBeenFlipped) dieState = 'selected-reroll';     // flipped this focus
            else if (flow.budget > 0) dieState = 'eligible';           // valid target
            else dieState = 'dimmed';
          } else if (eligibleSymbols?.includes(d.face.symbol) && !d.face.modifier) {
            dieState = 'eligible';
          }

          return (
            <Die3D
              key={d.instanceId}
              die={d}
              position={[xStart + i * DIE_SPACING, 0, 0]}
              baseColor={baseColor}
              textColor={textColor}
              state={dieState}
              isTumbling={isTumbling}
              onClick={() => handleTap(d)}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
