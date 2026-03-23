/**
 * PNEUMA S9 -- Temporal-Lead Voice Predictor
 *
 * Echo State Network (ESN) for utterance prediction with a 340ms
 * lookahead window. The ESN is a reservoir computing model:
 *
 * Math:
 *   x(t+1) = tanh(W_in * u(t) + W * x(t))   -- reservoir update
 *   y(t+1) = W_out * x(t+1)                   -- readout
 *
 * The reservoir W is a sparse random matrix with controlled spectral
 * radius (< 1 for echo state property). W_in maps input to reservoir
 * space. W_out is the only trained component (via ridge regression).
 *
 * Beam search over the readout produces multiple candidate predictions
 * ranked by score.
 *
 * Lyapunov exponent estimation via Rosenstein's algorithm detects
 * chaotic vs. convergent prediction regimes.
 *
 * Source: sublinear-time-solver temporal_predict tool,
 *         chaos_analyze tool (Rosenstein algorithm)
 */

import type {
  CompactVector,
  EpochMs,
  EpochNs,
  PneumaConfig,
  TemporalPrediction,
} from '../types/index';

// ---------------------------------------------------------------------------
// ESN State
// ---------------------------------------------------------------------------

/**
 * Echo State Network state and parameters.
 */
export interface ESNState {
  /** Reservoir size N. */
  reservoirSize: number;
  /** Target spectral radius rho of W (must be < 1). */
  spectralRadius: number;
  /** Input weight matrix W_in: N x inputDim (stored flat, row-major). */
  wIn: Float64Array;
  /** Reservoir weight matrix W: N x N (sparse, stored flat). */
  wReservoir: Float64Array;
  /** Output weight matrix W_out: outputDim x N (trained via ridge regression). */
  wOut: Float64Array;
  /** Current reservoir state x(t): N-dimensional. */
  state: Float64Array;
  /** Input dimension. */
  inputDim: number;
  /** Output dimension (same as input for autoregressive prediction). */
  outputDim: number;
  /** Whether W_out has been trained. */
  trained: boolean;
  /** Reservoir sparsity (fraction of zero entries in W). */
  sparsity: number;
  /** Ridge regression regularization parameter. */
  ridgeAlpha: number;
}

// ---------------------------------------------------------------------------
// Random number generation (deterministic, seedable)
// ---------------------------------------------------------------------------

/**
 * Simple seedable PRNG (xoshiro128**).
 * Used for deterministic reservoir initialization.
 */
class PRNG {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    // SplitMix64 seeding
    let z = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      t = t ^ (t >>> 15);
      this.s[i] = t >>> 0;
    }
  }

  /** Returns a float in [0, 1). */
  next(): number {
    const s = this.s;
    const result = Math.imul(this.rotl(Math.imul(s[1], 5), 7), 9);
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = this.rotl(s[3], 11);
    return (result >>> 0) / 4294967296;
  }

  /** Returns a float in [-1, 1). */
  nextSigned(): number {
    return this.next() * 2 - 1;
  }

  private rotl(x: number, k: number): number {
    return ((x << k) | (x >>> (32 - k))) >>> 0;
  }
}

// ---------------------------------------------------------------------------
// ESN initialization
// ---------------------------------------------------------------------------

/**
 * Initialize an Echo State Network with random weights.
 *
 * The reservoir matrix W is sparse with controlled spectral radius.
 * W_in is dense random in [-1, 1]. W_out is initialized to zero
 * (trained later via ridge regression).
 *
 * The spectral radius is enforced by:
 *   1. Generate sparse random W
 *   2. Estimate its spectral radius via power iteration
 *   3. Scale W so that rho(W) = target spectralRadius
 *
 * Complexity: O(N^2) for reservoir generation + O(N^2 * iterations) for
 * power iteration.
 *
 * @param reservoirSize  - Number of reservoir neurons N
 * @param spectralRadius - Target spectral radius (default 0.95)
 * @param inputDim       - Input vector dimension
 * @param outputDim      - Output vector dimension (default = inputDim)
 * @param sparsity       - Fraction of zero entries in W (default 0.9)
 * @param seed           - Random seed for reproducibility
 * @returns Initialized ESNState
 */
