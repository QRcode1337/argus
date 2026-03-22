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
