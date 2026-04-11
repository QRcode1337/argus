import type { GdeltEvent } from "@/types/gdelt";

type GdeltResponse = {
  events: GdeltEvent[];
  cached: boolean;
  count: number;
};

export async function fetchGdeltEvents(endpoint: string): Promise<GdeltEvent[]> {
  let url: string;
  if (endpoint.startsWith('/') && typeof window === 'undefined') {
    const host = require('os').hostname();
    const port = process.env.PORT || 3000;
    url = `http://${host}:${port}${endpoint}`;
  } else {
    url = endpoint;
  }

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`GDELT HTTP ${response.status}`);
  }

  const json = (await response.json()) as GdeltResponse;

  return json.events;
}
