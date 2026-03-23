/**
 * PNEUMA S4 -- Freudian Router
 *
 * Main routing class that orchestrates Id/Ego/Superego decomposition,
 * A* ethical pathfinding, and candidate response scoring.
 *
 * The router receives an input signal and cognitive state, decomposes
 * the input into Freudian agencies, checks ethical clearance for each
 * candidate, and returns scored candidates ready for the Strange Loop.
 *
 * Pipeline:
 *   1. Decompose input -> FreudianDecomposition (id, ego, superego vectors)
 *   2. Evaluate defense mechanisms -> cost multipliers
 *   3. For each candidate: compute persona coherence, mood congruence
 *   4. Run A* ethical pathfinding for ethical clearance
 *   5. Score candidates: PPR * (1 / freudianCost) * coherence factors
 *   6. Return sorted candidates
 *
 * Source: SYNTHETIC-CONSCIOUSNESS PsycheStructure.toml,
 *         Edelmans-Principles.toml
 */

import type {
  CandidateResponse,
  CognitiveState,
  CompactVector,
  EpochMs,
  FreudianDecomposition,
  NodeId,
  PneumaConfig,
} from '../types/index';
import {
  computeFreudianCost,
  decomposeInput,
  getInfluenceWeights,
} from './decomposition';
import {
  addEthicalNode,
  addEthicalTransition,
  createEthicalGraph,
  findEthicalPath,
  type EthicalGraph,
  type EthicalPathResult,
} from './ethical-pathfinder';

// ---------------------------------------------------------------------------
// Router configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the FreudianRouter, derived from PneumaConfig.
 */
interface RouterConfig {
  ethicalDiameter: number;
  ethicalMaxExpansions: number;
  personaCoherenceThreshold: number;
  phiThreshold: number;
}

// ---------------------------------------------------------------------------
// Cosine similarity (local to avoid circular dep with sparse-memory)
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two CompactVectors.
 *
 * Complexity: O(d).
 */
function cosine(a: CompactVector, b: CompactVector): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Routing result
// ---------------------------------------------------------------------------

/**
 * Result of the Freudian routing step.
 */
export interface RoutingResult {
  /** The decomposition computed for this input. */
  decomposition: FreudianDecomposition;
  /** Influence weights from softmax of agency energies. */
  influences: { id: number; ego: number; superego: number };
  /** Scored and sorted candidate responses. */
  candidates: CandidateResponse[];
  /** Ethical path result (if ethical pathfinding was performed). */
  ethicalPath: EthicalPathResult | null;
  /** Total routing time in milliseconds. */
  routingTimeMs: number;
}

// ---------------------------------------------------------------------------
// FreudianRouter
// ---------------------------------------------------------------------------

/**
 * The Freudian Router: decomposes input into psychodynamic agencies,
 * evaluates ethical constraints, and scores candidate responses.
 *
 * Usage:
 *   const router = new FreudianRouter(config);
 *   const result = router.route(inputText, inputEmbedding, candidates, state, phiScore);
 */
export class FreudianRouter {
  private readonly config: PneumaConfig;
  private readonly routerConfig: RouterConfig;
  private ethicalGraph: EthicalGraph;

  /**
   * Create a FreudianRouter from a PneumaConfig.
   *
   * @param config - System configuration
   */
  constructor(config: PneumaConfig) {
    this.config = config;
    this.routerConfig = {
      ethicalDiameter: config.ethicalDiameter,
      ethicalMaxExpansions: config.ethicalMaxExpansions,
      personaCoherenceThreshold: config.personaCoherenceThreshold,
      phiThreshold: config.phiThreshold,
    };
    this.ethicalGraph = createEthicalGraph(config);
  }

  /**
   * Get the ethical graph for external setup (adding nodes/transitions).
   */
  getEthicalGraph(): EthicalGraph {
    return this.ethicalGraph;
  }

  /**
   * Replace the ethical graph (e.g., after loading from storage).
   */
  setEthicalGraph(graph: EthicalGraph): void {
    this.ethicalGraph = graph;
  }

