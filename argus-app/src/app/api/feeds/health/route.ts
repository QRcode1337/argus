import { NextResponse } from "next/server";
import { getFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  const feeds = await getFeedHealth();
  const statuses = Object.values(feeds);
  const now = Date.now();

  const feedsWithAge = Object.fromEntries(
    Object.entries(feeds).map(([feedName, status]) => [
      feedName,
      {
        ...status,
        lastSuccessAgeMs: status.lastSuccess ? Math.max(0, now - Date.parse(status.lastSuccess)) : null,
        lastCheckAgeMs: status.lastCheck ? Math.max(0, now - Date.parse(status.lastCheck)) : null,
      },
    ]),
  );

  return NextResponse.json({
    feeds: feedsWithAge,
    summary: {
      ok: statuses.filter((status) => status.status === "ok").length,
      degraded: statuses.filter((status) => status.status === "degraded").length,
      error: statuses.filter((status) => status.status === "error").length,
      unknown: statuses.filter((status) => status.status === "unknown").length,
      total: statuses.length,
    },
    timestamp: new Date().toISOString(),
  });
}