export function initializeESN(
  reservoirSize: number,
  spectralRadius: number,
  inputDim: number,
  outputDim?: number,
  sparsity: number = 0.9,
  seed: number = 42,
): ESNState {
  const rng = new PRNG(seed);
  const outDim = outputDim ?? inputDim;
  const N = reservoirSize;

  // W_in: N x inputDim, dense random in [-0.5, 0.5]
  const wIn = new Float64Array(N * inputDim);
  for (let i = 0; i < wIn.length; i++) {
    wIn[i] = rng.nextSigned() * 0.5;
  }

  // W: N x N, sparse random
  const wReservoir = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (rng.next() > sparsity) {
        wReservoir[i * N + j] = rng.nextSigned();
      }
    }
  }

  // Scale W to target spectral radius via power iteration
  const estimatedRadius = estimateSpectralRadius(wReservoir, N, rng);
  if (estimatedRadius > 1e-10) {
    const scale = spectralRadius / estimatedRadius;
    for (let i = 0; i < wReservoir.length; i++) {
      wReservoir[i] *= scale;
    }
  }

  // W_out: outDim x N, initialized to zero
  const wOut = new Float64Array(outDim * N);

  return {
    reservoirSize: N,
    spectralRadius,
    wIn,
    wReservoir,
    wOut,
    state: new Float64Array(N),
    inputDim,
    outputDim: outDim,
    trained: false,
    sparsity,
    ridgeAlpha: 1e-6,
  };
}

/**
 * Estimate the spectral radius of a square matrix via power iteration.
 *
 * Complexity: O(N^2 * iterations).
 *
 * @param matrix - N x N matrix stored flat (row-major)
 * @param n      - Matrix dimension
 * @param rng    - PRNG for initial vector
 * @param iterations - Number of iterations (default 100)
 * @returns Estimated spectral radius
 */
function estimateSpectralRadius(
  matrix: Float64Array,
  n: number,
  rng: PRNG,
  iterations: number = 100,
): number {
  // Random initial vector
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = rng.nextSigned();
  }

  // Normalize
  let norm = vecNorm(v);
  if (norm < 1e-12) return 0;
  for (let i = 0; i < n; i++) v[i] /= norm;

  const mv = new Float64Array(n);

  for (let iter = 0; iter < iterations; iter++) {
    // mv = matrix * v
    mv.fill(0);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += matrix[i * n + j] * v[j];
      }
      mv[i] = sum;
    }

    norm = vecNorm(mv);
    if (norm < 1e-12) return 0;

    for (let i = 0; i < n; i++) {
      v[i] = mv[i] / norm;
    }
  }

  return norm;
}

/**
 * L2 norm of a vector.
 */
