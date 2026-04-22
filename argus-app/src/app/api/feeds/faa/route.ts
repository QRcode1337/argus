export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";

const FAA_STATUS_URL = "https://nasstatus.faa.gov/api/airport-status-information";

interface FaaDelay {
  airport: string;
  delayType: string;
  reason: string;
  avgDelay: string;
}

interface Notam {
  id: string;
  location: string;
  type: string;
  effectiveStart: string;
  effectiveEnd: string;
  description: string;
}

interface FaaResponse {
  delays: FaaDelay[];
  notams: Notam[];
  meta: { fetchedAt: string; delayCount: number; notamCount: number };
}

const negCache = new NegativeCache<FaaResponse>({ negativeTtlMs: 3 * 60_000 });

export async function GET() {
  try {
    const data = await negCache.fetch(async () => {
      const delayRes = await fetch(FAA_STATUS_URL, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });

      const delays: FaaDelay[] = [];
      if (delayRes.ok) {
        const json = await delayRes.json();
        const entries = Array.isArray(json) ? json : json?.data ?? [];

        for (const entry of entries) {
          const airport = entry.airportCode ?? entry.arpt ?? entry.ARPT ?? "";
          const reason = entry.reason ?? entry.Reason ?? "";
          const delayType = entry.type ?? entry.Type ?? "delay";
          const avgDelay = entry.avgDelay ?? entry.Avg ?? "";

          if (airport) {
            delays.push({ airport, delayType, reason, avgDelay: String(avgDelay) });
          }
        }
      }

      const notams: Notam[] = [];
      try {
        const tfrRes = await fetch("https://tfr.faa.gov/tfr2/list.json", {
          signal: AbortSignal.timeout(8_000),
          headers: { Accept: "application/json" },
        });
        if (tfrRes.ok) {
          const tfrJson = await tfrRes.json();
          const tfrList = Array.isArray(tfrJson) ? tfrJson : tfrJson?.data ?? [];
          for (const tfr of tfrList.slice(0, 30)) {
            notams.push({
              id: String(tfr.notamNumber ?? tfr.id ?? ""),
              location: String(tfr.facility ?? tfr.location ?? ""),
              type: "TFR",
              effectiveStart: String(tfr.effectiveDate ?? tfr.startDate ?? ""),
              effectiveEnd: String(tfr.expireDate ?? tfr.endDate ?? ""),
              description: String(tfr.description ?? tfr.comment ?? ""),
            });
          }
        }
      } catch {
        // TFR endpoint is optional
      }

      return {
        delays,
        notams,
        meta: { fetchedAt: new Date().toISOString(), delayCount: delays.length, notamCount: notams.length },
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { delays: [], notams: [], meta: { fetchedAt: new Date().toISOString(), delayCount: 0, notamCount: 0, error: String(error) } },
      { status: 200 },
    );
  }
}
