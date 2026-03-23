/**
 * PNEUMA S9 -- Temporal-Lead Voice Predictor
 *
 * Re-exports all public APIs for the temporal prediction subsystem.
 *
 * Usage:
 *   import {
 *     initializeESN, trainESN, predict, createESNFromConfig,
 *   } from './temporal-voice/index.js';
 */

export {
  createESNFromConfig,
  initializeESN,
  predict,
  trainESN,
  type ESNState,
} from './temporal-predictor.js';
