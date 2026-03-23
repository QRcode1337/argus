/**
 * PNEUMA S7 -- Mathematical Framing Engine
 *
 * Re-exports all public APIs for the mathematical framing subsystem.
 *
 * Usage:
 *   import {
 *     classifyDomain, createFrame, applyFrame, classifyAndFrame,
 *   } from './math-framing/index';
 */

export {
  applyFrame,
  classifyAndFrame,
  classifyDomain,
  createFrame,
  generateScaffold,
  selectNotation,
} from './framing-engine';
