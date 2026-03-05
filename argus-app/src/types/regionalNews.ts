export const COMMAND_REGIONS = [
  "WORLDCOM",
  "CENTCOM",
  "NORTHCOM",
  "SOUTHCOM",
  "EUCOM",
  "AFRICOM",
  "INDOPACOM",
] as const;

export type CommandRegion = (typeof COMMAND_REGIONS)[number];

export type RegionalPosture = "STABLE" | "ELEVATED" | "HIGH";

export interface RegionalNewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  region: CommandRegion;
  tags: string[];
}

export interface RegionalSummary {
  region: CommandRegion;
  summary: string;
  posture: RegionalPosture;
  keySignals: string[];
  updatedAt: string;
}

export interface RegionalNewsPayload {
  generatedAt: string;
  regions: Record<
    CommandRegion,
    {
      summary: RegionalSummary;
      items: RegionalNewsItem[];
    }
  >;
}
