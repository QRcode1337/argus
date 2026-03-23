/**
 * PNEUMA S2 -- Johnson-Lindenstrauss Random Projection Layer
 *
 * Implements dimensionality reduction via the Johnson-Lindenstrauss lemma:
 * a random linear projection from R^d to R^k preserves pairwise distances
 * within a factor (1 +/- eps) with high probability, where
 *
 *   k = ceil(8 * ln(d) / eps^2)
 *
 * This is the conservative bound from the JL lemma (matching the
 * sublinear-time-solver's JLEmbedding.compute_target_dimension).
 *
 * The projection matrix A in R^{k x d} is populated with entries drawn
 * from N(0, 1/k) using a seeded PRNG, so the same (d, eps, seed) triple
 * always produces the same matrix.
 *
 * Mathematical guarantee:
 *   For all pairs u, v in the original set:
 *   (1 - eps) * ||u - v||^2 <= ||A*u - A*v||^2 <= (1 + eps) * ||u - v||^2
 *
 * No external dependencies.
 */

import type { CompactVector } from '../types/index.js';

// ---------------------------------------------------------------------------
// PRNG for reproducible projection matrices
// ---------------------------------------------------------------------------

/**
 * Seeded xorshift128+ PRNG with Box-Muller Gaussian generation.
 * Identical to the one in mood-engine.ts but kept local to avoid
 * cross-module state coupling.
 */
class SeededRng {
  private s0: number;
  private s1: number;

  constructor(seed: number) {
    this.s0 = (seed ^ 0xdeadbeef) >>> 0;
    this.s1 = (seed ^ 0x12345678) >>> 0;
    for (let i = 0; i < 20; i++) this.nextUint32();
  }

  nextUint32(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= (s1 << 23) | 0;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    return (this.s0 + this.s1) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** N(0,1) via Box-Muller transform. */
  nextGaussian(): number {
    const u1 = this.nextFloat() || 1e-15;
    const u2 = this.nextFloat();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ---------------------------------------------------------------------------
// Target dimension computation
// ---------------------------------------------------------------------------

/**
 * Compute the target dimension k for a JL projection.
 *
 * Uses the conservative JL bound:
 *   k = ceil(8 * ln(d) / eps^2)
 *
 * This ensures that pairwise distances among d points are preserved
 * within (1 +/- eps) with probability at least 1 - 1/d^2.
 *
 * @param d   - Original dimension (number of points/features).
 * @param eps - Distortion parameter in (0, 1). Smaller = more faithful
 *              but higher target dimension.
 * @returns Target dimension k (integer >= 1).
 */
export function computeTargetDim(d: number, eps: number): number {
  if (d <= 0) return 1;
  if (eps <= 0 || eps >= 1) {
    throw new Error(`JL eps must be in (0, 1), got ${eps}`);
  }
  return Math.max(1, Math.ceil((8 * Math.log(d)) / (eps * eps)));
}

// ---------------------------------------------------------------------------
// Projection matrix
// ---------------------------------------------------------------------------

/**
 * A JL projection matrix stored as a flat Float64Array in row-major order.
 *
 * Shape: k rows x d columns.
 * Entry (i, j) = matrix[i * d + j].
 *
 * Entries are drawn from N(0, 1/k) so that E[||Ax||^2] = ||x||^2.
 */
export interface JLProjectionMatrix {
  /** The flat k*d matrix in row-major order. */
  data: Float64Array;
  /** Number of rows (target dimension k). */
  k: number;
  /** Number of columns (source dimension d). */
  d: number;
  /** Distortion parameter used to compute k. */
  eps: number;
  /** Seed used to generate the matrix. */
  seed: number;
}

/**
 * Create a JL random projection matrix.
 *
 * Generates a k x d matrix A where each entry is drawn from
 * N(0, 1/k) using a seeded PRNG. The scaling by 1/sqrt(k) ensures
 * that the projection approximately preserves norms:
 *
 *   E[||Ax||^2] = ||x||^2
 *
 * The matrix is deterministic given (fullDim, eps, seed), so the
 * same projection can be reconstructed later from just the seed.
 *
 * @param fullDim - Source dimension d.
 * @param eps     - JL distortion parameter in (0, 1).
 * @param seed    - PRNG seed for reproducibility.
 * @returns A JLProjectionMatrix ready for use with project().
 */
export function createProjection(
  fullDim: number,
  eps: number,
  seed: number,
): JLProjectionMatrix {
  const k = computeTargetDim(fullDim, eps);
  const d = fullDim;
  const data = new Float64Array(k * d);
  const rng = new SeededRng(seed);

  // Scale factor: 1/sqrt(k) so E[||Ax||^2] = ||x||^2
  const scale = 1 / Math.sqrt(k);

  for (let i = 0; i < k * d; i++) {
    data[i] = rng.nextGaussian() * scale;
  }

  return { data, k, d, eps, seed };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Project a full-dimensional vector through the JL projection matrix.
 *
 * Computes y = A * x where A is k x d and x is in R^d.
 * Result y is in R^k (the compressed space).
 *
 * @param full       - Source vector in R^d.
 * @param projMatrix - The JL projection matrix (k x d).
 * @returns Projected vector in R^k as a CompactVector (Float64Array).
 * @throws Error if the vector dimension doesn't match the matrix.
 */
export function project(
  full: Float64Array,
  projMatrix: JLProjectionMatrix,
): CompactVector {
  if (full.length !== projMatrix.d) {
    throw new Error(
      `Dimension mismatch: vector has length ${full.length}, ` +
      `projection matrix expects ${projMatrix.d}`,
    );
  }

  const { data, k, d } = projMatrix;
  const result = new Float64Array(k);

  // Matrix-vector multiply: result[i] = sum_j A[i,j] * full[j]
  for (let i = 0; i < k; i++) {
    let sum = 0;
    const rowOffset = i * d;
    for (let j = 0; j < d; j++) {
      sum += data[rowOffset + j] * full[j];
    }
    result[i] = sum;
  }

  return result;
}

/**
 * Project multiple vectors in a batch.
 *
 * More efficient than calling project() in a loop when the JIT
 * can optimize the inner loop across calls.
 *
 * @param vectors    - Array of source vectors, each in R^d.
 * @param projMatrix - The JL projection matrix (k x d).
 * @returns Array of projected vectors, each in R^k.
 */
export function projectBatch(
  vectors: Float64Array[],
  projMatrix: JLProjectionMatrix,
): CompactVector[] {
  return vectors.map(v => project(v, projMatrix));
}

// ---------------------------------------------------------------------------
// Utility: distance verification
// ---------------------------------------------------------------------------

/**
 * Compute the distortion ratio between original and projected distances.
 *
 * For a pair of vectors (u, v):
 *   distortion = ||A*u - A*v||^2 / ||u - v||^2
 *
 * The JL lemma guarantees this is in [(1-eps), (1+eps)] w.h.p.
 *
 * @param origA - Original vector u in R^d.
 * @param origB - Original vector v in R^d.
 * @param projA - Projected vector A*u in R^k.
 * @param projB - Projected vector A*v in R^k.
 * @returns The distortion ratio (1.0 = perfect preservation).
 */
export function distortionRatio(
  origA: Float64Array,
  origB: Float64Array,
  projA: Float64Array,
  projB: Float64Array,
): number {
  const origDistSq = squaredDistance(origA, origB);
  const projDistSq = squaredDistance(projA, projB);

  if (origDistSq === 0) return projDistSq === 0 ? 1.0 : Infinity;
  return projDistSq / origDistSq;
}

/**
 * Squared Euclidean distance between two vectors.
 */
function squaredDistance(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}
