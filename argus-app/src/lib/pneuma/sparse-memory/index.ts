/**
 * PNEUMA S5 -- Sparse Memory Retrieval Engine
 *
 * Re-exports all public APIs for the sparse memory subsystem.
 *
 * Usage:
 *   import {
 *     createMemoryGraph, addMemoryNode, addAssociation, rebuildCSR,
 *     retrieveMemories, forwardPush,
 *   } from './sparse-memory/index';
 */

// CSR matrix primitives
export {
  buildCSR,
  getRow,
  getRowDegree,
  normalizeRows,
  transpose,
  type WeightedEdge,
} from './csr-matrix';

// Forward Push algorithm
export { forwardPush, multiSourceForwardPush } from './forward-push';

// Memory graph management
export {
  addAssociation,
  addMemoryNode,
  createMemoryGraph,
  decayActivations,
  getEdges,
  rebuildCSR,
} from './memory-graph';

// High-level retrieval API
export {
  cosineSimilarity,
  findSeeds,
  retrieveFromNode,
  retrieveMemories,
} from './retrieval';
