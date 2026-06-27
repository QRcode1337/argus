import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

let cachedBody: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;
const TOKEN_EXPIRY_SKEW_MS = 60_000;

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;

type OpenSkyTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

interface AdsbLolAircraft {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  dbFlags?: number;
}

const ADSB_LOL_REGIONAL_FALLBACK_POINTS = [
  { lat: 39.0, lon: -98.0, radius: 350 },
  { lat: 37.5, lon: -122.0, radius: 250 },
  { lat: 40.8, lon: -74.0, radius: 250 },
  { lat: 50.0, lon: 10.0, radius: 300 },
  { lat: 25.0, lon: 55.0, radius: 250 },
  { lat: 22.0, lon: 78.0, radius: 250 },
  { lat: 20.0, lon: 115.0, radius: 250 },
  { lat: 35.0, lon: 135.0, radius: 220 },
  { lat: -23.5, lon: -46.6, radius: 250 },
  { lat: -33.9, lon: 151.2, radius: 250 },
] as const;

/** Convert adsb.lol format → OpenSky states format */
function adsbLolToOpenSky(aircraft: AdsbLolAircraft[]): object {
  const now = Math.floor(Date.now() / 1000);
  const states = aircraft
    .filter((ac) => ac.lat != null && ac.lon != null)
    .map((ac) => {
      const altBaro = typeof ac.alt_baro === "number" ? ac.alt_baro * 0.3048 : null;
      const altGeo = ac.alt_geom != null ? ac.alt_geom * 0.3048 : null;
      const velocity = ac.gs != null ? ac.gs * 0.514444 : null;
      const vertRate = (ac.geom_rate ?? ac.baro_rate) != null
        ? ((ac.geom_rate ?? ac.baro_rate)! * 0.00508)
        : null;
      const onGround = ac.alt_baro === "ground";

      return [
        ac.hex ?? "unknown",
        ac.flight?.trim() ?? null,
        "",
        now,
        now,
        ac.lon,
        ac.lat,
        altBaro,
        onGround,
        velocity,
        ac.track ?? null,
        vertRate,
        null,
        altGeo,
        ac.squawk ?? null,
        false,
        0,
      ];
    });

  return { time: now, states };
}

async function getOpenSkyAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Date.now();
  if (
    cachedAccessToken &&
    now < cachedAccessTokenExpiresAt - TOKEN_EXPIRY_SKEW_MS
  ) {
    return cachedAccessToken;
  }

  const authUrl =
    process.env.OPENSKY_AUTH_URL ??
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(authUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`OpenSky token HTTP ${response.status}`);
  }

  const payload = (await response.json()) as OpenSkyTokenResponse;
  if (!payload.access_token) {
    throw new Error("OpenSky token response missing access_token");
  }

  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = now + Math.max(60, payload.expires_in ?? 300) * 1000;
  return cachedAccessToken;
}

async function fetchAdsbLolRegionalFallback(): Promise<AdsbLolAircraft[]> {
  const responses = await Promise.all(
    ADSB_LOL_REGIONAL_FALLBACK_POINTS.map(async ({ lat, lon, radius }) => {
      try {
        const response = await fetch(`https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });

        if (!response.ok) return [] as AdsbLolAircraft[];
        const payload = (await response.json()) as { ac?: AdsbLolAircraft[] };
        return payload.ac ?? [];
      } catch {
        return [] as AdsbLolAircraft[];
      }
    }),
  );

  const deduped = new Map<string, AdsbLolAircraft>();
  for (const aircraft of responses.flat()) {
    if (!aircraft.hex || aircraft.lat == null || aircraft.lon == null) continue;
    deduped.set(aircraft.hex.toLowerCase(), aircraft);
  }

  return Array.from(deduped.values());
}

export async function GET() {
  const now = Date.now();
  if (cachedBody && now - cachedAt < CACHE_TTL_MS) {
    await reportFeedHealth("opensky", "ok");
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  const openSkyUrl =
    process.env.OPENSKY_ENDPOINT ?? "https://opensky-network.org/api/states/all";

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const accessToken = await getOpenSkyAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(openSkyUrl, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(8_000),
    });

    if (response.ok) {
      const body = await response.text();
      cachedBody = body;
      cachedAt = now;
      await reportFeedHealth("opensky", "ok");
      return new NextResponse(body, {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Cache": "MISS", "X-Source": "opensky" },
      });
    }
  } catch {
    // OpenSky unreachable or rate-limited, fall through
  }

  try {
    const fallbackAircraft = await fetchAdsbLolRegionalFallback();
    if (fallbackAircraft.length > 0) {
      const body = JSON.stringify(adsbLolToOpenSky(fallbackAircraft));
      cachedBody = body;
      cachedAt = now;
      await reportFeedHealth("opensky", "degraded", "Serving regional ADS-B fallback");
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "MISS",
          "X-Source": "fallback-regional",
        },
      });
    }
  } catch {
    // regional fallback failed; try explicit fallback below
  }

  const fallbackUrl = process.env.OPENSKY_FALLBACK_ENDPOINT?.trim();
  if (fallbackUrl) {
    try {
      const response = await fetch(fallbackUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        const data = (await response.json()) as { ac?: AdsbLolAircraft[]; aircraft?: AdsbLolAircraft[] };
        const converted = adsbLolToOpenSky(data.ac ?? data.aircraft ?? []);
        const body = JSON.stringify(converted);
        cachedBody = body;
        cachedAt = now;
        await reportFeedHealth("opensky", "degraded", "Serving explicit fallback endpoint");
        return new NextResponse(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Cache": "MISS",
            "X-Source": "fallback",
          },
        });
      }
    } catch {
      // explicit fallback also failed
    }
  }

  if (cachedBody) {
    await reportFeedHealth("opensky", "degraded", "Serving stale cached flight data");
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "STALE" },
    });
  }

  await reportFeedHealth("opensky", "error", "All flight data sources unavailable");
  return NextResponse.json(
    { error: "All flight data sources unavailable" },
    { status: 502 },
  );
}
