/**
 * PNEUMA S5 -- Sparse Memory Retrieval Engine
 *
 * High-level memory retrieval API.
 *
 * Retrieval pipeline:
 *   1. Find seed nodes nearest to query embedding via cosine similarity
 *   2. Run Forward Push from seeds to get PPR scores
 *   3. Boost scores by activation level and salience
 *   4. Return top-K results
 *
 * The epsilon parameter controls retrieval precision:
 *   - High Phi (integrated information) -> small epsilon -> precise retrieval
 *   - Low Phi -> large epsilon -> fast approximate retrieval
 *
 * This is the main entry point consumed by the PNEUMA cognitive loop.
 */

import type { CompactVector, MemoryGraph, MemoryNode, NodeId } from '../types/index.js';
import { forwardPush, multiSourceForwardPush } from './forward-push.js';

/**
 * Compute cosine similarity between two CompactVector (Float64Array) instances.
 *
 * cos(a, b) = dot(a, b) / (||a|| * ||b||)
 *
 * Returns 0 if either vector has zero norm (avoids NaN).
 *
 * Complexity: O(d) where d = vector dimension.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity in [-1, 1]
 */
export function cosineSimilarity(a: CompactVector, b: CompactVector): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

/**
 * Find the K nearest nodes to a query embedding by cosine similarity.
 *
 * Scans all nodes in the graph -- this is the one O(|V|) step in the
 * pipeline. For very large graphs (>100K nodes), an approximate
 * nearest neighbor index (e.g., HNSW) should replace this linear scan.
 *
 * Only considers nodes with non-zero activation to avoid retrieving
 * fully-decayed memories.
 *
 * Complexity: O(|V| * d) where d = embedding dimension.
 *
 * @param graph          - The memory graph
 * @param queryEmbedding - Query vector
 * @param k              - Number of seeds to return
 * @returns Array of {nodeId, similarity} sorted by descending similarity
 */
export function findSeeds(
  graph: MemoryGraph,
  queryEmbedding: CompactVector,
  k: number,
): Array<{ nodeId: NodeId; similarity: number }> {
  const candidates: Array<{ nodeId: NodeId; similarity: number }> = [];

  for (const [nodeId, node] of graph.nodes) {
    // Skip fully-decayed memories
    if (node.activation <= 0) continue;

    const sim = cosineSimilarity(queryEmbedding, node.embedding);
    candidates.push({ nodeId, similarity: sim });
  }

  // Partial sort: select top-k by similarity.
  // For small k relative to |V|, a min-heap would be more efficient,
  // but a full sort is simpler and sufficient for expected graph sizes.
  candidates.sort((a, b) => b.similarity - a.similarity);

  return candidates.slice(0, k);
}

/**
 * Score a node by combining PPR score with activation and salience.
 *
 * Combined score:
 *   score = pprScore * (0.6 + 0.2 * activation + 0.2 * salience)
 *
 * The 0.6 base ensures PPR is the dominant signal. Activation and
 * salience act as multiplicative boosts:
 *   - activation: recently/frequently accessed memories score higher
 *   - salience: emotionally significant memories score higher
 *
 * @param pprScore   - Personalized PageRank score
 * @param activation - Node activation level in [0, 1]
 * @param salience   - Node salience in [0, 1]
 * @returns Boosted score
 */
function combinedScore(
  pprScore: number,
  activation: number,
  salience: number,
): number {
  return pprScore * (0.6 + 0.2 * activation + 0.2 * salience);
}

