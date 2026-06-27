export type GnssZoneSeverity = "elevated" | "severe";

export type GnssZone = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  radiusKm: number;
  severity: GnssZoneSeverity;
  source: string;
  summary: string;
};

export type NavigationConfidence = {
  level: "high" | "guarded" | "low";
  zone: GnssZone | null;
  reason: string | null;
};

export const GNSS_INTERFERENCE_ZONES: GnssZone[] = [
  {
    id: "uuwv",
    label: "UUWV FIR",
    lat: 55.75,
    lon: 37.62,
    radiusKm: 320,
    severity: "severe",
    source: "FlySafe",
    summary: "High recent GNSS interference signal around Moscow FIR.",
  },
  {
    id: "ulll",
    label: "ULLL FIR",
    lat: 59.94,
    lon: 30.31,
    radiusKm: 240,
    severity: "elevated",
    source: "FlySafe",
    summary: "Elevated GNSS interference around Saint Petersburg FIR.",
  },
  {
    id: "urrv",
    label: "URRV FIR",
    lat: 47.24,
    lon: 39.71,
    radiusKm: 280,
    severity: "elevated",
    source: "FlySafe",
    summary: "Elevated GNSS interference near Rostov FIR / Black Sea approaches.",
  },
  {
    id: "oomm",
    label: "Oman / Hormuz",
    lat: 26.65,
    lon: 56.25,
    radiusKm: 360,
    severity: "severe",
    source: "FlySafe + Pole Star",
    summary: "Strait of Hormuz corridor has active spoofing / AIS positional deception risk.",
  },
  {
    id: "vyyf",
    label: "Myanmar FIR",
    lat: 19.75,
    lon: 96.1,
    radiusKm: 300,
    severity: "elevated",
    source: "FlySafe",
    summary: "Elevated interference observed across Myanmar FIR.",
  },
];

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getGnssInterferenceAt(lat: number, lon: number): GnssZone | null {
  let best: GnssZone | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const zone of GNSS_INTERFERENCE_ZONES) {
    const km = distanceKm(lat, lon, zone.lat, zone.lon);
    if (km <= zone.radiusKm && km < bestDistance) {
      best = zone;
      bestDistance = km;
    }
  }

  return best;
}

export function classifyNavigationConfidence(lat: number, lon: number): NavigationConfidence {
  const zone = getGnssInterferenceAt(lat, lon);
  if (!zone) {
    return { level: "high", zone: null, reason: null };
  }

  if (zone.severity === "severe") {
    return {
      level: "low",
      zone,
      reason: `${zone.label}: ${zone.summary}`,
    };
  }

  return {
    level: "guarded",
    zone,
    reason: `${zone.label}: ${zone.summary}`,
  };
}
