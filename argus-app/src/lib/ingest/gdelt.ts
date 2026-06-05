import type { GdeltEvent } from "@/types/gdelt";

type GdeltResponse = {
  events: GdeltEvent[];
  cached: boolean;
  count: number;
};

export async function fetchGdeltEvents(
  endpoint: string,
  options?: { window?: "1h" | "6h" | "24h" | "48h" | "7d" | "ALL" },
): Promise<GdeltEvent[]> {
  const isServerRelative = endpoint.startsWith("/") && typeof window === "undefined";
  let url: string;
  if (isServerRelative) {
    const host = process.env.NEXT_SERVER_HOST || "127.0.0.1";
    const port = process.env.PORT || 3000;
    url = `http://${host}:${port}${endpoint}`;
  } else {
    url = endpoint;
  }

  if (options?.window && options.window !== "ALL") {
    const next = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    next.searchParams.set("window", options.window);
    url = isServerRelative ? next.toString() : next.toString();
  }

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`GDELT HTTP ${response.status}`);
  }

  const json = (await response.json()) as GdeltResponse;

  return json.events;
}
