/**
 * PNEUMA S2 -- Cognitive State Manager
 *
 * Creates and maintains the joint CognitiveState: the system's
 * "consciousness vector" at any instant. Every subsystem reads from
 * and writes to this central state.
 *
 * The cognitive state is the tensor product of mood and persona in
 * a JL-compressed Hilbert space:
 *
 *   |Psi(t)> = |sigma_t> (x) |pi_t>  in H = H_mood (x) H_persona
 *   Projected: psi_t = [A * sigma_t ; A * pi_t] in R^{2k}
 *
 * The jointVector (concatenation of projectedMood and projectedPersona)
 * is pre-computed for fast downstream dot products in the response
 * ranking and strange loop subsystems.
 *
 * No external dependencies.
 */

import type {
  CognitiveState,
  PhiScore,
  MoodRegime,
  PersonaVector,
  FreudianDecomposition,
  CompactVector,
  PneumaConfig,
  DefenseMechanism,
} from '../types/index';
import { createProjection, project, type JLProjectionMatrix } from './jl-projection';

// ---------------------------------------------------------------------------
// Module state: projection matrix (initialized once per config)
// ---------------------------------------------------------------------------

let projMatrix: JLProjectionMatrix | null = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Create an initial CognitiveState from the system configuration.
 *
 * Sets up:
 *   - JL projection matrix (d -> k dimensions)
 *   - Zero-initialized projected mood and persona vectors in R^k
 *   - Pre-computed jointVector in R^{2k}
 *   - Default PhiScore (zero)
 *   - Default FreudianDecomposition from config
 *   - Empty attention schema
 *   - GWT broadcast flag = false
 *
 * @param config - PNEUMA system configuration.
 * @returns A fully initialized CognitiveState.
 */
export function createCognitiveState(config: PneumaConfig): CognitiveState {
  const d = config.embeddingDim;

  // Initialize the JL projection matrix
  projMatrix = createProjection(d, config.jlEps, config.jlSeed);
  const k = projMatrix.k;

  // Zero vectors in projected space
  const projectedMood = new Float64Array(k);
  const projectedPersona = new Float64Array(k);
  const jointVector = new Float64Array(2 * k);

  // Default PhiScore
  const phi: PhiScore = {
    value: 0,
    method: config.phiMethod,
    confidence: 0,
    computeCostMs: 0,
    numElements: 0,
    numPartitions: 0,
    computedAt: Date.now(),
    mipPartition: [[], []],
  };

  // Default FreudianDecomposition from config
  const freudian: FreudianDecomposition = {
    id: new Float64Array(k),
    ego: new Float64Array(k),
    superego: new Float64Array(k),
    energyId: config.freudianEnergy.id,
    energyEgo: config.freudianEnergy.ego,
    energySuperego: config.freudianEnergy.superego,
    activeDefenses: config.defaultDefenses.map(
      (def): DefenseMechanism => ({ ...def }),
    ),
    consciousnessLevel: {
      unconscious: 0.33,
      preconscious: 0.33,
      conscious: 0.34,
    },
  };

  // Default mood regime (minimal -- will be overwritten by first updateState)
  const mood: MoodRegime = {
    currentRegime: 0,
    regimeLabels: config.moodRegimeLabels.slice(),
    numRegimes: config.numMoodRegimes,
    transitionMatrix: config.moodTransitionMatrix.map(row => row.slice()),
    driftVectors: [],
    regimeVariances: [],
    impulseHistory: [],
    currentMood: new Float64Array(d),
    sojournTicks: 0,
  };

  // Default persona (minimal placeholder)
  const persona: PersonaVector = {
    id: 'default',
    label: 'Default',
    full: new Float64Array(d),
    projected: new Float64Array(k),
    jlEps: config.jlEps,
    jlSeed: config.jlSeed,
    neumannOrder: config.neumannOrder,
    spectralRadius: 0,
    traitLabels: [],
    background: '',
    updatedAt: Date.now(),
  };

  return {
    version: 0,
    timestamp: Date.now(),
    projectedMood,
    projectedPersona,
    jointVector,
    phi,
    mood,
    persona,
    freudian,
    gwtBroadcast: false,
    attentionSchema: {},
  };
}

// ---------------------------------------------------------------------------
// State update
// ---------------------------------------------------------------------------

