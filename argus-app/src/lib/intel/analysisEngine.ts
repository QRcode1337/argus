import type { MilitaryFlight, TrackedFlight } from "@/types/intel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AlertCategory = "FLIGHT" | "MILITARY" | "SATELLITE" | "SEISMIC" | "CAMERA" | "PHANTOM" | "ZERVE";
export type ThreatLevel = "GREEN" | "AMBER" | "RED";

export interface IntelAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string;
  timestamp: number;
  coordinates?: { lat: number; lon: number };
  entityId?: string;
}

export interface IntelBriefing {
  timestamp: number;
  threatLevel: ThreatLevel;
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  alerts: IntelAlert[];
  summary: string;
  riskScore?: number;
  dominantCategories?: AlertCategory[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMERGENCY_SQUAWKS: Record<string, string> = {
  "7500": "HIJACKING",
  "7600": "COMMS FAILURE",
  "7700": "GENERAL EMERGENCY",
};

const COMMERCIAL_SPEED_THRESHOLD_MPS = 300;
const EXTREME_DESCENT_RATE_MPS = 20;
const MILITARY_FORMATION_RADIUS_KM = 200;
const MILITARY_FORMATION_THRESHOLD = 5;
const CIVILIAN_AIRPORT_PROXIMITY_KM = 50;

/** Major civilian airport coordinates for intercept-zone detection. */
const MAJOR_AIRPORTS: { name: string; lat: number; lon: number }[] = [
  { name: "KJFK", lat: 40.6413, lon: -73.7781 },
  { name: "KLAX", lat: 33.9416, lon: -118.4085 },
  { name: "EGLL", lat: 51.47, lon: -0.4543 },
  { name: "LFPG", lat: 49.0097, lon: 2.5479 },
  { name: "VHHH", lat: 22.308, lon: 113.9185 },
  { name: "RJTT", lat: 35.5494, lon: 139.7798 },
  { name: "EDDF", lat: 50.0379, lon: 8.5622 },
  { name: "OMDB", lat: 25.2532, lon: 55.3657 },
  { name: "LEMD", lat: 40.4983, lon: -3.5676 },
  { name: "YSSY", lat: -33.9461, lon: 151.1772 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let alertCounter = 0;
const nextAlertId = (): string => `alert-${Date.now()}-${++alertCounter}`;

/** Haversine distance in kilometres between two lat/lon points. */
const haversineKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Round lat/lon to a grid square key (1-degree grid). */
const toGridKey = (lat: number, lon: number): string =>
  `${Math.floor(lat)},${Math.floor(lon)}`;

// ---------------------------------------------------------------------------
// Flight Analysis
// ---------------------------------------------------------------------------

export function analyzeFlights(flights: TrackedFlight[]): IntelAlert[] {
  const now = Date.now();
  const alerts: IntelAlert[] = [];

  // Track grid density for congestion detection
  const gridCounts = new Map<string, number>();

  for (const flight of flights) {
    if (flight.onGround) continue;

    const coords = { lat: flight.latitude, lon: flight.longitude };

    // Emergency squawk codes
    if (flight.squawk && EMERGENCY_SQUAWKS[flight.squawk]) {
      alerts.push({
        id: nextAlertId(),
        severity: "CRITICAL",
        category: "FLIGHT",
        title: `SQUAWK ${flight.squawk} \u2014 ${EMERGENCY_SQUAWKS[flight.squawk]}`,
        detail: `${flight.callsign} broadcasting emergency squawk ${flight.squawk} (${EMERGENCY_SQUAWKS[flight.squawk]}) at FL${Math.round(flight.altitudeMeters / 30.48).toString().padStart(3, "0")} over ${flight.originCountry}`,
        timestamp: now,
        coordinates: coords,
        entityId: `flight-${flight.id}`,
      });
    }

    // High speed anomaly
    if (flight.velocity > COMMERCIAL_SPEED_THRESHOLD_MPS) {
      alerts.push({
        id: nextAlertId(),
        severity: "WARNING",
        category: "FLIGHT",
        title: "ANOMALOUS VELOCITY DETECTED",
        detail: `${flight.callsign} at ${Math.round(flight.velocity)} m/s (${Math.round(flight.velocity * 1.944)} kt) \u2014 exceeds commercial threshold. Alt: ${Math.round(flight.altitudeMeters)}m`,
        timestamp: now,
        coordinates: coords,
        entityId: `flight-${flight.id}`,
      });
    }

    // No callsign (potential ghost flight)
    if (!flight.callsign || flight.callsign === flight.id.toUpperCase()) {
      alerts.push({
        id: nextAlertId(),
        severity: "INFO",
        category: "FLIGHT",
        title: "UNIDENTIFIED CALLSIGN",
        detail: `ICAO ${flight.id} transmitting without valid callsign at ${Math.round(flight.altitudeMeters)}m, track ${Math.round(flight.trueTrack)}\u00B0`,
        timestamp: now,
        coordinates: coords,
        entityId: `flight-${flight.id}`,
      });
    }

    // Extreme vertical rate (rapid descent/climb)
    if (
      flight.verticalRate !== null &&
      Math.abs(flight.verticalRate) > EXTREME_DESCENT_RATE_MPS
    ) {
      const direction = flight.verticalRate < 0 ? "DESCENT" : "CLIMB";
      alerts.push({
        id: nextAlertId(),
        severity: "WARNING",
        category: "FLIGHT",
        title: `EXTREME ${direction} RATE`,
        detail: `${flight.callsign} ${direction.toLowerCase()}ing at ${Math.round(Math.abs(flight.verticalRate))} m/s (${Math.round(Math.abs(flight.verticalRate) * 196.85)} fpm) \u2014 Alt: ${Math.round(flight.altitudeMeters)}m`,
        timestamp: now,
        coordinates: coords,
        entityId: `flight-${flight.id}`,
      });
    }

    // Grid density tracking
    const key = toGridKey(flight.latitude, flight.longitude);
    gridCounts.set(key, (gridCounts.get(key) ?? 0) + 1);
  }

  // Congestion detection (>50 aircraft per 1-degree grid square)
  for (const [key, count] of gridCounts) {
    if (count > 50) {
      const [latStr, lonStr] = key.split(",");
      alerts.push({
        id: nextAlertId(),
        severity: "INFO",
        category: "FLIGHT",
        title: "HIGH-DENSITY AIRSPACE",
        detail: `${count} aircraft concentrated in grid sector [${latStr}\u00B0, ${lonStr}\u00B0] \u2014 potential congestion zone`,
        timestamp: now,
        coordinates: {
          lat: Number(latStr) + 0.5,
          lon: Number(lonStr) + 0.5,
        },
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Military Analysis
// ---------------------------------------------------------------------------

export function analyzeMilitary(flights: MilitaryFlight[]): IntelAlert[] {
  const now = Date.now();
  const alerts: IntelAlert[] = [];

  // Region clustering: group by 2-degree grid squares
  const regionMap = new Map<string, MilitaryFlight[]>();
  for (const flight of flights) {
    const key = `${Math.floor(flight.latitude / 2) * 2},${Math.floor(flight.longitude / 2) * 2}`;
    const list = regionMap.get(key) ?? [];
    list.push(flight);
    regionMap.set(key, list);
  }

  // Formation detection via regional clustering
  for (const [key, group] of regionMap) {
    if (group.length >= MILITARY_FORMATION_THRESHOLD) {
      // Verify they are actually within formation radius of each other
      const center = group[0];
      const withinRadius = group.filter(
        (f) =>
          haversineKm(center.latitude, center.longitude, f.latitude, f.longitude) <
          MILITARY_FORMATION_RADIUS_KM,
      );

      if (withinRadius.length >= MILITARY_FORMATION_THRESHOLD) {
        const [latStr, lonStr] = key.split(",");
        const callsigns = withinRadius
          .slice(0, 5)
          .map((f) => f.callsign)
          .join(", ");
        alerts.push({
          id: nextAlertId(),
          severity: "WARNING",
          category: "MILITARY",
          title: "FORMATION DETECTED",
          detail: `${withinRadius.length} military aircraft within ${MILITARY_FORMATION_RADIUS_KM}km radius near [${latStr}\u00B0, ${lonStr}\u00B0]: ${callsigns}${withinRadius.length > 5 ? "..." : ""}`,
          timestamp: now,
          coordinates: {
            lat: Number(latStr) + 1,
            lon: Number(lonStr) + 1,
          },
        });
      }
    }
  }

  // Per-aircraft analysis
  for (const flight of flights) {
    const coords = { lat: flight.latitude, lon: flight.longitude };

    // Unidentified aircraft type
    if (!flight.type) {
      alerts.push({
        id: nextAlertId(),
        severity: "INFO",
        category: "MILITARY",
        title: "UNIDENTIFIED MILITARY AIRCRAFT",
        detail: `${flight.callsign} (hex: ${flight.id}) \u2014 no ICAO type designator. Alt: ${Math.round(flight.altitudeMeters)}m, Spd: ${Math.round(flight.velocity)} m/s`,
        timestamp: now,
        coordinates: coords,
        entityId: `mil-${flight.id}`,
      });
    }

    // Proximity to civilian airports
    for (const airport of MAJOR_AIRPORTS) {
      const distance = haversineKm(
        flight.latitude,
        flight.longitude,
        airport.lat,
        airport.lon,
      );
      if (distance < CIVILIAN_AIRPORT_PROXIMITY_KM) {
        alerts.push({
          id: nextAlertId(),
          severity: "WARNING",
          category: "MILITARY",
          title: "INTERCEPT ZONE \u2014 CIVILIAN PROXIMITY",
          detail: `${flight.callsign} operating ${Math.round(distance)}km from ${airport.name}. Alt: ${Math.round(flight.altitudeMeters)}m`,
          timestamp: now,
          coordinates: coords,
          entityId: `mil-${flight.id}`,
        });
        break; // One alert per aircraft is sufficient
      }
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Satellite Analysis
// ---------------------------------------------------------------------------

let previousSatelliteCount: number | null = null;

export function analyzeSatellites(count: number): IntelAlert[] {
  const now = Date.now();
  const alerts: IntelAlert[] = [];

  if (previousSatelliteCount !== null && previousSatelliteCount > 0) {
    const delta = previousSatelliteCount - count;
    const dropPercent = (delta / previousSatelliteCount) * 100;

    if (dropPercent > 10) {
      alerts.push({
        id: nextAlertId(),
        severity: "WARNING",
        category: "SATELLITE",
        title: "SATELLITE TRACKING LOSS",
        detail: `Tracking ${count} satellites, down from ${previousSatelliteCount} (\u2212${delta}, ${dropPercent.toFixed(1)}% drop). Possible orbital debris event or TLE propagation failure`,
        timestamp: now,
      });
    }
  }

  if (count > 0) {
    alerts.push({
      id: nextAlertId(),
      severity: "INFO",
      category: "SATELLITE",
      title: "CONSTELLATION STATUS",
      detail: `Tracking ${count} orbital objects. TLE propagation nominal`,
      timestamp: now,
    });
  }

  previousSatelliteCount = count;
  return alerts;
}

// ---------------------------------------------------------------------------
// Seismic Analysis
// ---------------------------------------------------------------------------

const seismicHistory: { count: number; timestamp: number }[] = [];

export function analyzeSeismic(count: number): IntelAlert[] {
  const now = Date.now();
  const alerts: IntelAlert[] = [];

  seismicHistory.push({ count, timestamp: now });

  // Keep only last 24 hours of history
  const cutoff = now - 24 * 60 * 60 * 1000;
  while (seismicHistory.length > 0 && seismicHistory[0].timestamp < cutoff) {
    seismicHistory.shift();
  }

  // Swarm detection: if count spikes above baseline
  if (seismicHistory.length >= 3) {
    const baseline =
      seismicHistory.slice(0, -1).reduce((sum, entry) => sum + entry.count, 0) /
      (seismicHistory.length - 1);

    if (count > baseline * 1.5 && count > 10) {
      alerts.push({
        id: nextAlertId(),
        severity: "WARNING",
        category: "SEISMIC",
        title: "SEISMIC SWARM DETECTED",
        detail: `${count} events reported vs ${Math.round(baseline)} baseline (24h). Elevated seismic activity \u2014 monitor for escalation`,
        timestamp: now,
      });
    }
  }

  if (count > 0) {
    alerts.push({
      id: nextAlertId(),
      severity: "INFO",
      category: "SEISMIC",
      title: "SEISMIC ACTIVITY SUMMARY",
      detail: `${count} seismic events in past 24h. USGS feed nominal`,
      timestamp: now,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Phantom Anomaly Analysis
// ---------------------------------------------------------------------------

export interface PhantomAnomaly {
  entity_id: string;
  anomaly_type: string;
  chaos_score: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  lat: number;
  lon: number;
  detail: string;
  detected_at: string;
}

const PHANTOM_SEVERITY_MAP: Record<string, AlertSeverity> = {
  Critical: "CRITICAL",
  High: "WARNING",
  Medium: "WARNING",
  Low: "INFO",
};

// ---------------------------------------------------------------------------
// Unified Anomaly Taxonomy
// ---------------------------------------------------------------------------

export type AnomalySourceEngine = "PHANTOM" | "ZERVE";

export type PhantomSubType =
  | "trajectory_chaos"
  | "anomalous_velocity"
  | "extreme_climb"
  | "extreme_descent";

export type ZerveSubType = "cluster" | "proximity" | "trend";

export type AnomalySubType = PhantomSubType | ZerveSubType;

export type ConfidenceTier = "high" | "moderate" | "low";

export interface UnifiedAnomaly {
  entity_id: string;
  source_engine: AnomalySourceEngine;
  anomaly_type: AnomalySubType;
  chaos_score: number;
  confidence: number;
  confidence_tier: ConfidenceTier;
  severity: "Critical" | "High" | "Medium" | "Low";
  importance: "important" | "routine";
  lat: number;
  lon: number;
  detail: string;
  detected_at: string;
  context: "anomaly";
}

/** Compute confidence tier from a 0-1 confidence score. Returns null if below threshold (filtered). */
export function getConfidenceTier(confidence: number): ConfidenceTier | null {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "moderate";
  if (confidence >= 0.5) return "low";
  return null; // Below 0.5: filtered out
}

/** Determine importance flag: "important" if severity is Critical/High OR chaos_score >= 0.70 */
export function getImportance(
  severity: UnifiedAnomaly["severity"],
  chaosScore: number,
): "important" | "routine" {
  if (severity === "Critical" || severity === "High") return "important";
  if (chaosScore >= 0.70) return "important";
  return "routine";
}

/** Convert a PhantomAnomaly to the unified taxonomy format. */
export function toUnifiedAnomaly(
  phantom: PhantomAnomaly,
  confidence: number = 0.8,
): UnifiedAnomaly | null {
  const tier = getConfidenceTier(confidence);
  if (!tier) return null; // Filtered: below 0.5

  return {
    entity_id: phantom.entity_id,
    source_engine: "PHANTOM",
    anomaly_type: phantom.anomaly_type as PhantomSubType,
    chaos_score: phantom.chaos_score,
    confidence,
    confidence_tier: tier,
    severity: phantom.severity,
    importance: getImportance(phantom.severity, phantom.chaos_score),
    lat: phantom.lat,
    lon: phantom.lon,
    detail: phantom.detail,
    detected_at: phantom.detected_at,
    context: "anomaly",
  };
}

export function analyzePhantomResults(anomalies: PhantomAnomaly[]): IntelAlert[] {
  const now = Date.now();
  return anomalies.map((a) => ({
    id: nextAlertId(),
    severity: PHANTOM_SEVERITY_MAP[a.severity] ?? "INFO",
    category: "PHANTOM" as AlertCategory,
    title: `CHAOS ANOMALY — ${a.anomaly_type.toUpperCase().replace(/_/g, " ")}`,
    detail: a.detail,
    timestamp: now,
    coordinates: { lat: a.lat, lon: a.lon },
    entityId: a.entity_id,
  }));
}

export function analyzeZerveResults(anomalies: UnifiedAnomaly[]): IntelAlert[] {
  const now = Date.now();
  return anomalies
    .filter((a) => a.source_engine === "ZERVE")
    .map((a) => ({
      id: nextAlertId(),
      severity: PHANTOM_SEVERITY_MAP[a.severity] ?? ("INFO" as AlertSeverity),
      category: "ZERVE" as AlertCategory,
      title: `SPATIAL ANOMALY — ${a.anomaly_type.toUpperCase()}`,
      detail: `${a.detail} [confidence: ${a.confidence_tier}, importance: ${a.importance}]`,
      timestamp: now,
      coordinates: { lat: a.lat, lon: a.lon },
      entityId: a.entity_id,
    }));
}

// ---------------------------------------------------------------------------
// Briefing Generator
// ---------------------------------------------------------------------------

export function generateBriefing(alerts: IntelAlert[]): IntelBriefing {
  const now = Date.now();

  // Deduplicate near-identical alerts in the same minute window.
  const deduped = Array.from(
    new Map(
      alerts.map((a) => {
        const minuteBucket = Math.floor(a.timestamp / 60000);
        const key = `${a.severity}|${a.category}|${a.title}|${a.entityId ?? "none"}|${minuteBucket}`;
        return [key, a] as const;
      }),
    ).values(),
  );

  const criticalCount = deduped.filter((a) => a.severity === "CRITICAL").length;
  const warningCount = deduped.filter((a) => a.severity === "WARNING").length;
  const infoCount = deduped.filter((a) => a.severity === "INFO").length;

  const severityWeight: Record<AlertSeverity, number> = {
    CRITICAL: 15,
    WARNING: 6,
    INFO: 1,
  };
  const categoryWeight: Record<AlertCategory, number> = {
    FLIGHT: 1.0,
    MILITARY: 1.2,
    SATELLITE: 0.8,
    SEISMIC: 1.1,
    CAMERA: 0.7,
    PHANTOM: 1.3,
    ZERVE: 1.1,
  };

  const riskScore = Math.round(
    deduped.reduce((sum, a) => sum + severityWeight[a.severity] * categoryWeight[a.category], 0),
  );

  let threatLevel: ThreatLevel = "GREEN";
  if (criticalCount >= 2 || riskScore >= 45) {
    threatLevel = "RED";
  } else if (criticalCount > 0 || warningCount >= 4 || riskScore >= 18) {
    threatLevel = "AMBER";
  }

  // Sort: CRITICAL first, then WARNING, then INFO; newest first within each tier
  const sorted = [...deduped].sort((a, b) => {
    const severityOrder: Record<AlertSeverity, number> = {
      CRITICAL: 0,
      WARNING: 1,
      INFO: 2,
    };
    const sev = severityOrder[a.severity] - severityOrder[b.severity];
    if (sev !== 0) return sev;
    return b.timestamp - a.timestamp;
  });

  const categoryCounts = new Map<AlertCategory, number>();
  for (const alert of deduped) {
    categoryCounts.set(alert.category, (categoryCounts.get(alert.category) ?? 0) + 1);
  }
  const dominantCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([category]) => category);

  const summary = `${criticalCount} CRITICAL, ${warningCount} WARNING, ${infoCount} INFO \u2014 ${threatLevel} threat level (risk ${riskScore})`;

  return {
    timestamp: now,
    threatLevel,
    totalAlerts: deduped.length,
    criticalCount,
    warningCount,
    infoCount,
    alerts: sorted,
    summary,
    riskScore,
    dominantCategories,
  };
}
