import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cachedBody: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60_000;

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
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`TLE API HTTP ${response.status}`);

    const data = (await response.json()) as TleApiResponse;
    allRecords.push(...data.member);

    url = data.view?.next && data.view.next !== url ? data.view.next : null;
    page++;
  }

  return allRecords;
}

export async function GET() {
  const now = Date.now();
  if (cachedBody && now - cachedAt < CACHE_TTL_MS) {
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // Primary: CelesTrak. Fallback: tle.ivanstanojevic.me
  const celestrakUrl =
    process.env.CELESTRAK_ENDPOINT ??
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json";

  try {
    // Try CelesTrak first
    const response = await fetch(celestrakUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (response.ok) {
      const body = await response.text();
      cachedBody = body;
      cachedAt = now;
      return new NextResponse(body, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  } catch {
    // CelesTrak unreachable, fall through to backup
  }

  try {
    // Fallback: alternative TLE API — fetch popular/active satellites
    const records = await fetchAllPages(
      "https://tle.ivanstanojevic.me/api/tle/?sort=popularity&sort-dir=desc&page-size=100&format=json",
      5,
    );

    const body = JSON.stringify(toGpJson(records));
    cachedBody = body;
    cachedAt = now;

    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    if (cachedBody) {
      return new NextResponse(cachedBody, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Satellite data fetch failed" },
      { status: 502 },
    );
  }
}
