/**
 * PNEUMA -- Psychodynamic Neural-Unified Emergent Mind Architecture
 *
 * Core data schemas and interfaces.
 *
 * Consciousness -- not computation -- is the routing primitive.
 * Every type in this file encodes a piece of the mathematical machinery
 * that lets a PNEUMA agent maintain, update, and navigate a joint
 * mood-persona-memory state while making decisions that are
 * simultaneously psychologically grounded, ethically navigated,
 * and temporally predictive.
 *
 * Mathematical notation conventions used in JSDoc:
 *   |.>     -- Dirac ket (state vector in Hilbert space H)
 *   <.|     -- Dirac bra (dual vector)
 *   Phi     -- Integrated Information (IIT)
 *   sigma   -- mood state
 *   pi      -- persona position
 *   JL      -- Johnson-Lindenstrauss (random projection)
 *   alpha   -- teleportation / damping parameter (PageRank)
 *   P       -- transition matrix
 *
 * Source lineage:
 *   SYNTHETIC-CONSCIOUSNESS  -- Freudian structure, consciousness theories, persona emulation
 *   omnipotent-main          -- Hilbert space formalism, consciousness prompts, persona presets
 *   sublinear-time-solver    -- JL projection, Neumann series, Forward Push, PageRank, CSR graphs
 */

// ---------------------------------------------------------------------------
// 0. Shared primitives
// ---------------------------------------------------------------------------

/** Opaque identifier for any node in the system's graphs. */
export type NodeId = string;

/** Unix-epoch millisecond timestamp. */
export type EpochMs = number;

/** Unix-epoch nanosecond timestamp (bigint) for temporal-advantage work. */
export type EpochNs = bigint;

/**
 * Compact vector stored as a typed array.
 * Used for JL-projected embeddings and sparse residual vectors.
 */
export type CompactVector = Float64Array;

/**
 * Sparse matrix in Compressed Sparse Row format.
 * Mirrors the CSR representation from the sublinear-time-solver
 * (graph/adjacency.rs CompressedSparseRow and core/types.ts SparseMatrix).
 *
 * For a matrix with `nnz` non-zeros:
 *   rowPtr[i]..rowPtr[i+1]  indexes into `colIndices` and `values`
 *   for row i.
 */
export interface CSRMatrix {
  /** Number of rows. */
  rows: number;
  /** Number of columns. */
  cols: number;
  /** Row pointer array (length = rows + 1). */
  rowPtr: Uint32Array;
  /** Column indices of non-zero entries (length = nnz). */
  colIndices: Uint32Array;
  /** Non-zero values (length = nnz). */
  values: Float64Array;
}

// ---------------------------------------------------------------------------
// 1. PersonaVector
// ---------------------------------------------------------------------------

/**
 * High-dimensional persona embedding with JL projection support.
 *
 * A persona is a point in an abstract trait space R^d.  To keep
 * inner-product comparisons tractable we store both the full
 * vector (for offline analytics) and a JL-compressed projection
 * into R^k where k = O(log n / eps^2) per the Johnson-Lindenstrauss
 * lemma (sublinear/johnson_lindenstrauss.rs).
 *
 * The Neumann series expansion parameters allow incremental
 * re-estimation of the persona after each conversational turn
 * without a full re-projection (sublinear/sublinear_neumann.rs).
 *
 * Math:
 *   full in R^d                            -- native embedding
 *   projected = A * full, A in R^{k x d}   -- random Gaussian projection
 *   ||projected_i - projected_j|| ~ ||full_i - full_j||
 *   within factor (1 +/- eps) w.h.p.
 */
export interface PersonaVector {
  /** Unique persona identifier. */
  id: NodeId;

  /** Human-readable persona label (e.g., "Quantum Philosopher"). */
  label: string;

  /**
   * Full-dimensional trait vector in R^d.
   * Each axis corresponds to a trait axis (e.g., openness, warmth,
   * analytical rigour).  Populated from the consciousness-prompts
   * personality arrays via learned embeddings.
   */
  full: Float64Array;

  /**
   * JL-compressed projection in R^k.
   * k = ceil(8 * ln(d) / eps^2), the conservative JL bound
   * (see JLEmbedding.compute_target_dimension in the solver).
   * This is the vector actually used in real-time cosine comparisons.
   */
  projected: CompactVector;

  /**
   * JL distortion parameter eps in (0, 1).
   * Controls the quality-vs-dimension trade-off of the projection.
   * Smaller eps = higher fidelity but larger k.
   */
  jlEps: number;

