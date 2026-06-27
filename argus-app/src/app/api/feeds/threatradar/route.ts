import { NextResponse } from "next/server";
import type { ThreatRadarThreat } from "@/lib/ingest/threatradar";
import { reportFeedHealth } from "@/lib/feedHealth";

export const dynamic = "force-dynamic";

type CisaKevVulnerability = {
  cveID?: string;
  vulnerabilityName?: string;
  shortDescription?: string;
  dateAdded?: string;
  vendorProject?: string;
  product?: string;
};

type OtxIndicator = {
  type?: string;
  indicator?: string;
};

type OtxPulse = {
  id?: string;
  name?: string;
  description?: string;
  author_name?: string;
  modified?: string;
  tags?: string[];
  indicators?: OtxIndicator[];
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "15", 10);
  
  const threats: ThreatRadarThreat[] = [];

  // 1. Fetch CISA KEV
  try {
    const cisaRes = await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", {
      next: { revalidate: 3600 },
    });
    if (cisaRes.ok) {
      const cisaData = (await cisaRes.json()) as {
        vulnerabilities?: CisaKevVulnerability[];
      };
      if (Array.isArray(cisaData.vulnerabilities)) {
        // Sort by dateAdded descending
        const recentCisa = cisaData.vulnerabilities
          .sort(
            (a, b) =>
              new Date(b.dateAdded ?? 0).getTime() -
              new Date(a.dateAdded ?? 0).getTime(),
          )
          .slice(0, Math.ceil(limit / 2));

        recentCisa.forEach((v) => {
          threats.push({
            id: v.cveID ?? crypto.randomUUID(),
            title: v.vulnerabilityName ?? "Unnamed vulnerability",
            description: v.shortDescription ?? "",
            severity: "critical",
            cve: v.cveID,
            source: "CISA KEV",
            publishedAt: new Date(v.dateAdded ?? Date.now()).toISOString(),
            tags: ["CISA", "KEV", v.vendorProject, v.product].filter((x): x is string => Boolean(x)),
          });
        });
      }
    }
  } catch (e) {
    console.error("Failed to fetch CISA KEV:", e);
  }

  // 2. Fetch AlienVault OTX Pulses
  const otxKey = process.env.OTX_API_KEY;
  if (otxKey) {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const otxRes = await fetch(`https://otx.alienvault.com/api/v1/pulses/subscribed?limit=${Math.ceil(limit / 2)}&modified_since=${since}`, {
        headers: { "X-OTX-API-KEY": otxKey, "Accept": "application/json" },
        next: { revalidate: 300 },
      });
      if (otxRes.ok) {
        const otxData = (await otxRes.json()) as { results?: OtxPulse[] };
        if (Array.isArray(otxData.results)) {
          otxData.results.forEach((p) => {
            const cveIndicators = (p.indicators ?? []).filter(
              (indicator) => indicator.type === "CVE",
            );
            const cve = cveIndicators.length > 0 ? cveIndicators[0].indicator : undefined;

            threats.push({
              id: p.id ?? crypto.randomUUID(),
              title: p.name ?? "Unnamed pulse",
              description: p.description || p.name || "",
              severity: "high",
              cve,
              source: p.author_name ? `OTX: ${p.author_name}` : "AlienVault OTX",
              publishedAt: p.modified ? new Date(p.modified).toISOString() : new Date().toISOString(),
              tags: Array.isArray(p.tags) ? p.tags : [],
              iocs: Array.isArray(p.indicators) ? p.indicators.slice(0, 10).map((i) => ({
                type: String(i.type ?? ""),
                value: String(i.indicator ?? ""),
              })) : undefined,
            });
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch OTX:", e);
    }
  }

  // Sort combined threats by date
  threats.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (threats.length === 0) {
    await reportFeedHealth("threatradar", "error", "All threat sources unavailable");
    return NextResponse.json({ threats: [], total: 0, updatedAt: new Date().toISOString(), error: "All threat sources unavailable" }, { status: 502 });
  }

  await reportFeedHealth("threatradar", "ok");
  return NextResponse.json({
    threats: threats.slice(0, limit),
    total: threats.length,
    updatedAt: new Date().toISOString(),
  });
}
