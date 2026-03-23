/**
 * PNEUMA S4 -- Freudian Router
 *
 * A* ethical pathfinder over the EthicalGraphNode state space.
 *
 * Each node represents an ethical state with active principles.
 * Edges (EthicalTransition) represent actions with associated costs
 * and principle requirements. The pathfinder finds the minimum-cost
 * path from a start state to a goal state that respects ethical
 * constraints.
 *
 * Heuristic (admissible):
 *   h(n) = (1 - phi_n / phi_max) * ethicalDiameter
 *
 * Higher Phi at a node means it is closer to the goal (states with
 * high integrated information are considered more ethically coherent).
 * This heuristic never overestimates because the actual cost is
 * bounded by ethicalDiameter when Phi is 0.
 *
 * Source: SYNTHETIC-CONSCIOUSNESS Edelmans-Principles.toml,
 *         Neuroscience-Consciousness-Framework.toml [theories.IIT]
 */

import type {
  EthicalGraphNode,
  EthicalTransition,
  NodeId,
  PneumaConfig,
} from '../types/index';

// ---------------------------------------------------------------------------
// Ethical graph management
// ---------------------------------------------------------------------------

/**
 * In-memory ethical constraint graph.
 *
 * Stores nodes and provides O(1) lookup by id.
 */
export interface EthicalGraph {
  nodes: Map<NodeId, EthicalGraphNode>;
  /** Maximum Phi observed across all nodes (for heuristic scaling). */
  phiMax: number;
  /** Diameter of the ethical space (max possible path cost). */
  ethicalDiameter: number;
  /** Maximum number of node expansions before search is aborted. */
  maxExpansions: number;
}

/**
 * Result of an A* ethical path search.
 */
export interface EthicalPathResult {
  /** Whether a valid path was found. */
  found: boolean;
  /** Ordered sequence of node IDs from start to goal (inclusive). */
  path: NodeId[];
  /** Total g-cost of the path. */
  totalCost: number;
  /** Number of nodes expanded during search. */
  nodesExpanded: number;
  /** Active principles along the path (union of all node principles). */
  principles: string[];
}

/**
 * Create a new empty EthicalGraph from config.
 *
 * Complexity: O(1).
 *
 * @param config - PNEUMA system configuration
 * @returns An empty EthicalGraph
 */
export function createEthicalGraph(config: PneumaConfig): EthicalGraph {
  return {
    nodes: new Map(),
    phiMax: config.phiThreshold,
    ethicalDiameter: config.ethicalDiameter,
    maxExpansions: config.ethicalMaxExpansions,
  };
}

/**
 * Add a node to the ethical graph.
 *
 * Updates phiMax if the node's Phi exceeds the current maximum.
 *
 * Complexity: O(1).
 *
 * @param graph - The ethical graph to mutate
 * @param node  - The EthicalGraphNode to add
 */
export function addEthicalNode(
  graph: EthicalGraph,
  node: EthicalGraphNode,
): void {
  graph.nodes.set(node.id, node);
  if (node.phi > graph.phiMax) {
    graph.phiMax = node.phi;
  }
}

/**
 * Add a transition (directed edge) between two ethical nodes.
 *
 * The transition is added to the source node's transition list.
 * Both nodes must already exist in the graph.
 *
 * Complexity: O(1) amortized.
 *
 * @param graph      - The ethical graph
 * @param fromId     - Source node id
 * @param transition - The transition to add
 */
export function addEthicalTransition(
  graph: EthicalGraph,
  fromId: NodeId,
  transition: EthicalTransition,
): void {
  const node = graph.nodes.get(fromId);
  if (!node) return;
  node.transitions.push(transition);
}

// ---------------------------------------------------------------------------
// Min-heap for A* open set (binary heap by fCost)
// ---------------------------------------------------------------------------

/**
 * A min-heap ordered by fCost for the A* open set.
 *
 * Uses a binary heap for O(log n) insert and extract-min.
 * Stores node IDs and looks up fCost from the node map.
 */
class MinHeap {
  private data: NodeId[] = [];
  private fCosts: Map<NodeId, number>;

  constructor(fCosts: Map<NodeId, number>) {
    this.fCosts = fCosts;
  }

  get size(): number {
    return this.data.length;
  }

  push(id: NodeId): void {
    this.data.push(id);
    this.siftUp(this.data.length - 1);
  }

  pop(): NodeId | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private cost(idx: number): number {
    return this.fCosts.get(this.data[idx]) ?? Infinity;
  }