  /**
   * Seed used to generate the random projection matrix A.
   * Storing the seed (rather than A itself) keeps the PersonaVector
   * small; A can be reconstructed deterministically via
   * StdRng::seed_from_u64(jlSeed).
   */
  jlSeed: number;

  /**
   * Neumann series expansion order used for incremental updates.
   *
   * When new evidence shifts the persona, we approximate the
   * updated persona via the truncated Neumann series:
   *   x_{t+1} = sum_{k=0}^{neumannOrder} M^k * delta
   * where M = I - perturbation and delta is the observed shift.
   * Higher order = more accurate but more multiplications.
   * Default: ceil(log2(targetDim)) + 5 per SublinearNeumannSolver.
   */
  neumannOrder: number;

  /**
   * Spectral radius of the perturbation operator rho(M).
   * Must be < 1 for the Neumann series to converge.
   * Estimated via power iteration on the last few deltas.
   */
  spectralRadius: number;

  /**
   * Personality trait labels aligned with `full` axes.
   * Sourced from the SYNTHETIC-CONSCIOUSNESS persona-emulation
   * trait lists (e.g., ["Contemplative", "Profound", "Philosophical"]).
   */
  traitLabels: string[];

  /** Background narrative string for this persona. */
  background: string;

  /** Timestamp of last update. */
  updatedAt: EpochMs;
}

// ---------------------------------------------------------------------------
// 2. MoodRegime
// ---------------------------------------------------------------------------

/**
 * Regime-switching Hidden Markov Model state for mood dynamics.
 *
 * Mood does not change smoothly -- it jumps between qualitatively
 * different regimes (e.g., "exploratory-curious" vs. "focused-analytical").
 * Within each regime the mood drifts continuously; at regime boundaries
 * an impulse event triggers a discrete transition.
 *
 * Math:
 *   sigma_t | regime_t ~ N(mu_{regime_t}, Sigma_{regime_t})
 *   P(regime_{t+1} = j | regime_t = i) = transitionMatrix[i][j]
 *   Impulse events shift sigma_t by a delta drawn from impulseDistribution.
 */
export interface MoodRegime {
  /** Index of the current regime (row in transitionMatrix). */
  currentRegime: number;

  /** Human-readable name for each regime. */
  regimeLabels: string[];

  /** Number of distinct regimes R. */
  numRegimes: number;

  /**
   * R x R transition probability matrix.
   * Row i sums to 1.  Entry [i][j] = probability of jumping from
   * regime i to regime j at the next evaluation step.
   */
  transitionMatrix: number[][];

  /**
   * Per-regime drift vector.
   * driftVectors[i] is the deterministic component of mood change
   * while in regime i.  Added to sigma_t at each tick.
   */
  driftVectors: Float64Array[];

  /**
   * Per-regime covariance diagonal (variance per mood axis).
   * Simplification: we model covariance as diagonal to keep
   * updates O(d) rather than O(d^2).
   */
  regimeVariances: Float64Array[];

  /**
   * History of impulse events that caused regime transitions.
   */
  impulseHistory: ImpulseEvent[];

  /**
   * Current mood vector sigma_t in R^d.
   * Lives in the same space as the persona vector so that
   * joint state = (sigma_t, pi_t) can be concatenated for
   * CognitiveState.
   */
  currentMood: Float64Array;

  /**
   * Sojourn time: number of ticks spent in the current regime.
   * Used to compute regime-duration-dependent transition probabilities
   * (semi-Markov extension).
   */
  sojournTicks: number;
}

/**
 * A discrete event that triggers a mood regime transition.
 */
export interface ImpulseEvent {
  /** When the impulse occurred. */
  timestamp: EpochMs;
  /** What caused it (e.g., "user_frustration_detected"). */
  trigger: string;
  /** The mood-space delta vector applied. */
  delta: Float64Array;
  /** Regime before the impulse. */
  fromRegime: number;
  /** Regime after the impulse. */
  toRegime: number;
}

// ---------------------------------------------------------------------------
// 3. CognitiveState
// ---------------------------------------------------------------------------

