import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hex = searchParams.get("hex");

  if (!hex) {
    return NextResponse.json({ error: "Missing hex parameter" }, { status: 400 });
  }

  const upstream = `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(hex)}`;

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Planespotters HTTP ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Planespotters proxy failed" },
      { status: 502 },
    );
  }
}
