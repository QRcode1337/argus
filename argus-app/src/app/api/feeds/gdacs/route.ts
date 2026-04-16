export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";

const GDACS_RSS = "https://www.gdacs.org/xml/rss.xml";

interface GdacsEvent {
  type: string;
  severity: "green" | "orange" | "red";
  country: string;
  title: string;
  populationExposed: number;
  date: string;
  lat: number;
  lon: number;
  link: string;
}

interface GdacsResponse {
  events: GdacsEvent[];
  meta: { fetchedAt: string; count: number };
}

const negCache = new NegativeCache<GdacsResponse>({ negativeTtlMs: 5 * 60_000 });

function parseAlertLevel(text: string): "green" | "orange" | "red" {
  const lower = text.toLowerCase();
  if (lower.includes("red")) return "red";
  if (lower.includes("orange")) return "orange";
  return "green";
}

function parseEventType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("earthquake")) return "EQ";
  if (lower.includes("flood")) return "FL";
  if (lower.includes("cyclone") || lower.includes("hurricane") || lower.includes("typhoon")) return "TC";
  if (lower.includes("volcano")) return "VO";
  if (lower.includes("drought")) return "DR";
  return "OTHER";
}

export async function GET() {
  try {
    const data = await negCache.fetch(async () => {
      const res = await fetch(GDACS_RSS, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/xml, text/xml" },
      });
      if (!res.ok) throw new Error(`GDACS ${res.status}`);

      const xml = await res.text();
      const events: GdacsEvent[] = [];
      const items = xml.split("<item>").slice(1);

      for (const item of items) {
        const tag = (name: string): string => {
          const match = item.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`));
          return match?.[1]?.trim() ?? "";
        };
        const gdacsTag = (name: string): string => {
          const match = item.match(new RegExp(`<gdacs:${name}[^>]*>([^<]*)</gdacs:${name}>`));
          return match?.[1]?.trim() ?? "";
        };
        const gdacsAttr = (name: string, attr: string): string => {
          const match = item.match(new RegExp(`<gdacs:${name}[^>]*${attr}="([^"]*)"`));
          return match?.[1]?.trim() ?? "";
        };

        const title = tag("title");
        const lat = parseFloat(item.match(/<geo:lat>([^<]*)/)?.[1] ?? "") || 0;
        const lon = parseFloat(item.match(/<geo:long>([^<]*)/)?.[1] ?? "") || 0;
        const alertLevel = gdacsTag("alertlevel") || gdacsAttr("alertlevel", "value");
        const population = parseInt(gdacsTag("population") || gdacsAttr("population", "value"), 10) || 0;
        const country = gdacsTag("country") || tag("gdacs:country") || "";

        if (!title) continue;

        events.push({
          type: parseEventType(title),
          severity: parseAlertLevel(alertLevel || title),
          country,
          title,
          populationExposed: population,
          date: tag("pubDate"),
          lat,
          lon,
          link: tag("link"),
        });
      }

      return { events: events.slice(0, 50), meta: { fetchedAt: new Date().toISOString(), count: events.length } };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { events: [], meta: { fetchedAt: new Date().toISOString(), count: 0, error: String(error) } },
      { status: 200 },
    );
  }
}
