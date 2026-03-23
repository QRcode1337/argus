/**
 * PNEUMA S1 -- Resource Allocator
 *
 * Converts a PhiScore into concrete compute budgets for all downstream
 * subsystems. This is the master resource allocation function -- every
 * other subsystem's precision, iteration count, and threshold is
 * determined by the current level of integrated information.
 *
 * Design principle: higher Phi (more consciousness integration) warrants
 * tighter tolerances and more compute. Low Phi means the system is
 * fragmented and should use cheap, relaxed processing.
 *
 * Allocation curves:
 *   Most budgets use a sigmoid mapping from Phi to the budget range,
 *   ensuring smooth transitions and bounded outputs:
 *
 *   budget(phi) = low + (high - low) * sigmoid(k * (phi - midpoint))
 *   sigmoid(x) = 1 / (1 + exp(-x))
 *
 * The midpoint and steepness k are calibrated per-subsystem.
 */

import type { PhiScore, PneumaConfig } from '../types/index';

// ---------------------------------------------------------------------------
// ResourceBudget type
// ---------------------------------------------------------------------------

/**
 * Compute budget allocated to each downstream subsystem based on Phi.
 *
 * Each field controls a specific precision/effort knob:
 *
 *   memoryEpsilon            -- Forward Push residual tolerance for S5
 *                               (Memory Graph). Lower = more precise PPR.
 *   ethicalHeuristicCeiling  -- Max f-cost for A* ethical navigation in S4.
 *                               Lower = stricter ethical bar.
 *   strangeLoopThreshold     -- Phi threshold for Strange Loop acceptance in S8.
 *                               Higher = harder to pass self-reflection.
 *   pageRankIterationBudget  -- Max iterations for PPR computation in S6.
 *                               More iterations = more accurate ranking.
 *   temporalLeadBeamWidth    -- Beam width for temporal prediction in S9.
 *                               Wider = more candidates explored.
 */
export interface ResourceBudget {
  /** Forward Push epsilon for memory retrieval (S5). Range: [1e-8, 1e-4]. */
  memoryEpsilon: number;

  /** A* heuristic ceiling for ethical navigation (S4). Range: [2.0, 20.0]. */
  ethicalHeuristicCeiling: number;

  /** Phi threshold for Strange Loop self-consistency check (S8). Range: [0.1, 0.9]. */
  strangeLoopThreshold: number;

  /** Max PageRank power iterations for response ranking (S6). Range: [10, 500]. */
  pageRankIterationBudget: number;

  /** Beam width for temporal prediction (S9). Range: [1, 20]. */
  temporalLeadBeamWidth: number;

  /** The Phi value that produced this budget. */
  sourcePhi: number;

  /** The method used to compute the source Phi. */
  sourceMethod: PhiScore['method'];

  /** Timestamp when this budget was computed. */
  allocatedAt: number;
}

// ---------------------------------------------------------------------------
// Sigmoid utility
// ---------------------------------------------------------------------------

/**
 * Standard logistic sigmoid: 1 / (1 + exp(-x)).
 * Clamped to avoid floating-point overflow.
 */
function sigmoid(x: number): number {
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Map a Phi value to a budget range using a sigmoid curve.
 *
 * @param phi      - Input Phi value (>= 0, typically 0 to ~5).
 * @param low      - Budget value when Phi is very low.
 * @param high     - Budget value when Phi is very high.
 * @param midpoint - Phi value at the sigmoid midpoint (50% between low and high).
 * @param steepness - How sharply the transition occurs. Higher = sharper.
 * @returns Mapped budget value in [low, high] (or [high, low] if high < low).
 */
function sigmoidMap(phi: number, low: number, high: number, midpoint: number, steepness: number): number {
  return low + (high - low) * sigmoid(steepness * (phi - midpoint));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Allocate compute resources across all PNEUMA subsystems based on the
 * current Phi score and system configuration.
 *
 * Allocation logic per subsystem:
 *
 *   S5 (Memory): memoryEpsilon
 *     High Phi -> epsilon = 1e-8 (very precise retrieval)
 *     Low  Phi -> epsilon = 1e-4 (relaxed, fast retrieval)
 *     Midpoint at phiThreshold from config.
 *
 *   S4 (Ethics): ethicalHeuristicCeiling
 *     High Phi -> ceiling = 2.0 (strict ethical bar)
 *     Low  Phi -> ceiling = 20.0 (relaxed, most paths pass)
 *     High integration demands more careful ethical reasoning.
 *
 *   S8 (Strange Loop): strangeLoopThreshold
 *     High Phi -> threshold = 0.8 (hard to satisfy self-reflection)
 *     Low  Phi -> threshold = 0.15 (easy pass, save compute)
 *     Scales with the system's capacity for self-reflection.
 *
 *   S6 (PageRank): pageRankIterationBudget
 *     High Phi -> 500 iterations (thorough ranking)
 *     Low  Phi -> 10 iterations  (quick approximate ranking)
 *
 *   S9 (Temporal): temporalLeadBeamWidth
 *     High Phi -> beam width 20 (explore many futures)
 *     Low  Phi -> beam width 1  (greedy single prediction)
 *     Capped by config.beamWidth.
 *
 * @param phi    - The current Phi score from the approximation engine.
 * @param config - System-wide PNEUMA configuration.
 * @returns ResourceBudget with concrete allocations for each subsystem.
 */
export function allocateResources(phi: PhiScore, config: PneumaConfig): ResourceBudget {
  const phiVal = phi.value;
  const mid = config.phiThreshold;

  // Steepness calibrated so that the transition region spans roughly
  // [mid - 0.5, mid + 0.5] in Phi space.
  const k = 6;

  // S5: Memory epsilon (inverse relationship -- high Phi = small epsilon)
  // Use log-space mapping for epsilon since it spans orders of magnitude.
  const logEpsHigh = Math.log(1e-8); // high Phi -> tight epsilon
  const logEpsLow = Math.log(config.memoryPushEpsilon || 1e-4); // low Phi -> relaxed
  const memoryEpsilon = Math.exp(sigmoidMap(phiVal, logEpsLow, logEpsHigh, mid, k));

  // S4: Ethical heuristic ceiling (inverse -- high Phi = low ceiling)
  const ethicalHeuristicCeiling = sigmoidMap(phiVal, config.ethicalDiameter * 2, config.ethicalDiameter * 0.2, mid, k);

  // S8: Strange Loop threshold (direct -- high Phi = high threshold)
  const strangeLoopThreshold = sigmoidMap(phiVal, 0.15, 0.8, mid, k);

  // S6: PageRank iteration budget (direct -- high Phi = more iterations)
  const pageRankIterationBudget = Math.round(sigmoidMap(phiVal, 10, 500, mid, k));

  // S9: Temporal beam width (direct -- high Phi = wider beam)
  const maxBeam = Math.max(config.beamWidth, 1);
  const temporalLeadBeamWidth = Math.round(
    Math.min(sigmoidMap(phiVal, 1, 20, mid, k), maxBeam),
  );

  return {
    memoryEpsilon,
    ethicalHeuristicCeiling,
    strangeLoopThreshold,
    pageRankIterationBudget,
    temporalLeadBeamWidth,
    sourcePhi: phiVal,
    sourceMethod: phi.method,
    allocatedAt: Date.now(),
  };
}
