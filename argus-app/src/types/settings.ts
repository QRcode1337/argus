export type LlmProvider = "ollama" | "openai_compatible" | "pneuma";

export interface LlmSettings {
  provider: LlmProvider;
  endpoint: string;
  model: string;
  apiKey?: string;
  GRADIENT_MODEL_ACCESS_KEY?: string;
}

export interface AppSettings {
  llm: LlmSettings;
}

function defaultLlmSettings(): LlmSettings {
  const gradientBase = process.env.GRADIENT_BASE_URL;
  const gradientKey = process.env.GRADIENT_ENDPOINT_ACCESS_KEY;
  if (gradientBase && gradientKey) {
    // Strip trailing /v1 if present — llmClient appends /v1/chat/completions
    const endpoint = gradientBase.replace(/\/v1\/?$/, "");
    return {
      provider: "openai_compatible",
      endpoint,
      model: "llama-3.3-70b-instruct",
      apiKey: gradientKey,
    };
  }
  return {
    provider: "ollama",
    endpoint: "http://localhost:11434",
    model: "llama3",
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  llm: defaultLlmSettings(),
};
