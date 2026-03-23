/**
 * PNEUMA S2 -- Consciousness State Layer
 *
 * Regime-switching mood dynamics, JL dimensionality reduction,
 * and joint cognitive state management.
 *
 * Re-exports:
 *   - Mood engine: initializeMoodRegime, tickMood, triggerImpulse
 *   - JL projection: createProjection, project, projectBatch, computeTargetDim
 *   - Cognitive state: createCognitiveState, updateState, broadcastToGWT
 */

export {
  initializeMoodRegime,
  tickMood,
  triggerImpulse,
  moodNorm,
  currentRegimeLabel,
} from './mood-engine';

export {
  createProjection,
  project,
  projectBatch,
  computeTargetDim,
  distortionRatio,
  type JLProjectionMatrix,
} from './jl-projection';

export {
  createCognitiveState,
  updateState,
  broadcastToGWT,
  getProjectionMatrix,
  moodPersonaCoherence,
} from './cognitive-state';
