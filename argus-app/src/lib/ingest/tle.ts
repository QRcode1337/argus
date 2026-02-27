import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from "satellite.js";

import type { SatellitePosition, SatelliteRecord } from "@/types/intel";

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

export async function fetchTleRecords(endpoint: string): Promise<SatelliteRecord[]> {
  const response = await fetch(endpoint, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`CelesTrak HTTP ${response.status}`);
  }

  const text = await response.text();
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const records: SatelliteRecord[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const tle1 = lines[i + 1];
    const tle2 = lines[i + 2];

    if (!tle1.startsWith("1 ") || !tle2.startsWith("2 ")) {
      continue;
    }

    records.push({
      id: tle1.slice(2, 7).trim() || `${i}`,
      name,
      tle1,
      tle2,
    });
  }

  return records;
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
      return {
        id: record.id,
        name: record.name,
        latitude: degreesLat(geodetic.latitude),
        longitude: degreesLong(geodetic.longitude),
        altitudeKm: geodetic.height,
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

    points.push([
      toDegrees(geodetic.longitude),
      toDegrees(geodetic.latitude),
      geodetic.height * 1000,
    ]);
  }

  return points;
}
