/**
 * PNEUMA S4 -- Freudian Router
 *
 * Re-exports all public APIs for the Freudian routing subsystem.
 *
 * Usage:
 *   import {
 *     createFreudianRouter, FreudianRouter,
 *     computeDecomposition, decomposeInput,
 *     findEthicalPath, hasEthicalClearance,
 *   } from './freudian-router/index.js';
 */

// Id/Ego/Superego decomposition
export {
  computeDecomposition,
  computeDefenseCost,
  computeFreudianCost,
  decomposeInput,
  evaluateDefenses,
  getInfluenceWeights,
} from './decomposition.js';

// A* ethical pathfinder
export {
  addEthicalNode,
  addEthicalTransition,
  createEthicalGraph,
  ethicalHeuristic,
  findEthicalPath,
  hasEthicalClearance,
  type EthicalGraph,
  type EthicalPathResult,
} from './ethical-pathfinder.js';

// FreudianRouter main class
export {
  createFreudianRouter,
  FreudianRouter,
  type RoutingResult,
} from './freudian-router.js';
