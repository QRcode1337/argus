import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const upstream =
    process.env.CELESTRAK_ENDPOINT ??
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";

  try {
    const response = await fetch(upstream, { cache: "no-store" });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CelesTrak proxy failed" },
      { status: 502 },
    );
  }
}