function vecNorm(v: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

// ---------------------------------------------------------------------------
// ESN training
// ---------------------------------------------------------------------------

/**
 * Train the ESN readout layer (W_out) via ridge regression.
 *
 * Drives the reservoir with the training sequence, collects
 * reservoir states, then solves:
 *   W_out = Y * X^T * (X * X^T + alpha * I)^{-1}
 *
 * where X is the matrix of reservoir states and Y is the target
 * output matrix (next-step values in the sequence).
 *
 * Uses a simplified approach: accumulates X*X^T and Y*X^T
 * incrementally to avoid storing the full state history.
 *
 * Complexity: O(T * N^2) where T = sequence length, N = reservoir size.
 *
 * @param esn     - The ESN to train (mutated in place)
 * @param history - Training sequence as array of CompactVectors
 * @param washout - Number of initial steps to discard (default: 100)
 */
export function trainESN(
  esn: ESNState,
  history: CompactVector[],
  washout: number = 100,
): void {
  if (history.length <= washout + 1) return;

  const N = esn.reservoirSize;
  const outDim = esn.outputDim;

  // Accumulate X*X^T (N x N) and Y*X^T (outDim x N)
  const XXT = new Float64Array(N * N);
  const YXT = new Float64Array(outDim * N);

  // Reset state
  esn.state.fill(0);

  let samplesCollected = 0;

  for (let t = 0; t < history.length - 1; t++) {
    const input = history[t];
    const target = history[t + 1];

    // Update reservoir: x(t+1) = tanh(W_in * u(t) + W * x(t))
    updateReservoir(esn, input);

    // Skip washout period
    if (t < washout) continue;

    // Accumulate X*X^T
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        XXT[i * N + j] += esn.state[i] * esn.state[j];
      }
    }

    // Accumulate Y*X^T
    const targetLen = Math.min(target.length, outDim);
    for (let i = 0; i < targetLen; i++) {
      for (let j = 0; j < N; j++) {
        YXT[i * N + j] += target[i] * esn.state[j];
      }
    }

    samplesCollected++;
  }

  if (samplesCollected === 0) return;

  // Add ridge regularization: X*X^T + alpha * I
  for (let i = 0; i < N; i++) {
    XXT[i * N + i] += esn.ridgeAlpha;
  }

  // Solve W_out = Y*X^T * (X*X^T + alpha*I)^{-1}
  // Using Cholesky-free approach: Gauss-Jordan on augmented [XXT | YXT^T]
  const invXXT = invertSymmetric(XXT, N);
  if (invXXT) {
    // W_out = YXT * invXXT
    for (let i = 0; i < outDim; i++) {
      for (let j = 0; j < N; j++) {
        let sum = 0;
        for (let k = 0; k < N; k++) {
          sum += YXT[i * N + k] * invXXT[k * N + j];
        }
        esn.wOut[i * N + j] = sum;
      }
    }
  }

  esn.trained = true;
}

/**
 * Invert a symmetric positive-definite matrix via Gauss-Jordan.
 *
 * Complexity: O(N^3).
 *
 * @param matrix - N x N SPD matrix (row-major, not modified)
 * @param n      - Matrix dimension
 * @returns N x N inverse, or null if singular
 */
function invertSymmetric(matrix: Float64Array, n: number): Float64Array | null {
  // Augmented matrix [A | I]
  const aug = new Float64Array(n * 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i * 2 * n + j] = matrix[i * n + j];
    }
    aug[i * 2 * n + n + i] = 1;
  }

  const w = 2 * n;

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(aug[col * w + col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row * w + col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxVal < 1e-12) return null; // Singular

    // Swap rows
    if (maxRow !== col) {
      for (let j = 0; j < w; j++) {
        const tmp = aug[col * w + j];
        aug[col * w + j] = aug[maxRow * w + j];
        aug[maxRow * w + j] = tmp;
      }
    }

    // Scale pivot row
    const pivot = aug[col * w + col];
    for (let j = 0; j < w; j++) {
      aug[col * w + j] /= pivot;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row * w + col];
      if (factor === 0) continue;
      for (let j = 0; j < w; j++) {
        aug[row * w + j] -= factor * aug[col * w + j];
      }
    }
  }

  // Extract inverse from right half
  const inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i * n + j] = aug[i * w + n + j];
    }
  }

  return inv;
}

// ---------------------------------------------------------------------------
// Reservoir dynamics
// ---------------------------------------------------------------------------

/**
 * Update the reservoir state with a new input.
 *
 * x(t+1) = tanh(W_in * u(t) + W * x(t))
 *
 * Complexity: O(N * inputDim + N^2).
 *
 * @param esn   - The ESN (state is mutated)
 * @param input - Input vector u(t)
 */
function updateReservoir(esn: ESNState, input: CompactVector): void {
  const N = esn.reservoirSize;
  const newState = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    let sum = 0;

    // W_in * u(t)
    const inLen = Math.min(input.length, esn.inputDim);
    for (let j = 0; j < inLen; j++) {
      sum += esn.wIn[i * esn.inputDim + j] * input[j];
    }

    // W * x(t)
    for (let j = 0; j < N; j++) {
      sum += esn.wReservoir[i * N + j] * esn.state[j];
    }

    newState[i] = Math.tanh(sum);
  }

  esn.state.set(newState);
}

