import { readSettings } from "@/lib/settings";
import type { LlmSettings } from "@/types/settings";

interface LlmResponse {
  text: string;
  error?: string;
  pneumaState?: any; // ProcessResult when using pneuma provider
}

interface QueryLlmOptions {
  maxTokens?: number;
  timeoutMs?: number;
  llmOverride?: Partial<LlmSettings>;
}

function getEffectiveApiKey(apiKey?: string, endpoint?: string): string | undefined {
  if (endpoint && /generativelanguage\.googleapis\.com/i.test(endpoint)) {
    return process.env.GEMINI_API_KEY || apiKey || process.env.OPENAI_COMPATIBLE_API_KEY;
  }
  if (endpoint && /do-ai\.run|gradient/i.test(endpoint)) {
    // Prefer an explicitly-passed key (e.g. ARGUS AI assistant override) over the
    // shared GRADIENT_* env keys, so a per-call agent key wins for do-ai endpoints.
    return (
      apiKey ||
      process.env.ARGUS_AI_AGENT_KEY ||
      process.env.GRADIENT_ENDPOINT_ACCESS_KEY ||
      process.env.GRADIENT_MODEL_ACCESS_KEY
    );
  }
  return apiKey || process.env.OPENAI_COMPATIBLE_API_KEY || process.env.GEMINI_API_KEY;
}

function resolveOpenAiCompatibleUrl(endpoint: string): string {
  const base = endpoint.trim().replace(/\/+$/, "");

  if (
    /\/chat\/completions$/i.test(base) ||
    /\/v1\/chat\/completions$/i.test(base) ||
    /\/api\/v1\/chat\/completions$/i.test(base)
  ) {
    return base;
  }

  if (/generativelanguage\.googleapis\.com/i.test(base)) {
    if (/\/openai$/i.test(base)) return `${base}/chat/completions`;
    if (/\/v1beta$/i.test(base) || /\/v1$/i.test(base)) return `${base}/openai/chat/completions`;
    return `${base}/v1beta/openai/chat/completions`;
  }

  if (/\/api\/v1$/i.test(base)) {
    return `${base}/chat/completions`;
  }

  return `${base}/v1/chat/completions`;
}

// Singleton PNEUMA instance — initialized once, reused across requests
let pneumaInstance: any = null;

export async function getPneumaInstance(): Promise<any> {
  if (!pneumaInstance) {
    const { PNEUMA } = await import("@/lib/pneuma/pneuma");
    pneumaInstance = new PNEUMA();
  }
  return pneumaInstance;
}

// Singleton Gradient generator — avoids re-parsing env vars per request
let gradientGenerator: any = null;

async function getGradientGenerator(): Promise<any> {
  if (!gradientGenerator) {
    const { GradientCandidateGenerator } = await import(
      "@/lib/pneuma/gradient-candidate-generator"
    );
    gradientGenerator = new GradientCandidateGenerator();
  }
  return gradientGenerator;
}

/**
 * Create a simple hash-based embedding from input text.
 * Returns a Float64Array of length 128.
 */
function hashEmbedding(text: string): Float64Array {
  const embedding = new Float64Array(128);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const idx = i % 128;
    embedding[idx] = (embedding[idx] + code * (i + 1)) % 1.0;
  }
  // Normalize to [-1, 1] range
  for (let i = 0; i < 128; i++) {
    embedding[i] = Math.sin(embedding[i] * Math.PI * 2);
  }
  return embedding;
}

export async function queryLlm(
  prompt: string,
  systemPrompt?: string,
  options: QueryLlmOptions = {},
): Promise<LlmResponse> {
  const { llm: savedLlm } = await readSettings();
  const llm = {
    ...savedLlm,
    ...(options.llmOverride ?? {}),
  } as LlmSettings;

  const maxTokens = Number.isFinite(options.maxTokens)
    ? Math.max(256, Math.floor(options.maxTokens as number))
    : 4096;

  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(10_000, Math.floor(options.timeoutMs as number))
    : llm.provider === "ollama"
      ? 300_000
      : 60_000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (llm.provider === "ollama") {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const apiKey = getEffectiveApiKey(llm.apiKey, llm.endpoint);
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(`${llm.endpoint}/api/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: llm.model,
          prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
          stream: false,
          options: { num_predict: maxTokens },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        return { text: "", error: `Ollama error: ${res.status} ${body.slice(0, 300)}` };
      }
      const data = await res.json();
      return { text: data.response ?? "" };
    }

    if (llm.provider === "pneuma") {
      try {
        const pneuma = await getPneumaInstance();
        if (!pneuma.isInitialized) pneuma.initialize();

        const generator = await getGradientGenerator();
        const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

        // Generate 3 candidates: Id, Ego, Superego — pass target maxTokens for full reports
        const candidates = await generator.generateCandidates(fullPrompt, {
          mood: "neutral",
          memories: [],
          persona: "balanced",
        }, undefined, undefined, maxTokens);

        // Create hash-based embedding from input text
        const embedding = hashEmbedding(fullPrompt);

        // Feed candidates + embedding through PNEUMA's cognitive pipeline
        const result = pneuma.processInput(fullPrompt, embedding, candidates);

        const text = result.selectedText ?? "";
        if (text) {
          return { text, pneumaState: result };
        }
        // Empty result — fall through to Ollama backup
      } catch (e: unknown) {
        console.warn("[PNEUMA] Gradient failed, falling back to Ollama:", e instanceof Error ? e.message : e);
      }

      // Ollama fallback for PNEUMA provider
      if (llm.endpoint) {
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const apiKey = getEffectiveApiKey(llm.apiKey, llm.endpoint);
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

          const res = await fetch(`${llm.endpoint}/api/generate`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: llm.model || "llama3",
              prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
              stream: false,
              options: { num_predict: maxTokens },
            }),
            signal: controller.signal,
          });
          if (res.ok) {
            const data = await res.json();
            if (data.response) return { text: data.response };
          }
        } catch {
          // Ollama also unavailable
        }
      }

      return { text: "", error: "PNEUMA and Ollama fallback both failed" };
    }

    // OpenAI-compatible. Note: DigitalOcean Gradient agent endpoints reject
    // role:"system" — agent instructions are configured on the agent itself.
    // Merge systemPrompt into the user content so this branch works for both
    // vanilla OpenAI-compatible servers and Gradient agents.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = getEffectiveApiKey(llm.apiKey, llm.endpoint);
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const userContent = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const messages = [{ role: "user", content: userContent }];

    const res = await fetch(resolveOpenAiCompatibleUrl(llm.endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify({ model: llm.model, messages, max_tokens: maxTokens }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      return { text: "", error: `LLM error: ${res.status} ${body.slice(0, 300)}` };
    }
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { text: "", error: msg };
  } finally {
    clearTimeout(timeout);
  }
}
