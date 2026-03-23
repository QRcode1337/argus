/**
 * PNEUMA S6 -- PageRank Darwinism
 *
 * Conversation graph construction and PageRank-based response selection
 * with Neural Darwinism competitive pressure.
 *
 * Re-exports:
 *   - ConversationGraph  -- Graph class: addUtterance, addCandidate, buildEdges
 *   - selectWinner       -- Run PageRank to pick the best response
 *   - decayCandidates    -- Penalize losers (Neural Darwinism)
 */

export { ConversationGraph } from './conversation-graph';

export {
  decayCandidates,
  selectWinner,
  type PageRankResult,
} from './pagerank-selection';
