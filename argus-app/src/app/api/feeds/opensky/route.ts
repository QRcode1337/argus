import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cachedBody: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15_000;

export async function GET() {
  const now = Date.now();
  if (cachedBody && now - cachedAt < CACHE_TTL_MS) {
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  const upstream =
    process.env.OPENSKY_ENDPOINT ?? "https://opensky-network.org/api/states/all";

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    const body = await response.text();

    if (response.ok) {
      cachedBody = body;
      cachedAt = now;
      return new NextResponse(body, {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
      });
    }

    if (cachedBody) {
      return new NextResponse(cachedBody, {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Cache": "STALE" },
      });
    }

    return NextResponse.json(
      { error: `OpenSky HTTP ${response.status}` },
      { status: 502 },
    );
  } catch (error) {
    if (cachedBody) {
      return new NextResponse(cachedBody, {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Cache": "STALE" },
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OpenSky proxy failed" },
      { status: 502 },
    );
  }
}
