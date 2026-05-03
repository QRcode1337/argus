import { NextResponse } from "next/server";
import { normalizeThreatRadar, type ThreatRadarThreat } from "@/lib/ingest/threatradar";

export const dynamic = "force-dynamic";

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
      const cisaData = await cisaRes.json();
      if (cisaData && Array.isArray(cisaData.vulnerabilities)) {
        // Sort by dateAdded descending
        const recentCisa = cisaData.vulnerabilities
          .sort((a: any, b: any) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
          .slice(0, Math.ceil(limit / 2));
        
        recentCisa.forEach((v: any) => {
          threats.push({
            id: v.cveID,
            title: v.vulnerabilityName,
            description: v.shortDescription,
            severity: "critical",
            cve: v.cveID,
            source: "CISA KEV",
            publishedAt: new Date(v.dateAdded).toISOString(),
            tags: ["CISA", "KEV", v.vendorProject, v.product].filter(Boolean),
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
        const otxData = await otxRes.json();
        if (otxData && Array.isArray(otxData.results)) {
          otxData.results.forEach((p: any) => {
            const cveIndicators = (p.indicators || []).filter((i: any) => i.type === "CVE");
            const cve = cveIndicators.length > 0 ? cveIndicators[0].indicator : undefined;
            
            threats.push({
              id: p.id,
              title: p.name,
              description: p.description || p.name,
              severity: "high",
              cve,
              source: p.author_name ? `OTX: ${p.author_name}` : "AlienVault OTX",
              publishedAt: p.modified ? new Date(p.modified).toISOString() : new Date().toISOString(),
              tags: Array.isArray(p.tags) ? p.tags : [],
              iocs: Array.isArray(p.indicators) ? p.indicators.slice(0, 10).map((i: any) => ({
                type: i.type,
                value: i.indicator
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
    return NextResponse.json({ threats: [], total: 0, updatedAt: new Date().toISOString(), error: "All threat sources unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    threats: threats.slice(0, limit),
    total: threats.length,
    updatedAt: new Date().toISOString(),
  });
}
