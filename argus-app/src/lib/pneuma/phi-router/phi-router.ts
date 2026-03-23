/**
 * PNEUMA S1 -- Phi Router
 *
 * Main entry point for the Phi computation and resource allocation subsystem.
 * Orchestrates the approximation engine and allocator, auto-selects the
 * computation method based on the time budget, and caches recent Phi values
 * to avoid redundant recomputation.
 *
 * Architecture:
 *   stateTrace -> [PhiRouter] -> PhiScore -> [ResourceAllocator] -> ResourceBudget
 *                                   |
 *                              [LRU Cache]
 *
 * Method auto-selection heuristic:
 *   phiBudgetMs < 20ms  -> compression  (cheapest, O(2^d * T * d) with small constant)
 *   phiBudgetMs < 80ms  -> phi_ar       (moderate, needs covariance + Cholesky)
 *   phiBudgetMs >= 80ms -> phi_id       (most faithful, full bipartition MI)
 */

import type { PhiScore, PneumaConfig } from '../types/index.js';
import { computePhi } from './phi-approximation.js';
import { allocateResources, type ResourceBudget } from './resource-allocator.js';

// ---------------------------------------------------------------------------
// LRU cache for PhiScore values
// ---------------------------------------------------------------------------

/**
 * Simple LRU cache keyed by a hash of the state trace.
 * Avoids recomputing Phi when the state hasn't changed significantly.
 */
class PhiCache {
  private readonly entries: Map<string, { score: PhiScore; expiry: number }> = new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number = 64, ttlMs: number = 5000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Compute a fast hash of a state trace for cache lookup.
   *
   * Uses a combination of trace dimensions, first/last vector norms,
   * and sampled values to produce a string key. This is NOT
   * cryptographically secure -- it's a fast fingerprint for caching.
   */
  static hashTrace(trace: Float64Array[]): string {
    if (trace.length === 0) return 'empty';

    const T = trace.length;
    const d = trace[0].length;

    // Sample up to 8 values from the trace for the hash
    let hash = `${T}:${d}`;
    const sampleIndices = [0, Math.floor(T / 4), Math.floor(T / 2), Math.floor(3 * T / 4), T - 1];

    for (const ti of sampleIndices) {
      if (ti >= T) continue;
      const vec = trace[ti];
      // Take first, middle, and last element of each sampled vector
      const samples = [vec[0], vec[Math.floor(d / 2)], vec[d - 1]];
      for (const s of samples) {
        // Quantize to 6 significant figures to allow minor floating-point drift
        hash += `:${s.toPrecision(6)}`;
      }
    }

    return hash;
  }

