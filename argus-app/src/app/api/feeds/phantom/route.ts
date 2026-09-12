import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";
import { ARGUS_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ARGUS_CONFIG.endpoints.phantom}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      await reportFeedHealth("phantom", "ok");
      return NextResponse.json({ status: "ok", phantom: "up" });
    }
    await reportFeedHealth("phantom", "degraded", "Phantom health returned non-200");
    return NextResponse.json({ status: "degraded", phantom: "down" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Phantom unreachable";
    await reportFeedHealth("phantom", "degraded", msg);
    return NextResponse.json({ status: "degraded", error: msg });
  }
}
