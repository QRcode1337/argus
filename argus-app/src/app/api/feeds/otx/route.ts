import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

type OtxPayload = Record<string, unknown>;

type OtxCache = {
  data: OtxPayload;
  cachedAt: string;
};

let cache: OtxCache | null = null;
let refreshPromise: Promise<OtxPayload> | null = null;

const REQUEST_TIMEOUT_MS = Number(process.env.OTX_TIMEOUT_MS ?? 15000);

async function refreshSnapshot(apiKey: string): Promise<OtxPayload> {
  // Fetch pulses modified in the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
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
        throw new Error(`OTX returned ${response.status}`);
      }

      const data = (await response.json()) as OtxPayload;
      cache = { data, cachedAt: new Date().toISOString() };
      await reportFeedHealth("otx", "ok");
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "OTX proxy failed";
      if (cache) {
        await reportFeedHealth("otx", "degraded", message);
        return cache.data;
      }
      await reportFeedHealth("otx", "error", message);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function GET() {
  const apiKey = process.env.OTX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OTX_API_KEY not configured" }, { status: 500 });
  }

  if (cache) {
    const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
    if (ageMs < REQUEST_TIMEOUT_MS) {
      return NextResponse.json({ ...cache.data, _cached: true });
    }

    void refreshSnapshot(apiKey);
    await reportFeedHealth("otx", "degraded", "Refreshing stale cached OTX snapshot");
    return NextResponse.json({ ...cache.data, _stale: true, _source: "otx-cache", _cachedAt: cache.cachedAt });
  }

  try {
    const data = await refreshSnapshot(apiKey);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OTX proxy failed";
    return NextResponse.json({ results: [], _degraded: true, _source: "otx-empty", _reason: message });
  }
}
