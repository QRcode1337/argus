import { promises as fs } from "fs";
import path from "path";
import { AppSettings, DEFAULT_SETTINGS, LlmProvider } from "@/types/settings";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

/** Providers that have a working code path in llmClient.ts. */
const VALID_PROVIDERS = new Set<LlmProvider>(["ollama", "openai_compatible", "pneuma"]);

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    const saved = JSON.parse(raw) as Partial<AppSettings>;

    // Deep-merge llm settings so individual keys survive.
    // Drop empty strings so env-var defaults aren't overridden by blank values.
    const savedLlm = Object.fromEntries(
      Object.entries(saved.llm ?? {}).filter(([, v]) => v !== "" && v != null),
    );
    const llm = { ...DEFAULT_SETTINGS.llm, ...savedLlm } as AppSettings["llm"];

    // Migrate unknown/stale providers to the default before they 502
    if (!VALID_PROVIDERS.has(llm.provider)) {
      console.warn(
        `[settings] unknown llm.provider "${llm.provider}" in ${SETTINGS_PATH} — falling back to "${DEFAULT_SETTINGS.llm.provider}"`,
      );
      llm.provider = DEFAULT_SETTINGS.llm.provider;
    }

    return { ...DEFAULT_SETTINGS, ...saved, llm };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}
