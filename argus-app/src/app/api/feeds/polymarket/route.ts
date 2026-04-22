export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";

const GAMMA_API = "https://gamma-api.polymarket.com/events";

const GEO_TAGS = ["politics", "geopolitics", "world", "conflict", "elections", "war", "military"];

interface PolymarketEvent {
  question: string;
  probability: number;
  change24h: number;
  volume: number;
  category: string;
  endDate: string;
  slug: string;
}

interface PolymarketResponse {
  events: PolymarketEvent[];
  meta: { fetchedAt: string; count: number };
}

const negCache = new NegativeCache<PolymarketResponse>({ negativeTtlMs: 30_000 });

export async function GET() {
  try {
    const data = await negCache.fetch(async () => {
      const res = await fetch(`${GAMMA_API}?active=true&closed=false&limit=100&order=volume24hr&ascending=false`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Polymarket ${res.status}`);

      const json = await res.json();
      const rawEvents: Array<Record<string, unknown>> = Array.isArray(json) ? json : [];

      const events: PolymarketEvent[] = rawEvents
        .filter((e) => {
          const tags = String(e.slug ?? "").toLowerCase();
          const title = String(e.title ?? "").toLowerCase();
          return GEO_TAGS.some((t) => tags.includes(t) || title.includes(t));
        })
        .slice(0, 50)
        .map((e) => {
          const markets = Array.isArray(e.markets) ? e.markets : [];
          const topMarket = markets[0] as Record<string, unknown> | undefined;
          const prices = topMarket?.outcomePrices;
          const firstPrice = Array.isArray(prices) ? prices[0] : prices;
          return {
            question: String(e.title ?? ""),
            probability: Number(firstPrice ?? topMarket?.lastTradePrice ?? 0),
            change24h: 0,
            volume: Number(e.volume ?? 0),
            category: String(e.slug ?? "").split("-")[0],
            endDate: String(e.endDate ?? ""),
            slug: String(e.slug ?? ""),
          };
        });

      return { events, meta: { fetchedAt: new Date().toISOString(), count: events.length } };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { events: [], meta: { fetchedAt: new Date().toISOString(), count: 0, error: String(error) } },
      { status: 200 },
    );
  }
}
