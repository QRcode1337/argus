import { NextResponse } from "next/server";
import { normalizeThreatRadar } from "@/lib/ingest/threatradar";

const BASE = "https://radar.offseq.com/api/v1";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ?? "10";
  const apiKey = process.env.THREATRADAR_API_KEY;
  try {
    const res = await fetch(`${BASE}/threats?limit=${limit}`, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`ThreatRadar: ${res.status}`);
    const raw = await res.json();
    return NextResponse.json(normalizeThreatRadar(raw));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ThreatRadar unavailable";
    return NextResponse.json({ threats: [], total: 0, updatedAt: new Date().toISOString(), error: msg }, { status: 502 });
  }
}
