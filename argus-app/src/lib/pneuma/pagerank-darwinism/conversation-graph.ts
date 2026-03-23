/**
 * PNEUMA S6 -- PageRank Darwinism: Conversation Graph
 *
 * Builds and maintains a directed graph over conversation utterances
 * (nodes) connected by weighted edges. Edge weights combine three
 * similarity signals:
 *
 *   weight = w_s * semanticOverlap + w_t * temporalCoactivation + w_m * memoryCoRelevance
 *
 * where:
 *   semanticOverlap       = cosine(embedding_i, embedding_j) in JL space
 *   temporalCoactivation  = exp(-|t_i - t_j| / tau)
 *   memoryCoRelevance     = |M_i intersect M_j| / |M_i union M_j|  (Jaccard)
 *
 * Usage:
 *   const graph = new ConversationGraph(config);
 *   graph.addUtterance('u1', embedding1, timestamp1);
 *   graph.addCandidate(candidateResponse);
 *   graph.buildEdges();
 *   // graph.edges now populated for PageRank
 */

import type {
  CandidateResponse,
  CompactVector,
  ConversationGraphEdge,
  EpochMs,
  NodeId,
  PneumaConfig,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Internal utterance node
// ---------------------------------------------------------------------------

/**
 * Minimal node representation for utterances that aren't full
 * CandidateResponse objects (e.g., user messages, context turns).
 */
interface UtteranceNode {
  id: NodeId;
  embedding: CompactVector;
  timestamp: EpochMs;
  groundingMemories: NodeId[];
  isCandidate: false;
}

/** Union type for anything stored in the graph. */
type GraphNode = (CandidateResponse & { isCandidate: true }) | UtteranceNode;

// ---------------------------------------------------------------------------
// ConversationGraph class
// ---------------------------------------------------------------------------

/**
 * Directed weighted graph over conversation utterances and candidate
 * responses. Edges encode semantic, temporal, and memory-based
 * relationships. Used by PageRank selection to rank candidates.
 */
export class ConversationGraph {
  /** All nodes by id. */
  readonly nodes: Map<NodeId, GraphNode> = new Map();

  /** All edges, keyed by "source:target". */
  readonly edges: Map<string, ConversationGraphEdge> = new Map();

  /** Adjacency list: nodeId -> outgoing edge keys. */
  readonly adjacency: Map<NodeId, string[]> = new Map();

  /** Candidate responses available for selection. */
  readonly candidates: Map<NodeId, CandidateResponse> = new Map();

  private readonly weightSemantic: number;
  private readonly weightTemporal: number;
  private readonly weightMemory: number;
  private readonly temporalDecayTau: number;

  constructor(config: PneumaConfig) {
    this.weightSemantic = config.edgeWeightSemantic;
    this.weightTemporal = config.edgeWeightTemporal;
    this.weightMemory = config.edgeWeightMemory;
    this.temporalDecayTau = config.temporalDecayTau;
  }

  /**
   * Add a conversation utterance (user message, context turn, etc.)
   * as a node in the graph.
   *
   * Edges are NOT computed here -- call buildEdges() after all
   * nodes and candidates have been added.
   *
   * @param id        - Unique utterance identifier
   * @param embedding - JL-projected embedding vector
   * @param timestamp - When the utterance occurred (epoch ms)
   */
  addUtterance(id: NodeId, embedding: CompactVector, timestamp: EpochMs): void {
    this.nodes.set(id, {
      id,
      embedding,
      timestamp,
      groundingMemories: [],
      isCandidate: false,
    });
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, []);
    }
  }

  /**
   * Add a CandidateResponse as a node in the graph.
   *
   * Candidates participate in PageRank selection. They also
   * contribute to edge computation via their embedding, timestamp,
   * and grounding memories.
   *
   * @param response - The candidate response to add
   */
  addCandidate(response: CandidateResponse): void {
    this.nodes.set(response.id, { ...response, isCandidate: true } as GraphNode);
    this.candidates.set(response.id, response);
    if (!this.adjacency.has(response.id)) {
      this.adjacency.set(response.id, []);
    }
  }

  /**
   * Compute all pairwise edges between nodes in the graph.
   *
   * Each pair (i, j) produces two directed edges (i->j and j->i)
   * with weights based on the composite similarity:
   *   w = w_s * semanticOverlap + w_t * temporalCoactivation + w_m * memoryCoRelevance
   *
   * Clears any previously computed edges before rebuilding.
   *
   * Complexity: O(|V|^2 * d) where d = embedding dimension.
   */
  buildEdges(): void {
    this.edges.clear();
    for (const adj of this.adjacency.values()) {
      adj.length = 0;
    }

    const nodeList = Array.from(this.nodes.values());
    const n = nodeList.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodeList[i];
        const b = nodeList[j];

        const semanticOverlap = cosineSim(
          getEmbedding(a),
          getEmbedding(b),
        );
        const temporalCoactivation = temporalDecay(
          getTimestamp(a),
          getTimestamp(b),
          this.temporalDecayTau,
        );
        const memoryCoRelevance = jaccardSimilarity(
          getMemories(a),
          getMemories(b),
        );

        const weight =
          this.weightSemantic * semanticOverlap +
          this.weightTemporal * temporalCoactivation +
          this.weightMemory * memoryCoRelevance;

        const clampedWeight = Math.max(0, weight);
        const now = Date.now();

        // Forward edge: a -> b
        const fwdKey = edgeKey(a.id, b.id);
        const fwdEdge: ConversationGraphEdge = {
          source: a.id,
          target: b.id,
          semanticOverlap,
          temporalCoactivation,
          memoryCoRelevance,
          weight: clampedWeight,
          createdAt: now,
        };
        this.edges.set(fwdKey, fwdEdge);
        this.adjacency.get(a.id)!.push(fwdKey);

        // Reverse edge: b -> a
        const revKey = edgeKey(b.id, a.id);
        const revEdge: ConversationGraphEdge = {
          source: b.id,
          target: a.id,
          semanticOverlap,
          temporalCoactivation,
          memoryCoRelevance,
          weight: clampedWeight,
          createdAt: now,
        };
        this.edges.set(revKey, revEdge);
        this.adjacency.get(b.id)!.push(revKey);
      }
    }
  }

  /**
   * Get all outgoing edges from a node.
   */
  getOutEdges(nodeId: NodeId): ConversationGraphEdge[] {
    const keys = this.adjacency.get(nodeId) ?? [];
    const result: ConversationGraphEdge[] = [];
    for (const key of keys) {
      const edge = this.edges.get(key);
      if (edge) result.push(edge);
    }
    return result;
  }

  /**
   * Get all candidate responses currently in the graph.
   */
  getCandidates(): CandidateResponse[] {
    return Array.from(this.candidates.values());
  }

  /**
   * Number of nodes in the graph.
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Number of edges in the graph.
   */
  get edgeCount(): number {
    return this.edges.size;
  }
}

