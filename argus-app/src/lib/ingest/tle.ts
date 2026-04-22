import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from "satellite.js";

import type { SatellitePosition, SatelliteRecord, OrbitType, RcsSize } from "@/types/intel";

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

interface GpJsonRecord {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  TLE_LINE1: string;
  TLE_LINE2: string;
  OBJECT_TYPE: string | null;
  COUNTRY_CODE: string | null;
  LAUNCH_DATE: string | null;
  SITE: string | null;
  RCS_SIZE: string | null;
  PERIOD: number | null;
  INCLINATION: number | null;
  APOAPSIS: number | null;
  PERIAPSIS: number | null;
  DECAY_DATE: string | null;
}

function deriveOrbitType(periodMinutes: number | null): OrbitType {
  if (periodMinutes === null) return "Unknown";
  if (periodMinutes < 128) return "LEO";
  if (periodMinutes >= 1400 && periodMinutes <= 1500) return "GEO";
  if (periodMinutes <= 720) return "MEO";
  return "HEO";
}

function normalizeRcsSize(raw: string | null): RcsSize {
  if (!raw) return "Unknown";
  const upper = raw.toUpperCase();
  if (upper === "SMALL" || upper === "MEDIUM" || upper === "LARGE") return upper;
  return "Unknown";
}

export async function fetchTleRecords(endpoint: string): Promise<SatelliteRecord[]> {
  const response = await fetch(endpoint, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`CelesTrak HTTP ${response.status}`);
  }

  const json = (await response.json()) as GpJsonRecord[];

  return json
    .filter((gp) => gp.TLE_LINE1 && gp.TLE_LINE2)
    .map((gp) => ({
      id: String(gp.NORAD_CAT_ID),
      name: gp.OBJECT_NAME,
      tle1: gp.TLE_LINE1,
      tle2: gp.TLE_LINE2,
      metadata: {
        objectType: gp.OBJECT_TYPE,
        countryCode: gp.COUNTRY_CODE,
        launchDate: gp.LAUNCH_DATE,
        launchSite: gp.SITE,
        rcsSize: normalizeRcsSize(gp.RCS_SIZE),
        periodMinutes: gp.PERIOD,
        inclinationDeg: gp.INCLINATION,
        apogeeKm: gp.APOAPSIS,
        perigeeKm: gp.PERIAPSIS,
        decayDate: gp.DECAY_DATE,
        orbitType: deriveOrbitType(gp.PERIOD),
      },
    }));
}

export function computeSatellitePositions(
  records: SatelliteRecord[],
  at: Date,
): SatellitePosition[] {
  const gmst = gstime(at);

  return records
    .map((record) => {
      const satrec = twoline2satrec(record.tle1, record.tle2);
      const propagated = propagate(satrec, at);
      if (!propagated || !propagated.position) {
        return null;
      }

      const geodetic = eciToGeodetic(propagated.position, gmst);
      const lat = degreesLat(geodetic.latitude);
      const lon = degreesLong(geodetic.longitude);
      const alt = geodetic.height;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) {
        return null;
      }
      return {
        id: record.id,
        name: record.name,
        latitude: lat,
        longitude: lon,
        altitudeKm: alt,
      };
    })
    .filter((sat): sat is SatellitePosition => sat !== null);
}

export function computeOrbitTrack(
  record: SatelliteRecord,
  at: Date,
  samples: number,
  stepMinutes: number,
): [number, number, number][] {
  const satrec = twoline2satrec(record.tle1, record.tle2);
  const points: [number, number, number][] = [];

  const half = Math.floor(samples / 2);
  for (let i = -half; i <= half; i += 1) {
    const t = new Date(at.getTime() + i * stepMinutes * 60_000);
    const positionAndVelocity = propagate(satrec, t);

    if (!positionAndVelocity || !positionAndVelocity.position) {
      continue;
    }

    const geodetic = eciToGeodetic(positionAndVelocity.position, gstime(t));

    const lon = toDegrees(geodetic.longitude);
    const lat = toDegrees(geodetic.latitude);
    const alt = geodetic.height * 1000;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(alt)) {
      continue;
    }
    points.push([lon, lat, alt]);
  }

  return points;
}
