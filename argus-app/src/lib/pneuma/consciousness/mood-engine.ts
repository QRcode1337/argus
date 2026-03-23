/**
 * PNEUMA S2 -- Regime-Switching Mood Engine
 *
 * Implements a Hidden Markov Model (HMM) with regime switching for the
 * system's mood dynamics. Mood evolves continuously within each regime
 * via drift + stochastic noise, and discretely jumps between regimes
 * via a Markov transition matrix or explicit impulse events.
 *
 * Mathematical model:
 *
 *   Within-regime dynamics (continuous):
 *     sigma_{t+1} = sigma_t + drift_{regime} + noise
 *     noise ~ N(0, diag(regimeVariances[regime]))
 *
 *   Regime switching (discrete):
 *     At each tick, with probability P_switch = 0.02 (scaled by sojourn),
 *     sample a new regime from transitionMatrix[currentRegime].
 *
 *   Impulse events (external):
 *     sigma_t += delta   (immediate additive shift)
 *     Regime forced to the most probable regime given the new mood.
 *
 * No external dependencies -- uses a simple xorshift128+ PRNG for
 * reproducibility and performance.
 */

import type { MoodRegime, ImpulseEvent, PneumaConfig } from '../types/index.js';

// ---------------------------------------------------------------------------
// PRNG: xorshift128+ for reproducible Gaussian noise
// ---------------------------------------------------------------------------

/**
 * Lightweight xorshift128+ PRNG.
 * State is two 64-bit integers stored as pairs of 32-bit values
 * (BigInt would be cleaner but slower).
 */
class Xorshift128Plus {
  private s0: number;
  private s1: number;