// ---------------------------------------------------------------------------
// Node accessors (handle both UtteranceNode and CandidateResponse)
// ---------------------------------------------------------------------------

function getEmbedding(node: GraphNode): CompactVector {
  return node.embedding;
}

function getTimestamp(node: GraphNode): EpochMs {
  return node.isCandidate ? node.generatedAt : node.timestamp;
}

function getMemories(node: GraphNode): NodeId[] {
  return node.isCandidate ? node.groundingMemories : node.groundingMemories;
}

// ---------------------------------------------------------------------------
// Similarity functions
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two CompactVector instances.
 * Returns 0 if either has zero norm.
 */
function cosineSim(a: CompactVector, b: CompactVector): number {
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
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Temporal coactivation: exp(-|t1 - t2| / (tau * 1000)).
 * tau is in seconds, timestamps in epoch milliseconds.
 */
function temporalDecay(t1: EpochMs, t2: EpochMs, tauSeconds: number): number {
  const dtMs = Math.abs(t1 - t2);
  return Math.exp(-dtMs / (tauSeconds * 1000));
}

/**
 * Jaccard similarity between two sets of NodeIds.
 * Returns 0 if both sets are empty.
 */
function jaccardSimilarity(a: NodeId[], b: NodeId[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const id of setA) {
    if (setB.has(id)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function edgeKey(source: NodeId, target: NodeId): string {
  return `${source}:${target}`;
}
