import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";
import { AdsbRateLimitError, adsbLolFetch } from "@/lib/adsbLolGateway";

export const dynamic = "force-dynamic";

type MilPayload = { ac?: unknown[]; [key: string]: unknown };

// The UI polls this every 10s (ARGUS_CONFIG.pollMs.adsbMilitary). Without a
// server-side cache each open tab became its own upstream request, which is
// what tripped adsb.lol's rate limiter. One upstream call per interval now
// serves every client.
const CACHE_TTL_MS = 10_000;

let cache: { data: MilPayload; cachedAt: number } | null = null;
let inflight: Promise<MilPayload> | null = null;

async function fetchUpstream(): Promise<MilPayload> {
  const upstream = process.env.ADSB_MIL_ENDPOINT ?? "https://api.adsb.lol/v2/mil";
  // priority: this is the primary military layer on a 10s poll; it should not
  // be held off by a cooldown that the wide-area sweep caused.
  const response = await adsbLolFetch(upstream, 8_000, true);

  if (!response.ok) {
    throw new Error(`upstream ${response.status}`);
  }

  // Upstream sometimes answers with an HTML error page. Parsing here means we
  // never forward HTML to the client under an application/json content type,
  // which previously made the browser's JSON.parse throw and blanked the layer.
  const body = await response.text();
  try {
    return JSON.parse(body) as MilPayload;
  } catch {
    throw new Error("upstream returned non-JSON body");
  }
}

function refresh(): Promise<MilPayload> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const data = await fetchUpstream();
      cache = { data, cachedAt: Date.now() };
      await reportFeedHealth("adsb", "ok");
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function GET() {
  if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.data, _cached: true });
  }

  try {
    return NextResponse.json(await refresh());
  } catch (error) {
    const message = error instanceof Error ? error.message : "ADS-B proxy failed";
    const rateLimited = error instanceof AdsbRateLimitError;

    // Prefer stale data over an error: the globe keeps its last known tracks
    // instead of dropping every military contact on a transient 429.
    if (cache) {
      await reportFeedHealth("adsb", "degraded", message);
      return NextResponse.json({
        ...cache.data,
        _stale: true,
        _reason: message,
        _cachedAt: new Date(cache.cachedAt).toISOString(),
      });
    }

    await reportFeedHealth("adsb", rateLimited ? "degraded" : "error", message);
    return NextResponse.json({ ac: [], _degraded: true, _reason: message });
  }
}