/**
 * Update the CognitiveState with new mood, persona, and Phi values.
 *
 * Performs:
 *   1. JL-project the mood vector: projectedMood = A * currentMood
 *   2. JL-project the persona vector: projectedPersona = A * persona.full
 *   3. Concatenate into jointVector = [projectedMood ; projectedPersona]
 *   4. Update the Phi score
 *   5. Snapshot the mood regime and persona
 *   6. Bump version counter
 *   7. Reset GWT broadcast flag (must be re-broadcast each cycle)
 *
 * Math:
 *   projectedMood = A * sigma_t,  A in R^{k x d}
 *   projectedPersona = A * pi_t
 *   jointVector = [projectedMood ; projectedPersona] in R^{2k}
 *
 * @param state   - Current CognitiveState (mutated in place).
 * @param mood    - Current MoodRegime after tickMood.
 * @param persona - Current PersonaVector.
 * @param phi     - Latest PhiScore from the Phi Router.
 * @returns The same CognitiveState reference (mutated).
 */
export function updateState(
  state: CognitiveState,
  mood: MoodRegime,
  persona: PersonaVector,
  phi: PhiScore,
): CognitiveState {
  if (!projMatrix) {
    throw new Error(
      'CognitiveState not initialized. Call createCognitiveState(config) first.',
    );
  }

  const k = projMatrix.k;

  // 1. Project mood
  const newProjMood = project(mood.currentMood, projMatrix);
  state.projectedMood.set(newProjMood);

  // 2. Project persona
  const newProjPersona = project(persona.full, projMatrix);
  state.projectedPersona.set(newProjPersona);

  // Also update the persona's own projected field
  persona.projected = newProjPersona;

  // 3. Concatenate into jointVector
  state.jointVector.set(newProjMood, 0);
  state.jointVector.set(newProjPersona, k);

  // 4. Update Phi
  state.phi = phi;

  // 5. Snapshot mood and persona
  state.mood = mood;
  state.persona = persona;

  // 6. Bump version
  state.version++;
  state.timestamp = Date.now();

  // 7. Reset GWT broadcast (must be re-broadcast each cycle)
  state.gwtBroadcast = false;

  return state;
}

// ---------------------------------------------------------------------------
// Global Workspace Theory broadcast
// ---------------------------------------------------------------------------

/**
 * Broadcast the current CognitiveState to all subsystems via GWT.
 *
 * In Global Workspace Theory, the "conscious" state is the one that
 * gets broadcast to all processing modules simultaneously. Setting
 * gwtBroadcast = true signals that the current state has been made
 * available to all downstream subsystems in this cycle.
 *
 * Also updates the attention schema based on Phi and Freudian energy:
 *   - Higher Phi -> more attention to 'integration' and 'ethical'
 *   - Higher Ego energy -> more attention to 'reality_testing'
 *   - Higher Superego -> more attention to 'ethical'
 *   - Higher Id -> more attention to 'creative'
 *
 * @param state - Current CognitiveState (mutated in place).
 * @returns The same CognitiveState reference (mutated).
 */
export function broadcastToGWT(state: CognitiveState): CognitiveState {
  // Compute attention weights from Freudian energy (softmax)
  const { energyId, energyEgo, energySuperego } = state.freudian;
  const maxE = Math.max(energyId, energyEgo, energySuperego);
  const expId = Math.exp(energyId - maxE);
  const expEgo = Math.exp(energyEgo - maxE);
  const expSuperego = Math.exp(energySuperego - maxE);
  const sumExp = expId + expEgo + expSuperego;

  const idWeight = expId / sumExp;
  const egoWeight = expEgo / sumExp;
  const superegoWeight = expSuperego / sumExp;

  // Phi-based integration attention (higher Phi -> more attention to integration)
  const phiNorm = Math.min(1, state.phi.value / 2); // Normalize to [0, 1]

  state.attentionSchema = {
    memory: 0.5 + 0.3 * egoWeight,
    creative: 0.3 + 0.5 * idWeight,
    ethical: 0.3 + 0.5 * superegoWeight,
    reality_testing: 0.4 + 0.4 * egoWeight,
    integration: 0.3 + 0.5 * phiNorm,
    temporal: 0.3 + 0.2 * phiNorm,
  };

  state.gwtBroadcast = true;
  return state;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Get the current JL projection matrix.
 * Returns null if createCognitiveState has not been called.
 */
export function getProjectionMatrix(): JLProjectionMatrix | null {
  return projMatrix;
}

/**
 * Compute the cosine similarity between the current mood and persona
 * in the projected space. This measures mood-persona coherence.
 *
 * cos(projMood, projPersona) = (projMood . projPersona) / (|projMood| * |projPersona|)
 */
export function moodPersonaCoherence(state: CognitiveState): number {
  const a = state.projectedMood;
  const b = state.projectedPersona;
  const n = a.length;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}