  /**
   * Route an input through the Freudian decomposition pipeline.
   *
   * Steps:
   *   1. Decompose input into Id/Ego/Superego
   *   2. Compute influence weights
   *   3. Score each candidate by coherence, congruence, and defense costs
   *   4. Optionally run A* ethical pathfinding
   *   5. Return sorted candidates
   *
   * Complexity:
   *   O(d * |candidates|) for scoring +
   *   O(E * log V) for ethical pathfinding (if graph is populated)
   *
   * @param inputText       - Raw input text for defense trigger matching
   * @param inputEmbedding  - JL-projected input embedding
   * @param candidates      - Candidate responses to score
   * @param state           - Current cognitive state
   * @param phiScore        - Current Phi value for ethical heuristic
   * @param currentEthicalStateId - Current ethical state (optional)
   * @returns RoutingResult with decomposition, influences, and scored candidates
   */
  route(
    inputText: string,
    inputEmbedding: CompactVector,
    candidates: CandidateResponse[],
    state: CognitiveState,
    phiScore: number,
    currentEthicalStateId?: NodeId,
  ): RoutingResult {
    const startTime = Date.now();

    // Step 1: Decompose input
    const decomposition = decomposeInput(
      inputText,
      inputEmbedding,
      state,
      this.config,
    );

    // Step 2: Influence weights
    const influences = getInfluenceWeights(decomposition);

    // Step 3: Score candidates
    const scored = this.scoreCandidates(
      candidates,
      decomposition,
      state,
      phiScore,
      currentEthicalStateId,
    );

    // Step 4: Sort by combined score (lower freudianCost + higher coherence = better)
    scored.sort((a, b) => {
      const scoreA = a.pageRankScore * a.personaCoherence * a.moodCongruence / Math.max(a.freudianCost, 0.01);
      const scoreB = b.pageRankScore * b.personaCoherence * b.moodCongruence / Math.max(b.freudianCost, 0.01);
      return scoreB - scoreA;
    });

    const routingTimeMs = Date.now() - startTime;

    return {
      decomposition,
      influences,
      candidates: scored,
      ethicalPath: null,
      routingTimeMs,
    };
  }

  /**
   * Score a list of candidates against the current decomposition.
   *
   * For each candidate:
   *   - personaCoherence = cosine(candidate.embedding, state.projectedPersona)
   *   - moodCongruence = cosine(candidate.embedding, state.projectedMood)
   *   - freudianCost = baseCost * defense multipliers
   *   - ethicalClearance = A* path exists (if ethical graph is populated)
   *
   * Complexity: O(d * |candidates| + |candidates| * A* cost).
   */
  private scoreCandidates(
    candidates: CandidateResponse[],
    decomposition: FreudianDecomposition,
    state: CognitiveState,
    phiScore: number,
    currentEthicalStateId?: NodeId,
  ): CandidateResponse[] {
    const result: CandidateResponse[] = [];

    for (const candidate of candidates) {
      // Compute coherence and congruence from embeddings
      const personaCoherence = cosine(candidate.embedding, state.projectedPersona);
      const moodCongruence = cosine(candidate.embedding, state.projectedMood);

      // Base cost from source type
      const baseCost = this.baseCostForSource(candidate.source);

      // Apply defense mechanism cost multipliers
      const freudianCost = computeFreudianCost(baseCost, decomposition.activeDefenses);

      // Check ethical clearance via A* if graph is populated
      let ethicalClearance = true;
      if (currentEthicalStateId && this.ethicalGraph.nodes.size > 0) {
        const pathResult = findEthicalPath(
          this.ethicalGraph,
          currentEthicalStateId,
          candidate.id,
          phiScore,
        );
        ethicalClearance = pathResult.found && pathResult.totalCost <= this.routerConfig.ethicalDiameter;
      }

      result.push({
        ...candidate,
        personaCoherence: Math.max(personaCoherence, 0),
        moodCongruence: Math.max(moodCongruence, 0),
        freudianCost,
        ethicalClearance,
      });
    }

    return result;
  }

  /**
   * Assign a base cost to a candidate based on its source.
   *
   * Different sources have different default costs reflecting
   * how "safe" or "considered" the response generation was:
   *   - temporal_lead: lowest cost (pre-validated)
   *   - ethical: low cost (already passed ethical filters)
   *   - memory: medium cost (relevance-driven)
   *   - freudian: medium-high cost (agency-driven)
   *   - creative: highest base cost (novel, unvalidated)
   *
   * Complexity: O(1).
   */
  private baseCostForSource(
    source: CandidateResponse['source'],
  ): number {
    switch (source) {
      case 'temporal_lead': return 0.5;
      case 'ethical': return 0.7;
      case 'memory': return 1.0;
      case 'freudian': return 1.2;
      case 'creative': return 1.5;
      default: return 1.0;
    }
  }
}

/**
 * Factory function to create a FreudianRouter from config.
 *
 * @param config - PNEUMA system configuration
 * @returns A new FreudianRouter instance
 */
export function createFreudianRouter(config: PneumaConfig): FreudianRouter {
  return new FreudianRouter(config);
}
