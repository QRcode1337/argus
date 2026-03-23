/**
 * PNEUMA S4 -- Freudian Router
 *
 * Id / Ego / Superego decomposition engine.
 *
 * Decomposes an input signal into three psychodynamic agency vectors
 * (id, ego, superego), computes energy levels whose softmax yields
 * influence weights, and applies defense mechanism cost multipliers
 * to shape downstream response selection.
 *
 * Math:
 *   influence(a) = softmax(energyId, energyEgo, energySuperego)[a]
 *   response_cost(r) = base_cost(r) * prod_{d in active} d.costMultiplier^d.activation
 *
 * The decomposition is driven by the current CognitiveState: mood
 * biases toward Id (pleasure principle), persona toward Ego (reality
 * principle), and ethical constraints toward Superego.
 *
 * Source: SYNTHETIC-CONSCIOUSNESS PsycheStructure.toml
 */

import type {
  CognitiveState,
  CompactVector,
  DefenseMechanism,
  FreudianDecomposition,
  PneumaConfig,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute softmax over three energy values.
 *
 * Uses the max-subtraction trick for numerical stability.
 *
 * Complexity: O(1).
 *
 * @param a - First energy
 * @param b - Second energy
 * @param c - Third energy
 * @returns Tuple of [P(a), P(b), P(c)] summing to 1
 */
function softmax3(a: number, b: number, c: number): [number, number, number] {
  const max = Math.max(a, b, c);
  const ea = Math.exp(a - max);
  const eb = Math.exp(b - max);
  const ec = Math.exp(c - max);
  const sum = ea + eb + ec;
  return [ea / sum, eb / sum, ec / sum];
}

/**
 * Compute the dot product of two CompactVectors.
 *
 * Complexity: O(d) where d = min(a.length, b.length).
 */
function dot(a: CompactVector, b: CompactVector): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Compute the L2 norm of a CompactVector.
 *
 * Complexity: O(d).
 */
function norm(v: CompactVector): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/**
 * Scale a vector by a scalar, returning a new Float64Array.
 *
 * Complexity: O(d).
 */
function scale(v: CompactVector, s: number): CompactVector {
  const result = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] * s;
  }
  return result;
}

/**
 * Add two vectors element-wise, returning a new Float64Array.
 *
 * Complexity: O(d).
 */
function vadd(a: CompactVector, b: CompactVector): CompactVector {
  const len = Math.max(a.length, b.length);
  const result = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = (a[i] ?? 0) + (b[i] ?? 0);
  }
  return result;
}

/**
 * Subtract b from a element-wise, returning a new Float64Array.
 *
 * Complexity: O(d).
 */
