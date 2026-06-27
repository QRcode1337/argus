import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

type CachedTleResponse = {
  body: string;
  cachedAt: number;
  source: "celestrak" | "tle-fallback";
};

let cache: CachedTleResponse | null = null;
let refreshPromise: Promise<CachedTleResponse> | null = null;

const CACHE_TTL_MS = 10 * 60_000;
const UPSTREAM_TIMEOUT_MS = Number(process.env.CELESTRAK_TIMEOUT_MS ?? 10_000);
const FALLBACK_TIMEOUT_MS = Number(process.env.TLE_FALLBACK_TIMEOUT_MS ?? 12_000);

interface TleApiRecord {
  satelliteId: number;
  name: string;
  line1: string;
  line2: string;
}

interface TleApiResponse {
  member: TleApiRecord[];
  totalItems: number;
  view?: { next?: string; last?: string };
}

/** Convert tle.ivanstanojevic.me format → CelesTrak GP JSON format */
function toGpJson(records: TleApiRecord[]): object[] {
  return records.map((r) => ({
    OBJECT_NAME: r.name,
    NORAD_CAT_ID: r.satelliteId,
    TLE_LINE1: r.line1,
    TLE_LINE2: r.line2,
    OBJECT_TYPE: null,
    COUNTRY_CODE: null,
    LAUNCH_DATE: null,
    SITE: null,
    RCS_SIZE: null,
    PERIOD: null,
    INCLINATION: null,
    APOAPSIS: null,
    PERIAPSIS: null,
    DECAY_DATE: null,
  }));
}

async function fetchAllPages(baseUrl: string, maxPages = 5): Promise<TleApiRecord[]> {
  const allRecords: TleApiRecord[] = [];
  let url: string | null = baseUrl;
  let page = 0;

  while (url && page < maxPages) {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`TLE API HTTP ${response.status}`);

    const data = (await response.json()) as TleApiResponse;
    allRecords.push(...data.member);

    url = data.view?.next && data.view.next !== url ? data.view.next : null;
    page++;
  }

  return allRecords;
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
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      if (response.ok) {
        const body = await response.text();
        const nextEntry: CachedTleResponse = {
          body,
          cachedAt: now,
          source: "celestrak",
        };
        cache = nextEntry;
        await reportFeedHealth("celestrak", "ok");
        return nextEntry;
      }
    } catch {
      // Fall through to backup source below.
    }

    try {
      const records = await fetchAllPages(
        "https://tle.ivanstanojevic.me/api/tle/?sort=popularity&sort-dir=desc&page-size=100&format=json",
        2,
      );

      const nextEntry: CachedTleResponse = {
        body: JSON.stringify(toGpJson(records)),
        cachedAt: now,
        source: "tle-fallback",
      };
      cache = nextEntry;
      await reportFeedHealth("celestrak", "degraded", "Serving fallback TLE API");
      return nextEntry;
    } catch (error) {
      if (cache) {
        await reportFeedHealth("celestrak", "degraded", "Serving stale cached satellite data");
        return cache;
      }

      await reportFeedHealth(
        "celestrak",
        "error",
        error instanceof Error ? error.message : "Satellite data fetch failed",
      );
      throw error;
    }
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Satellite data fetch failed" },
      { status: 502 },
    );
  }
}
