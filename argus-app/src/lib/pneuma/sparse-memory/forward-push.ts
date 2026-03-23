/**
 * PNEUMA S5 -- Sparse Memory Retrieval Engine
 *
 * Forward Push algorithm for approximate Personalized PageRank (PPR).
 *
 * This is the core retrieval primitive: given a source node s in the
 * memory graph, compute approximate PPR scores pi(v) for all reachable
 * nodes. The key property is that Forward Push is LOCAL -- it only
 * touches nodes whose residual exceeds a threshold, making it O(1/eps)
 * total work regardless of graph size.
 *
 * PPR equation:
 *   pi(v) = alpha * 1_{v=s} + (1-alpha) * sum_{u->v} pi(u) / d_out(u)
 *
 * Push rule: when r[v] / d_out(v) >= epsilon,
 *   1. Move alpha * r[v] from r[v] to pi[v]
 *   2. Distribute (1-alpha) * r[v] / d_out(v) to each neighbor u of v
 *   3. Set r[v] = 0
 *
 * Reference: Andersen, Chung, Lang. "Local Graph Partitioning using
 * PageRank Vectors." FOCS 2006.
 */

import type { MemoryGraph, NodeId } from '../types/index';
import { getRow } from './csr-matrix';

/**
 * Compute approximate Personalized PageRank via Forward Push.
 *
 * This function is genuinely sublinear: it maintains a work queue of
 * nodes with high residual and only processes those nodes. Total work
 * is O(1/epsilon) pushes, independent of graph size |V|.
 *
 * The algorithm maintains two sparse vectors:
 *   - pi (estimate): accumulated PPR probability mass
 *   - r  (residual): mass that has not yet been pushed
 *
 * Initially r[source] = 1 and all other entries are 0.
 * The algorithm terminates when no node v has r[v]/d_out(v) >= epsilon.
 *
 * Complexity:
 *   Time:  O(1/epsilon) push operations total
 *   Space: O(number of nodes touched) -- sparse maps, not full arrays
 *
 * @param graph    - The memory graph with CSR adjacency and degree arrays
 * @param sourceId - The seed node for personalization
 * @param epsilon  - Residual tolerance. Smaller = more precise, more work.
 *                   Typically set by Phi Router: high Phi -> small epsilon.
 * @param alpha    - Teleportation probability (damping factor).
 *                   Higher alpha = more weight on source node.
 *                   Default from PneumaConfig: 0.85.
 * @returns Map from NodeId to approximate PPR score (only non-zero entries)
 */
export function forwardPush(
  graph: MemoryGraph,
  sourceId: NodeId,
  epsilon: number,
  alpha: number,
): Map<NodeId, number> {
  const sourceIdx = graph.nodeIndex.get(sourceId);
  if (sourceIdx === undefined) {
    return new Map();
  }

  // Sparse residual and estimate vectors, indexed by internal node index.
  // Using Maps instead of dense arrays is critical: we must NOT allocate
  // or iterate over |V|-sized structures.
  const residual = new Map<number, number>();
  const estimate = new Map<number, number>();

  // Initialize: all mass starts as residual at the source
  residual.set(sourceIdx, 1.0);

  // Work queue: set of node indices with r[v]/d_out(v) >= epsilon.
  // Using a Set for O(1) membership checks and iteration.
  const activeQueue = new Set<number>();

  // Check if source should be in the queue
  const sourceDegree = graph.outDegrees[sourceIdx];
  if (sourceDegree === 0) {
    // Dangling node: treat d_out as 1 for the threshold check
    // (all residual teleports back via alpha)
    if (1.0 >= epsilon) {
      activeQueue.add(sourceIdx);
    }
  } else if (1.0 / sourceDegree >= epsilon) {
    activeQueue.add(sourceIdx);
  }

  // Main push loop -- only processes nodes in the active queue.
  // Each push reduces total residual, guaranteeing termination.
  // Total number of pushes is bounded by O(1/epsilon).
  while (activeQueue.size > 0) {
    // Pick an arbitrary active node (Set iteration gives first element)
    const v = activeQueue.values().next().value!;
    activeQueue.delete(v);

    const rv = residual.get(v);
    if (rv === undefined || rv === 0) continue;

    const dv = graph.outDegrees[v];

    // Re-check threshold (residual may have changed since enqueue)
    const effectiveDegree = dv === 0 ? 1 : dv;
    if (Math.abs(rv) / effectiveDegree < epsilon) continue;

    // Step 1: Move alpha * r[v] to estimate
    const alphaRv = alpha * rv;
    estimate.set(v, (estimate.get(v) ?? 0) + alphaRv);

    // Step 2: Distribute (1-alpha) * r[v] to neighbors
    if (dv > 0) {
      const pushMass = (1 - alpha) * rv / dv;
      const neighbors = getRow(graph.forward, v);

      for (let i = 0; i < neighbors.length; i++) {
        const { col: u, val: weight } = neighbors[i];
        // Weight-adjusted push: use normalized edge weight
        const mass = pushMass * weight;
        const newResidual = (residual.get(u) ?? 0) + mass;
        residual.set(u, newResidual);

        // Check if neighbor should enter the queue
        const du = graph.outDegrees[u];
        const effectiveDu = du === 0 ? 1 : du;
        if (Math.abs(newResidual) / effectiveDu >= epsilon) {
          activeQueue.add(u);
        }
      }
    }
    // For dangling nodes (dv === 0), the (1-alpha) mass is lost
    // (equivalent to uniform teleportation in standard PageRank).

    // Step 3: Zero out residual at v
    residual.set(v, 0);
  }

  // Convert internal indices back to NodeIds
  const result = new Map<NodeId, number>();
  for (const [idx, score] of estimate) {
    if (score > 0) {
      const nodeId = graph.indexToNode[idx];
      if (nodeId !== undefined) {
        result.set(nodeId, score);
      }
    }
  }

  return result;
}

/**
 * Run Forward Push from multiple seed nodes and combine results.
 *
 * Used when a query matches several memory nodes -- we spread
 * activation from each seed and merge the PPR vectors, weighting
 * each seed by its similarity to the query.
 *
 * Complexity: O(numSeeds / epsilon) total pushes.
 *
 * @param graph     - The memory graph
 * @param seeds     - Array of {nodeId, weight} pairs. Weights should sum to 1.
 * @param epsilon   - Residual tolerance
 * @param alpha     - Teleportation probability
 * @returns Combined PPR scores as Map<NodeId, number>
 */
export function multiSourceForwardPush(
  graph: MemoryGraph,
  seeds: Array<{ nodeId: NodeId; weight: number }>,
  epsilon: number,
  alpha: number,
): Map<NodeId, number> {
  const combined = new Map<NodeId, number>();

  for (const { nodeId, weight } of seeds) {
    if (weight <= 0) continue;

    const ppr = forwardPush(graph, nodeId, epsilon, alpha);

    for (const [id, score] of ppr) {
      combined.set(id, (combined.get(id) ?? 0) + weight * score);
    }
  }

  return combined;
}
