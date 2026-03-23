/**
 * PNEUMA -- Psychodynamic Neural-Unified Emergent Mind Architecture
 *
 * Main orchestrator class wiring all 10 subsystems into a single
 * cognitive processing pipeline.
 *
 * Pipeline (per processInput call):
 *   S9 temporal predict -> S1 Phi compute -> S2 mood tick ->
 *   S3 persona blend -> S4 Freudian route -> S5 memory retrieve ->
 *   S6 PageRank select -> S7 math frame -> S8 strange loop verify -> emit
 *
 * Each subsystem's precision is governed by the ResourceBudget
 * produced by S1 (Phi Router).
 */

import type {
  CandidateResponse,
  CognitiveState,
  CompactVector,
  MathematicalFrame,
  MemoryGraph,
  MemoryNode,
  MoodRegime,
  NodeId,
  PersonaVector,
  PneumaConfig,
  StrangeLoopVerdict,
  TemporalPrediction,
} from './types/index.js';
import { createDefaultPneumaConfig } from './types/index.js';

// S1: Phi Router
import { PhiRouter, type ResourceBudget } from './phi-router/index.js';

// S2: Consciousness (mood + JL projection + cognitive state)
import {
  initializeMoodRegime,
  tickMood,
} from './consciousness/index.js';
import {
  createCognitiveState,
  updateState,
  broadcastToGWT,
} from './consciousness/index.js';

// S3: Persona Blender
import {
  createPersonaBlender,
  blendPersonas,
  type PersonaBlender,
} from './persona-blender/index.js';

// S4: Freudian Router
import { FreudianRouter, type RoutingResult } from './freudian-router/index.js';

// S5: Sparse Memory
import {
  createMemoryGraph,
  addMemoryNode,
  rebuildCSR,
  retrieveMemories,
} from './sparse-memory/index.js';

// S6: PageRank Darwinism
import {
  ConversationGraph,
  selectWinner,
  decayCandidates,
  type PageRankResult,
} from './pagerank-darwinism/index.js';

// S7: Math Framing
import { createFrame } from './math-framing/index.js';

// S8: Strange Loop
import { StrangeLoop } from './strange-loop/index.js';

// S9: Temporal Voice
import {
  createESNFromConfig,
  predict,
  type ESNState,
} from './temporal-voice/index.js';

// ---------------------------------------------------------------------------
// ProcessResult
// ---------------------------------------------------------------------------

/**
 * Result of a single PNEUMA cognitive cycle (processInput).
 *
 * Contains outputs from every subsystem stage so callers can
 * inspect the full pipeline trace for debugging or introspection.
 */
export interface ProcessResult {
  /** S9: Temporal prediction from ESN. */
  temporalPrediction: TemporalPrediction;
  /** S1: Resource budget derived from Phi. */
  resourceBudget: ResourceBudget;
  /** S2: Mood regime after tick. */
  moodRegime: MoodRegime;
  /** S3: Blended persona vector. */
  blendedPersona: Float64Array;
  /** S4: Freudian routing result with scored candidates. */
  routingResult: RoutingResult;
  /** S5: Retrieved memory nodes. */
  retrievedMemories: MemoryNode[];
  /** S6: PageRank selection result. */
  pageRankResult: PageRankResult;
  /** S7: Mathematical frame (null if no math domain detected). */
  mathFrame: MathematicalFrame | null;
  /** S8: Strange Loop verdict (final gate). */
  strangeLoopVerdict: StrangeLoopVerdict;
  /** The cognitive state after this cycle. */
  cognitiveState: CognitiveState;
  /** The selected response text (empty string if none passed). */
  selectedText: string;
  /** Total pipeline wall-clock time in milliseconds. */
  pipelineTimeMs: number;
}

// ---------------------------------------------------------------------------
// PNEUMA class
// ---------------------------------------------------------------------------

/**
 * The PNEUMA orchestrator: wires all 10 subsystems into a single
 * cognitive processing pipeline.
 *
 * Usage:
 *   const pneuma = new PNEUMA();
 *   pneuma.initialize(config);
 *   const result = pneuma.processInput('Hello world', embedding, candidates);
 */
export class PNEUMA {
  private config: PneumaConfig | null = null;
  private initialized = false;

  // Subsystem instances
  private phiRouter!: PhiRouter;
  private moodRegime!: MoodRegime;
  private cognitiveState!: CognitiveState;
  private personaBlender!: PersonaBlender;
  private freudianRouter!: FreudianRouter;
  private memoryGraph!: MemoryGraph;
  private strangeLoop!: StrangeLoop;
  private esn!: ESNState;

  // State trace for Phi computation (sliding window of recent joint vectors)
  private stateTrace: Float64Array[] = [];
  private readonly maxTraceLength = 20;

  // Cycle counter
  private cycleCount = 0;

