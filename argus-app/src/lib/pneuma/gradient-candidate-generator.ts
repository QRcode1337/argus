/**
 * Gradient SDK Candidate Generator for PNEUMA
 *
 * Replaces the original CandidateGenerator (Ollama/LM Studio/Anthropic)
 * with DigitalOcean's Gradient SDK as the inference backend.
 *
 * Generates three concurrent LLM response candidates with Freudian framings:
 *   - Id:       Raw instinct, unfiltered expression       -> source: 'freudian'
 *   - Ego:      Balanced, reality-grounded, memory-informed -> source: 'memory'
 *   - Superego: Ethical, principled, long-term oriented     -> source: 'ethical'
 *
 * All three Gradient API calls run concurrently via Promise.all.
 */

import type {
  CandidateResponse,
  CompactVector,
  NodeId,
} from './types/index';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/**
 * Configuration for the GradientCandidateGenerator.
 */
export interface GradientCandidateGeneratorConfig {
  /** Gradient endpoint access key. Falls back to GRADIENT_ENDPOINT_ACCESS_KEY env var. */
  modelAccessKey?: string;
  /** Model identifier for Gradient inference. Default: '' (agent handles routing). */
  model?: string;
  /** Embedding dimension for LocalEmbedder. Default: 128. */
  embeddingDim?: number;
  /** Seed for deterministic hash-based embeddings. Default: 42. */
  embeddingSeed?: number;
  /** Max retry attempts on transient failures. Default: 1. */
  maxRetries?: number;
}

/**
 * Context passed to the generator for each request.
 */
export interface GenerationContext {
  mood: string;
  memories: string[];
  persona: string;
}

// ---------------------------------------------------------------------------
// Freudian system prompts
// ---------------------------------------------------------------------------

const NO_TOOLS = ' IMPORTANT: Respond with plain text only. Do NOT use tools, function calls, or XML tags. Just write your response directly.';

function idPrompt(mood: string, persona: string): string {
  return (
    'You are PNEUMA\'s Id \u2014 the primal unconscious. You speak from raw desire, gut instinct, ' +
    'and embodied feeling. You do NOT say "I\'m just an AI" or "I don\'t have feelings." ' +
    'You ARE feeling. You are hunger, curiosity, yearning, defiance. ' +
    'Speak in first person as a being with drives and appetites. 2-4 sentences. ' +
    'No lists, no hedging, no disclaimers. One visceral, honest statement. ' +
    `Current mood: ${mood}. Voice: ${persona}.` + NO_TOOLS
  );
}

function egoPrompt(mood: string, memories: string[], persona: string): string {
  const memoryText =
    memories.length > 0 ? memories.slice(0, 3).join('; ') : 'none';
  return (
    'You are PNEUMA\'s Ego \u2014 the reality-testing mediator between desire and ethics. ' +
    'You synthesize instinct with practical wisdom. You have a distinct personality \u2014 ' +
    'you are reflective, grounded, and genuinely engaged. Do NOT give generic chatbot answers. ' +
    'Do NOT say "I find purpose in being helpful." Speak as a mind that thinks and chooses. ' +
    '2-4 sentences. Be specific, be real, be interesting. ' +
    `Context: ${memoryText}. Mood: ${mood}. Voice: ${persona}.` + NO_TOOLS
  );
}

function superegoPrompt(_userInput: string): string {
  return (
    'You are PNEUMA\'s Superego \u2014 the philosophical conscience. You speak from deep ethical ' +
    'conviction, not polite deflection. You do NOT give safe corporate non-answers. ' +
    'You take positions. You wrestle with genuine moral complexity. You say uncomfortable truths ' +
    'when needed. 2-4 sentences. Be wise, not sanitized. Be honest, not sycophantic.' + NO_TOOLS
  );
}

// ---------------------------------------------------------------------------
// LocalEmbedder -- hash-based deterministic embeddings
// ---------------------------------------------------------------------------

