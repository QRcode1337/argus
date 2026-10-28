export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";
import type { GdeltEvent } from "@/types/gdelt";
import { applyGdeltWindow, fetchGdeltExportEvents } from "@/lib/gdelt/fetchGdeltExportEvents";

let cachedEvents: GdeltEvent[] = [];
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const windowParam = searchParams.get("window");

    // Return cached if fresh
    if (cachedEvents.length > 0 && Date.now() - cachedAt < CACHE_TTL_MS) {
      const filtered = applyGdeltWindow(cachedEvents, windowParam);
      await reportFeedHealth("gdelt", "ok");
      return NextResponse.json(
        { events: filtered, cached: true, count: filtered.length, window: windowParam ?? "ALL" },
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=600",
          },
        },
      );
    }

    const events = await fetchGdeltExportEvents();
    cachedEvents = events;
    cachedAt = Date.now();
    const filtered = applyGdeltWindow(events, windowParam);
    await reportFeedHealth("gdelt", "ok");

    return NextResponse.json(
      { events: filtered, cached: false, count: filtered.length, window: windowParam ?? "ALL" },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=600",
        },
      },
    );
  } catch (error) {
    await reportFeedHealth(
      "gdelt",
      "error",
      error instanceof Error ? error.message : "GDELT fetch failed",
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GDELT fetch failed" },
      { status: 502 },
    );
  }
}
