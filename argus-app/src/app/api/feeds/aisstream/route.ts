import { NextResponse } from "next/server";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

// Focused bounding boxes for strategic maritime regions.
// NO global box — a global box floods the stream with random vessels worldwide
// and you hit the message cap before getting meaningful density in key areas.
// AISStream sends messages matching ANY box, so each region gets dedicated coverage.
const DEFAULT_BOUNDS = [
  [[23, 48], [30, 60]],               // Persian Gulf & Strait of Hormuz
  [[10, 40], [16, 46]],               // Bab el-Mandeb & Gulf of Aden
  [[12, 32], [32, 44]],               // Red Sea & Suez Canal (full length)
  [[30, 24], [42, 37]],               // Eastern Mediterranean
  [[-5, 98], [8, 106]],               // Strait of Malacca
  [[20, 118], [28, 123]],             // Taiwan Strait & South China Sea
  [[48, -8], [62, 12]],               // North Sea & English Channel
  [[33, -10], [48, 5]],               // Western Mediterranean & Gibraltar
  [[25, -82], [32, -78]],             // Straits of Florida
  [[8, 76], [22, 90]],                // Bay of Bengal & Indian Ocean approaches
  [[-8, 38], [12, 52]],               // East African coast / Mozambique Channel
  [[30, 125], [45, 145]],             // East China Sea & Sea of Japan
];

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

type RawAisMessage = {
  Message?: {
    PositionReport?: {
      Latitude?: unknown;
      Longitude?: unknown;
      UserID?: unknown;
      MMSI?: unknown;
      Sog?: unknown;
      Cog?: unknown;
      TrueHeading?: unknown;
      NavigationalStatus?: unknown;
    };
  };
  MetaData?: {
    MMSI?: unknown;
    time_utc?: string;
    time?: string;
    ShipName?: string;
    CallSign?: string;
  };
};

type WsLike = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  send: (data: string) => void;
  close: () => void;
};

type WsConstructor = new (
  url: string,
  options: { handshakeTimeout: number },
) => WsLike;

let cache: AisCache | null = null;
const CACHE_TTL_MS = 45_000; // Serve cached data for 45s to avoid hammering the WebSocket

const REQUEST_TIMEOUT_MS = Number(process.env.AISSTREAM_TIMEOUT_MS ?? 40000);
const MAX_MESSAGES = Number(process.env.AISSTREAM_MAX_MESSAGES ?? 2000);

function rawDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Buffer) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data) && data.every((item) => item instanceof Buffer)) {
    return Buffer.concat(data).toString("utf8");
  }
  return String(data);
}

function normalizeAisMessage(raw: unknown): AisVessel | null {
  const message = raw as RawAisMessage;
  const position = message?.Message?.PositionReport;
  const metadata = message?.MetaData;
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

  const wsModule = (await import("ws")) as { default?: WsConstructor };
  const WebSocket = (wsModule.default ?? (wsModule as unknown as WsConstructor));

  return new Promise((resolve, reject) => {
    const vessels = new Map<number, AisVessel>();
    let upstreamError: string | null = null;

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

    ws.on("message", (data: unknown) => {
      try {
        const parsed = JSON.parse(rawDataToString(data));
        if (parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string") {
          upstreamError = (parsed as { error: string }).error;
          try { ws.close(); } catch {}
          finish(() => reject(new Error(upstreamError ?? "AISStream upstream error")));
          return;
        }
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
        else reject(new Error(upstreamError ?? "AISStream connection closed without data"));
      });
    });
  });
}

export async function GET() {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AISSTREAM_API_KEY not configured" }, { status: 500 });
  }

  // Return cached data if still fresh
  if (cache && Date.now() - new Date(cache.cachedAt).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.data, _cached: true });
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
