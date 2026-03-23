/**
 * PNEUMA -- Psychodynamic Neural-Unified Emergent Mind Architecture
 *
 * Root barrel export wiring all 10 subsystems:
 *   S1  Phi Router           -- IIT consciousness metric + resource allocation
 *   S2  Consciousness        -- Mood regime, JL projection, cognitive state
 *   S3  Persona Blender      -- Neumann-series persona blending
 *   S4  Freudian Router      -- Id/Ego/Superego decomposition + ethical A*
 *   S5  Sparse Memory        -- Forward Push PPR memory retrieval
 *   S6  PageRank Darwinism   -- Conversation graph + competitive selection
 *   S7  Math Framing         -- Domain classification + formal scaffolds
 *   S8  Strange Loop         -- Act/Evaluate/Modify self-verification
 *   S9  Temporal Voice       -- ESN temporal prediction
 *
 * The PNEUMA class orchestrates the full pipeline.
 */

// -- PNEUMA orchestrator --
export { PNEUMA, type ProcessResult } from './pneuma.js';

// -- Types --
export type {
  CSRMatrix,
  CandidateResponse,
  CognitiveState,
  CompactVector,
  ConversationGraphEdge,
  EpochMs,
  EpochNs,
  EthicalGraphNode,
  FreudianDecomposition,
  MathematicalFrame,
  MemoryGraph,
  MemoryNode,
  MoodRegime,
  NodeId,
  PersonaVector,
  PhiScore,
  PneumaConfig,
  StrangeLoopVerdict,
  TemporalPrediction,
} from './types/index.js';
export { createDefaultPneumaConfig } from './types/index.js';

// -- S1: Phi Router --
export {
  PhiRouter,
  allocateResources,
  computePhi,
  phiAR,
  phiCompression,
  phiID,
  type ResourceBudget,
} from './phi-router/index.js';

// -- S2: Consciousness --
export {
  initializeMoodRegime,
  tickMood,
  triggerImpulse,
  moodNorm,
  currentRegimeLabel,
  createProjection,
  project,
  projectBatch,
  computeTargetDim,
  distortionRatio,
  type JLProjectionMatrix,
  createCognitiveState,
  updateState,
  broadcastToGWT,
  getProjectionMatrix,
  moodPersonaCoherence,
} from './consciousness/index.js';

// -- S3: Persona Blender --
export {
  createPersonaBlender,
  blendPersonas,
  updateBlend,
  isConvergent,
  effectiveDamping,
  type PersonaBlender,
} from './persona-blender/index.js';

// -- S4: Freudian Router --
export {
  computeDecomposition,
  computeDefenseCost,
  computeFreudianCost,
  decomposeInput,
  evaluateDefenses,
  getInfluenceWeights,
  addEthicalNode,
  addEthicalTransition,
  createEthicalGraph,
  ethicalHeuristic,
  findEthicalPath,
  hasEthicalClearance,
  type EthicalGraph,
  type EthicalPathResult,
  createFreudianRouter,
  FreudianRouter,
  type RoutingResult,
} from './freudian-router/index.js';

// -- S5: Sparse Memory --
export {
  addAssociation,
  addMemoryNode,
  buildCSR,
  cosineSimilarity,
  createMemoryGraph,
  decayActivations,
  findSeeds,
  forwardPush,
  getRow,
  getRowDegree,
  multiSourceForwardPush,
  normalizeRows,
  rebuildCSR,
  retrieveFromNode,
  retrieveMemories,
  transpose,
  type WeightedEdge,
} from './sparse-memory/index.js';

// -- S6: PageRank Darwinism --
export {
  ConversationGraph,
  decayCandidates,
  selectWinner,
  type PageRankResult,
} from './pagerank-darwinism/index.js';

// -- S7: Math Framing --
export {
  applyFrame,
  classifyAndFrame,
  classifyDomain,
  createFrame,
  generateScaffold,
  selectNotation,
} from './math-framing/index.js';

// -- S8: Strange Loop --
export { StrangeLoop } from './strange-loop/index.js';

// -- S9: Temporal Voice --
export {
  createESNFromConfig,
  initializeESN,
  predict,
  trainESN,
  type ESNState,
} from './temporal-voice/index.js';
