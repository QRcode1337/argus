import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

const DEFAULT_BOUNDS = [[[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]];

type AisVessel = {
  mmsi: number;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  heading?: number;
  navStatus?: number;
  timestamp?: string;
  vesselName?: string;
  callsign?: string;
};

type AisPayload = { vessels: AisVessel[] };

type AisCache = {
  data: AisPayload;
  cachedAt: string;
};

let cache: AisCache | null = null;

const REQUEST_TIMEOUT_MS = Number(process.env.AISSTREAM_TIMEOUT_MS ?? 12000);
const MAX_MESSAGES = Number(process.env.AISSTREAM_MAX_MESSAGES ?? 200);

function normalizeAisMessage(raw: any): AisVessel | null {
  const position = raw?.Message?.PositionReport;
  const metadata = raw?.MetaData;
  if (!position) return null;

  const lat = Number(position.Latitude);
  const lon = Number(position.Longitude);
  const mmsi = Number(metadata?.MMSI ?? position.UserID ?? position.MMSI);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mmsi)) return null;

  return {
    mmsi,
    lat,
    lon,
    sog: Number.isFinite(Number(position.Sog)) ? Number(position.Sog) : undefined,
    cog: Number.isFinite(Number(position.Cog)) ? Number(position.Cog) : undefined,
    heading: Number.isFinite(Number(position.TrueHeading)) ? Number(position.TrueHeading) : undefined,
    navStatus: Number.isFinite(Number(position.NavigationalStatus))
      ? Number(position.NavigationalStatus)
      : undefined,
    timestamp: metadata?.time_utc ?? metadata?.time ?? undefined,
    vesselName: metadata?.ShipName ?? undefined,
    callsign: metadata?.CallSign ?? undefined,
  };
}

async function fetchSnapshotFromWs(apiKey: string): Promise<AisPayload> {
  // Avoid ws optional native addons that break in bundled/serverless contexts.
  process.env.WS_NO_BUFFER_UTIL = "1";
  process.env.WS_NO_UTF_8_VALIDATE = "1";

  const wsModule: any = await import("ws");
  const WebSocket = wsModule.default ?? wsModule;

  return new Promise((resolve, reject) => {
    const vessels = new Map<number, AisVessel>();

    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream", {
      handshakeTimeout: REQUEST_TIMEOUT_MS,
    });

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      finish(() => {
        if (vessels.size > 0) resolve({ vessels: Array.from(vessels.values()) });
        else reject(new Error("AISStream timed out without data"));
      });
    }, REQUEST_TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: DEFAULT_BOUNDS,
          FilterMessageTypes: ["PositionReport"],
        }),
      );
    });

    ws.on("message", (data: any) => {
      try {
        const parsed = JSON.parse(data.toString());
        const vessel = normalizeAisMessage(parsed);
        if (vessel) vessels.set(vessel.mmsi, vessel);

        if (vessels.size >= MAX_MESSAGES) {
          try { ws.close(); } catch {}
          finish(() => resolve({ vessels: Array.from(vessels.values()) }));
        }
      } catch {
        // ignore malformed frame
      }
    });

    ws.on("error", (err: unknown) => {
      finish(() => reject(err instanceof Error ? err : new Error("AISStream websocket error")));
    });

    ws.on("close", () => {
      finish(() => {
        if (vessels.size > 0) resolve({ vessels: Array.from(vessels.values()) });
        else reject(new Error("AISStream connection closed without data"));
      });
    });
  });
}

export async function GET() {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AISSTREAM_API_KEY not configured" }, { status: 500 });
  }

  try {
    const data = await fetchSnapshotFromWs(apiKey);
    cache = { data, cachedAt: new Date().toISOString() };
    reportFeedHealth("aisstream", "ok");
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AISStream proxy failed";

    if (cache) {
      reportFeedHealth("aisstream", "degraded", message);
      return NextResponse.json({
        ...cache.data,
        _stale: true,
        _source: "ais-cache",
        _cachedAt: cache.cachedAt,
      });
    }

    reportFeedHealth("aisstream", "error", message);
    return NextResponse.json({ vessels: [], _degraded: true, _source: "ais-empty", _reason: message });
  }
}
