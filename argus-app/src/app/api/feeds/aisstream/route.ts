import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_BOUNDS = [[[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]];

export async function GET() {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AISSTREAM_API_KEY not configured" }, { status: 500 });
  }

  const endpoint = process.env.AISSTREAM_ENDPOINT ?? "https://api.aisstream.io/v0/vessels";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BoundingBoxes: DEFAULT_BOUNDS,
        FilterMessageTypes: ["PositionReport"],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `AISStream returned ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AISStream proxy failed" },
      { status: 502 },
    );
  }
}
