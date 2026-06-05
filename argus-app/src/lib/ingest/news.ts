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
    window?: string;
  };
  regions: Record<CommandRegion, RegionDigest>;
}

export async function fetchNewsFeed(
  endpoint: string,
  options?: { window?: "1h" | "6h" | "24h" | "48h" | "7d" | "ALL" },
): Promise<NewsFeedResponse> {
  const url = new URL(endpoint, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (options?.window && options.window !== "ALL") {
    url.searchParams.set("window", options.window);
  }

  const response = await fetch(
    typeof window === "undefined" && endpoint.startsWith("/") ? `${url.pathname}${url.search}` : url.toString(),
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`News feed returned ${response.status}`);
  }

  const payload = (await response.json()) as NewsFeedResponse;
  if (!Array.isArray(payload.items) || !payload.meta) {
    throw new Error("Invalid news feed payload");
  }

  return payload;
}
