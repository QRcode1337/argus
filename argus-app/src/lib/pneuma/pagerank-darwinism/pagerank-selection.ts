/**
 * PNEUMA S6 -- PageRank Darwinism: PageRank Selection
 *
 * Runs power-iteration PageRank over the conversation graph to score
 * candidate responses. The highest-scoring candidate is selected as
 * the winner ("survival of the fittest" response).
 *
 * PageRank equation:
 *   r(t+1) = alpha * uniform + (1 - alpha) * W^T * r(t)
 *
 * Neural Darwinism: losing candidates are penalized via decayCandidates,
 * reducing their pageRankScore so they are less likely to win in
 * subsequent rounds. This implements competitive selection pressure.
 *
 * The iteration budget is controlled by ResourceBudget.pageRankIterationBudget
 * from the Phi Router (S1).
 */

import type {
  CandidateResponse,
  NodeId,
} from '../types/index.js';
import { ConversationGraph } from './conversation-graph.js';

// ---------------------------------------------------------------------------
// PageRank result
// ---------------------------------------------------------------------------

/**
 * Result of PageRank selection over the conversation graph.
 */
export interface PageRankResult {
  /** Ranked candidates, highest PageRank first. */
  ranked: Array<{ candidate: CandidateResponse; score: number }>;
  /** The winning candidate (highest PageRank score). */
  winner: CandidateResponse | null;
  /** Index of the winner in the candidates array (-1 if none). */
  winnerIndex: number;
  /** Number of power iterations performed. */
  iterations: number;
  /** L1 residual at convergence (or when budget exhausted). */
  residual: number;
  /** Whether the algorithm converged before exhausting iterations. */
  converged: boolean;
}

// ---------------------------------------------------------------------------
// selectWinner
// ---------------------------------------------------------------------------

/**
 * Run PageRank over the conversation graph and select the winning
 * candidate response.
 *
 * Standard PageRank iteration:
 *   r(t+1) = alpha * uniform + (1 - alpha) * W^T * r(t)
 *
 * where W is the row-normalized weighted adjacency matrix derived
 * from the conversation graph edges.
 *
 * Complexity: O(iterations * |E|) where |E| = number of edges.
 *
 * @param graph      - The conversation graph with edges already built
 * @param candidates - Active candidate responses to rank
 * @param iterations - Max power iterations (from ResourceBudget.pageRankIterationBudget)
 * @param alpha      - Teleportation probability. Default 0.15.
 * @param tolerance  - Convergence threshold on L1 norm of delta. Default 1e-6.
 * @returns The winning CandidateResponse (highest PageRank), or null if empty
 */
export function selectWinner(
  graph: ConversationGraph,
  candidates: CandidateResponse[],
  iterations: number,
  alpha: number = 0.15,
  tolerance: number = 1e-6,
): PageRankResult {
  if (candidates.length === 0) {
    return { ranked: [], winner: null, winnerIndex: -1, iterations: 0, residual: 0, converged: true };
  }

  // Build indexed node list from graph
  const nodeIds = Array.from(graph.nodes.keys());
  const n = nodeIds.length;

  if (n === 0) {
    return { ranked: [], winner: null, winnerIndex: -1, iterations: 0, residual: 0, converged: true };
  }

  const nodeIndex = new Map<NodeId, number>();
  for (let i = 0; i < n; i++) {
    nodeIndex.set(nodeIds[i], i);
  }

  // Precompute weighted out-degrees and adjacency
  const outDegree = new Float64Array(n);
  const adj: Array<Array<{ target: number; weight: number }>> = new Array(n);
  for (let i = 0; i < n; i++) {
    adj[i] = [];
  }

  for (let i = 0; i < n; i++) {
    const edges = graph.getOutEdges(nodeIds[i]);
    for (const edge of edges) {
      const targetIdx = nodeIndex.get(edge.target);
      if (targetIdx === undefined) continue;
      adj[i].push({ target: targetIdx, weight: edge.weight });
      outDegree[i] += edge.weight;
    }
  }

  // Uniform teleportation vector
  const uniform = 1 / n;

  // Initialize PageRank vector uniformly
  let r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    r[i] = uniform;
  }

  let iterCount = 0;
  let residual = Infinity;
  let converged = false;

  // Power iteration: r(t+1) = alpha * uniform + (1 - alpha) * W^T * r(t)
  for (let iter = 0; iter < iterations; iter++) {
    const rNext = new Float64Array(n);

    // Teleportation component: alpha * (1/n)
    for (let i = 0; i < n; i++) {
      rNext[i] = alpha * uniform;
    }

    // Dangling node mass: nodes with no outgoing edges
    let danglingMass = 0;
    for (let i = 0; i < n; i++) {
      if (outDegree[i] === 0) {
        danglingMass += r[i];
      }
    }

    // Redistribute dangling mass uniformly
    const danglingContrib = (1 - alpha) * danglingMass * uniform;
    for (let i = 0; i < n; i++) {
      rNext[i] += danglingContrib;
    }

    // Transition: push mass along edges (W^T * r)
    for (let u = 0; u < n; u++) {
      if (outDegree[u] === 0) continue;
      const pushMass = (1 - alpha) * r[u] / outDegree[u];
      for (const { target, weight } of adj[u]) {
        rNext[target] += pushMass * weight;
      }
    }

    // Compute L1 residual
    residual = 0;
    for (let i = 0; i < n; i++) {
      residual += Math.abs(rNext[i] - r[i]);
    }

    r = rNext;
    iterCount = iter + 1;

    if (residual < tolerance) {
      converged = true;
      break;
    }
  }

  // Extract scores for candidates and find winner
  const ranked: Array<{ candidate: CandidateResponse; score: number }> = [];
  for (const c of candidates) {
    const idx = nodeIndex.get(c.id);
    if (idx === undefined) continue;
    ranked.push({ candidate: c, score: r[idx] });
  }

  ranked.sort((a, b) => b.score - a.score);

  // Find winner index in the original candidates array
  const winner = ranked.length > 0 ? ranked[0].candidate : null;
  const winnerIndex = winner ? candidates.indexOf(winner) : -1;

  return {
    ranked,
    winner,
    winnerIndex,
    iterations: iterCount,
    residual,
    converged,
  };
}

// ---------------------------------------------------------------------------
// Neural Darwinism: decay losers
// ---------------------------------------------------------------------------

/**
 * Apply Neural Darwinism penalty to losing candidates.
 *
 * The winner's pageRankScore is boosted, while all losers have their
 * pageRankScore decayed by a penalty factor. This creates competitive
 * selection pressure: candidates that repeatedly lose will have
 * progressively lower scores and are less likely to be selected in
 * future rounds.
 *
 * Mutation is in-place on the candidate objects.
 *
 * @param candidates   - All candidate responses
 * @param winnerIndex  - Index of the winner in the candidates array
 * @param decayFactor  - Multiplicative penalty for losers. Default 0.8 (20% decay).
 * @param boostFactor  - Multiplicative boost for the winner. Default 1.1 (10% boost).
 */
export function decayCandidates(
  candidates: CandidateResponse[],
  winnerIndex: number,
  decayFactor: number = 0.8,
  boostFactor: number = 1.1,
): void {
  for (let i = 0; i < candidates.length; i++) {
    if (i === winnerIndex) {
      // Winner gets boosted (capped at 1.0)
      candidates[i].pageRankScore = Math.min(
        1.0,
        candidates[i].pageRankScore * boostFactor,
      );
    } else {
      // Losers get penalized (floored at 0)
      candidates[i].pageRankScore = Math.max(
        0,
        candidates[i].pageRankScore * decayFactor,
      );
    }
  }
}
