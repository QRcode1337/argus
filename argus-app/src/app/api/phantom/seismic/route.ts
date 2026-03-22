import { NextResponse } from "next/server";
import { ARGUS_CONFIG } from "@/lib/config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(
      `${ARGUS_CONFIG.endpoints.phantom}/api/anomalies/seismic`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return NextResponse.json({ error: "Phantom unavailable" }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Phantom connection failed" }, { status: 502 });
  }
}