/**
 * Retrieve the most relevant memories for a query embedding.
 *
 * Pipeline:
 *   1. Find seed nodes nearest to the query (cosine similarity)
 *   2. Run Forward Push from seeds (weighted by similarity)
 *   3. Score each reached node: PPR * (activation + salience boost)
 *   4. Return top-K by combined score
 *
 * The epsilon parameter controls precision vs. speed:
 *   - Smaller epsilon -> more nodes explored -> better recall -> slower
 *   - Larger epsilon -> fewer nodes explored -> faster -> approximate
 *   - Set dynamically by the Phi Router based on integrated information
 *
 * Complexity:
 *   O(|V| * d) for seed finding (linear scan) +
 *   O(numSeeds / epsilon) for Forward Push (sublinear in |V|)
 *
 * @param graph          - The memory graph
 * @param queryEmbedding - Query vector (same dimension as node embeddings)
 * @param epsilon        - Forward Push residual tolerance
 * @param topK           - Number of results to return
 * @param numSeeds       - Number of seed nodes for Forward Push (default: 3)
 * @returns Array of MemoryNode sorted by relevance, length <= topK
 */
export function retrieveMemories(
  graph: MemoryGraph,
  queryEmbedding: CompactVector,
  epsilon: number,
  topK: number,
  numSeeds: number = 3,
): MemoryNode[] {
  if (graph.size === 0) return [];

  // Step 1: Find seed nodes closest to the query
  const seeds = findSeeds(graph, queryEmbedding, numSeeds);
  if (seeds.length === 0) return [];

  // Normalize seed similarities to weights summing to 1
  const totalSim = seeds.reduce((sum, s) => sum + Math.max(s.similarity, 0), 0);

  let pprScores: Map<NodeId, number>;

  if (totalSim <= 0) {
    // All similarities <= 0: fall back to uniform seed weights
    const uniformWeight = 1 / seeds.length;
    pprScores = multiSourceForwardPush(
      graph,
      seeds.map(s => ({ nodeId: s.nodeId, weight: uniformWeight })),
      epsilon,
      graph.alpha,
    );
  } else if (seeds.length === 1) {
    // Single seed: use the simpler single-source push
    pprScores = forwardPush(graph, seeds[0].nodeId, epsilon, graph.alpha);
  } else {
    // Multiple seeds: weighted by normalized similarity
    pprScores = multiSourceForwardPush(
      graph,
      seeds.map(s => ({
        nodeId: s.nodeId,
        weight: Math.max(s.similarity, 0) / totalSim,
      })),
      epsilon,
      graph.alpha,
    );
  }

  // Step 3: Score and rank results
  const scored: Array<{ node: MemoryNode; score: number }> = [];

  for (const [nodeId, ppr] of pprScores) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    const score = combinedScore(ppr, node.activation, node.salience);
    if (score > 0) {
      scored.push({ node, score });
    }
  }

  // Step 4: Sort by combined score and return top-K
  scored.sort((a, b) => b.score - a.score);

  const result: MemoryNode[] = new Array(Math.min(topK, scored.length));
  for (let i = 0; i < result.length; i++) {
    result[i] = scored[i].node;
  }

  return result;
}

/**
 * Retrieve memories using a pre-identified source node rather than
 * an embedding query. Useful when the system already knows which
 * memory to spread activation from (e.g., the most recent episodic
 * memory).
 *
 * Complexity: O(1/epsilon) for Forward Push.
 *
 * @param graph    - The memory graph
 * @param sourceId - Node to spread activation from
 * @param epsilon  - Residual tolerance
 * @param topK     - Number of results
 * @returns Array of MemoryNode sorted by PPR-boosted relevance
 */
export function retrieveFromNode(
  graph: MemoryGraph,
  sourceId: NodeId,
  epsilon: number,
  topK: number,
): MemoryNode[] {
  const pprScores = forwardPush(graph, sourceId, epsilon, graph.alpha);

  const scored: Array<{ node: MemoryNode; score: number }> = [];

  for (const [nodeId, ppr] of pprScores) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    const score = combinedScore(ppr, node.activation, node.salience);
    if (score > 0) {
      scored.push({ node, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const result: MemoryNode[] = new Array(Math.min(topK, scored.length));
  for (let i = 0; i < result.length; i++) {
    result[i] = scored[i].node;
  }

  return result;
}
