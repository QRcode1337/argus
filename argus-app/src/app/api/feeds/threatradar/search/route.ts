import { NextResponse } from "next/server";

const BASE = "https://radar.offseq.com/api/v1";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (!q) return NextResponse.json({ error: "q param required" }, { status: 400 });
  try {
    const apiKey = process.env.THREATRADAR_API_KEY;
    const res = await fetch(`${BASE}/threats/search?q=${encodeURIComponent(q)}`, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`Search: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ results: [], error: msg }, { status: 502 });
  }
}
