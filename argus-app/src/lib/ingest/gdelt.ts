import type { GdeltEvent } from "@/types/gdelt";

type GdeltResponse = {
  events: GdeltEvent[];
  cached: boolean;
  count: number;
};

export async function fetchGdeltEvents(endpoint: string): Promise<GdeltEvent[]> {
  const url = endpoint.startsWith('/') && typeof window === 'undefined'
    ? `http://127.0.0.1:${process.env.PORT || 3000}${endpoint}`
    : endpoint;

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`GDELT HTTP ${response.status}`);
  }

  const json = (await response.json()) as GdeltResponse;

  return json.events;
}
