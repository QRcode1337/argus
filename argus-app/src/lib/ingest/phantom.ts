import type { TrackedFlight, EarthquakeFeature } from "@/types/intel";
import type { PhantomAnomaly } from "@/lib/intel/analysisEngine";

interface PhantomAnomalyResponse {
  anomalies: PhantomAnomaly[];
  processing_time_ms: number;
}

export async function sendFlightsToPhantom(
  phantomUrl: string,
  flights: TrackedFlight[],
): Promise<PhantomAnomaly[]> {
  const body = {
    flights: flights.map((f) => ({
      flight_id: f.id,
      callsign: f.callsign,
      lat: f.latitude,
      lon: f.longitude,
      altitude: f.altitudeMeters,
      velocity: f.velocity,
      timestamp: Date.now() / 1000,
    })),
  };

  const res = await fetch(`${phantomUrl}/api/anomalies/flight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`Phantom flight: ${res.status}`);
  const data: PhantomAnomalyResponse = await res.json();
  return data.anomalies;
}

export async function sendSeismicToPhantom(
  phantomUrl: string,
  quakes: EarthquakeFeature[],
): Promise<PhantomAnomaly[]> {
  const body = {
    events: quakes.map((q) => ({
      id: q.id,
      lat: q.latitude,
      lon: q.longitude,
      magnitude: q.magnitude,
      depth_km: q.depthKm,
      timestamp: q.timestamp / 1000,
    })),
  };

  const res = await fetch(`${phantomUrl}/api/anomalies/seismic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`Phantom seismic: ${res.status}`);
  const data: PhantomAnomalyResponse = await res.json();
  return data.anomalies;
}

export async function checkPhantomHealth(phantomUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${phantomUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Forward a Phantom anomaly (if high-signal) to ARGUS API intake.
 * This triggers DB persistence + ATHENA Action Packet generation for qualifying events.
 * Non-blocking and best-effort (failures are silent; ATHENA is advisory).
 */
export async function reportPhantomAnomalyToAthena(anomaly: PhantomAnomaly): Promise<void> {
  const severityLower = String(anomaly.severity || "").toLowerCase();
  const chaos = Number(anomaly.chaos_score || 0);
  const isHighSignal =
    severityLower === "high" || severityLower === "critical" || chaos >= 0.75;
  if (!isHighSignal) return;

  try {
    await fetch("/api/feeds/anomalies/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: anomaly.anomaly_type,
        chaosScore: chaos,
        lat: anomaly.lat,
        lon: anomaly.lon,
        severity: severityLower,
        payload: {
          entity_id: anomaly.entity_id,
          detail: anomaly.detail,
          detected_at: anomaly.detected_at,
        },
      }),
      // short timeout; do not block UI
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Swallow: collection/ATHENA is best-effort
  }
}
