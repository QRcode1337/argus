import { NextResponse } from "next/server";

const BASE = "https://radar.offseq.com/api/v1";

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const apiKey = process.env.THREATRADAR_API_KEY;
    const res = await fetch(`${BASE}/threats/check-iocs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`IoC check: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "IoC check failed";
    return NextResponse.json({ matches: [], error: msg }, { status: 502 });
  }
}