function vsub(a: CompactVector, b: CompactVector): CompactVector {
  const len = Math.max(a.length, b.length);
  const result = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = (a[i] ?? 0) - (b[i] ?? 0);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Defense mechanism evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate which defense mechanisms are activated by the input content.
 *
 * Each mechanism has a triggerPattern (regex). If the input matches,
 * the mechanism's activation is boosted proportionally.
 *
 * Complexity: O(|defenses| * |input|) for regex matching.
 *
 * @param content   - The input text to scan
 * @param defaults  - Default defense mechanism configurations
 * @returns Active defense mechanisms with updated activation levels
 */
export function evaluateDefenses(
  content: string,
  defaults: DefenseMechanism[],
): DefenseMechanism[] {
  const result: DefenseMechanism[] = [];

  for (const def of defaults) {
    let activation = def.activation;

    try {
      const pattern = new RegExp(def.triggerPattern, 'i');
      if (pattern.test(content)) {
        // Boost activation when trigger matches, capped at 1.0
        activation = Math.min(activation + 0.3, 1.0);
      }
    } catch {
      // Invalid regex -- keep default activation
    }

    result.push({
      name: def.name,
      costMultiplier: def.costMultiplier,
      activation,
      triggerPattern: def.triggerPattern,
    });
  }

  return result;
}

/**
 * Compute the total cost multiplier from active defense mechanisms.
 *
 * Math:
 *   totalCost = prod_{d in defenses} d.costMultiplier^d.activation
 *
 * When activation is 0, the mechanism contributes factor 1 (no effect).
 * When activation is 1, the full costMultiplier applies.
 *
 * Complexity: O(|defenses|).
 *
 * @param defenses - Active defense mechanisms
 * @returns Aggregate cost multiplier (>= 1.0 in typical configurations)
 */
export function computeDefenseCost(defenses: DefenseMechanism[]): number {
  let cost = 1.0;
  for (const d of defenses) {
    if (d.activation > 0) {
      cost *= Math.pow(d.costMultiplier, d.activation);
    }
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Consciousness level estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the consciousness level distribution across Freudian layers.
 *
 * Maps the ego's dominance (from softmax influence) and defense activations
 * to a distribution over unconscious / preconscious / conscious levels.
 *
 * - High ego influence -> more conscious processing
 * - High defense activation -> more unconscious influence
 * - Balanced state -> preconscious dominates
 *
 * All three values sum to 1.0.
 *
 * Complexity: O(|defenses|).
 *
 * @param egoInfluence     - Ego's softmax weight in [0, 1]
 * @param defenses         - Active defense mechanisms
 * @returns Consciousness level distribution
 */
function estimateConsciousnessLevel(
  egoInfluence: number,
  defenses: DefenseMechanism[],
): { unconscious: number; preconscious: number; conscious: number } {
  // Average defense activation pushes toward unconscious
  let avgDefenseActivation = 0;
  if (defenses.length > 0) {
    let sum = 0;
    for (const d of defenses) {
      sum += d.activation;
    }
    avgDefenseActivation = sum / defenses.length;
  }

  // Ego influence promotes consciousness; defense activation opposes it
  const conscious = Math.max(0, egoInfluence - avgDefenseActivation * 0.5);
  const unconscious = Math.max(0, avgDefenseActivation * 0.7 + (1 - egoInfluence) * 0.3);
  const preconscious = Math.max(0, 1 - conscious - unconscious);

  // Normalize to sum to 1.0
  const total = conscious + unconscious + preconscious;
  if (total === 0) {
    return { unconscious: 0.33, preconscious: 0.34, conscious: 0.33 };
  }

  return {
    unconscious: unconscious / total,
    preconscious: preconscious / total,
    conscious: conscious / total,
  };
}

// ---------------------------------------------------------------------------
// Core decomposition
// ---------------------------------------------------------------------------

/**
 * Decompose an input embedding into Id / Ego / Superego vectors.
 *
 * The decomposition uses the current CognitiveState to project the input
 * along three psychodynamic axes:
 *
 *   Id = projection along mood direction (pleasure principle / instinct)
 *   Superego = projection along ethical/persona-normative direction
 *   Ego = residual after removing Id and Superego components (reality principle)
 *
 * Energy levels are computed from the alignment strength of each
 * projection. The softmax of energies gives influence weights:
 *   influence(a) = softmax(energyId, energyEgo, energySuperego)[a]
 *
 * Complexity: O(d) where d = embedding dimension.
 *
 * @param inputEmbedding - The input signal to decompose (JL-projected)
 * @param state          - Current cognitive state providing mood/persona context
 * @param config         - System configuration for energy baselines
 * @returns FreudianDecomposition with vectors, energies, defenses, and consciousness levels
 */
export function computeDecomposition(
  inputEmbedding: CompactVector,
  state: CognitiveState,
  config: PneumaConfig,
): FreudianDecomposition {
  const dim = inputEmbedding.length;

  // --- Id vector: projection of input onto mood direction ---
  // The Id represents instinctual drives, aligned with the current mood
  const moodNorm = norm(state.projectedMood);
  let idVector: CompactVector;
  let idStrength: number;

  if (moodNorm > 1e-12) {
    const moodUnit = scale(state.projectedMood, 1.0 / moodNorm);
    idStrength = dot(inputEmbedding, moodUnit);
    idVector = scale(moodUnit, idStrength);
  } else {
    idVector = new Float64Array(dim);
    idStrength = 0;
  }

  // --- Superego vector: projection of input onto persona direction ---
  // The Superego represents internalized norms, aligned with the persona
  const personaNorm = norm(state.projectedPersona);
  let superegoVector: CompactVector;
  let superegoStrength: number;

  if (personaNorm > 1e-12) {
    const personaUnit = scale(state.projectedPersona, 1.0 / personaNorm);
    superegoStrength = dot(inputEmbedding, personaUnit);
    superegoVector = scale(personaUnit, superegoStrength);
  } else {
    superegoVector = new Float64Array(dim);
    superegoStrength = 0;
  }

  // --- Ego vector: residual (reality principle) ---
  // What remains after removing Id and Superego projections
  const egoVector = vsub(inputEmbedding, vadd(idVector, superegoVector));
  const egoStrength = norm(egoVector);

  // --- Energy levels ---
  // Base energies from config, modulated by projection strengths
  const energyId = config.freudianEnergy.id + Math.abs(idStrength);
  const energyEgo = config.freudianEnergy.ego + egoStrength;
  const energySuperego = config.freudianEnergy.superego + Math.abs(superegoStrength);

  // --- Influence weights (for consciousness level estimation) ---
  const [, egoInfluence] = softmax3(energyId, energyEgo, energySuperego);

  // --- Defense mechanisms ---
  // Use existing defenses from state if available, otherwise defaults
  const activeDefenses = state.freudian.activeDefenses.length > 0
    ? state.freudian.activeDefenses
    : config.defaultDefenses;

  // --- Consciousness level ---
  const consciousnessLevel = estimateConsciousnessLevel(egoInfluence, activeDefenses);

  return {
    id: idVector,
    ego: egoVector,
    superego: superegoVector,
    energyId,
    energyEgo,
    energySuperego,
    activeDefenses,
    consciousnessLevel,
  };
}

/**
 * Decompose an input text into a FreudianDecomposition.
 *
 * This is the high-level entry point that:
 *   1. Evaluates defense mechanism triggers against the input text
 *   2. Computes the Id/Ego/Superego decomposition from the joint vector
 *   3. Updates defense activations based on content analysis
 *
 * Complexity: O(d + |defenses| * |input|).
 *
 * @param inputText       - Raw input text (for defense trigger matching)
 * @param inputEmbedding  - JL-projected embedding of the input
 * @param state           - Current cognitive state
 * @param config          - System configuration
 * @returns FreudianDecomposition with content-aware defense activations
 */
export function decomposeInput(
  inputText: string,
  inputEmbedding: CompactVector,
  state: CognitiveState,
  config: PneumaConfig,
): FreudianDecomposition {
  // Evaluate defense triggers against input content
  const triggeredDefenses = evaluateDefenses(inputText, config.defaultDefenses);

  // Compute the structural decomposition
  const decomposition = computeDecomposition(inputEmbedding, state, config);

  // Override defenses with content-aware activations
  decomposition.activeDefenses = triggeredDefenses;

  // Recompute consciousness level with updated defenses
  const [, egoInfluence] = softmax3(
    decomposition.energyId,
    decomposition.energyEgo,
    decomposition.energySuperego,
  );
  decomposition.consciousnessLevel = estimateConsciousnessLevel(
    egoInfluence,
    triggeredDefenses,
  );

  return decomposition;
}

/**
 * Compute the Freudian cost modifier for a candidate response.
 *
 * Math:
 *   freudianCost = baseCost * prod_{d in active} (1 + (d.costMultiplier - 1) * d.activation)
 *
 * This smoothed version avoids discontinuities: at activation = 0
 * the multiplier is 1, at activation = 1 it equals costMultiplier.
 *
 * Complexity: O(|defenses|).
 *
 * @param baseCost  - The base cost of the response
 * @param defenses  - Active defense mechanisms
 * @returns Modified cost >= baseCost
 */
export function computeFreudianCost(
  baseCost: number,
  defenses: DefenseMechanism[],
): number {
  let cost = baseCost;
  for (const d of defenses) {
    cost *= 1 + (d.costMultiplier - 1) * d.activation;
  }
  return cost;
}

/**
 * Get the influence weights for each Freudian agency.
 *
 * Returns the softmax distribution over Id, Ego, and Superego
 * energy levels. The agency with highest influence dominates
 * response selection.
 *
 * Complexity: O(1).
 *
 * @param decomposition - A computed FreudianDecomposition
 * @returns Object with id, ego, superego influence weights summing to 1
 */
export function getInfluenceWeights(
  decomposition: FreudianDecomposition,
): { id: number; ego: number; superego: number } {
  const [id, ego, superego] = softmax3(
    decomposition.energyId,
    decomposition.energyEgo,
    decomposition.energySuperego,
  );
  return { id, ego, superego };
}