  get(key: string): PhiScore | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.entries.delete(key);
      return null;
    }

    // Move to end (most recently used) by re-inserting
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.score;
  }

  set(key: string, score: PhiScore): void {
    // Evict oldest entry if at capacity
    if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    this.entries.set(key, {
      score,
      expiry: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

// ---------------------------------------------------------------------------
// Method selection
// ---------------------------------------------------------------------------

/**
 * Auto-select the Phi approximation method based on the available
 * time budget and state trace dimensions.
 *
 * Heuristic:
 *   - compression is ~3-5x faster than phi_ar (no matrix operations)
 *   - phi_ar is ~2-3x faster than phi_id (reuses temporal structure)
 *   - phi_id is the gold standard but O(2^d * d^3)
 *
 * @param budgetMs  - Available wall-clock milliseconds.
 * @param d         - Dimensionality of state vectors.
 * @param T         - Number of timesteps in the trace.
 * @param preferred - User-preferred method from config (used if budget allows).
 * @returns The selected method identifier.
 */
function selectMethod(
  budgetMs: number,
  d: number,
  T: number,
  preferred: PhiScore['method'],
): PhiScore['method'] {
  // If the preferred method is one of our three and the budget seems
  // sufficient, honor the preference.
  const validMethods = new Set(['phi_ar', 'phi_id', 'compression']);
  if (!validMethods.has(preferred)) {
    // Fall through to auto-selection for unsupported methods
  } else if (preferred === 'compression') {
    return 'compression'; // Always affordable
  } else if (preferred === 'phi_ar' && budgetMs >= 15) {
    return 'phi_ar';
  } else if (preferred === 'phi_id' && budgetMs >= 60) {
    return 'phi_id';
  }

  // Auto-selection based on budget
  if (budgetMs < 20) return 'compression';
  if (budgetMs < 80) return 'phi_ar';
  return 'phi_id';
}

// ---------------------------------------------------------------------------
// PhiRouter class
// ---------------------------------------------------------------------------

/**
 * The Phi Router: master orchestrator for PNEUMA's consciousness-metric
 * computation and resource allocation pipeline.
 *
 * Usage:
 *   const router = new PhiRouter();
 *   router.initialize(config);
 *   const budget = router.computeAndAllocate(stateTrace);
 *   // budget.memoryEpsilon, budget.pageRankIterationBudget, etc.
 */
export class PhiRouter {
  private config: PneumaConfig | null = null;
  private cache: PhiCache;
  private latestPhi: PhiScore | null = null;
  private latestBudget: ResourceBudget | null = null;
  private computeCount: number = 0;
  private cacheHits: number = 0;

  constructor() {
    this.cache = new PhiCache();
  }

  /**
   * Initialize the router with system configuration.
   * Must be called before computeAndAllocate.
   *
   * @param config - PNEUMA system configuration containing phiMethod,
   *                 phiBudgetMs, and subsystem parameters.
   */
  initialize(config: PneumaConfig): void {
    this.config = config;
    this.cache = new PhiCache(
      64,
      // TTL scales with budget: tighter budgets -> shorter cache TTL
      Math.max(1000, config.phiBudgetMs * 50),
    );
    this.latestPhi = null;
    this.latestBudget = null;
    this.computeCount = 0;
    this.cacheHits = 0;
  }

  /**
   * Compute Phi for the given state trace and allocate resources
   * for all downstream subsystems.
   *
   * This is the main entry point called on each cognitive cycle.
   * It will:
   *   1. Check the cache for a recent Phi value matching this trace.
   *   2. If cache miss, auto-select the best method for the budget.
   *   3. Compute Phi using the selected method.
   *   4. Cache the result.
   *   5. Convert the PhiScore to a ResourceBudget via the allocator.
   *
   * @param stateTrace - Array of system state vectors forming a time series.
   *                     Each vector must have the same dimensionality.
   *                     Minimum 2 timesteps required.
   * @returns ResourceBudget with allocations for S4, S5, S6, S8, S9.
   * @throws Error if the router has not been initialized.
   */
  computeAndAllocate(stateTrace: Float64Array[]): ResourceBudget {
    if (!this.config) {
      throw new Error('PhiRouter not initialized. Call initialize(config) first.');
    }

    this.computeCount++;

    // Check cache
    const cacheKey = PhiCache.hashTrace(stateTrace);
    const cached = this.cache.get(cacheKey);

    let phi: PhiScore;

    if (cached) {
      phi = cached;
      this.cacheHits++;
    } else {
      // Select method based on budget
      const d = stateTrace.length > 0 ? stateTrace[0].length : 0;
      const method = selectMethod(
        this.config.phiBudgetMs,
        d,
        stateTrace.length,
        this.config.phiMethod,
      );

      // Reserve 10% of budget for allocation overhead
      const computeBudget = this.config.phiBudgetMs * 0.9;

      phi = computePhi(stateTrace, method, computeBudget);
      this.cache.set(cacheKey, phi);
    }

    this.latestPhi = phi;
    const budget = allocateResources(phi, this.config);
    this.latestBudget = budget;

    return budget;
  }

  /**
   * Get the most recently computed Phi score.
   *
   * @returns The latest PhiScore, or null if no computation has been performed.
   */
  getLatestPhi(): PhiScore | null {
    return this.latestPhi;
  }

  /**
   * Get the most recently allocated resource budget.
   *
   * @returns The latest ResourceBudget, or null if no allocation has been performed.
   */
  getLatestBudget(): ResourceBudget | null {
    return this.latestBudget;
  }

  /**
   * Get diagnostic statistics about the router's performance.
   */
  getStats(): {
    computeCount: number;
    cacheHits: number;
    cacheHitRate: number;
    cacheSize: number;
    latestPhi: number | null;
    latestMethod: PhiScore['method'] | null;
    latestCostMs: number | null;
    latestConfidence: number | null;
  } {
    return {
      computeCount: this.computeCount,
      cacheHits: this.cacheHits,
      cacheHitRate: this.computeCount > 0 ? this.cacheHits / this.computeCount : 0,
      cacheSize: this.cache.size,
      latestPhi: this.latestPhi?.value ?? null,
      latestMethod: this.latestPhi?.method ?? null,
      latestCostMs: this.latestPhi?.computeCostMs ?? null,
      latestConfidence: this.latestPhi?.confidence ?? null,
    };
  }

  /**
   * Force a Phi computation with a specific method, bypassing auto-selection
   * and cache. Useful for diagnostics and calibration.
   *
   * @param stateTrace - State time series.
   * @param method     - Specific method to use.
   * @param budgetMs   - Override budget in milliseconds.
   * @returns The computed PhiScore.
   */
  computePhiDirect(
    stateTrace: Float64Array[],
    method: PhiScore['method'],
    budgetMs?: number,
  ): PhiScore {
    const budget = budgetMs ?? this.config?.phiBudgetMs ?? 100;
    const phi = computePhi(stateTrace, method, budget);
    this.latestPhi = phi;
    return phi;
  }

  /**
   * Clear the Phi cache. Useful when the system undergoes a regime
   * change and cached values are no longer representative.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check whether the router has been initialized.
   */
  get isInitialized(): boolean {
    return this.config !== null;
  }
}
