import type { FirmsConfidence, ThermalAnomaly } from "@/types/intel";

type Row = Record<string, string>;

const parseCsv = (text: string): Row[] => {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    if (cells.length < headers.length) continue;
    const row: Row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cells[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
};

const parseFloatOrNull = (value: string | undefined): number | null => {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeConfidence = (raw: string): FirmsConfidence => {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "h" || normalized === "high") return "high";
  if (normalized === "l" || normalized === "low") return "low";
  if (normalized === "n" || normalized === "nominal") return "nominal";
  const num = Number(normalized);
  if (Number.isFinite(num)) {
    if (num >= 80) return "high";
    if (num >= 30) return "nominal";
    return "low";
  }
  return "nominal";
};

const parseAcquired = (date: string, time: string): number => {
  const padded = time.padStart(4, "0");
  const hh = padded.slice(0, 2);
  const mm = padded.slice(2, 4);
  const iso = `${date}T${hh}:${mm}:00Z`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : Date.now();
};

const parseDaynight = (raw: string | undefined): "D" | "N" | null => {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "D") return "D";
  if (v === "N") return "N";
  return null;
};

export function parseFirmsCsv(text: string): ThermalAnomaly[] {
  const rows = parseCsv(text);
  const anomalies: ThermalAnomaly[] = [];

  for (const row of rows) {
    const lat = parseFloatOrNull(row["latitude"]);
    const lon = parseFloatOrNull(row["longitude"]);
    if (lat === null || lon === null) continue;

    const date = row["acq_date"] ?? "";
    const time = row["acq_time"] ?? "";
    if (!date) continue;

    const acquiredAt = parseAcquired(date, time);
    const satellite = row["satellite"] ?? "";
    const instrument = row["instrument"] ?? "VIIRS";
    const brightness =
      parseFloatOrNull(row["bright_ti4"]) ??
      parseFloatOrNull(row["brightness"]) ??
      0;
    const brightnessT31 =
      parseFloatOrNull(row["bright_ti5"]) ??
      parseFloatOrNull(row["bright_t31"]);
    const confidenceRaw = row["confidence"] ?? "";

    anomalies.push({
      id: `firms-${satellite || instrument}-${lat.toFixed(4)}-${lon.toFixed(4)}-${acquiredAt}`,
      latitude: lat,
      longitude: lon,
      brightness,
      brightnessT31,
      scan: parseFloatOrNull(row["scan"]),
      track: parseFloatOrNull(row["track"]),
      acquiredAt,
      satellite,
      instrument,
      confidence: normalizeConfidence(confidenceRaw),
      confidenceRaw,
      frp: parseFloatOrNull(row["frp"]),
      daynight: parseDaynight(row["daynight"]),
      version: row["version"] ?? null,
    });
  }

  return anomalies;
}

export async function fetchFirmsAnomalies(endpoint: string): Promise<ThermalAnomaly[]> {
  const response = await fetch(endpoint, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`FIRMS HTTP ${response.status}`);
  }

  const json = (await response.json()) as { anomalies?: ThermalAnomaly[] };
  return json.anomalies ?? [];
}