/**
 * Compute the readout from the current reservoir state.
 *
 * y(t) = W_out * x(t)
 *
 * Complexity: O(outputDim * N).
 *
 * @param esn - The ESN
 * @returns Output vector y(t)
 */
function readout(esn: ESNState): CompactVector {
  const N = esn.reservoirSize;
  const output = new Float64Array(esn.outputDim);

  for (let i = 0; i < esn.outputDim; i++) {
    let sum = 0;
    for (let j = 0; j < N; j++) {
      sum += esn.wOut[i * N + j] * esn.state[j];
    }
    output[i] = sum;
  }

  return output;
}

// ---------------------------------------------------------------------------
// Prediction with beam search
// ---------------------------------------------------------------------------

/**
 * Beam search candidate during prediction.
 */
interface BeamCandidate {
  state: Float64Array;
  outputs: CompactVector[];
  score: number;
}

/**
 * Predict the next output using the trained ESN with beam search.
 *
 * Runs the reservoir forward from the current state, generating
 * multiple candidate continuations via beam search. Each beam
 * candidate perturbs the reservoir state slightly to explore
 * alternative trajectories.
 *
 * The 340ms lookahead window determines how many steps ahead
 * to predict based on the expected timing between inputs.
 *
 * Complexity: O(beamWidth * lookaheadSteps * N^2).
 *
 * @param esn          - The trained ESN
 * @param currentInput - Current input vector u(t)
 * @param beamWidth    - Number of beam candidates (default 5)
 * @param lookaheadMs  - Lookahead window in milliseconds (default 340)
 * @param stepMs       - Estimated time per step in ms (default 50)
 * @returns TemporalPrediction with beam candidates
 */
export function predict(
  esn: ESNState,
  currentInput: CompactVector,
  beamWidth: number = 5,
  lookaheadMs: number = 340,
  stepMs: number = 50,
): TemporalPrediction {
  const startTime = Date.now();
  const lookaheadSteps = Math.max(1, Math.ceil(lookaheadMs / stepMs));

  if (!esn.trained) {
    return emptyPrediction(esn, startTime);
  }

  // Update reservoir with current input
  updateReservoir(esn, currentInput);

  // Initialize beam with the current state
  const beams: BeamCandidate[] = [];
  for (let b = 0; b < beamWidth; b++) {
    const perturbedState = new Float64Array(esn.state);
    // Add small perturbation for diversity (except first beam)
    if (b > 0) {
      const perturbScale = 0.01 * b;
      for (let i = 0; i < perturbedState.length; i++) {
        // Deterministic perturbation based on beam index
        perturbedState[i] += perturbScale * Math.sin(i * b * 0.1);
      }
    }
    beams.push({ state: perturbedState, outputs: [], score: 1.0 });
  }

  // Run beam search forward
  for (let step = 0; step < lookaheadSteps; step++) {
    for (const beam of beams) {
      // Save/restore ESN state for each beam
      const savedState = new Float64Array(esn.state);
      esn.state.set(beam.state);

      // Get readout
      const output = readout(esn);
      beam.outputs.push(output);

      // Score update: norm of output (higher activation = higher confidence)
      const outputNorm = vecNorm(output);
      beam.score *= Math.exp(-0.1 * (1 - Math.min(outputNorm, 1)));

      // Feed output back as next input (autoregressive)
      updateReservoir(esn, output);
      beam.state.set(esn.state);

      // Restore original state
      esn.state.set(savedState);
    }
  }

  // Sort beams by score
  beams.sort((a, b) => b.score - a.score);

  // Build prediction result
  const bestBeam = beams[0];
  const lastOutput = bestBeam.outputs[bestBeam.outputs.length - 1];

  // Estimate Lyapunov exponent from beam divergence
  const lyapunov = estimateLyapunov(beams);

  const beamCandidates = beams.map((beam, idx) => ({
    text: `beam_${idx}`,
    score: beam.score,
  }));

  const elapsedMs = Date.now() - startTime;
  const temporalAdvantageNs = BigInt(Math.max(0, lookaheadMs - elapsedMs)) * BigInt(1_000_000);

  return {
    predictedText: vectorToToken(lastOutput),
    confidence: beams[0].score,
    beamCandidates,
    expectedTimingMs: lookaheadMs,
    temporalAdvantageNs,
    lyapunovExponent: lyapunov,
    reservoirSize: esn.reservoirSize,
    spectralRadius: esn.spectralRadius,
    predictedAt: Date.now() as EpochMs,
  };
}

