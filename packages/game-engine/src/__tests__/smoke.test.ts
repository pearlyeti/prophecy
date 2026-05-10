import { describe, expect, it } from 'vitest';

import { createRng } from '../rng/seeded-rng';

describe('engine smoke', () => {
  it('rng is deterministic across instances with the same seed', () => {
    const a = createRng('test-seed');
    const b = createRng('test-seed');
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('rng produces different streams for different seeds', () => {
    const a = createRng('seed-one');
    const b = createRng('seed-two');
    expect(a.next()).not.toEqual(b.next());
  });

  it('rng.rollDie stays within range', () => {
    const r = createRng('die-test');
    for (let i = 0; i < 100; i++) {
      const roll = r.rollDie(6);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(6);
    }
  });
});
