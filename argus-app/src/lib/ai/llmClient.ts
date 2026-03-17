import { readSettings } from "@/lib/settings";

interface LlmResponse {
  text: string;
  error?: string;
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