  /**
   * Initialize all subsystems from the given configuration.
   *
   * Must be called before processInput.
   *
   * @param config - PNEUMA system configuration. Defaults to createDefaultPneumaConfig().
   */
  initialize(config?: PneumaConfig): void {
    this.config = config ?? createDefaultPneumaConfig();
    const cfg = this.config;

    // S1: Phi Router
    this.phiRouter = new PhiRouter();
    this.phiRouter.initialize(cfg);

    // S2: Consciousness layer (mood + cognitive state)
    this.moodRegime = initializeMoodRegime(cfg);
    this.cognitiveState = createCognitiveState(cfg);

    // S3: Persona Blender
    this.personaBlender = createPersonaBlender(cfg);

    // S4: Freudian Router
    this.freudianRouter = new FreudianRouter(cfg);

    // S5: Memory Graph
    this.memoryGraph = createMemoryGraph(cfg);

    // S8: Strange Loop
    this.strangeLoop = new StrangeLoop(cfg);

    // S9: Temporal Voice (ESN)
    this.esn = createESNFromConfig(cfg);

    // Reset state
    this.stateTrace = [];
    this.cycleCount = 0;
    this.initialized = true;
  }

  /**
   * Run the full cognitive pipeline on an input.
   *
   * Pipeline stages:
   *   1. S9: Temporal prediction from ESN
   *   2. S1: Compute Phi from state trace -> ResourceBudget
   *   3. S2: Tick mood regime with input embedding
   *   4. S3: Blend persona with current mood
   *   5. S2: Update cognitive state (JL-project mood + persona)
   *   6. S2: GWT broadcast
   *   7. S4: Freudian decomposition + candidate scoring
   *   8. S5: Retrieve grounding memories
   *   9. S6: PageRank selection over conversation graph
   *  10. S7: Apply mathematical framing (if math domain detected)
   *  11. S8: Strange Loop self-verification
   *  12. Emit selected response
   *
   * @param inputText      - Raw input text for decomposition and framing
   * @param inputEmbedding - JL-projected input embedding in R^k
   * @param candidates     - Candidate responses to evaluate
   * @param persona        - Current persona vector (uses default if not provided)
   * @returns ProcessResult with outputs from every pipeline stage
   * @throws Error if PNEUMA has not been initialized
   */
  processInput(
    inputText: string,
    inputEmbedding: CompactVector,
    candidates: CandidateResponse[],
    persona?: PersonaVector,
  ): ProcessResult {
    if (!this.initialized || !this.config) {
      throw new Error('PNEUMA not initialized. Call initialize(config) first.');
    }

    const startTime = Date.now();
    const cfg = this.config;
    const activePersona = persona ?? this.cognitiveState.persona;

    // -------------------------------------------------------------------
    // Stage 1: S9 Temporal Prediction
    // -------------------------------------------------------------------
    const temporalPrediction = predict(
      this.esn,
      inputEmbedding,
      cfg.beamWidth,
    );

    // -------------------------------------------------------------------
    // Stage 2: S1 Phi Computation -> Resource Budget
    // -------------------------------------------------------------------
    // Append current joint vector to state trace for Phi
    this.stateTrace.push(new Float64Array(this.cognitiveState.jointVector));
    if (this.stateTrace.length > this.maxTraceLength) {
      this.stateTrace.shift();
    }

    // Need at least 2 timesteps for Phi computation
    let resourceBudget: ResourceBudget;
    if (this.stateTrace.length >= 2) {
      resourceBudget = this.phiRouter.computeAndAllocate(this.stateTrace);
    } else {
      // Bootstrap budget with defaults for first cycle
      resourceBudget = {
        memoryEpsilon: cfg.memoryPushEpsilon,
        ethicalHeuristicCeiling: cfg.ethicalDiameter,
        strangeLoopThreshold: cfg.phiThreshold,
        pageRankIterationBudget: 50,
        temporalLeadBeamWidth: cfg.beamWidth,
        sourcePhi: 0,
        sourceMethod: cfg.phiMethod,
        allocatedAt: Date.now(),
      };
    }

    // -------------------------------------------------------------------
    // Stage 3: S2 Mood Tick
    // -------------------------------------------------------------------
    // Use input embedding as external mood input (truncated/padded to mood dim)
    const moodDim = this.moodRegime.currentMood.length;
    const moodInput = new Float64Array(moodDim);
    const copyLen = Math.min(inputEmbedding.length, moodDim);
    for (let j = 0; j < copyLen; j++) {
      moodInput[j] = inputEmbedding[j] * 0.01; // Scale down to avoid dominating drift
    }
    tickMood(this.moodRegime, moodInput);

    // -------------------------------------------------------------------
    // Stage 4: S3 Persona Blend
    // -------------------------------------------------------------------
    const blendedPersona = blendPersonas(
      activePersona,
      this.moodRegime,
      0.5, // alpha: moderate mood influence
      this.personaBlender,
    );

    // Update persona's full vector with blended result
    activePersona.full.set(blendedPersona);
    activePersona.updatedAt = Date.now();

    // -------------------------------------------------------------------
    // Stage 5: S2 Update Cognitive State + GWT Broadcast
    // -------------------------------------------------------------------
    const phi = this.phiRouter.getLatestPhi() ?? this.cognitiveState.phi;
    updateState(this.cognitiveState, this.moodRegime, activePersona, phi);
    broadcastToGWT(this.cognitiveState);

    // -------------------------------------------------------------------
    // Stage 6: S4 Freudian Routing
    // -------------------------------------------------------------------
    const routingResult = this.freudianRouter.route(
      inputText,
      inputEmbedding,
      candidates,
      this.cognitiveState,
      phi.value,
    );

    // -------------------------------------------------------------------
    // Stage 7: S5 Memory Retrieval
    // -------------------------------------------------------------------
    let retrievedMemories: MemoryNode[] = [];
    if (this.memoryGraph.size > 0) {
      retrievedMemories = retrieveMemories(
        this.memoryGraph,
        inputEmbedding,
        resourceBudget.memoryEpsilon,
        10, // top-K
      );
    }

    // Attach grounding memories to candidates
    const memoryIds = retrievedMemories.map(m => m.id);
    for (const c of routingResult.candidates) {
      c.groundingMemories = memoryIds;
    }

    // -------------------------------------------------------------------
    // Stage 8: S6 PageRank Selection
    // -------------------------------------------------------------------
    const convGraph = new ConversationGraph(cfg);

    // Add input utterance
    convGraph.addUtterance(
      `input_${this.cycleCount}`,
      inputEmbedding,
      Date.now(),
    );

    // Add scored candidates from Freudian routing
    for (const c of routingResult.candidates) {
      convGraph.addCandidate(c);
    }

    convGraph.buildEdges();

    const pageRankResult = selectWinner(
      convGraph,
      routingResult.candidates,
      resourceBudget.pageRankIterationBudget,
    );

    // Apply Neural Darwinism: decay losers, boost winner
    if (pageRankResult.winnerIndex >= 0) {
      decayCandidates(routingResult.candidates, pageRankResult.winnerIndex);
    }

    // -------------------------------------------------------------------
    // Stage 9: S7 Mathematical Framing
    // -------------------------------------------------------------------
    const mathFrame = createFrame(inputText);
    const hasMathContent = mathFrame.classificationConfidence > 0;
    const finalMathFrame = hasMathContent ? mathFrame : null;

    // -------------------------------------------------------------------
    // Stage 10: S8 Strange Loop Verification
    // -------------------------------------------------------------------
    const strangeLoopVerdict = this.strangeLoop.runLoop(
      routingResult.candidates,
      this.cognitiveState,
      resourceBudget.strangeLoopThreshold,
    );

    // -------------------------------------------------------------------
    // Stage 11: Emit
    // -------------------------------------------------------------------
    const selectedText = strangeLoopVerdict.selectedResponse?.text ?? '';

    this.cycleCount++;

    const pipelineTimeMs = Date.now() - startTime;

    return {
      temporalPrediction,
      resourceBudget,
      moodRegime: this.moodRegime,
      blendedPersona,
      routingResult,
      retrievedMemories,
      pageRankResult,
      mathFrame: finalMathFrame,
      strangeLoopVerdict,
      cognitiveState: this.cognitiveState,
      selectedText,
      pipelineTimeMs,
    };
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /** Get the current cognitive state. */
  getCognitiveState(): CognitiveState {
    this.checkInitialized();
    return this.cognitiveState;
  }

  /** Get the memory graph for external manipulation. */
  getMemoryGraph(): MemoryGraph {
    this.checkInitialized();
    return this.memoryGraph;
  }

  /** Get the Phi Router for diagnostics. */
  getPhiRouter(): PhiRouter {
    this.checkInitialized();
    return this.phiRouter;
  }

  /** Get the ESN state for training or inspection. */
  getESN(): ESNState {
    this.checkInitialized();
    return this.esn;
  }

  /** Get the mood regime. */
  getMoodRegime(): MoodRegime {
    this.checkInitialized();
    return this.moodRegime;
  }

  /** Get the persona blender state. */
  getPersonaBlender(): PersonaBlender {
    this.checkInitialized();
    return this.personaBlender;
  }

  /** Get the Freudian router. */
  getFreudianRouter(): FreudianRouter {
    this.checkInitialized();
    return this.freudianRouter;
  }

  /** Number of cognitive cycles processed. */
  getCycleCount(): number {
    return this.cycleCount;
  }

  /** Whether the system has been initialized. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Get the current config. */
  getConfig(): PneumaConfig {
    this.checkInitialized();
    return this.config!;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error('PNEUMA not initialized. Call initialize(config) first.');
    }
  }
}
