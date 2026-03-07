import type { GdeltEvent } from "@/types/gdelt";

type GdeltResponse = {
  events: GdeltEvent[];
  cached: boolean;
  count: number;
};

export async function fetchGdeltEvents(endpoint: string): Promise<GdeltEvent[]> {
  const response = await fetch(endpoint, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`GDELT HTTP ${response.status}`);
  }

  const json = (await response.json()) as GdeltResponse;

  return json.events;
}