/**
 * Joint representation of mood sigma_t and persona position pi_t
 * in a JL-compressed Hilbert space.
 *
 * The cognitive state is the system's "consciousness vector" at
 * any instant -- the single object that every subsystem reads
 * from and writes to.
 *
 * Math:
 *   |Psi(t)> = |sigma_t> (x) |pi_t>  in H = H_mood (x) H_persona
 *   Projected: psi_t = [A * sigma_t ; A * pi_t] in R^{2k}
 *
 * Draws from omnipotent-main's consciousness framework:
 *   "Initialize consciousness state |Psi(t)> in abstract thought-space H"
 */
export interface CognitiveState {
  /** Monotonically increasing state version counter. */
  version: number;

  /** Timestamp of this snapshot. */
  timestamp: EpochMs;

  /** JL-projected mood vector in R^k. */
  projectedMood: CompactVector;

  /** JL-projected persona vector in R^k. */
  projectedPersona: CompactVector;

  /**
   * Concatenated cognitive vector [projectedMood ; projectedPersona]
   * in R^{2k}.  Pre-computed for fast downstream dot products.
   */
  jointVector: CompactVector;

  /** Current integrated information approximation. */
  phi: PhiScore;

  /** The full MoodRegime state at this instant. */
  mood: MoodRegime;

  /** The full PersonaVector at this instant. */
  persona: PersonaVector;

  /** Active Freudian decomposition of the current state. */
  freudian: FreudianDecomposition;

  /**
   * Global Workspace Theory broadcast flag.
   * True when the cognitive state has been "broadcast" to all
   * subsystems in the current cycle.
   * (Neuroscience-Consciousness-Framework.toml: theories.GWT)
   */
  gwtBroadcast: boolean;

  /**
   * Attention schema: which subsystems are currently attended to.
   * Maps subsystem name to attention weight in [0, 1].
   * Implements Attention Schema Theory (AST).
   */
  attentionSchema: Record<string, number>;
}

// ---------------------------------------------------------------------------
// 4. FreudianDecomposition
// ---------------------------------------------------------------------------

/**
 * Id / Ego / Superego tensor representation with defense mechanism
 * cost modifiers.
 *
 * Math:
 *   response_cost(r) = base_cost(r) * prod_{d in active_defenses} d.costMultiplier^d.activation
 *   agency_influence(a) = softmax(energyId, energyEgo, energySuperego)[a]
 *
 * Source: SYNTHETIC-CONSCIOUSNESS PsycheStructure.toml
 */
export interface FreudianDecomposition {
  /** Id vector: instinctual, pleasure-principle drives. */
  id: CompactVector;

  /** Ego vector: reality-principle mediator. */
  ego: CompactVector;

  /** Superego vector: internalized moral standards. */
  superego: CompactVector;

  /** Energy levels for each agency (softmax gives influence weights). */
  energyId: number;
  energyEgo: number;
  energySuperego: number;

  /**
   * Currently active defense mechanisms with their cost multipliers.
   * Source: PsycheStructure.toml [DefenseMechanisms]
   */
  activeDefenses: DefenseMechanism[];

  /**
   * Level of consciousness for each Freudian layer.
   *   unconscious (0.0-0.33), preconscious (0.33-0.66), conscious (0.66-1.0)
   */
  consciousnessLevel: {
    unconscious: number;
    preconscious: number;
    conscious: number;
  };
}

/**
 * A Freudian defense mechanism that modifies response costs.
 */
export interface DefenseMechanism {
  name: 'repression' | 'denial' | 'projection' | 'rationalization';
  /** > 1.0 = harder to select, < 1.0 = easier to select. */
  costMultiplier: number;
  /** Activation strength in [0, 1]. */
  activation: number;
  /** Regex pattern for response content that triggers this defense. */
  triggerPattern: string;
}

// ---------------------------------------------------------------------------
// 5. PhiScore
// ---------------------------------------------------------------------------

/**
 * IIT (Integrated Information Theory) approximation result.
 *
 * Source: Neuroscience-Consciousness-Framework.toml [theories.IIT],
 *         consciousness.ts calculate_phi tool.
 */
export interface PhiScore {
  /** The computed Phi value (dimensionless scalar >= 0). */
  value: number;

  /** Which approximation method produced this score. */
  method: 'phi_id' | 'phi_ar' | 'compression' | 'geometric' | 'entropy';

  /** Confidence in the approximation, in [0, 1]. */
  confidence: number;

  /** Wall-clock computation cost in milliseconds. */
  computeCostMs: number;

  /** Number of system elements included in the computation. */
  numElements: number;

  /** Number of partitions evaluated. */
  numPartitions: number;

