import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.OTX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OTX_API_KEY not configured" }, { status: 500 });
  }

  // Fetch pulses modified in the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  try {
    const response = await fetch(
      `https://otx.alienvault.com/api/v1/pulses/subscribed?limit=50&modified_since=${since}`,
      {
        cache: "no-store",
        headers: {
          "X-OTX-API-KEY": apiKey,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `OTX returned ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OTX proxy failed" },
      { status: 502 },
    );
  }
}
