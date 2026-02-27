import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const upstream = process.env.ADSB_MIL_ENDPOINT ?? "https://api.adsb.lol/v2/mil";

  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (process.env.ADSB_MIL_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ADSB_MIL_API_KEY}`;
  }

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers,
    });

    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ADS-B proxy failed" },
      { status: 502 },
    );
  }
}
