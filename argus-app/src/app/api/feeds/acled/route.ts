export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";

const ACLED_BASE = "https://api.acleddata.com/acled/read";

interface AcledEvent {
  event_type: string;
  country: string;
  location: string;
  fatalities: number;
  actor1: string;
  actor2: string;
  event_date: string;
  notes: string;
  latitude: number;
  longitude: number;
  region: string;
}

interface AcledResponse {
  events: AcledEvent[];
  meta: { fetchedAt: string; count: number };
}

const negCache = new NegativeCache<AcledResponse>({ negativeTtlMs: 5 * 60_000 });

export async function GET() {
  const apiKey = process.env.ACLED_API_KEY;
  const email = process.env.ACLED_EMAIL;

  if (!apiKey || !email) {
    return NextResponse.json(
      { events: [], meta: { fetchedAt: new Date().toISOString(), count: 0, error: "ACLED_API_KEY or ACLED_EMAIL not configured" } },
      { status: 200 },
    );
  }

  try {
    const data = await negCache.fetch(async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const url = `${ACLED_BASE}?key=${apiKey}&email=${encodeURIComponent(email)}&event_date=${since}|${new Date().toISOString().split("T")[0]}&event_date_where=BETWEEN&limit=200`;

      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`ACLED ${res.status}`);

      const json = await res.json();
      const rawEvents = json.data ?? [];

      const events: AcledEvent[] = rawEvents.map((e: Record<string, string>) => ({
        event_type: e.event_type ?? "Unknown",
        country: e.country ?? "",
        location: e.location ?? "",
        fatalities: parseInt(e.fatalities, 10) || 0,
        actor1: e.actor1 ?? "",
        actor2: e.actor2 ?? "",
        event_date: e.event_date ?? "",
        notes: e.notes ?? "",
        latitude: parseFloat(e.latitude) || 0,
        longitude: parseFloat(e.longitude) || 0,
        region: e.region ?? "",
      }));

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
