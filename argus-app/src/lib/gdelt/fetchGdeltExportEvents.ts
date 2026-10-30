import type { GdeltEvent } from "../../types/gdelt";

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

export const WINDOW_HOURS = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "48h": 48,
  "7d": 168,
} as const;

export async function fetchLatestExportUrl(): Promise<string | null> {
  const res = await fetch(GDELT_LAST_UPDATE, { cache: "no-store" });
  if (!res.ok) return null;
  const text = await res.text();
  // First line is the export CSV, format: "size md5 url"
  const firstLine = text.trim().split("\n")[0];
  const parts = firstLine?.split(/\s+/);
  const url = parts?.[2];
  return url && url.endsWith(".export.CSV.zip") ? url : null;
}

const GDELT_BASE = "http://data.gdeltproject.org/gdeltv2";
const TIMESTAMP_RE = /\/(\d{14})\.export\.CSV\.zip$/;

function formatGdeltTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/**
 * GDELT publishes every 15 minutes, but the "latest" pointer can briefly
 * reference a file that hasn't actually landed yet (seen in practice —
 * both the current and prior slot 404ing at once). Steps back through
 * earlier 15-minute slots rather than failing on the very first miss.
 */
function previousSlotUrls(latestUrl: string, maxSteps: number): string[] {
  const match = latestUrl.match(TIMESTAMP_RE);
  if (!match) return [];

  const ts = match[1];
  const base = Date.UTC(
    Number(ts.slice(0, 4)),
    Number(ts.slice(4, 6)) - 1,
    Number(ts.slice(6, 8)),
    Number(ts.slice(8, 10)),
    Number(ts.slice(10, 12)),
    Number(ts.slice(12, 14)),
  );

  const urls: string[] = [];
  for (let step = 1; step <= maxSteps; step++) {
    const prior = new Date(base - step * 15 * 60_000);
    urls.push(`${GDELT_BASE}/${formatGdeltTimestamp(prior)}.export.CSV.zip`);
  }
  return urls;
}

export function parseGdeltTsv(tsv: string): GdeltEvent[] {
  const lines = tsv.trim().split("\n");
  const events: GdeltEvent[] = [];

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 61) continue;

    const lat = parseFloat(cols[COL.ACTION_GEO_LAT]);
    const lon = parseFloat(cols[COL.ACTION_GEO_LON]);
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;

    const goldsteinScale = parseFloat(cols[COL.GOLDSTEIN_SCALE]) || 0;
    const numMentions = parseInt(cols[COL.NUM_MENTIONS], 10) || 0;
    const quadClass = (parseInt(cols[COL.QUAD_CLASS], 10) || 0) as GdeltEvent["quadClass"];

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

export function parseGdeltDateAdded(value: string): number | null {
  if (!/^\d{14}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const ts = Date.UTC(year, month, day, hour, minute, second);
  return Number.isFinite(ts) ? ts : null;
}

export function applyGdeltWindow(
  events: GdeltEvent[],
  windowParam: string | null,
): GdeltEvent[] {
  if (!windowParam || windowParam === "ALL") return events;
  if (!(windowParam in WINDOW_HOURS)) return events;

  const horizon = Date.now() - WINDOW_HOURS[windowParam as keyof typeof WINDOW_HOURS] * 3_600_000;
  return events.filter((event) => {
    const ts = parseGdeltDateAdded(event.dateAdded);
    return ts !== null && ts >= horizon;
  });
}

async function fetchAndParseZip(url: string): Promise<GdeltEvent[]> {
  const zipRes = await fetch(url, { cache: "no-store" });
  if (!zipRes.ok) {
    throw new Error(`GDELT export fetch failed: ${zipRes.status}`);
  }

  const zipBuffer = await zipRes.arrayBuffer();

  // Parse ZIP manually — GDELT zips contain a single CSV file.
  // ZIP local file header starts at offset 0: PK\x03\x04
  const view = new DataView(zipBuffer);
  const bytes = new Uint8Array(zipBuffer);

  if (view.getUint32(0, true) !== 0x04034b50) {
    throw new Error("Invalid ZIP");
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
    throw new Error(`Unsupported ZIP compression: ${compressionMethod}`);
  }

  return parseGdeltTsv(csvText);
}

let lastKnownGoodEvents: GdeltEvent[] | null = null;
let lastKnownGoodAt = 0;
const LAST_KNOWN_GOOD_MAX_AGE_MS = 6 * 3_600_000; // 6 hours

/**
 * Fetches the latest GDELT v2 export, decompresses it, and parses it into
 * events.
 *
 * GDELT's "latest" pointer can briefly reference a file that 404s (the
 * slot hasn't landed yet, or the upstream pipeline is lagging — observed
 * in practice to affect more than one consecutive 15-minute slot at a
 * time). Steps back through earlier slots before giving up, and as a
 * last resort falls back to the most recent successful fetch rather than
 * throwing, as long as it's not too stale.
 */
export async function fetchGdeltExportEvents(): Promise<GdeltEvent[]> {
  const exportUrl = await fetchLatestExportUrl();
  if (!exportUrl) {
    throw new Error("Failed to resolve GDELT export URL");
  }

  const candidates = [exportUrl, ...previousSlotUrls(exportUrl, 6)];
  let lastError: unknown = null;

  for (const url of candidates) {
    try {
      const events = await fetchAndParseZip(url);
      lastKnownGoodEvents = events;
      lastKnownGoodAt = Date.now();
      return events;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastKnownGoodEvents && Date.now() - lastKnownGoodAt < LAST_KNOWN_GOOD_MAX_AGE_MS) {
    return lastKnownGoodEvents;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("GDELT export fetch failed across all recent slots");
}
