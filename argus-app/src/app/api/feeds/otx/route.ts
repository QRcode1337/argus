import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

type OtxPayload = Record<string, unknown>;

type OtxCache = {
  data: OtxPayload;
  cachedAt: string;
};

let cache: OtxCache | null = null;

const REQUEST_TIMEOUT_MS = Number(process.env.OTX_TIMEOUT_MS ?? 15000);

export async function GET() {
  const apiKey = process.env.OTX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OTX_API_KEY not configured" }, { status: 500 });
  }

  // Fetch pulses modified in the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://otx.alienvault.com/api/v1/pulses/subscribed?limit=50&modified_since=${since}`,
      {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "X-OTX-API-KEY": apiKey,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      const reason = `OTX returned ${response.status}`;
      if (cache) {
        reportFeedHealth("otx", "degraded", reason);
        return NextResponse.json({ ...cache.data, _stale: true, _source: "otx-cache", _cachedAt: cache.cachedAt });
      }
      reportFeedHealth("otx", "error", reason);
      return NextResponse.json({ results: [], _degraded: true, _source: "otx-empty", _reason: reason });
    }

    const data = (await response.json()) as OtxPayload;
    cache = { data, cachedAt: new Date().toISOString() };
    reportFeedHealth("otx", "ok");
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OTX proxy failed";

    if (cache) {
      reportFeedHealth("otx", "degraded", message);
      return NextResponse.json({ ...cache.data, _stale: true, _source: "otx-cache", _cachedAt: cache.cachedAt });
    }

    reportFeedHealth("otx", "error", message);
    return NextResponse.json({ results: [], _degraded: true, _source: "otx-empty", _reason: message });
  } finally {
    clearTimeout(timeout);
  }
}
