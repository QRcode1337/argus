import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FRED_API_KEY not configured" }, { status: 500 });
  }

  const seriesId = request.nextUrl.searchParams.get("series_id") ?? process.env.FRED_SERIES_ID ?? "DFF";
  const baseUrl = process.env.FRED_ENDPOINT ?? "https://api.stlouisfed.org/fred/series/observations";

  try {
    const upstream = new URL(baseUrl);
    upstream.searchParams.set("series_id", seriesId);
    upstream.searchParams.set("api_key", apiKey);
    upstream.searchParams.set("file_type", "json");
    upstream.searchParams.set("sort_order", "desc");
    upstream.searchParams.set("limit", "30");

    const response = await fetch(upstream.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `FRED returned ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "FRED proxy failed" },
      { status: 502 },
    );
  }
}
