import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.CLOUDFLARE_RADAR_TOKEN;
  if (!token) {
    await reportFeedHealth("cfradar", "error", "CLOUDFLARE_RADAR_TOKEN not configured");
    return NextResponse.json(
      { error: "CLOUDFLARE_RADAR_TOKEN not configured" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=7d&limit=50&format=json",
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      await reportFeedHealth("cfradar", "error", `Cloudflare Radar returned ${response.status}`);
      return NextResponse.json(
        { error: `Cloudflare Radar returned ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    await reportFeedHealth("cfradar", "ok");
    return NextResponse.json(data);
  } catch (error) {
    await reportFeedHealth(
      "cfradar",
      "error",
      error instanceof Error ? error.message : "Cloudflare Radar proxy failed",
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cloudflare Radar proxy failed" },
      { status: 502 },
    );
  }
}
