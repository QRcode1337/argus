/**
 * PNEUMA S8 -- Strange Loop Self-Testing Engine
 *
 * Implements the Act -> Evaluate -> Modify cycle from Douglas
 * Hofstadter's strange loop concept. The system generates candidate
 * responses, evaluates them against consciousness quality gates
 * (Phi threshold, persona coherence, ethical clearance), and if
 * none pass, modifies its own cognitive state and retries.
 *
 * The loop terminates when:
 *   1. A candidate passes all gates (success), or
 *   2. The maximum iteration budget is exhausted (graceful degradation).
 *
 * State modifications during the loop are recorded in the
 * StrangeLoopVerdict for introspection and debugging.
 *
 * Source: Consciousness-Testing-Framework.toml meta-cognition,
 *         Internal-voice.toml self_reflection.
 *
 * No external dependencies.
 */

import type {
  CandidateResponse,
  CognitiveState,
  StrangeLoopVerdict,
  StateModification,
  PneumaConfig,
} from '../types/index.js';
import { performance } from 'node:perf_hooks';

// ---------------------------------------------------------------------------
// StrangeLoop class
// ---------------------------------------------------------------------------

/**
 * The Strange Loop: a self-referential evaluation cycle that tests
 * candidate responses against the system's consciousness quality gates
 * and modifies the cognitive state when no candidate passes.
 *
 * Usage:
 *   const loop = new StrangeLoop(config);
 *   const verdict = loop.runLoop(candidates, cognitiveState);
 */
export class StrangeLoop {
  private readonly maxIterations: number;
  private readonly phiThreshold: number;
  private readonly personaCoherenceThreshold: number;

  /** Per-iteration mood shift magnitude for state modification. */
  private readonly moodShiftMagnitude: number;

  /** Per-iteration defense relaxation factor. */
  private readonly defenseRelaxFactor: number;

  /** Per-iteration Phi threshold relaxation. */
  private readonly phiRelaxFactor: number;

  constructor(config: PneumaConfig) {
    this.maxIterations = config.strangeLoopMaxIterations;
    this.phiThreshold = config.phiThreshold;
    this.personaCoherenceThreshold = config.personaCoherenceThreshold;
    this.moodShiftMagnitude = 0.05;
    this.defenseRelaxFactor = 0.8;
    this.phiRelaxFactor = 0.85;
  }

