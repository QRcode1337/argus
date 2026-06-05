import type { GdeltEvent } from "@/types/gdelt";
import { resolveGdeltEndpoint } from "./resolveGdeltEndpoint.mjs";

type GdeltResponse = {
  events: GdeltEvent[];
  cached: boolean;
  count: number;
};

export async function fetchGdeltEvents(
  endpoint: string,
  options?: { window?: "1h" | "6h" | "24h" | "48h" | "7d" | "ALL" },
): Promise<GdeltEvent[]> {
  const url = resolveGdeltEndpoint(endpoint, options);
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`GDELT HTTP ${response.status}`);
  }

  const json = (await response.json()) as GdeltResponse;

  return json.events;
}
