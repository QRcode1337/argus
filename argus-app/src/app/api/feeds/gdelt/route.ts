export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const GDELT_LAST_UPDATE = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";

// GDELT v2 export column indices (0-based)
const COL = {
  GLOBALEVENTID: 0,
  DATEADDED: 59,
  ACTOR1_NAME: 6,
  ACTOR1_COUNTRY: 7,
  ACTOR2_NAME: 16,
  ACTOR2_COUNTRY: 17,
  EVENT_CODE: 26,
  EVENT_BASE_CODE: 27,
  EVENT_ROOT_CODE: 28,
  QUAD_CLASS: 29,
  GOLDSTEIN_SCALE: 30,
  NUM_MENTIONS: 31,
  NUM_SOURCES: 32,
  AVG_TONE: 34,
  ACTION_GEO_FULLNAME: 52,
  ACTION_GEO_COUNTRYCODE: 53,
  ACTION_GEO_LAT: 56,
  ACTION_GEO_LON: 57,
  SOURCE_URL: 60,
} as const;

interface ParsedEvent {
  id: string;
  dateAdded: string;
  actor1Name: string;
  actor1Country: string;
  actor2Name: string;
  actor2Country: string;
  eventCode: string;
  eventBaseCode: string;
  eventRootCode: string;
  quadClass: number;
  goldsteinScale: number;
  numMentions: number;
  numSources: number;
  avgTone: number;
  actionGeoName: string;
  actionGeoCountry: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
}

let cachedEvents: ParsedEvent[] = [];
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes

async function fetchLatestExportUrl(): Promise<string | null> {
  const res = await fetch(GDELT_LAST_UPDATE, { cache: "no-store" });
  if (!res.ok) return null;
  const text = await res.text();
  // First line is the export CSV, format: "size md5 url"
  const firstLine = text.trim().split("\n")[0];
  const parts = firstLine?.split(/\s+/);
  const url = parts?.[2];
  return url && url.endsWith(".export.CSV.zip") ? url : null;
}

function parseTsv(tsv: string): ParsedEvent[] {
  const lines = tsv.trim().split("\n");
  const events: ParsedEvent[] = [];

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 61) continue;

    const lat = parseFloat(cols[COL.ACTION_GEO_LAT]);
    const lon = parseFloat(cols[COL.ACTION_GEO_LON]);
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;

    const goldsteinScale = parseFloat(cols[COL.GOLDSTEIN_SCALE]) || 0;
    const numMentions = parseInt(cols[COL.NUM_MENTIONS], 10) || 0;
    const quadClass = parseInt(cols[COL.QUAD_CLASS], 10) || 0;

    // Filter to high-signal events: keep extreme Goldstein (≤-5 or ≥7) OR widely-mentioned (≥5)
    if (goldsteinScale > -5 && goldsteinScale < 7 && numMentions < 5) continue;

    events.push({
      id: cols[COL.GLOBALEVENTID],
      dateAdded: cols[COL.DATEADDED],
      actor1Name: cols[COL.ACTOR1_NAME],
      actor1Country: cols[COL.ACTOR1_COUNTRY],
      actor2Name: cols[COL.ACTOR2_NAME],
      actor2Country: cols[COL.ACTOR2_COUNTRY],
      eventCode: cols[COL.EVENT_CODE],
      eventBaseCode: cols[COL.EVENT_BASE_CODE],
      eventRootCode: cols[COL.EVENT_ROOT_CODE],
      quadClass,
      goldsteinScale,
      numMentions,
      numSources: parseInt(cols[COL.NUM_SOURCES], 10) || 0,
      avgTone: parseFloat(cols[COL.AVG_TONE]) || 0,
      actionGeoName: cols[COL.ACTION_GEO_FULLNAME],
      actionGeoCountry: cols[COL.ACTION_GEO_COUNTRYCODE],
      latitude: lat,
      longitude: lon,
      sourceUrl: cols[COL.SOURCE_URL],
    });
  }

  return events;
}

export async function GET() {
  try {
    // Return cached if fresh
    if (cachedEvents.length > 0 && Date.now() - cachedAt < CACHE_TTL_MS) {
      return NextResponse.json(
        { events: cachedEvents, cached: true, count: cachedEvents.length },
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=600",
          },
        },
      );
    }

    const exportUrl = await fetchLatestExportUrl();
    if (!exportUrl) {
      return NextResponse.json(
        { error: "Failed to resolve GDELT export URL" },
        { status: 502 },
      );
    }

    const zipRes = await fetch(exportUrl, { cache: "no-store" });
    if (!zipRes.ok) {
      return NextResponse.json(
        { error: `GDELT export fetch failed: ${zipRes.status}` },
        { status: 502 },
      );
    }

    const zipBuffer = await zipRes.arrayBuffer();

    // Parse ZIP manually — GDELT zips contain a single CSV file
    // ZIP local file header starts at offset 0: PK\x03\x04
    const view = new DataView(zipBuffer);
    const bytes = new Uint8Array(zipBuffer);

    // Find the local file header
    if (view.getUint32(0, true) !== 0x04034b50) {
      return NextResponse.json({ error: "Invalid ZIP" }, { status: 502 });
    }

    const fnLen = view.getUint16(26, true);
    const extraLen = view.getUint16(28, true);
    const compressedSize = view.getUint32(18, true);
    const compressionMethod = view.getUint16(8, true);
    const dataOffset = 30 + fnLen + extraLen;

    let csvText: string;

    if (compressionMethod === 0) {
      // Stored (no compression)
      csvText = new TextDecoder().decode(bytes.slice(dataOffset, dataOffset + compressedSize));
    } else if (compressionMethod === 8) {
      // Deflate
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      writer.write(compressed);
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.value) chunks.push(result.value);
        done = result.done;
      }

      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      csvText = new TextDecoder().decode(merged);
    } else {
      return NextResponse.json(
        { error: `Unsupported ZIP compression: ${compressionMethod}` },
        { status: 502 },
      );
    }

    const events = parseTsv(csvText);
    cachedEvents = events;
    cachedAt = Date.now();

    return NextResponse.json(
      { events, cached: false, count: events.length },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=600",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GDELT fetch failed" },
      { status: 502 },
    );
  }
}
