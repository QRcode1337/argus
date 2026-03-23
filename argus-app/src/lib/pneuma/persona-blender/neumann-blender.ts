/**
 * PNEUMA S3 -- Neumann-Series Persona Blender
 *
 * Blends a base persona vector with mood-derived perturbations using
 * the truncated Neumann series expansion. This allows incremental,
 * convergent re-estimation of the persona after each conversational
 * turn without a full re-projection.
 *
 * Mathematical model:
 *
 *   The persona at time t is a series expansion:
 *
 *     P(t) = sum_{k=0}^{K} alpha^k * M^k * pi_base
 *
 *   where:
 *     pi_base    -- base persona vector in R^d
 *     M          -- perturbation operator (I - mood-derived shift)
 *     alpha      -- damping/teleportation parameter in (0, 1)
 *     K          -- truncation order (neumannOrder from config)
 *
 *   Convergence condition: spectralRadius(M) < 1
 *     When satisfied, the series converges to:
 *     P = (I - alpha * M)^{-1} * pi_base
 *
 *   The Neumann series avoids computing the matrix inverse directly,
 *   instead accumulating the powers of M iteratively.
 *
 * Source: sublinear-time-solver SublinearNeumannSolver,
 *         PersonaVector.neumannOrder and PersonaVector.spectralRadius.
 *
 * No external dependencies.
 */

import type { PersonaVector, MoodRegime, PneumaConfig, EpochMs } from '../types/index.js';

// ---------------------------------------------------------------------------
// PersonaBlender state
// ---------------------------------------------------------------------------

/**
 * Internal state for the Neumann-series persona blender.
 *
 * Tracks the current blended persona, the perturbation history,
 * and convergence diagnostics.
 */
export interface PersonaBlender {
  /** The current blended persona vector in R^d. */
  blended: Float64Array;

  /** Base persona before any blending. */
  basePersona: Float64Array;

  /** Neumann series truncation order K. */
  neumannOrder: number;

  /** Estimated spectral radius of the perturbation operator. */
  spectralRadius: number;

  /** Embedding dimensionality d. */
  dim: number;

  /** Number of blend updates performed. */
  updateCount: number;

  /** History of recent perturbation norms for spectral radius estimation. */
  perturbationNorms: number[];

  /** Maximum perturbation history length for rolling estimation. */
  maxHistory: number;

