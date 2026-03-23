/**
 * PNEUMA S5 -- Sparse Memory Retrieval Engine
 *
 * MemoryGraph construction and management.
 *
 * The memory graph is a weighted directed graph where:
 *   - Nodes are MemoryNode instances (episodic, semantic, procedural, dream)
 *   - Edges represent associations between memories (weighted by strength)
 *   - CSR matrices (forward + reverse) enable efficient traversal
 *   - Forward Push uses the forward CSR for PPR computation
 *
 * The graph supports incremental node/edge addition with periodic
 * CSR rebuilds. Activations decay exponentially over time:
 *   a(t) = a(t0) * exp(-lambda * (t - t0))
 */

import type {
  CSRMatrix,
  EpochMs,
  MemoryGraph,
  MemoryNode,
  NodeId,
  PneumaConfig,
} from '../types/index';
import { buildCSR, normalizeRows, transpose, type WeightedEdge } from './csr-matrix';

/**
 * Internal edge storage used before CSR construction.
 * Kept alongside the CSR so we can rebuild after mutations.
 */
const edgeStore = new WeakMap<MemoryGraph, WeightedEdge[]>();

/**
 * Create a new empty MemoryGraph from a PneumaConfig.
 *
 * The graph starts with no nodes or edges. CSR matrices are
 * initialized as empty (0x0).
 *
 * Complexity: O(1).
 *
 * @param config - PNEUMA system configuration
 * @returns An empty MemoryGraph ready for node/edge insertion
 */
export function createMemoryGraph(config: PneumaConfig): MemoryGraph {
  const emptyCSR: CSRMatrix = {
    rows: 0,
    cols: 0,
    rowPtr: new Uint32Array([0]),
    colIndices: new Uint32Array(0),
    values: new Float64Array(0),
  };

  const graph: MemoryGraph = {
    nodes: new Map(),
    forward: emptyCSR,
    reverse: emptyCSR,
    outDegrees: new Float64Array(0),
    inDegrees: new Float64Array(0),
    alpha: config.memoryAlpha,
    pushEpsilon: config.memoryPushEpsilon,
    nodeIndex: new Map(),
    indexToNode: [],
    size: 0,
    numEdges: 0,
  };

  edgeStore.set(graph, []);
  return graph;
}

/**
 * Add a memory node to the graph.
 *
 * The node is registered in the node map and assigned a numeric index
 * for CSR addressing. Adding a node does NOT rebuild the CSR --
 * call rebuildCSR() after batch insertions.
 *
 * If a node with the same id already exists, it is replaced
 * (the numeric index is preserved).
 *
 * Complexity: O(1) amortized.
 *
 * @param graph - The memory graph to mutate
 * @param node  - The MemoryNode to add
 */
export function addMemoryNode(graph: MemoryGraph, node: MemoryNode): void {
  const existing = graph.nodeIndex.get(node.id);

  if (existing !== undefined) {
    // Replace node data but keep the same index
    graph.nodes.set(node.id, node);
    return;
  }

  const idx = graph.size;
  graph.nodes.set(node.id, node);
  graph.nodeIndex.set(node.id, idx);
  graph.indexToNode.push(node.id);
  graph.size++;
}

/**
 * Add a weighted directed edge (association) between two memory nodes.
 *
 * Both fromId and toId must already exist in the graph (added via
 * addMemoryNode). If either is missing, this is a no-op.
 *
 * Does NOT rebuild the CSR -- call rebuildCSR() after batch insertions.
 *
 * Complexity: O(1) amortized.
 *
 * @param graph  - The memory graph to mutate
 * @param fromId - Source node id
 * @param toId   - Target node id
 * @param weight - Edge weight (association strength), must be > 0
 */
export function addAssociation(
  graph: MemoryGraph,
  fromId: NodeId,
  toId: NodeId,
  weight: number,
): void {
  const fromIdx = graph.nodeIndex.get(fromId);
  const toIdx = graph.nodeIndex.get(toId);
  if (fromIdx === undefined || toIdx === undefined) return;
  if (weight <= 0) return;

  const edges = edgeStore.get(graph);
  if (!edges) return;

  edges.push({ source: fromIdx, target: toIdx, weight });
  graph.numEdges++;
}

/**
 * Rebuild CSR matrices from the current node and edge state.
 *
 * Must be called after adding nodes and edges to make them visible
 * to Forward Push. Builds both forward and reverse CSR, plus
 * degree arrays.
 *
 * The forward CSR is row-normalized (row-stochastic) so that
 * Forward Push can use it directly as the transition matrix P.
 *
 * Complexity: O(|E| + |V|) where |E| = numEdges, |V| = size.
 *
 * @param graph - The memory graph to rebuild
 */
export function rebuildCSR(graph: MemoryGraph): void {
  const edges = edgeStore.get(graph);
  if (!edges) return;

  const n = graph.size;

  if (n === 0) return;

  // Build raw forward CSR, then normalize rows for PageRank
  const rawForward = buildCSR(edges, n);
  graph.forward = normalizeRows(rawForward);
  graph.reverse = transpose(graph.forward);

  // Compute degree arrays
  graph.outDegrees = new Float64Array(n);
  graph.inDegrees = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    graph.outDegrees[i] = rawForward.rowPtr[i + 1] - rawForward.rowPtr[i];
  }

  // In-degrees from the raw forward matrix (count entries per column)
  for (let i = 0; i < edges.length; i++) {
    graph.inDegrees[edges[i].target]++;
  }
}

/**
 * Apply exponential activation decay to all memory nodes.
 *
 * For each node, updates:
 *   activation = activation * exp(-decayRate * (currentTime - lastAccessedAt) / 1000)
 *
 * The division by 1000 converts millisecond timestamps to seconds,
 * since decayRate is specified per-second in the MemoryNode interface.
 *
 * High-salience memories resist decay: the effective decay rate is
 * reduced by (1 - salience), so a memory with salience = 1.0 never decays.
 *
 * Complexity: O(|V|) -- must touch every node.
 *
 * @param graph       - The memory graph
 * @param currentTime - Current time in epoch milliseconds
 */
export function decayActivations(
  graph: MemoryGraph,
  currentTime: EpochMs,
): void {
  for (const [, node] of graph.nodes) {
    const dtSeconds = (currentTime - node.lastAccessedAt) / 1000;
    if (dtSeconds <= 0) continue;

    // Salience resists decay: effective rate = decayRate * (1 - salience)
    const effectiveRate = node.decayRate * (1 - node.salience);
    node.activation = node.activation * Math.exp(-effectiveRate * dtSeconds);

    // Clamp to avoid floating-point underflow noise
    if (node.activation < 1e-15) {
      node.activation = 0;
    }
  }
}

/**
 * Get the internal edge list for testing or serialization.
 *
 * @param graph - The memory graph
 * @returns Copy of the internal edge list, or empty array if unavailable
 */
export function getEdges(graph: MemoryGraph): WeightedEdge[] {
  const edges = edgeStore.get(graph);
  return edges ? [...edges] : [];
}
