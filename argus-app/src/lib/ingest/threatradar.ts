export interface ThreatRadarThreat {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  cve?: string;
  source: string;
  publishedAt: string;
  tags: string[];
  iocs?: { type: string; value: string }[];
}

export interface ThreatRadarResponse {
  threats: ThreatRadarThreat[];
  total: number;
  updatedAt: string;
}

export function normalizeThreatRadar(raw: unknown): ThreatRadarResponse {
  const data = raw as Record<string, unknown>;
  const threats = Array.isArray(data.threats) ? data.threats : Array.isArray(data.data) ? data.data : [];
  return {
    threats: threats.map((t: Record<string, unknown>) => ({
      id: String(t.id ?? t._id ?? ""),
      title: String(t.title ?? t.name ?? "Unknown Threat"),
      description: String(t.description ?? t.summary ?? ""),
      severity: normalizeSeverity(String(t.severity ?? t.risk ?? "info")),
      cve: t.cve ? String(t.cve) : undefined,
      source: String(t.source ?? "ThreatRadar"),
      publishedAt: String(t.publishedAt ?? t.published ?? t.created ?? new Date().toISOString()),
      tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
      iocs: Array.isArray(t.iocs) ? t.iocs : undefined,
    })),
    total: Number(data.total ?? threats.length),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSeverity(s: string): ThreatRadarThreat["severity"] {
  const low = s.toLowerCase();
  if (low === "critical") return "critical";
  if (low === "high") return "high";
  if (low === "medium" || low === "moderate") return "medium";
  if (low === "low") return "low";
  return "info";
}