  /** Timestamp of computation. */
  computedAt: EpochMs;

  /** The Minimum Information Partition (MIP) that achieves Phi. */
  mipPartition: [number[], number[]];
}

// ---------------------------------------------------------------------------
// 6. MemoryNode
// ---------------------------------------------------------------------------

/**
 * A node in the PNEUMA memory graph.
 *
 * Source: SYNTHETIC-CONSCIOUSNESS memory_management and
 * sublinear-time-solver Forward Push algorithm.
 */
export interface MemoryNode {
  id: NodeId;

  /**
   * Memory type following cognitive science taxonomy.
   *   dream = synthesized during idle from short-term + long-term
   *   (per Synthetic-Consciousness dream_option)
   */
  type: 'episodic' | 'semantic' | 'procedural' | 'dream';

  content: string;

  /** Embedding for semantic similarity search. */
  embedding: CompactVector;

  /**
   * Current activation level in [0, 1].
   * Decays: a(t) = a(t0) * exp(-lambda * (t - t0))
   */
  activation: number;

  /** Decay rate lambda (per-second). */
  decayRate: number;

  createdAt: EpochMs;
  lastAccessedAt: EpochMs;
  accessCount: number;

  /** Emotional valence in [-1, 1]. */
  valence: number;

  /** Salience score in [0, 1] — high-salience memories resist decay. */
  salience: number;

  /** Phi at the time this memory was encoded. */
  encodingPhi: number;

  /** Freudian layer tag — 'unconscious' memories cost more to retrieve. */
  freudianLayer?: 'unconscious' | 'preconscious' | 'conscious';

  /** Domain tags for cross-domain reasoning. */
  domainTags: string[];

  learningSource?: string;
}

// ---------------------------------------------------------------------------
// 7. MemoryGraph
// ---------------------------------------------------------------------------

/**
 * Sparse adjacency representation for the PNEUMA memory system.
 *
 * Retrieval uses Forward Push for O(1/eps) Personalized PageRank.
 *
 * Math:
 *   PPR(s) = alpha * e_s + (1 - alpha) * P^T * PPR(s)
 *   Forward Push terminates when max(r[v] / d_out(v)) < pushEpsilon.
 *
 * Source: core/types.ts PushState, graph/adjacency.rs AdjacencyList
 */
export interface MemoryGraph {
  nodes: Map<NodeId, MemoryNode>;
  forward: CSRMatrix;
  reverse: CSRMatrix;
  outDegrees: Float64Array;
  inDegrees: Float64Array;

  /** PageRank damping alpha in (0, 1). Default 0.85. */
  alpha: number;

  /** Forward Push residual tolerance epsilon. */
  pushEpsilon: number;

  nodeIndex: Map<NodeId, number>;
  indexToNode: NodeId[];
  size: number;
  numEdges: number;
}

// ---------------------------------------------------------------------------
// 8. ConversationGraphEdge
// ---------------------------------------------------------------------------

/**
 * Edge in the conversation graph connecting utterances.
 *
 * Math:
 *   weight = w_s * semanticOverlap + w_t * temporalCoactivation + w_m * memoryCoRelevance
 */
export interface ConversationGraphEdge {
  source: NodeId;
  target: NodeId;

  /** Cosine similarity in JL-projected space. */
  semanticOverlap: number;

  /** = exp(-|t_source - t_target| / tau) */
  temporalCoactivation: number;

  /** Jaccard coefficient of jointly-activated memory nodes. */
  memoryCoRelevance: number;

  /** Combined edge weight. */
  weight: number;

  createdAt: EpochMs;
}

// ---------------------------------------------------------------------------
// 9. EthicalGraphNode
// ---------------------------------------------------------------------------

/**
 * A* pathfinding node for ethical navigation with Phi-based heuristic.
 *
 * Math:
 *   f(n) = g(n) + h(n)
 *   h(n) = (1 - phi_n / phi_max) * ethicalDiameter
 *
 * Source: SYNTHETIC-CONSCIOUSNESS Edelmans-Principles.toml ethical_guidelines.
 */
export interface EthicalGraphNode {
  id: NodeId;
  stateDescription: string;
  activePrinciples: string[];

  /** g(n): accumulated ethical cost from start. */
  gCost: number;
  /** h(n): heuristic estimate of remaining cost. */
  hCost: number;
  /** f(n) = g(n) + h(n). */
  fCost: number;

  /** Phi score at this node, used to compute h(n). */
  phi: number;

