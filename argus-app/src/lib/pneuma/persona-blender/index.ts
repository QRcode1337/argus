/**
 * PNEUMA S3 -- Persona Blender
 *
 * Neumann-series persona blending with mood-derived perturbation.
 *
 * Re-exports:
 *   - createPersonaBlender  -- Initialize blender state
 *   - blendPersonas         -- Full Neumann-series blend
 *   - updateBlend           -- Incremental evidence update
 *   - isConvergent          -- Convergence check
 *   - effectiveDamping      -- Safe alpha computation
 *   - PersonaBlender        -- Blender state type
 */

export {
  createPersonaBlender,
  blendPersonas,
  updateBlend,
  isConvergent,
  effectiveDamping,
  type PersonaBlender,
} from './neumann-blender';
