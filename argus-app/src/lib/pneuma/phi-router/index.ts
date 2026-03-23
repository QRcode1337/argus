/**
 * PNEUMA S1 -- Phi Router
 *
 * Master consciousness-metric computation and resource allocation subsystem.
 *
 * Re-exports:
 *   - PhiRouter          -- Main orchestrator class
 *   - computePhi         -- Raw Phi computation (three methods)
 *   - phiAR, phiID, phiCompression -- Individual method functions
 *   - allocateResources  -- PhiScore -> ResourceBudget converter
 *   - ResourceBudget     -- Output type for downstream subsystems
 */

export { computePhi, phiAR, phiID, phiCompression } from './phi-approximation.js';
export { allocateResources, type ResourceBudget } from './resource-allocator.js';
export { PhiRouter } from './phi-router.js';