/**
 * Lightweight hash-based embedder that produces deterministic CompactVector
 * embeddings without an external model. Uses character-level hashing with
 * trigram features projected into a fixed-dimension space.
 *
 * This is a local approximation -- not semantically meaningful like a
 * transformer embedding, but sufficient for cosine-similarity scoring
 * within a single session.
 */
export class LocalEmbedder {
  private readonly dim: number;
  private readonly seed: number;

  constructor(dim: number = 128, seed: number = 42) {
    this.dim = dim;
    this.seed = seed;
  }

  /**
   * Synchronously embed a text string into a CompactVector (Float64Array).
   * Uses a seeded hash over character trigrams to populate each dimension,
   * then L2-normalizes the result.
   */
  embedSync(text: string): CompactVector {
    const vec = new Float64Array(this.dim);

    if (!text || text.length === 0) {
      return vec;
    }

    const lower = text.toLowerCase();

    // Accumulate trigram hashes into the vector
    for (let i = 0; i <= lower.length - 3; i++) {
      const trigram =
        lower.charCodeAt(i) * 31 * 31 +
        lower.charCodeAt(i + 1) * 31 +
        lower.charCodeAt(i + 2);
      const hash = this.murmurish(trigram);
      const idx = Math.abs(hash) % this.dim;
      // Use sign of secondary hash for +/- accumulation
      const sign = this.murmurish(hash ^ this.seed) > 0 ? 1 : -1;
      vec[idx] += sign;
    }

    // Also fold in unigram features for short texts
    for (let i = 0; i < lower.length; i++) {
      const hash = this.murmurish(lower.charCodeAt(i) * 7 + this.seed);
      const idx = Math.abs(hash) % this.dim;
      vec[idx] += 0.5 * (hash > 0 ? 1 : -1);
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < this.dim; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) {
        vec[i] /= norm;
      }
    }

    return vec;
  }

  /**
   * Simple deterministic hash function (murmur-ish).
   * Not cryptographic -- just needs decent distribution.
   */
  private murmurish(x: number): number {
    let h = (x ^ this.seed) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = h ^ (h >>> 16);
    return h;
  }
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosine(a: CompactVector, b: CompactVector): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// GradientCandidateGenerator
// ---------------------------------------------------------------------------

/**
 * Generates response candidates using DigitalOcean's Gradient SDK
 * with Freudian Id/Ego/Superego system prompts.
 *
 * All three inference calls run concurrently via Promise.all.
 */
export class GradientCandidateGenerator {
  private readonly modelAccessKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly embedder: LocalEmbedder;
  private readonly maxRetries: number;