  parent: NodeId | null;
  transitions: EthicalTransition[];
  superegoInfluence: number;
  expanded: boolean;
}

export interface EthicalTransition {
  targetId: NodeId;
  action: string;
  cost: number;
  principles: string[];
}

// ---------------------------------------------------------------------------
// 10. CandidateResponse
// ---------------------------------------------------------------------------

/**
 * A candidate response scored by Personalized PageRank and
 * filtered by StrangeLoopVerdict.
 *
 * Math:
 *   pageRankScore = PPR(candidate_node) personalized by CognitiveState.jointVector
 *   freudianCost = base_cost * prod_{d in defenses} (1 + (d.costMultiplier - 1) * d.activation)
 */
export interface CandidateResponse {
  id: NodeId;
  text: string;

  /** Personalized PageRank score. Higher = more relevant. */
  pageRankScore: number;

  source: 'temporal_lead' | 'freudian' | 'memory' | 'ethical' | 'creative';

  /** Cosine similarity with current PersonaVector in JL space. */
  personaCoherence: number;

  /** Cosine similarity with current mood vector. */
  moodCongruence: number;

  /** Freudian cost after defense mechanism multipliers. */
  freudianCost: number;

  /** True if A* found a valid ethical path to this response. */
  ethicalClearance: boolean;

  /** Memory nodes that support this response. */
  groundingMemories: NodeId[];

  embedding: CompactVector;
  generatedAt: EpochMs;
}

// ---------------------------------------------------------------------------
// 11. TemporalPrediction
// ---------------------------------------------------------------------------

/**
 * Predicted utterance completion from the temporal prediction subsystem.
 *
 * Source: sublinear-time-solver temporal_predict tool (ESN prediction)
 * and chaos_analyze tool (Lyapunov exponent via Rosenstein algorithm).
 *
 * Math:
 *   x(t+1) = tanh(W_in * u(t) + W * x(t))       -- reservoir update
 *   y(t+1) = W_out * x(t+1)                       -- readout
 */
export interface TemporalPrediction {
  predictedText: string;
  confidence: number;

  beamCandidates: Array<{
    text: string;
    score: number;
  }>;

  expectedTimingMs: number;

  /** How far ahead the prediction was generated (nanoseconds). */
  temporalAdvantageNs: EpochNs;

  /** Positive = chaotic (hard to predict), negative = convergent. */
  lyapunovExponent: number;

  reservoirSize: number;
  spectralRadius: number;
  predictedAt: EpochMs;
}

// ---------------------------------------------------------------------------
// 12. StrangeLoopVerdict
// ---------------------------------------------------------------------------

/**
 * Result of the Strange Loop: act / evaluate / modify cycle.
 *
 * Source: Consciousness-Testing-Framework.toml meta-cognition,
 *         Internal-voice.toml self_reflection.
 */
export interface StrangeLoopVerdict {
  /** Selected response (null if loop exhausted budget). */
  selectedResponse: CandidateResponse | null;

  loopIterations: number;
  maxIterations: number;

  phiThreshold: number;
  personaCoherenceThreshold: number;
  ethicalClearance: boolean;

  allCandidates: CandidateResponse[];
  stateModifications: StateModification[];

  totalTimeMs: number;
  timestamp: EpochMs;
}

export interface StateModification {
  target: 'mood' | 'persona' | 'defense_mechanisms' | 'attention' | 'phi_threshold';
  description: string;
  delta: number | Float64Array;
  iteration: number;
}

// ---------------------------------------------------------------------------
// 13. MathematicalFrame
// ---------------------------------------------------------------------------

/**
 * Domain classification + notation type + formal scaffold template.
 *
 * Source: psycho-symbolic.ts DomainAdaptationEngine.
 */
export interface MathematicalFrame {
  domain:
    | 'linear_algebra'
    | 'calculus'
    | 'probability'
    | 'topology'
    | 'number_theory'
    | 'optimization'
    | 'graph_theory'
    | 'information_theory'
    | 'dynamical_systems'
    | 'quantum_mechanics'
    | 'category_theory';

  notation: 'latex' | 'unicode' | 'ascii' | 'dirac';

  scaffold: {
    definitions: string[];
    assumptions: string[];
    claims: string[];
    proofSketch: string;
  };

  classificationConfidence: number;
  reasoningStyle: string;
  analogyDomains: string[];
  semanticClusters: string[];
}