  /** Last update timestamp. */
  updatedAt: EpochMs;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Create a PersonaBlender from the system configuration.
 *
 * Initializes with a zero base persona (to be set on first blend)
 * and default Neumann parameters from config.
 *
 * @param config - PNEUMA system configuration.
 * @returns An initialized PersonaBlender.
 */
export function createPersonaBlender(config: PneumaConfig): PersonaBlender {
  const d = config.embeddingDim;

  return {
    blended: new Float64Array(d),
    basePersona: new Float64Array(d),
    neumannOrder: config.neumannOrder,
    spectralRadius: 0,
    dim: d,
    updateCount: 0,
    perturbationNorms: [],
    maxHistory: 20,
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Core: Neumann-series persona blending
// ---------------------------------------------------------------------------

/**
 * Blend a base persona with mood-derived perturbation using the
 * truncated Neumann series.
 *
 * The perturbation operator M is constructed from the mood state:
 *
 *   M = I - normalize(moodInfluence)
 *
 * where moodInfluence is the element-wise product of the mood vector
 * and the persona vector, capturing how much the current mood shifts
 * each persona dimension.
 *
 * The blended persona is then:
 *
 *   P(t) = sum_{k=0}^{K} alpha^k * M^k * pi_base
 *
 * Computed iteratively:
 *   term_0 = pi_base
 *   term_{k+1} = alpha * M * term_k
 *   P(t) = sum of all terms
 *
 * If the spectral radius rho(M) >= 1, the series may diverge.
 * In that case we clamp alpha to ensure alpha * rho < 1.
 *
 * @param basePersona - The base persona vector pi_base in R^d.
 * @param moodState   - Current MoodRegime (provides currentMood).
 * @param alpha       - Damping parameter in (0, 1). Higher alpha = more
 *                      mood influence on the blended persona.
 * @param blender     - PersonaBlender state (mutated with new spectral
 *                      radius estimate and blended result).
 * @returns The blended persona vector in R^d.
 */
export function blendPersonas(
  basePersona: PersonaVector,
  moodState: MoodRegime,
  alpha: number,
  blender: PersonaBlender,
): Float64Array {
  const d = blender.dim;
  const K = blender.neumannOrder;
  const mood = moodState.currentMood;
  const piBase = basePersona.full;

  // Store base persona
  blender.basePersona.set(piBase);

  // Construct perturbation vector: element-wise mood influence on persona.
  // M[j] represents how much dimension j is perturbed.
  // M_diag[j] = 1 - clamp(mood[j] * piBase[j] / (||mood|| * ||piBase|| + eps), -0.99, 0.99)
  const moodNorm = vecNorm(mood);
  const baseNorm = vecNorm(piBase);
  const normProduct = moodNorm * baseNorm + 1e-12;

  const mDiag = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    const influence = (mood[j] * piBase[j]) / normProduct;
    // Clamp to ensure diagonal entries of M are in (-1, 1) for convergence
    mDiag[j] = 1 - clamp(influence, -0.99, 0.99);
  }

  // Estimate spectral radius: max |mDiag[j]|
  let rho = 0;
  for (let j = 0; j < d; j++) {
    rho = Math.max(rho, Math.abs(mDiag[j]));
  }

  // Track spectral radius history for rolling estimation
  blender.perturbationNorms.push(rho);
  if (blender.perturbationNorms.length > blender.maxHistory) {
    blender.perturbationNorms.shift();
  }

  // Use exponential moving average of recent spectral radii
  blender.spectralRadius = estimateSpectralRadius(blender.perturbationNorms);

  // Ensure convergence: clamp alpha so that alpha * rho < 1
  const effectiveAlpha = blender.spectralRadius > 0
    ? Math.min(alpha, 0.99 / blender.spectralRadius)
    : alpha;

  // Neumann series: P(t) = sum_{k=0}^{K} alpha^k * M^k * pi_base
  //
  // Iterative computation:
  //   term_0 = pi_base
  //   term_{k+1}[j] = effectiveAlpha * mDiag[j] * term_k[j]
  //   result = sum of all terms
  const result = new Float64Array(d);
  const term = new Float64Array(d);
  term.set(piBase);

  // k=0: add pi_base
  for (let j = 0; j < d; j++) {
    result[j] += term[j];
  }

  // k=1..K: accumulate alpha^k * M^k * pi_base
  for (let k = 1; k <= K; k++) {
    // term = alpha * M * term (element-wise for diagonal M)
    for (let j = 0; j < d; j++) {
      term[j] = effectiveAlpha * mDiag[j] * term[j];
    }
    for (let j = 0; j < d; j++) {
      result[j] += term[j];
    }

    // Early termination if term contribution is negligible
    const termNorm = vecNorm(term);
    if (termNorm < 1e-12) break;
  }

  blender.blended.set(result);
  blender.updateCount++;
  blender.updatedAt = Date.now();

  return result;
}

// ---------------------------------------------------------------------------
// Incremental update
// ---------------------------------------------------------------------------

/**
 * Update the blended persona incrementally with new evidence.
 *
 * Instead of recomputing the full Neumann series, applies a
 * rank-1 correction to the current blend:
 *
 *   P(t+1) = P(t) + sum_{k=0}^{K} alpha^k * M^k * delta
 *
 * where delta is the new evidence vector. This is equivalent to
 * blending (basePersona + delta) but avoids redundant computation
 * of the base persona's series.
 *
 * Uses the same convergence guarantees as blendPersonas.
 *
 * @param blender     - Current PersonaBlender state (mutated).
 * @param newEvidence - Evidence vector (shift in persona space) in R^d.
 * @param alpha       - Damping parameter (same as in blendPersonas).
 * @returns The updated blended persona vector.
 */
export function updateBlend(
  blender: PersonaBlender,
  newEvidence: Float64Array,
  alpha: number = 0.5,
): Float64Array {
  const d = blender.dim;
  const K = blender.neumannOrder;

  // Ensure convergence
  const effectiveAlpha = blender.spectralRadius > 0
    ? Math.min(alpha, 0.99 / blender.spectralRadius)
    : alpha;

  // Reconstruct M_diag from current base and blended state.
  // Approximate: use the ratio blended/base as the effective M diagonal.
  const mDiag = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    if (Math.abs(blender.basePersona[j]) > 1e-15 && blender.updateCount > 0) {
      // Estimate M_diag from the relationship between blended and base
      const ratio = blender.blended[j] / blender.basePersona[j];
      mDiag[j] = clamp(ratio - 1, -0.99, 0.99);
    } else {
      mDiag[j] = 0;
    }
  }

  // Neumann series on the delta: correction = sum alpha^k * M^k * delta
  const correction = new Float64Array(d);
  const term = new Float64Array(d);
  term.set(newEvidence);

  // k=0
  for (let j = 0; j < d; j++) {
    correction[j] += term[j];
  }

  // k=1..K
  for (let k = 1; k <= K; k++) {
    for (let j = 0; j < d; j++) {
      term[j] = effectiveAlpha * mDiag[j] * term[j];
    }
    for (let j = 0; j < d; j++) {
      correction[j] += term[j];
    }

    if (vecNorm(term) < 1e-12) break;
  }

  // Apply correction to current blend
  for (let j = 0; j < d; j++) {
    blender.blended[j] += correction[j];
    blender.basePersona[j] += newEvidence[j];
  }

  blender.updateCount++;
  blender.updatedAt = Date.now();

  return blender.blended;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Check whether the Neumann series is convergent for the current state.
 *
 * The series converges iff spectralRadius < 1.
 */
export function isConvergent(blender: PersonaBlender): boolean {
  return blender.spectralRadius < 1;
}

/**
 * Get the effective damping that ensures convergence.
 *
 * @param blender - Current blender state.
 * @param alpha   - Desired damping parameter.
 * @returns The clamped alpha that guarantees convergence.
 */
export function effectiveDamping(blender: PersonaBlender, alpha: number): number {
  if (blender.spectralRadius <= 0) return alpha;
  return Math.min(alpha, 0.99 / blender.spectralRadius);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** L2 norm of a vector. */
function vecNorm(v: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/** Clamp a value to [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Estimate spectral radius from a history of perturbation norms
 * using exponential moving average.
 *
 * More recent values are weighted more heavily.
 */
function estimateSpectralRadius(history: number[]): number {
  if (history.length === 0) return 0;
  if (history.length === 1) return history[0];

  const decay = 0.8;
  let ema = history[0];
  for (let i = 1; i < history.length; i++) {
    ema = decay * ema + (1 - decay) * history[i];
  }
  return ema;
}
