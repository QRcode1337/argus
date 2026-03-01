import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cachedBody: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60_000;

export async function GET() {
  const now = Date.now();
  if (cachedBody && now - cachedAt < CACHE_TTL_MS) {
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const upstream =
    process.env.CELESTRAK_ENDPOINT ??
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json";

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      if (cachedBody) {
        return new NextResponse(cachedBody, {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      return NextResponse.json(
        { error: `CelesTrak HTTP ${response.status}` },
        { status: response.status },
      );
    }

    const body = await response.text();
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
      { error: error instanceof Error ? error.message : "CelesTrak proxy failed" },
      { status: 502 },
    );
  }
}
