// 3D dice pool rendered with Three.js (react-three-fiber + drei).
// Lazy-loaded — the bundle only loads when the game route is visited.
// Used as a drop-in replacement for the flat DiceStack component.
//
// Architecture: one Canvas per player zone (not per die) — a single
// WebGL context per zone keeps the context count low (browsers cap at ~16).

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { DieInPool, DieSymbol } from '@prophecy/game-engine';
import { useApp, type SelectionMode } from '../store.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DIE_SIZE = 0.8;           // world units
const DIE_RADIUS = 0.12;        // chamfer radius — matches physical dice
const DIE_SPACING = 1.05;       // center-to-center spacing
const CANVAS_HEIGHT_PX = 64;    // px — overhead perspective needs a touch more vertical space

// Camera position: mostly overhead, slight lean toward bottom of screen (+Z toward
// viewer). X=0 keeps the horizontal die row straight in screen space — any X offset
// makes the row appear diagonal. The bottom-of-screen depth comes from Z alone.
const CAM_POS: [number, number, number] = [0, 2.5, 0.9];
const CAM_FOV = 40;

// Points the camera at the dice origin after mount.
// r3f positions the camera but doesn't auto-aim it for perspective cameras.
function CameraLookAt() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(0, 0, 0); }, [camera]);
  return null;
}

const CARD_COLORS: Record<string, { bg: string; text: string }> = {
  red:    { bg: '#ef4444', text: '#ffffff' },
  blue:   { bg: '#3b82f6', text: '#ffffff' },
  yellow: { bg: '#facc15', text: '#1c1917' },
  gray:   { bg: '#9ca3af', text: '#1c1917' },
};
const FALLBACK_COLOR = { bg: '#a8a29e', text: '#1c1917' };

// Abbreviated symbol labels for die faces.
function symLabel(s: string): string {
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
    case 'blank':    return '';
    default:         return s.slice(0, 3).toUpperCase();
  }
}

// ── Face texture ──────────────────────────────────────────────────────────────
// Creates a 128×128 CanvasTexture with value + symbol on the die's base color.
// Applied to all faces so the label is always readable regardless of tilt.

function makeFaceTexture(
  symbol: string,
  value: number,
  modifier: boolean,
  baseColor: string,
  textColor: string,
): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);

  // Very subtle inner highlight — keeps the face texture readable without fighting the color
  const grad = ctx.createRadialGradient(S * 0.35, S * 0.3, 0, S * 0.5, S * 0.5, S * 0.7);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // Value text
  const valueStr = symbol === 'blank' ? '—' : `${modifier ? '+' : ''}${value > 0 ? value : ''}`;
  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.round(S * 0.38)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(valueStr, S / 2, S * 0.58);

  // Symbol label
  const sym = symLabel(symbol);
  if (sym) {
    // Slightly transparent version of the text color
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = textColor;
    ctx.font = `${Math.round(S * 0.22)}px ui-sans-serif, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(sym, S / 2, S * 0.86);
    ctx.globalAlpha = 1;
  }

  return new THREE.CanvasTexture(c);
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

  // No baked rotation — the camera angle provides all the depth perspective.
  // During tumble the die spins freely; at rest it sits flat, face-up.
  const rotation: [number, number, number] = [0, 0, 0];

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
  if (s === 'special' || s === 'focus' || s === 'indirect' || s === 'discard' || s === 'draw') return false;
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
    if (diceInteractive && activeFlow === null && !d.face.modifier) {
      if (!eligibleSymbols?.includes(d.face.symbol)) return;
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
