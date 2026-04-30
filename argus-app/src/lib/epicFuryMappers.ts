import type { GdeltEvent } from "@/types/gdelt";
import type { MilitaryFlight, EarthquakeFeature } from "@/types/intel";
import type { AisVessel } from "@/types/vessel";
import { isInEpicFuryTheater, type EpicFuryIncident, type Severity } from "@/store/useEpicFuryStore";

// GDELT v2 DATEADDED is YYYYMMDDHHMMSS in UTC, which Date.parse does not recognize.
const parseGdeltDateAdded = (ts: string): number => {
  if (!/^\d{14}$/.test(ts)) return Date.now();
  const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
};

export function mapGdeltIncidents(events: GdeltEvent[]): EpicFuryIncident[] {
  return events
    .filter(
      (e) =>
        e.latitude !== 0 &&
        e.longitude !== 0 &&
        isInEpicFuryTheater(e.latitude, e.longitude),
    )
    .map((e) => {
      let severity: Severity = "medium";
      if (e.quadClass === 4) severity = "critical";
      else if (e.quadClass === 3) severity = "high";

      return {
        type: "gdelt" as const,
        id: e.id,
        lat: e.latitude,
        lon: e.longitude,
        timestamp: parseGdeltDateAdded(e.dateAdded),
        title: e.actionGeoName || "Unknown Location",
        severity,
        detail: `${e.actor1Name || "?"} → ${e.actor2Name || "?"} | ${e.eventCode}`,
        source: "GDELT",
      };
    });
}

export function mapMilitaryIncidents(flights: MilitaryFlight[]): EpicFuryIncident[] {
  return flights
    .filter((f) => isInEpicFuryTheater(f.latitude, f.longitude))
    .map((f) => ({
      type: "military" as const,
      id: `mil-${f.id}`,
      lat: f.latitude,
      lon: f.longitude,
      timestamp: Date.now(),
      title: f.callsign,
      severity: "medium" as const,
      detail: f.type || "Unknown aircraft",
      source: "ADSB",
    }));
}

export function mapVesselIncidents(vessels: AisVessel[]): EpicFuryIncident[] {
  return vessels
    .filter((v) => isInEpicFuryTheater(v.lat, v.lon))
    .map((v) => ({
      type: "vessel" as const,
      id: `ais-${v.mmsi}`,
      lat: v.lat,
      lon: v.lon,
      timestamp: Date.parse(v.timestamp) || Date.now(),
      title: v.vesselName || `MMSI ${v.mmsi}`,
      severity: "low" as const,
      detail: `SOG: ${v.sog}kn, HDG: ${v.heading}°`,
      source: "AIS",
    }));
}

export function mapSeismicIncidents(quakes: EarthquakeFeature[]): EpicFuryIncident[] {
  return quakes
    .filter((q) => isInEpicFuryTheater(q.latitude, q.longitude))
    .map((q) => {
      let severity: Severity = "low";
      if (q.magnitude >= 6) severity = "critical";
      else if (q.magnitude >= 4.5) severity = "high";
      else if (q.magnitude >= 3) severity = "medium";

      return {
        type: "seismic" as const,
        id: `usgs-${q.id}`,
        lat: q.latitude,
        lon: q.longitude,
        timestamp: q.timestamp,
        title: q.place || "Unknown Location",
        severity,
        detail: `M${q.magnitude.toFixed(1)} at ${q.depthKm}km depth`,
        source: "USGS",
      };
    });
}
