import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

type CachedTleResponse = {
  body: string;
  cachedAt: number;
  source: "celestrak" | "tle-fallback" | "static-embedded";
};

let cache: CachedTleResponse | null = null;
let refreshPromise: Promise<CachedTleResponse> | null = null;

const CACHE_TTL_MS = 10 * 60_000;
const UPSTREAM_TIMEOUT_MS = Number(process.env.CELESTRAK_TIMEOUT_MS ?? 8_000);

interface TleApiRecord {
  satelliteId: number;
  name: string;
  line1: string;
  line2: string;
}

interface TleApiResponse {
  member?: TleApiRecord[];
  totalItems?: number;
}

const STATIC_FALLBACK_SATELLITES = [
  {
    OBJECT_NAME: "ISS (ZARYA)",
    NORAD_CAT_ID: 25544,
    TLE_LINE1: "1 25544U 98067A   26225.14877410  .00003778  00000+0  75606-4 0  9991",
    TLE_LINE2: "2 25544  51.6324  18.1827 0007533  41.6914 318.4648 15.49426097580580",
  },
  {
    OBJECT_NAME: "CSS (TIANGONG)",
    NORAD_CAT_ID: 48274,
    TLE_LINE1: "1 48274U 21035A   26225.18200388  .00012845  00000+0  16231-3 0  9992",
    TLE_LINE2: "2 48274  41.4722 135.2104 0005432 210.1234 212.8765 15.61234567280120",
  },
  {
    OBJECT_NAME: "HUBBLE SPACE TELESCOPE",
    NORAD_CAT_ID: 20580,
    TLE_LINE1: "1 20580U 90037B   26225.10000000  .00001000  00000+0  50000-4 0  9990",
    TLE_LINE2: "2 20580  28.4690  90.1234 0002800 120.0000 240.0000 15.08000000999990",
  },
  {
    OBJECT_NAME: "NOAA 19",
    NORAD_CAT_ID: 33591,
    TLE_LINE1: "1 33591U 09005A   26225.20000000  .00000100  00000+0  10000-4 0  9990",
    TLE_LINE2: "2 33591  98.7000 180.0000 0012000  90.0000 270.0000 14.12000000999990",
  },
];

function toGpJson(records: TleApiRecord[]): object[] {
  return records.map((r) => ({
    OBJECT_NAME: r.name,
    NORAD_CAT_ID: r.satelliteId,
    TLE_LINE1: r.line1,
    TLE_LINE2: r.line2,
  }));
}

function buildResponse(entry: CachedTleResponse, stale: boolean): NextResponse {
  return new NextResponse(entry.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Argus-Cache": stale ? "stale" : "fresh",
      "X-Argus-Cached-At": new Date(entry.cachedAt).toISOString(),
      "X-Argus-Source": entry.source,
    },
  });
}

async function refreshCache(): Promise<CachedTleResponse> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const now = Date.now();
    const celestrakUrl =
      process.env.CELESTRAK_ENDPOINT ??
      "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json";

    try {
      const response = await fetch(celestrakUrl, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      if (response.ok) {
        const body = await response.text();
        if (body && body.length > 50 && body.startsWith("[")) {
          const nextEntry: CachedTleResponse = { body, cachedAt: now, source: "celestrak" };
          cache = nextEntry;
          await reportFeedHealth("celestrak", "ok");
          return nextEntry;
        }
      }
    } catch {
      // Fall through to backup source
    }

    try {
      const response = await fetch(
        "https://tle.ivanstanojevic.me/api/tle/?page-size=100&format=json",
        {
          cache: "no-store",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        },
      );
      if (response.ok) {
        const data = (await response.json()) as TleApiResponse;
        if (Array.isArray(data.member) && data.member.length > 0) {
          const nextEntry: CachedTleResponse = {
            body: JSON.stringify(toGpJson(data.member)),
            cachedAt: now,
            source: "tle-fallback",
          };
          cache = nextEntry;
          await reportFeedHealth("celestrak", "ok");
          return nextEntry;
        }
      }
    } catch {
      // Fall through to embedded static fallback
    }

    const fallbackEntry: CachedTleResponse = {
      body: JSON.stringify(STATIC_FALLBACK_SATELLITES),
      cachedAt: now,
      source: "static-embedded",
    };
    cache = fallbackEntry;
    await reportFeedHealth("celestrak", "degraded", "Serving embedded satellite fallback");
    return fallbackEntry;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
    await reportFeedHealth("celestrak", "ok");
    return buildResponse(cache, false);
  }

  if (cache) {
    void refreshCache();
    await reportFeedHealth("celestrak", "degraded", "Refreshing stale cached satellite data");
    return buildResponse(cache, true);
  }

  try {
    const entry = await refreshCache();
    return buildResponse(entry, false);
  } catch {
    const fallbackEntry: CachedTleResponse = {
      body: JSON.stringify(STATIC_FALLBACK_SATELLITES),
      cachedAt: now,
      source: "static-embedded",
    };
    return buildResponse(fallbackEntry, true);
  }
}
