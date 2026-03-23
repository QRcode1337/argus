/**
 * Argus -> PNEUMA Bridge
 *
 * Feeds Argus IntelAlerts into PNEUMA's Sparse Memory system so that
 * Forward Push (O(1/eps) PPR) can later retrieve contextually relevant
 * historical alerts -- e.g. "last time we saw a military formation near
 * JFK was..." when processing new intel.
 *
 * Each IntelAlert becomes a MemoryNode in the graph:
 *   - severity  -> salience  (CRITICAL=1.0, WARNING=0.7, INFO=0.3)
 *   - category  -> memoryType (semantic -- factual intel, not episodic)
 *   - title+detail -> content + hash-based embedding (Float64Array[128])
 *   - coordinates -> metadata stored in domainTags
 */

import type {
  MemoryGraph,
  MemoryNode,
  NodeId,
} from '@/lib/pneuma/types/index';

import {
  addMemoryNode,
  rebuildCSR,
} from '@/lib/pneuma/sparse-memory/index';

import type {
  IntelAlert,
  IntelBriefing,
  AlertSeverity,
} from '@/lib/intel/analysisEngine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBEDDING_DIM = 128;
const CSR_REBUILD_INTERVAL = 10;

const SEVERITY_SALIENCE: Record<AlertSeverity, number> = {
  CRITICAL: 1.0,
  WARNING: 0.7,
  INFO: 0.3,
};

/** Semantic decay rate -- intel memories fade slowly. */
const INTEL_DECAY_RATE = 0.0001;

// ---------------------------------------------------------------------------
// Hash-based embedding
// ---------------------------------------------------------------------------

/**
 * Deterministic hash-based embedding from text into Float64Array[128].
 *
 * Uses a simple FNV-1a-inspired hash seeded at multiple offsets to fill
 * each dimension. This is NOT a learned embedding -- it provides a
 * consistent fingerprint so that identical text maps to identical vectors,
 * and similar text shares some components. For production, swap this with
 * a real embedding model call.
 */
function hashEmbedding(text: string): Float64Array {
  const vec = new Float64Array(EMBEDDING_DIM);
  const len = text.length;

  for (let dim = 0; dim < EMBEDDING_DIM; dim++) {
    let h = 2166136261 ^ (dim * 16777619); // FNV offset basis XOR dimension seed
    for (let i = 0; i < len; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // Map to [-1, 1] range
    vec[dim] = ((h >>> 0) / 4294967295) * 2 - 1;
  }

  // L2-normalize
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

// ---------------------------------------------------------------------------
// PneumaBridge
// ---------------------------------------------------------------------------

export interface BridgeStats {
  nodeCount: number;
  lastIngestTime: number;
}

export class PneumaBridge {
  private readonly graph: MemoryGraph;
  private ingestCount = 0;
  private lastIngestTime = 0;

  constructor(memoryGraph: MemoryGraph) {
    this.graph = memoryGraph;
  }

  /**
   * Convert an IntelAlert into a PNEUMA MemoryNode and store it
   * in the sparse memory graph.
   *
   * Triggers a CSR rebuild every {@link CSR_REBUILD_INTERVAL} ingestions
   * to keep the graph queryable via Forward Push without rebuilding on
   * every single insert.
   */
  ingestAlert(alert: IntelAlert): void {
    const now = Date.now();
    const content = `${alert.title}\n${alert.detail}`;
    const embedding = hashEmbedding(content);

    const domainTags: string[] = [
      `category:${alert.category}`,
      `severity:${alert.severity}`,
    ];
    if (alert.coordinates) {
      domainTags.push(
        `lat:${alert.coordinates.lat.toFixed(4)}`,
        `lon:${alert.coordinates.lon.toFixed(4)}`,
      );
    }
    if (alert.entityId) {
      domainTags.push(`entity:${alert.entityId}`);
    }

    const node: MemoryNode = {
      id: alert.id as NodeId,
      type: 'semantic',
      content,
      embedding,
      activation: 1.0,
      decayRate: INTEL_DECAY_RATE,
      createdAt: alert.timestamp,
      lastAccessedAt: now,
      accessCount: 1,
      valence: alert.severity === 'CRITICAL' ? -0.8
        : alert.severity === 'WARNING' ? -0.4
        : 0.0,
      salience: SEVERITY_SALIENCE[alert.severity],
      encodingPhi: 0,
      freudianLayer: 'conscious',
      domainTags,
    };

    addMemoryNode(this.graph, node);

    this.ingestCount++;
    this.lastIngestTime = now;

    if (this.ingestCount % CSR_REBUILD_INTERVAL === 0) {
      rebuildCSR(this.graph);
    }
  }

  /**
   * Ingest every alert from a briefing in one call.
   * Triggers a final CSR rebuild after all alerts are inserted
   * (in addition to any periodic rebuilds during ingestion).
   */
  ingestBriefing(briefing: IntelBriefing): void {
    for (const alert of briefing.alerts) {
      this.ingestAlert(alert);
    }

    // Ensure the graph is queryable after a full briefing,
    // even if the last periodic rebuild didn't land on the final alert.
    rebuildCSR(this.graph);
  }

  /** Return current memory stats. */
  getMemoryStats(): BridgeStats {
    return {
      nodeCount: this.graph.size,
      lastIngestTime: this.lastIngestTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Singleton-friendly factory. Call once with the graph obtained from
 * `pneuma.getMemoryGraph()`, then reuse the returned bridge instance
 * across the application.
 *
 * @example
 * ```ts
 * const graph = pneuma.getMemoryGraph();
 * const bridge = createPneumaBridge(graph);
 * bridge.ingestAlert(alert);
 * ```
 */
export function createPneumaBridge(memoryGraph: MemoryGraph): PneumaBridge {
  return new PneumaBridge(memoryGraph);
}
