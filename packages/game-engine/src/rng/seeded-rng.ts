// Seeded RNG. Determinism is non-negotiable — no Math.random() anywhere
// inside the engine. Replays reconstruct state from seed + action stream.

// Mulberry32: tiny, fast, well-distributed, zero deps.
export interface SeededRng {
  next(): number;
  rollDie(faces: number): number;
  fork(label: string): SeededRng;
}

export function createRng(seed: string): SeededRng {
  let state = hashSeed(seed);
  return rngFromState(state, seed);

  function rngFromState(initialState: number, label: string): SeededRng {
    let s = initialState >>> 0;
    return {
      next() {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      rollDie(faces: number) {
        if (faces <= 0) throw new Error('faces must be > 0');
        return Math.floor(this.next() * faces);
      },
      fork(forkLabel: string) {
        return rngFromState(hashSeed(`${label}:${forkLabel}`), `${label}:${forkLabel}`);
      },
    };
  }
}

function hashSeed(input: string): number {
  // FNV-1a 32-bit. Deterministic across platforms.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