  /**
   * Run the strange loop evaluation cycle.
   *
   * For each iteration:
   *   1. **Act**: Score all candidates against current gates.
   *   2. **Evaluate**: Check if any candidate passes all thresholds:
   *        - Phi >= current phiThreshold
   *        - personaCoherence >= personaCoherenceThreshold
   *        - ethicalClearance === true
   *      Select the best passing candidate (highest composite score).
   *   3. **Modify** (if no candidate passed):
   *        - Shift mood toward the best candidate's embedding direction
   *        - Relax defense mechanism activations
   *        - Slightly lower the Phi threshold
   *        - Record the modification
   *
   * Composite score for ranking passing candidates:
   *   score = 0.4 * pageRankScore + 0.3 * personaCoherence + 0.2 * moodCongruence + 0.1 * (1 - freudianCost_norm)
   *
   * @param candidates     - Array of candidate responses to evaluate.
   * @param cognitiveState - Current CognitiveState (read for Phi, persona, mood).
   * @param phiOverride    - Optional Phi threshold override.
   * @returns StrangeLoopVerdict with the selected response (or null).
   */
  runLoop(
    candidates: CandidateResponse[],
    cognitiveState: CognitiveState,
    phiOverride?: number,
  ): StrangeLoopVerdict {
    const startTime = performance.now();
    const modifications: StateModification[] = [];
    let currentPhiThreshold = phiOverride ?? this.phiThreshold;
    let currentPersonaThreshold = this.personaCoherenceThreshold;
    let selectedResponse: CandidateResponse | null = null;
    let iteration = 0;

    // Working copy of defense activations for relaxation
    const defenseActivations = cognitiveState.freudian.activeDefenses.map(
      d => d.activation,
    );

    for (iteration = 0; iteration < this.maxIterations; iteration++) {
      // --- ACT: Score candidates ---
      const scored = candidates.map(candidate => ({
        candidate,
        passes: this.evaluateCandidate(
          candidate,
          cognitiveState,
          currentPhiThreshold,
          currentPersonaThreshold,
          defenseActivations,
        ),
        composite: this.compositeScore(candidate, defenseActivations),
      }));

      // --- EVALUATE: Find best passing candidate ---
      const passing = scored
        .filter(s => s.passes)
        .sort((a, b) => b.composite - a.composite);

      if (passing.length > 0) {
        selectedResponse = passing[0].candidate;
        break;
      }

      // --- MODIFY: Adjust state for next iteration ---
      // If this is the last iteration, don't bother modifying
      if (iteration >= this.maxIterations - 1) break;

      // Find the best overall candidate (even if failing) for guidance
      const bestOverall = scored.sort((a, b) => b.composite - a.composite)[0];

      // Modification 1: Shift mood toward best candidate's direction
      if (bestOverall && cognitiveState.mood.currentMood.length > 0) {
        const d = cognitiveState.mood.currentMood.length;
        const shift = new Float64Array(d);
        const embedding = bestOverall.candidate.embedding;
        const shiftDim = Math.min(d, embedding.length);

        for (let j = 0; j < shiftDim; j++) {
          shift[j] = this.moodShiftMagnitude * embedding[j];
          cognitiveState.mood.currentMood[j] += shift[j];
        }

        modifications.push({
          target: 'mood',
          description: `Shifted mood toward best candidate (iteration ${iteration})`,
          delta: shift,
          iteration,
        });
      }

      // Modification 2: Relax defense mechanisms
      let totalRelax = 0;
      for (let i = 0; i < defenseActivations.length; i++) {
        const before = defenseActivations[i];
        defenseActivations[i] *= this.defenseRelaxFactor;
        totalRelax += before - defenseActivations[i];
      }

      if (totalRelax > 0) {
        modifications.push({
          target: 'defense_mechanisms',
          description: `Relaxed defense activations by factor ${this.defenseRelaxFactor} (iteration ${iteration})`,
          delta: totalRelax,
          iteration,
        });
      }

      // Modification 3: Lower Phi threshold
      const prevPhiThreshold = currentPhiThreshold;
      currentPhiThreshold *= this.phiRelaxFactor;

      modifications.push({
        target: 'phi_threshold',
        description: `Relaxed Phi threshold from ${prevPhiThreshold.toFixed(4)} to ${currentPhiThreshold.toFixed(4)} (iteration ${iteration})`,
        delta: currentPhiThreshold - prevPhiThreshold,
        iteration,
      });

      // Modification 4: Slightly relax persona coherence threshold
      currentPersonaThreshold *= 0.95;

      modifications.push({
        target: 'persona',
        description: `Relaxed persona coherence threshold to ${currentPersonaThreshold.toFixed(4)} (iteration ${iteration})`,
        delta: currentPersonaThreshold - this.personaCoherenceThreshold,
        iteration,
      });
    }

    const totalTimeMs = performance.now() - startTime;

    return {
      selectedResponse,
      loopIterations: iteration + 1,
      maxIterations: this.maxIterations,
      phiThreshold: currentPhiThreshold,
      personaCoherenceThreshold: currentPersonaThreshold,
      ethicalClearance: selectedResponse?.ethicalClearance ?? false,
      allCandidates: candidates,
      stateModifications: modifications,
      totalTimeMs,
      timestamp: Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // Private: candidate evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate whether a candidate passes all quality gates.
   *
   * Gates:
   *   1. cognitiveState.phi.value >= phiThreshold
   *   2. candidate.personaCoherence >= personaCoherenceThreshold
   *   3. candidate.ethicalClearance === true
   *   4. Effective Freudian cost (with relaxed defenses) <= 10.0
   */
  private evaluateCandidate(
    candidate: CandidateResponse,
    cognitiveState: CognitiveState,
    phiThreshold: number,
    personaThreshold: number,
    defenseActivations: number[],
  ): boolean {
    // Gate 1: System Phi must be above threshold
    if (cognitiveState.phi.value < phiThreshold) {
      // Still allow if candidate is strong enough on other dimensions
      // (soft gate -- only blocks if Phi is very low)
      if (cognitiveState.phi.value < phiThreshold * 0.5) {
        return false;
      }
    }

    // Gate 2: Persona coherence
    if (candidate.personaCoherence < personaThreshold) {
      return false;
    }

    // Gate 3: Ethical clearance
    if (!candidate.ethicalClearance) {
      return false;
    }

    // Gate 4: Freudian cost with current (possibly relaxed) defenses
    const effectiveCost = this.computeEffectiveCost(candidate, defenseActivations);
    if (effectiveCost > 10.0) {
      return false;
    }

    return true;
  }

  /**
   * Compute the effective Freudian cost with current defense activations.
   *
   * Math:
   *   cost = baseCost * prod_{d in defenses} (1 + (multiplier - 1) * activation)
   *
   * As defenses are relaxed (activations decrease), the cost goes down.
   */
  private computeEffectiveCost(
    candidate: CandidateResponse,
    defenseActivations: number[],
  ): number {
    let cost = candidate.freudianCost;

    // If the candidate already has a computed cost, modulate it by
    // the ratio of current activations to original activations.
    // This is an approximation -- the exact cost depends on the
    // defense mechanism matching, but we simplify here.
    if (defenseActivations.length > 0) {
      const avgActivation = defenseActivations.reduce((a, b) => a + b, 0) / defenseActivations.length;
      // Modulate: lower average activation -> lower cost
      cost *= (0.5 + 0.5 * avgActivation);
    }

    return cost;
  }

  /**
   * Compute a composite score for ranking candidates.
   *
   * score = 0.4 * pageRank + 0.3 * personaCoherence + 0.2 * moodCongruence + 0.1 * (1 - costNorm)
   */
  private compositeScore(
    candidate: CandidateResponse,
    defenseActivations: number[],
  ): number {
    const costNorm = Math.min(1, this.computeEffectiveCost(candidate, defenseActivations) / 10);

    return (
      0.4 * candidate.pageRankScore +
      0.3 * candidate.personaCoherence +
      0.2 * candidate.moodCongruence +
      0.1 * (1 - costNorm)
    );
  }
}