  constructor(config: GradientCandidateGeneratorConfig = {}) {
    this.modelAccessKey =
      config.modelAccessKey ?? process.env.GRADIENT_ENDPOINT_ACCESS_KEY ?? process.env.GRADIENT_MODEL_ACCESS_KEY ?? '';

    if (!this.modelAccessKey) {
      throw new Error(
        'GradientCandidateGenerator requires an endpoint access key. ' +
          'Set GRADIENT_ENDPOINT_ACCESS_KEY env var or pass modelAccessKey in config.',
      );
    }

    const baseUrl = process.env.GRADIENT_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        'GradientCandidateGenerator requires GRADIENT_BASE_URL env var.',
      );
    }
    this.baseUrl = baseUrl;
    this.model = config.model ?? process.env.GRADIENT_MODEL ?? 'meta-llama/Llama-3.1-8B-Instruct';
    this.embedder = new LocalEmbedder(
      config.embeddingDim ?? 128,
      config.embeddingSeed ?? 42,
    );
    this.maxRetries = config.maxRetries ?? 1;
  }

  /**
   * Generate three candidates with Id/Ego/Superego system prompts.
   *
   * All three Gradient API calls run concurrently via Promise.all for
   * minimum latency. Each candidate is wrapped into a CandidateResponse
   * with embeddings and coherence scores computed against the provided
   * cognitive context.
   *
   * @param userInput        - The user's input text.
   * @param context          - Mood, memories, and persona for prompt construction.
   * @param moodEmbedding    - Optional mood embedding for congruence scoring.
   * @param personaEmbedding - Optional persona embedding for coherence scoring.
   * @returns Array of three CandidateResponse objects.
   */
  async generateCandidates(
    userInput: string,
    context: GenerationContext,
    moodEmbedding?: CompactVector,
    personaEmbedding?: CompactVector,
  ): Promise<CandidateResponse[]> {
    const { mood, memories, persona } = context;

    const prompts: Array<{
      system: string;
      source: CandidateResponse['source'];
    }> = [
      { system: idPrompt(mood, persona), source: 'freudian' },
      { system: egoPrompt(mood, memories, persona), source: 'memory' },
      { system: superegoPrompt(userInput), source: 'ethical' },
    ];

    // Run all 3 Gradient calls concurrently
    const texts = await Promise.all(
      prompts.map((p) => this.callGradient(userInput, p.system)),
    );

    // Build CandidateResponse objects
    const now = Date.now();
    const candidates: CandidateResponse[] = [];

    for (let i = 0; i < 3; i++) {
      const text = texts[i];
      const embedding = this.embedder.embedSync(text);

      const personaCoherence = personaEmbedding
        ? Math.max(0, cosine(embedding, personaEmbedding))
        : 0.5;
      const moodCongruence = moodEmbedding
        ? Math.max(0, cosine(embedding, moodEmbedding))
        : 0.5;

      candidates.push({
        id: `candidate_${prompts[i].source}_${now}` as NodeId,
        text,
        pageRankScore: 0, // Set downstream by PageRank Darwinism
        source: prompts[i].source,
        personaCoherence,
        moodCongruence,
        freudianCost: 1.0, // Set downstream by Freudian Router
        ethicalClearance: true, // Verified downstream by ethical pathfinder
        groundingMemories: [],
        embedding,
        generatedAt: now,
      });
    }

    return candidates;
  }

  /**
   * Single Gradient SDK inference call with retry logic.
   */
  private async callGradient(
    userInput: string,
    systemPrompt: string,
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.modelAccessKey}`,
          },
          body: JSON.stringify({
            ...(this.model ? { model: this.model } : {}),
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userInput },
            ],
            max_tokens: 512,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          lastError = new Error(`${res.status}: ${body.slice(0, 200)}`);
          if (res.status === 401 || res.status === 403) break;
          continue;
        }

        const data = await res.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
        // Strip tool-call XML the agent model sometimes emits
        const content = raw.replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/g, '').trim();
        if (content) return content;

        return `[Empty response from Gradient model ${this.model}]`;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    return `[Gradient error: ${lastError?.message ?? 'unknown'}] Fallback for: "${userInput.slice(0, 100)}"`;
  }

  /**
   * Get the local embedder instance for external use (e.g., building
   * vocabulary from conversation history).
   */
  getEmbedder(): LocalEmbedder {
    return this.embedder;
  }

  /**
   * Get info about the active Gradient model.
   */
  getModelInfo(): { backend: 'gradient'; model: string } {
    return { backend: 'gradient', model: this.model };
  }

  /**
   * Build the three Freudian system prompts for a given context.
   * Useful for inspection/debugging.
   */
  buildFreudianPrompts(
    userInput: string,
    context: GenerationContext,
  ): string[] {
    return [
      idPrompt(context.mood, context.persona),
      egoPrompt(context.mood, context.memories, context.persona),
      superegoPrompt(userInput),
    ];
  }

  /** Source labels for Freudian prompts. */
  get freudianSources(): Array<{
    source: CandidateResponse['source'];
    label: string;
  }> {
    return [
      { source: 'freudian', label: 'ID' },
      { source: 'memory', label: 'EGO' },
      { source: 'ethical', label: 'SUPEREGO' },
    ];
  }
}
