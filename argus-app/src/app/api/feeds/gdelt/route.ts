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
    const message = error instanceof Error ? error.message : "GDELT fetch failed";
    await reportFeedHealth("gdelt", "error", message);

    // fetchGdeltExportEvents() already retries across several recent GDELT
    // slots internally; if it still failed, fall back to our own stale
    // cache (if any) rather than a hard 502 — this is what was turning a
    // transient upstream gap into a fully broken feed/digest.
    if (cachedEvents.length > 0) {
      const { searchParams } = new URL(req.url);
      const windowParam = searchParams.get("window");
      const filtered = applyGdeltWindow(cachedEvents, windowParam);
      return NextResponse.json(
        { events: filtered, cached: true, stale: true, count: filtered.length, window: windowParam ?? "ALL" },
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        },
      );
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
