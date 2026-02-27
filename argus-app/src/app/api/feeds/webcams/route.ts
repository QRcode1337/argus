import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cachedData: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15 * 60_000;

export async function GET() {
  const apiKey = process.env.WINDY_WEBCAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ webcams: [] });
  }

  const now = Date.now();
  if (cachedData && now - cachedAt < CACHE_TTL_MS) {
    return new NextResponse(cachedData, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  try {
    const url = "https://api.windy.com/webcams/api/v3/webcams?include=location,images,categories&categories=nature,landscape,outdoor,wildlife,landmark&limit=500";
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "x-windy-api-key": apiKey,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Windy Webcams HTTP ${response.status}` },
        { status: response.status },
      );
    }

    const body = await response.text();
    cachedData = body;
    cachedAt = now;

    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Windy Webcams proxy failed" },
      { status: 502 },
    );
  }
}
