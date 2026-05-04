import { NextResponse } from "next/server";

import { NegativeCache } from "@/lib/cache/negativeCache";
import { parseFirmsCsv } from "@/lib/ingest/firms";
import type { ThermalAnomaly } from "@/types/intel";

export const dynamic = "force-dynamic";

const FIRMS_ENDPOINT =
  process.env.FIRMS_ENDPOINT ??
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv";

const MAX_ANOMALIES = Number(process.env.FIRMS_MAX ?? 4000);

interface FirmsResponse {
  anomalies: ThermalAnomaly[];
  meta: { fetchedAt: string; count: number; source: string };
}

const negCache = new NegativeCache<FirmsResponse>({
  negativeTtlMs: 5 * 60_000,
  positiveTtlMs: 5 * 60_000,
});

export async function GET() {
  try {
    const data = await negCache.fetch(async () => {
      const res = await fetch(FIRMS_ENDPOINT, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: "text/csv,*/*" },
      });

      if (!res.ok) {
        throw new Error(`FIRMS upstream ${res.status}`);
      }

      const csv = await res.text();
      const parsed = parseFirmsCsv(csv);
      parsed.sort((a, b) => b.brightness - a.brightness);
      const anomalies = parsed.slice(0, MAX_ANOMALIES);

      return {
        anomalies,
        meta: {
          fetchedAt: new Date().toISOString(),
          count: anomalies.length,
          source: FIRMS_ENDPOINT,
        },
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        anomalies: [],
        meta: {
          fetchedAt: new Date().toISOString(),
          count: 0,
          source: FIRMS_ENDPOINT,
          error: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 200 },
    );
  }
}
