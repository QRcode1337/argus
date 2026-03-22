import { NextResponse } from "next/server";
import { ARGUS_CONFIG } from "@/lib/config";

export async function GET() {
  try {
    const res = await fetch(`${ARGUS_CONFIG.endpoints.phantom}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return NextResponse.json({ status: res.ok ? "up" : "down" });
  } catch {
    return NextResponse.json({ status: "down" });
  }
}
