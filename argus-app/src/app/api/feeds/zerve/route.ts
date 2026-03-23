import { NextResponse } from "next/server";

/**
 * POST /api/feeds/zerve
 *
 * Receives geospatial analysis results from Zerve notebooks/API
 * and formats them as IntelAlerts for ingestion into PNEUMA's memory.
 *
 * Expected payload from Zerve:
 * {
 *   "analysis_type": "cluster" | "proximity" | "anomaly" | "trend",
 *   "region": string,
 *   "findings": [
 *     {
 *       "title": string,
 *       "detail": string,
 *       "severity": "INFO" | "WARNING" | "CRITICAL",
 *       "lat": number,
 *       "lon": number,
 *       "confidence": number,  // 0-1
 *       "metadata": Record<string, any>
 *     }
 *   ],
 *   "timestamp": string,       // ISO 8601
 *   "notebook_id": string      // Zerve notebook that produced this
 * }
 */

export interface ZerveAnalysisPayload {
  analysis_type: "cluster" | "proximity" | "anomaly" | "trend";
  region: string;
  findings: ZerveFinding[];
  timestamp: string;
  notebook_id: string;
}

export interface ZerveFinding {
  title: string;
  detail: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  lat: number;
  lon: number;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    const payload: ZerveAnalysisPayload = await req.json();

    if (!payload.findings || !Array.isArray(payload.findings)) {
      return NextResponse.json(
        { error: "findings array required" },
        { status: 400 },
      );
    }

    // Convert Zerve findings to IntelAlert-compatible format
    const alerts = payload.findings.map((finding, i) => ({
      id: `zerve-${payload.notebook_id}-${Date.now()}-${i}`,
      severity: finding.severity,
      category: "ZERVE" as const,
      title: `[${payload.analysis_type.toUpperCase()}] ${finding.title}`,
      detail: `${finding.detail} (confidence: ${(finding.confidence * 100).toFixed(1)}%, region: ${payload.region})`,
      timestamp: new Date(payload.timestamp).getTime(),
      coordinates: { lat: finding.lat, lon: finding.lon },
      metadata: {
        ...finding.metadata,
        zerve_notebook: payload.notebook_id,
        analysis_type: payload.analysis_type,
        confidence: finding.confidence,
      },
    }));

    return NextResponse.json({
      ingested: alerts.length,
      alerts,
      source: "zerve",
      notebook_id: payload.notebook_id,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    description: "Zerve geospatial analysis ingestion endpoint",
    accepts: "POST with ZerveAnalysisPayload",
  });
}
