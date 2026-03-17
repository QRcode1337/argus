import { promises as fs } from "fs";
import path from "path";
import { AppSettings, DEFAULT_SETTINGS } from "@/types/settings";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}
