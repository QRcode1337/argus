import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  const upstream =
    process.env.USGS_ENDPOINT ??
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const body = await response.text();

    if (response.ok) {
      await reportFeedHealth("usgs", "ok");
    } else {
      await reportFeedHealth("usgs", "degraded", `upstream ${response.status}`);
    }

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    await reportFeedHealth(
      "usgs",
      "error",
      error instanceof Error ? error.message : "USGS proxy failed",
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "USGS proxy failed" },
      { status: 502 },
    );
  }
}