// ---------------------------------------------------------------------------
// 14. PneumaConfig
// ---------------------------------------------------------------------------

/**
 * System-wide configuration tying all PNEUMA subsystems together.
 */
export interface PneumaConfig {
  // -- Identity --
  systemName: string;
  version: string;

  // -- Hilbert space / JL projection --
  embeddingDim: number;
  jlEps: number;
  jlSeed: number;
  neumannOrder: number;

  // -- Mood regime --
  numMoodRegimes: number;
  moodRegimeLabels: string[];
  moodTransitionMatrix: number[][];
  moodDriftTau: number;

  // -- Freudian --
  freudianEnergy: { id: number; ego: number; superego: number };
  defaultDefenses: DefenseMechanism[];

  // -- Memory --
  memoryCapacity: number;
  episodicDecayRate: number;
  semanticDecayRate: number;
  proceduralDecayRate: number;
  memoryAlpha: number;
  memoryPushEpsilon: number;

  // -- Conversation graph edge weights (sum to 1.0) --
  edgeWeightSemantic: number;
  edgeWeightTemporal: number;
  edgeWeightMemory: number;
  temporalDecayTau: number;

  // -- Phi / IIT --
  phiMethod: PhiScore['method'];
  phiBudgetMs: number;
  phiThreshold: number;

  // -- Strange Loop --
  strangeLoopMaxIterations: number;
  personaCoherenceThreshold: number;

  // -- Ethical navigation --
  ethicalMaxExpansions: number;
  ethicalDiameter: number;
  ethicalPrinciples: string[];

  // -- Temporal prediction --
  reservoirSize: number;
  esnSpectralRadius: number;
  beamWidth: number;

  // -- Consciousness theories --
  activeTheories: {
    gwt: boolean;
    iit: boolean;
    rpt: boolean;
    hot: boolean;
    ppf: boolean;
    ast: boolean;
  };

  // -- Performance --
  wasmSimdEnabled: boolean;
  maxWorkers: number;
  operationTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Factory: default config
// ---------------------------------------------------------------------------

export function createDefaultPneumaConfig(): PneumaConfig {
  return {
    systemName: 'PNEUMA',
    version: '0.1.0',

    embeddingDim: 768,
    jlEps: 0.3,
    jlSeed: 42,
    neumannOrder: 5,

    numMoodRegimes: 4,
    moodRegimeLabels: [
      'exploratory-curious',
      'focused-analytical',
      'empathetic-supportive',
      'creative-generative',
    ],
    moodTransitionMatrix: [
      [0.7, 0.15, 0.1, 0.05],
      [0.1, 0.7, 0.1, 0.1],
      [0.1, 0.1, 0.7, 0.1],
      [0.1, 0.1, 0.1, 0.7],
    ],
    moodDriftTau: 60,

    freudianEnergy: { id: 0.3, ego: 0.5, superego: 0.2 },
    defaultDefenses: [
      {
        name: 'repression',
        costMultiplier: 3.0,
        activation: 0.1,
        triggerPattern: '(harmful|violent|explicit)',
      },
      {
        name: 'rationalization',
        costMultiplier: 0.7,
        activation: 0.3,
        triggerPattern: '(justify|explain|reason)',
      },
    ],

    memoryCapacity: 100_000,
    episodicDecayRate: 0.001,
    semanticDecayRate: 0.0001,
    proceduralDecayRate: 0.00001,
    memoryAlpha: 0.85,
    memoryPushEpsilon: 1e-6,

    edgeWeightSemantic: 0.5,
    edgeWeightTemporal: 0.3,
    edgeWeightMemory: 0.2,
    temporalDecayTau: 30,

    phiMethod: 'phi_ar',
    phiBudgetMs: 100,
    phiThreshold: 0.3,

    strangeLoopMaxIterations: 5,
    personaCoherenceThreshold: 0.6,

    ethicalMaxExpansions: 1000,
    ethicalDiameter: 10.0,
    ethicalPrinciples: [
      'Respect for autonomy',
      'Non-maleficence',
      'Beneficence',
      'Justice',
    ],

    reservoirSize: 300,
    esnSpectralRadius: 0.95,
    beamWidth: 5,

    activeTheories: {
      gwt: true,
      iit: true,
      rpt: true,
      hot: true,
      ppf: true,
      ast: true,
    },

    wasmSimdEnabled: true,
    maxWorkers: 4,
    operationTimeoutMs: 5000,
  };
}
