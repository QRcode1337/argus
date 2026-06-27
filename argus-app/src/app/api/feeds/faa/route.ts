export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";
import { reportFeedHealth } from "@/lib/feedHealth";

const FAA_STATUS_URL = "https://nasstatus.faa.gov/api/airport-status-information";
const TFR_URL = "https://tfr.faa.gov/tfr2/list.json";

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

const negCache = new NegativeCache<FaaResponse>({
  negativeTtlMs: 3 * 60_000,
  positiveTtlMs: 60_000,
});

function extractXmlTag(block: string, tagName: string): string {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseAirportStatusXml(xml: string): FaaDelay[] {
  const delayTypeBlocks = xml.match(/<Delay_type>[\s\S]*?<\/Delay_type>/gi) ?? [];
  const delays: FaaDelay[] = [];

  for (const block of delayTypeBlocks) {
    const delayType = decodeXmlEntities(extractXmlTag(block, "Name")) || "delay";
    const airportBlocks = block.match(/<Airport>[\s\S]*?<\/Airport>/gi) ?? [];

    for (const airportBlock of airportBlocks) {
      const airport = decodeXmlEntities(
        extractXmlTag(airportBlock, "ARPT") ||
          extractXmlTag(airportBlock, "Airport_Code"),
      );
      if (!airport) continue;

      delays.push({
        airport,
        delayType,
        reason: decodeXmlEntities(extractXmlTag(airportBlock, "Reason")),
        avgDelay: decodeXmlEntities(
          extractXmlTag(airportBlock, "Avg") ||
            extractXmlTag(airportBlock, "Avg_Delay") ||
            extractXmlTag(airportBlock, "Reopen"),
        ),
      });
    }
  }

  return delays;
}

function isLikelyJsonResponse(contentType: string | null, bodyStart: string): boolean {
  return contentType?.includes("application/json") || bodyStart.trim().startsWith("{") || bodyStart.trim().startsWith("[");
}

export async function GET() {
  try {
    const data = await negCache.fetch(async () => {
      const delayRes = await fetch(FAA_STATUS_URL, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/xml, text/xml;q=0.9, application/json;q=0.8" },
      });

      const delays: FaaDelay[] = [];
      if (delayRes.ok) {
        const body = await delayRes.text();
        const contentType = delayRes.headers.get("content-type");

        if (isLikelyJsonResponse(contentType, body)) {
          const json = JSON.parse(body) as { data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
          const entries = Array.isArray(json) ? json : json?.data ?? [];

          for (const entry of entries) {
            const airport = String(entry.airportCode ?? entry.arpt ?? entry.ARPT ?? "");
            const reason = String(entry.reason ?? entry.Reason ?? "");
            const delayType = String(entry.type ?? entry.Type ?? "delay");
            const avgDelay = String(entry.avgDelay ?? entry.Avg ?? "");

            if (airport) {
              delays.push({ airport, delayType, reason, avgDelay });
            }
          }
        } else {
          delays.push(...parseAirportStatusXml(body));
        }
      }

      const notams: Notam[] = [];
      try {
        const tfrRes = await fetch(TFR_URL, {
          signal: AbortSignal.timeout(8_000),
          headers: { Accept: "application/json" },
        });
        if (tfrRes.ok) {
          const body = await tfrRes.text();
          const contentType = tfrRes.headers.get("content-type");
          if (isLikelyJsonResponse(contentType, body)) {
            const tfrJson = JSON.parse(body) as { data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
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

    await reportFeedHealth("faa", "ok");
    return NextResponse.json(data);
  } catch (error) {
    await reportFeedHealth("faa", "error", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { delays: [], notams: [], meta: { fetchedAt: new Date().toISOString(), delayCount: 0, notamCount: 0, error: String(error) } },
      { status: 200 },
    );
  }
}
