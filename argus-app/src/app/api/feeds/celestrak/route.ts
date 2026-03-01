export const runtime = "edge";

export async function GET() {
  const upstream =
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json";

  try {
    const response = await fetch(upstream, { cache: "no-store" });

    if (!response.ok || !response.body) {
      return new Response(
        JSON.stringify({ error: `CelesTrak HTTP ${response.status}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "CelesTrak proxy failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
