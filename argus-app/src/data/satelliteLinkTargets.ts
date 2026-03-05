import { MILITARY_BASES } from "./militaryBases";

export interface SatelliteLinkTarget {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: "base" | "carrier";
}

type CarrierTrack = {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  radiusLatDeg: number;
  radiusLonDeg: number;
  periodHours: number;
  phaseOffset: number;
};

const STRATEGIC_BASES: SatelliteLinkTarget[] = MILITARY_BASES.filter(
  (base) => base.type === "naval" || base.type === "space" || base.type === "joint",
).map((base) => ({
  id: `base-${base.id}`,
  name: base.name,
  lat: base.lat,
  lon: base.lon,
  kind: "base" as const,
}));

const CARRIER_TRACKS: CarrierTrack[] = [
  {
    id: "carrier-5th-fleet",
    name: "Carrier Group - Arabian Sea",
    centerLat: 18.1,
    centerLon: 66.8,
    radiusLatDeg: 2.2,
    radiusLonDeg: 3.1,
    periodHours: 9.5,
    phaseOffset: 0.1,
  },
  {
    id: "carrier-7th-fleet",
    name: "Carrier Group - Philippine Sea",
    centerLat: 18.9,
    centerLon: 133.5,
    radiusLatDeg: 3.2,
    radiusLonDeg: 4.5,
    periodHours: 11.5,
    phaseOffset: 0.35,
  },
  {
    id: "carrier-med",
    name: "Carrier Group - East Med",
    centerLat: 34.2,
    centerLon: 23.4,
    radiusLatDeg: 1.6,
    radiusLonDeg: 2.8,
    periodHours: 8.2,
    phaseOffset: 0.62,
  },
  {
    id: "carrier-norwegian",
    name: "Carrier Group - Norwegian Sea",
    centerLat: 67.6,
    centerLon: 4.1,
    radiusLatDeg: 1.9,
    radiusLonDeg: 3.5,
    periodHours: 10.2,
    phaseOffset: 0.78,
  },
  {
    id: "carrier-atlantic",
    name: "Carrier Group - Mid Atlantic",
    centerLat: 31.8,
    centerLon: -40.5,
    radiusLatDeg: 2.5,
    radiusLonDeg: 5.2,
    periodHours: 12.3,
    phaseOffset: 0.5,
  },
];

const normLon = (lon: number): number => {
  if (lon > 180) return lon - 360;
  if (lon < -180) return lon + 360;
  return lon;
};

const buildCarrierTargets = (at: Date): SatelliteLinkTarget[] => {
  const hour = at.getTime() / 3_600_000;

  return CARRIER_TRACKS.map((track) => {
    const phase = ((hour / track.periodHours + track.phaseOffset) % 1) * 2 * Math.PI;
    const lat = track.centerLat + Math.sin(phase) * track.radiusLatDeg;
    const lon = normLon(track.centerLon + Math.cos(phase) * track.radiusLonDeg);

    return {
      id: track.id,
      name: track.name,
      lat,
      lon,
      kind: "carrier",
    };
  });
};

export function buildSatelliteLinkTargets(at: Date): SatelliteLinkTarget[] {
  return [...STRATEGIC_BASES, ...buildCarrierTargets(at)];
}
