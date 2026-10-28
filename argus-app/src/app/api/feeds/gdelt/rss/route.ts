export const dynamic = "force-dynamic";

import { reportFeedHealth } from "@/lib/feedHealth";
import { applyGdeltWindow, fetchGdeltExportEvents } from "@/lib/gdelt/fetchGdeltExportEvents";
import { buildGdeltRssFeed } from "@/lib/gdelt/buildRssFeed";

const TOP_N = 250;

let cachedXml: string | null = null;
let cachedDay: string | null = null;

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const today = currentUtcDay();
  const feedUrl = new URL(req.url);
  feedUrl.search = "";

  if (cachedXml && cachedDay === today) {
    await reportFeedHealth("gdelt", "ok");
    return new Response(cachedXml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  try {
    const events = await fetchGdeltExportEvents();
    const dailyEvents = applyGdeltWindow(events, "24h");

    const xml = buildGdeltRssFeed(dailyEvents, {
      limit: TOP_N,
      generatedAt: new Date(),
      feedUrl: feedUrl.toString(),
    });

    cachedXml = xml;
    cachedDay = today;
    await reportFeedHealth("gdelt", "ok");

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GDELT RSS build failed";
    await reportFeedHealth("gdelt", "error", message);

    // Serve the previous day's snapshot rather than nothing, if we have one.
    if (cachedXml) {
      return new Response(cachedXml, {
        status: 200,
        headers: {
          "Content-Type": "application/rss+xml; charset=utf-8",
          "Cache-Control": "public, max-age=600",
        },
      });
    }

    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<error>${message}</error>`, {
      status: 502,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
}