  constructor(seed: number = 42) {
    // Splitmix-style seeding from a single 32-bit seed
    this.s0 = (seed ^ 0xdeadbeef) >>> 0;
    this.s1 = (seed ^ 0x12345678) >>> 0;
    // Warm up
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

  /** Uniform [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Standard normal via Box-Muller transform.
   * Returns a single N(0,1) variate.
   */
  nextGaussian(): number {
    const u1 = this.nextFloat() || 1e-15; // avoid log(0)
    const u2 = this.nextFloat();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// Module-level PRNG instance (re-seeded on initialize)
let rng = new Xorshift128Plus(42);

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Create an initial MoodRegime state from the system configuration.
 *
 * Sets up:
 *   - Regime labels and transition matrix from config
 *   - Zero-centered initial mood vector in R^d (d = embeddingDim)
 *   - Per-regime drift vectors scaled by 1/moodDriftTau
 *   - Per-regime variance vectors (default 0.01 per axis)
 *   - Starting regime = 0
 *
 * @param config - PNEUMA system configuration.
 * @returns A fully initialized MoodRegime ready for tickMood calls.
 */
export function initializeMoodRegime(config: PneumaConfig): MoodRegime {
  const R = config.numMoodRegimes;
  const d = config.embeddingDim;

  // Re-seed PRNG for reproducibility
  rng = new Xorshift128Plus(config.jlSeed);

  // Build drift vectors: small regime-specific biases in mood space.
  // Each regime drifts toward a different direction, scaled by 1/tau.
  // We use a simple deterministic pattern: regime i drifts along
  // dimensions [i*stride .. (i+1)*stride) with magnitude 1/tau.
  const driftVectors: Float64Array[] = [];
  const stride = Math.max(1, Math.floor(d / R));

  for (let r = 0; r < R; r++) {
    const drift = new Float64Array(d);
    const start = r * stride;
    const end = Math.min(start + stride, d);
    const mag = 1 / config.moodDriftTau;
    for (let j = start; j < end; j++) {
      drift[j] = mag * (((r + j) % 2 === 0) ? 1 : -1);
    }
    driftVectors.push(drift);
  }

  // Build variance vectors: per-regime noise level per axis.
  // Default: 0.01 variance per axis, slightly differentiated by regime.
  const regimeVariances: Float64Array[] = [];
  for (let r = 0; r < R; r++) {
    const variance = new Float64Array(d);
    const baseVar = 0.01 * (1 + 0.1 * r); // Slightly increase with regime index
    for (let j = 0; j < d; j++) {
      variance[j] = baseVar;
    }
    regimeVariances.push(variance);
  }

  // Initial mood: zero vector
  const currentMood = new Float64Array(d);

  // Copy transition matrix (validate row sums)
  const transitionMatrix: number[][] = [];
  for (let r = 0; r < R; r++) {
    if (r < config.moodTransitionMatrix.length) {
      const row = config.moodTransitionMatrix[r].slice(0, R);
      // Normalize to sum to 1
      const sum = row.reduce((a, b) => a + b, 0);
      transitionMatrix.push(sum > 0 ? row.map(v => v / sum) : Array(R).fill(1 / R));
    } else {
      transitionMatrix.push(Array(R).fill(1 / R));
    }
  }

  return {
    currentRegime: 0,
    regimeLabels: config.moodRegimeLabels.slice(0, R),
    numRegimes: R,
    transitionMatrix,
    driftVectors,
    regimeVariances,
    impulseHistory: [],
    currentMood,
    sojournTicks: 0,
  };
}

// ---------------------------------------------------------------------------
// Tick: within-regime evolution + stochastic regime switching
// ---------------------------------------------------------------------------

/**
 * Advance the mood state by one tick.
 *
 * Applies three operations in sequence:
 *
 *   1. **Drift**: sigma_t += drift_{currentRegime}
 *      Deterministic push toward the regime's characteristic mood.
 *
 *   2. **Noise**: sigma_t[j] += sqrt(variance[j]) * N(0,1)
 *      Gaussian perturbation scaled by per-regime, per-axis variance.
 *
 *   3. **Regime switch check**: With base probability P=0.02 (scaled
 *      by sojourn time to encourage regime stability for short stays
 *      and allow switches for long stays):
 *        P_switch = 0.02 * sigmoid((sojournTicks - 50) / 20)
 *      If switching, sample new regime from transitionMatrix[current].
 *
 * An optional input vector is added to the mood before drift/noise,
 * representing external sensory input to the mood system.
 *
 * Math:
 *   sigma_{t+1} = sigma_t + input + drift_r + epsilon
 *   epsilon_j ~ N(0, regimeVariances[r][j])
 *   P(switch) = 0.02 * sigmoid((sojourn - 50) / 20)
 *   new_regime ~ Categorical(transitionMatrix[r])
 *
 * @param regime - Current MoodRegime state (mutated in place).
 * @param input  - Optional external input vector (same dim as mood).
 *                 Pass null or undefined if no external input.
 * @returns The same MoodRegime reference (mutated).
 */
export function tickMood(regime: MoodRegime, input?: Float64Array | null): MoodRegime {
  const d = regime.currentMood.length;
  const r = regime.currentRegime;

  // Add external input if provided
  if (input && input.length === d) {
    for (let j = 0; j < d; j++) {
      regime.currentMood[j] += input[j];
    }
  }

  // 1. Apply drift
  const drift = regime.driftVectors[r];
  for (let j = 0; j < d; j++) {
    regime.currentMood[j] += drift[j];
  }

  // 2. Apply noise: sqrt(variance) * N(0,1)
  const variance = regime.regimeVariances[r];
  for (let j = 0; j < d; j++) {
    regime.currentMood[j] += Math.sqrt(variance[j]) * rng.nextGaussian();
  }

  // 3. Regime switch check
  regime.sojournTicks++;

  // Sojourn-scaled switch probability:
  //   Base P=0.02, sigmoid modulation so new regimes are sticky
  //   and old regimes are more likely to transition.
  const sojournFactor = 1 / (1 + Math.exp(-(regime.sojournTicks - 50) / 20));
  const pSwitch = 0.02 * sojournFactor;

  if (rng.nextFloat() < pSwitch) {
    // Sample new regime from transition matrix
    const row = regime.transitionMatrix[r];
    const u = rng.nextFloat();
    let cumulative = 0;
    let newRegime = r;

    for (let i = 0; i < regime.numRegimes; i++) {
      cumulative += row[i];
      if (u < cumulative) {
        newRegime = i;
        break;
      }
    }

    if (newRegime !== r) {
      regime.currentRegime = newRegime;
      regime.sojournTicks = 0;
    }
  }

  return regime;
}

// ---------------------------------------------------------------------------
// Impulse: external event forces a mood shift + regime transition
// ---------------------------------------------------------------------------

/**
 * Apply an impulse event that immediately shifts the mood vector
 * and triggers a regime transition.
 *
 * Impulses represent sudden external events (e.g., user frustration,
 * a surprising input) that push the mood out of its current trajectory.
 *
 * The new regime is selected as the one whose drift vector has the
 * highest cosine similarity with the post-impulse mood, reflecting
 * the idea that the mood "settles into" the most compatible regime.
 *
 * Math:
 *   sigma_t += delta
 *   new_regime = argmax_r cos(sigma_t, drift_r)
 *   cos(a, b) = (a . b) / (|a| * |b|)
 *
 * @param regime  - Current MoodRegime state (mutated in place).
 * @param trigger - Human-readable trigger description.
 * @param delta   - Mood-space shift vector (same dim as mood).
 * @returns The same MoodRegime reference (mutated).
 */
export function triggerImpulse(
  regime: MoodRegime,
  trigger: string,
  delta: Float64Array,
): MoodRegime {
  const d = regime.currentMood.length;
  const fromRegime = regime.currentRegime;

  // Apply the delta
  for (let j = 0; j < d; j++) {
    regime.currentMood[j] += delta[j];
  }

  // Select the most compatible regime via cosine similarity
  // between the new mood and each regime's drift vector.
  let bestRegime = fromRegime;
  let bestSim = -Infinity;

  for (let r = 0; r < regime.numRegimes; r++) {
    const sim = cosineSimilarity(regime.currentMood, regime.driftVectors[r]);
    if (sim > bestSim) {
      bestSim = sim;
      bestRegime = r;
    }
  }

  const toRegime = bestRegime;
  regime.currentRegime = toRegime;
  regime.sojournTicks = 0;

  // Record the impulse
  const event: ImpulseEvent = {
    timestamp: Date.now(),
    trigger,
    delta,
    fromRegime,
    toRegime,
  };
  regime.impulseHistory.push(event);

  return regime;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two vectors.
 *
 * cos(a, b) = (a . b) / (|a| * |b|)
 *
 * Returns 0 if either vector has zero norm.
 */
function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Get the current mood vector norm (L2).
 * Useful for monitoring mood intensity.
 */
export function moodNorm(regime: MoodRegime): number {
  let sum = 0;
  for (let j = 0; j < regime.currentMood.length; j++) {
    sum += regime.currentMood[j] * regime.currentMood[j];
  }
  return Math.sqrt(sum);
}

/**
 * Get the current regime label.
 */
export function currentRegimeLabel(regime: MoodRegime): string {
  return regime.regimeLabels[regime.currentRegime] ?? `regime-${regime.currentRegime}`;
}