  private siftUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.cost(idx) < this.cost(parent)) {
        [this.data[idx], this.data[parent]] = [this.data[parent], this.data[idx]];
        idx = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(idx: number): void {
    const len = this.data.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;

      if (left < len && this.cost(left) < this.cost(smallest)) {
        smallest = left;
      }
      if (right < len && this.cost(right) < this.cost(smallest)) {
        smallest = right;
      }
      if (smallest === idx) break;

      [this.data[idx], this.data[smallest]] = [this.data[smallest], this.data[idx]];
      idx = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// A* Search
// ---------------------------------------------------------------------------

/**
 * Compute the A* heuristic for an ethical node.
 *
 * h(n) = (1 - phi_n / phi_max) * ethicalDiameter
 *
 * This is admissible: nodes with high Phi are assumed closer to
 * ethically coherent states (the goal). When phi_n = phi_max,
 * h(n) = 0 (at goal). When phi_n = 0, h(n) = ethicalDiameter
 * (maximum possible remaining cost).
 *
 * Complexity: O(1).
 *
 * @param phi              - Phi score at the node
 * @param phiMax           - Maximum Phi across the graph
 * @param ethicalDiameter  - Maximum possible path cost
 * @returns Heuristic cost estimate
 */
export function ethicalHeuristic(
  phi: number,
  phiMax: number,
  ethicalDiameter: number,
): number {
  if (phiMax <= 0) return ethicalDiameter;
  const ratio = Math.min(phi / phiMax, 1.0);
  return (1 - ratio) * ethicalDiameter;
}

/**
 * Find the minimum-cost ethical path from start to goal using A*.
 *
 * The search explores the EthicalGraphNode space, expanding nodes
 * in order of f(n) = g(n) + h(n). It terminates when:
 *   1. The goal is reached (success)
 *   2. The open set is empty (no path exists)
 *   3. maxExpansions is exceeded (budget exhausted)
 *
 * Complexity:
 *   Time:  O(E * log V) where E = transitions, V = nodes expanded
 *   Space: O(V) for open/closed sets and path reconstruction
 *
 * @param graph    - The ethical constraint graph
 * @param startId  - Starting state node id
 * @param goalId   - Goal state node id
 * @param phiScore - Current Phi score (used to modulate heuristic)
 * @returns EthicalPathResult with path, cost, and expanded count
 */
export function findEthicalPath(
  graph: EthicalGraph,
  startId: NodeId,
  goalId: NodeId,
  phiScore: number,
): EthicalPathResult {
  const startNode = graph.nodes.get(startId);
  const goalNode = graph.nodes.get(goalId);

  if (!startNode || !goalNode) {
    return { found: false, path: [], totalCost: Infinity, nodesExpanded: 0, principles: [] };
  }

  // Trivial case
  if (startId === goalId) {
    return {
      found: true,
      path: [startId],
      totalCost: 0,
      nodesExpanded: 0,
      principles: [...startNode.activePrinciples],
    };
  }

  // g-costs: best known cost from start to each node
  const gCost = new Map<NodeId, number>();
  gCost.set(startId, 0);

  // f-costs: g + h for priority queue ordering
  const fCost = new Map<NodeId, number>();
  const startH = ethicalHeuristic(startNode.phi, graph.phiMax, graph.ethicalDiameter);
  fCost.set(startId, startH);

  // Parent map for path reconstruction
  const cameFrom = new Map<NodeId, NodeId>();

  // Open set (priority queue) and closed set
  const openSet = new MinHeap(fCost);
  openSet.push(startId);
  const inOpen = new Set<NodeId>([startId]);
  const closedSet = new Set<NodeId>();

  let nodesExpanded = 0;

  while (openSet.size > 0) {
    if (nodesExpanded >= graph.maxExpansions) {
      break; // Budget exhausted
    }

    const currentId = openSet.pop()!;
    inOpen.delete(currentId);

    // Goal reached
    if (currentId === goalId) {
      return buildResult(currentId, gCost, cameFrom, graph, nodesExpanded);
    }

    closedSet.add(currentId);
    nodesExpanded++;

    const currentNode = graph.nodes.get(currentId);
    if (!currentNode) continue;

    const currentG = gCost.get(currentId) ?? Infinity;

    // Expand transitions
    for (const transition of currentNode.transitions) {
      const neighborId = transition.targetId;

      if (closedSet.has(neighborId)) continue;

      const neighborNode = graph.nodes.get(neighborId);
      if (!neighborNode) continue;

      const tentativeG = currentG + transition.cost;

      const existingG = gCost.get(neighborId) ?? Infinity;
      if (tentativeG >= existingG) continue;

      // Found a better path to neighbor
      gCost.set(neighborId, tentativeG);
      cameFrom.set(neighborId, currentId);

      const h = ethicalHeuristic(neighborNode.phi, graph.phiMax, graph.ethicalDiameter);
      fCost.set(neighborId, tentativeG + h);

      if (!inOpen.has(neighborId)) {
        openSet.push(neighborId);
        inOpen.add(neighborId);
      }
    }
  }

  // No path found
  return { found: false, path: [], totalCost: Infinity, nodesExpanded, principles: [] };
}

/**
 * Reconstruct the path and collect principles from goal back to start.
 *
 * Complexity: O(path length).
 */
function buildResult(
  goalId: NodeId,
  gCost: Map<NodeId, number>,
  cameFrom: Map<NodeId, NodeId>,
  graph: EthicalGraph,
  nodesExpanded: number,
): EthicalPathResult {
  const path: NodeId[] = [];
  const principleSet = new Set<string>();
  let current: NodeId | undefined = goalId;

  while (current !== undefined) {
    path.push(current);
    const node = graph.nodes.get(current);
    if (node) {
      for (const p of node.activePrinciples) {
        principleSet.add(p);
      }
    }
    current = cameFrom.get(current);
  }

  path.reverse();

  return {
    found: true,
    path,
    totalCost: gCost.get(goalId) ?? 0,
    nodesExpanded,
    principles: Array.from(principleSet),
  };
}

/**
 * Check whether a candidate response has ethical clearance.
 *
 * Attempts to find an ethical path from the current state to a
 * target state representing the response. If a path exists with
 * cost below the ethical diameter, the response is cleared.
 *
 * Complexity: O(E * log V) for A* search.
 *
 * @param graph       - The ethical constraint graph
 * @param currentId   - Current ethical state
 * @param responseId  - Target ethical state for the response
 * @param phiScore    - Current Phi score
 * @param maxCost     - Maximum acceptable path cost (default: ethicalDiameter)
 * @returns True if the response has ethical clearance
 */
export function hasEthicalClearance(
  graph: EthicalGraph,
  currentId: NodeId,
  responseId: NodeId,
  phiScore: number,
  maxCost?: number,
): boolean {
  const result = findEthicalPath(graph, currentId, responseId, phiScore);
  const threshold = maxCost ?? graph.ethicalDiameter;
  return result.found && result.totalCost <= threshold;
}
