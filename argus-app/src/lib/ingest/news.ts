import type { CommandRegion, RegionalPosture } from "@/types/regionalNews";

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
  tags: string[];
  score: number;
  region: CommandRegion;
}

export interface RegionDigest {
  posture: RegionalPosture;
  summary: string;
  keySignals: string[];
  itemCount: number;
}

export interface NewsFeedResponse {
  items: NewsItem[];
  meta: {
    sourcesChecked: number;
    fetchedAt: string;
    dedupedCount: number;
  };
  regions: Record<CommandRegion, RegionDigest>;
}

export async function fetchNewsFeed(endpoint: string): Promise<NewsFeedResponse> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`News feed returned ${response.status}`);
  }

  const payload = (await response.json()) as NewsFeedResponse;
  if (!Array.isArray(payload.items) || !payload.meta) {
    throw new Error("Invalid news feed payload");
  }

  return payload;
}
