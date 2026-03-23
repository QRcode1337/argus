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

export const DEFAULT_SETTINGS: AppSettings = {
  llm: {
    provider: "ollama",
    endpoint: "http://localhost:11434",
    model: "llama3",
  },
};