/**
 * Create an empty prediction for untrained ESN.
 */
function emptyPrediction(esn: ESNState, startTime: number): TemporalPrediction {
  return {
    predictedText: '',
    confidence: 0,
    beamCandidates: [],
    expectedTimingMs: 0,
    temporalAdvantageNs: BigInt(0),
    lyapunovExponent: 0,
    reservoirSize: esn.reservoirSize,
    spectralRadius: esn.spectralRadius,
    predictedAt: Date.now() as EpochMs,
  };
}

/**
 * Estimate the largest Lyapunov exponent from beam divergence.
 *
 * Compares the final states of beam candidates. High divergence
 * indicates chaotic dynamics (positive exponent); low divergence
 * indicates convergent dynamics (negative exponent).
 *
 * Simplified Rosenstein-inspired estimate:
 *   lambda ~ (1/T) * ln(d_final / d_initial)
 *
 * Complexity: O(beamWidth * N).
 *
 * @param beams - Beam candidates with final states
 * @returns Estimated Lyapunov exponent
 */
function estimateLyapunov(beams: BeamCandidate[]): number {
  if (beams.length < 2) return 0;

  const ref = beams[0].state;
  let totalDivergence = 0;
  let count = 0;

  for (let i = 1; i < beams.length; i++) {
    const other = beams[i].state;
    let dist = 0;
    for (let j = 0; j < ref.length; j++) {
      const diff = ref[j] - other[j];
      dist += diff * diff;
    }
    dist = Math.sqrt(dist);

    // Initial perturbation was proportional to beam index
    const initialDist = 0.01 * i * Math.sqrt(ref.length / 3);

    if (initialDist > 1e-12 && dist > 1e-12) {
      totalDivergence += Math.log(dist / initialDist);
      count++;
    }
  }

  return count > 0 ? totalDivergence / count : 0;
}

/**
 * Convert an output vector to a token string representation.
 *
 * In a full system this would map through an embedding codebook.
 * Here we produce a hash-based token ID from the vector for
 * downstream matching.
 *
 * Complexity: O(d).
 */
function vectorToToken(v: CompactVector): string {
  let hash = 0;
  for (let i = 0; i < v.length; i++) {
    hash = ((hash << 5) - hash + Math.round(v[i] * 1000)) | 0;
  }
  return `tok_${(hash >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Factory from config
// ---------------------------------------------------------------------------

/**
 * Create an ESN from PneumaConfig defaults.
 *
 * Uses config.reservoirSize, config.esnSpectralRadius, and
 * config.embeddingDim for dimensions.
 *
 * Complexity: O(N^2) for reservoir initialization.
 *
 * @param config - PNEUMA system configuration
 * @returns Initialized ESNState
 */
export function createESNFromConfig(config: PneumaConfig): ESNState {
  // JL-projected dimension: k = ceil(8 * ln(d) / eps^2)
  const jlDim = Math.ceil(8 * Math.log(config.embeddingDim) / (config.jlEps * config.jlEps));

  return initializeESN(
    config.reservoirSize,
    config.esnSpectralRadius,
    jlDim,
    jlDim,
    0.9,
    config.jlSeed,
  );
}
