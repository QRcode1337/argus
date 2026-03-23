import { readSettings } from "@/lib/settings";

interface LlmResponse {
  text: string;
  error?: string;
  pneumaState?: any; // ProcessResult when using pneuma provider
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

export async function queryLlm(prompt: string, systemPrompt?: string): Promise<LlmResponse> {
  const { llm } = await readSettings();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    if (llm.provider === "ollama") {
      const res = await fetch(`${llm.endpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: llm.model,
          prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return { text: "", error: `Ollama error: ${res.status}` };
      const data = await res.json();
      return { text: data.response ?? "" };
    }

    if (llm.provider === "pneuma") {
      const pneuma = await getPneumaInstance();
      if (!pneuma.isInitialized) pneuma.initialize();

      const { GradientCandidateGenerator } = await import(
        "@/lib/pneuma/gradient-candidate-generator"
      );
      const generator = new GradientCandidateGenerator();
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

      // Generate 3 candidates: Id, Ego, Superego
      const candidates = await generator.generateCandidates(fullPrompt, {
        mood: "neutral",
        memories: [],
        persona: "balanced",
      });

      // Create hash-based embedding from input text
      const embedding = hashEmbedding(fullPrompt);

      // Feed candidates + embedding through PNEUMA's cognitive pipeline
      const result = pneuma.processInput(fullPrompt, embedding, candidates);

      return {
        text: result.selectedText ?? "",
        pneumaState: result,
      };
    }

    // OpenAI-compatible
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (llm.apiKey) headers["Authorization"] = `Bearer ${llm.apiKey}`;

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const res = await fetch(`${llm.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: llm.model, messages, max_tokens: 512 }),
      signal: controller.signal,
    });
    if (!res.ok) return { text: "", error: `LLM error: ${res.status}` };
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { text: "", error: msg };
  } finally {
    clearTimeout(timeout);
  }
}
