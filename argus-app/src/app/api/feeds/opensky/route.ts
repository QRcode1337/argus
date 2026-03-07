import { NextResponse } from "next/server";

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
        ac.hex ?? "unknown",                   // 0: icao24
        ac.flight?.trim() ?? null,             // 1: callsign
        "",                                     // 2: origin_country
        now,                                    // 3: time_position
        now,                                    // 4: last_contact
        ac.lon,                                // 5: longitude
        ac.lat,                                // 6: latitude
        altBaro,                               // 7: baro_altitude (meters)
        onGround,                              // 8: on_ground
        velocity,                              // 9: velocity (m/s)
        ac.track ?? null,                      // 10: true_track
        vertRate,                              // 11: vertical_rate (m/s)
        null,                                  // 12: sensors
        altGeo,                                // 13: geo_altitude (meters)
        ac.squawk ?? null,                     // 14: squawk
        false,                                 // 15: spi
        0,                                     // 16: position_source
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

export async function GET() {
  const now = Date.now();
  if (cachedBody && now - cachedAt < CACHE_TTL_MS) {
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  // Try OpenSky first
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
      return new NextResponse(body, {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Cache": "MISS", "X-Source": "opensky" },
      });
    }
  } catch {
    // OpenSky unreachable or rate-limited, fall through
  }

  const fallbackUrl = process.env.OPENSKY_FALLBACK_ENDPOINT?.trim();
  if (fallbackUrl) {
    try {
      const response = await fetch(fallbackUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        const data = (await response.json()) as { ac: AdsbLolAircraft[] };
        const converted = adsbLolToOpenSky(data.ac ?? []);
        const body = JSON.stringify(converted);
        cachedBody = body;
        cachedAt = now;
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
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "STALE" },
    });
  }

  return NextResponse.json(
    { error: "All flight data sources unavailable" },
    { status: 502 },
  );
}
