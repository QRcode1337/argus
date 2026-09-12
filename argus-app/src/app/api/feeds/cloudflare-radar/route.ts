import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

const FALLBACK_OUTAGES = {
  result: {
    outages: [
      {
        id: "outage-1",
        locations: [{ name: "Ukraine", code: "UA", lat: 48.3794, lon: 31.1656 }],
        type: "WAR_INFRASTRUCTURE",
        startDate: new Date(Date.now() - 3600000).toISOString(),
        endDate: null,
      },
      {
        id: "outage-2",
        locations: [{ name: "Red Sea Cable", code: "YE", lat: 15.5527, lon: 48.5164 }],
        type: "SUBSEA_CABLE",
        startDate: new Date(Date.now() - 7200000).toISOString(),
        endDate: null,
      },
    ],
  },
};

export async function GET() {
  const token = process.env.CLOUDFLARE_RADAR_TOKEN;

  if (token) {
    try {
      const response = await fetch(
        "https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=7d&limit=50&format=json",
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (response.ok) {
        const data = await response.json();
        await reportFeedHealth("cfradar", "ok");
        return NextResponse.json(data);
      }
    } catch {
      // Fall through to fallback below
    }
  }

  await reportFeedHealth("cfradar", "degraded", "Serving outage fallback snapshot");
  return NextResponse.json({ ...FALLBACK_OUTAGES, _fallback: true });
}
