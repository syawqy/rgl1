/**
 * rng.ts — deterministic PRNG + Brogue-compatible random helpers.
 *
 * Brogue uses `rand_range(lo, hi)` (inclusive), `rand_percent(p)`,
 * `shuffleList` (Fisher-Yates) and `fillSequentialList`. We mirror those
 * exactly so the ported generator produces the same shapes as the original.
 */

export type RNG = () => number;

/** mulberry32 — small, fast, good enough distribution for level generation. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string seed into a 32-bit integer. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  private next: RNG;

  constructor(seed: number | string) {
    const s = typeof seed === "string" ? hashSeed(seed) : seed;
    this.next = mulberry32(s);
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Uniform integer in [lo, hi] inclusive. Mirrors Brogue's rand_range. */
  range(lo: number, hi: number): number {
    if (hi <= lo) return lo;
    const interval = hi - lo + 1;
    return lo + Math.floor(this.next() * interval);
  }

  /** True with probability `percent`/100. Mirrors Brogue's rand_percent. */
  /** A random integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  percent(percent: number): boolean {
    return this.range(0, 99) < clamp(percent, 0, 100);
  }

  /** True with probability `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.range(0, arr.length - 1)];
  }

  /** In-place Fisher-Yates shuffle. Mirrors Brogue's shuffleList. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = 0; i < arr.length - 1; i++) {
      const r = this.range(i, arr.length - 1);
      if (i !== r) {
        const tmp = arr[r];
        arr[r] = arr[i];
        arr[i] = tmp;
      }
    }
    return arr;
  }

  /** [0, 1, 2, ... n-1] */
  sequential(n: number): number[] {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = i;
    return out;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
