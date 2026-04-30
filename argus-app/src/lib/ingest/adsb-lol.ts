import type { TrackedFlight } from "@/types/intel";

interface AdsbLolAircraft {
  hex: string;
  type?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  mlat?: boolean;
  tisb?: boolean;
  rssi?: number;
  dst?: number;
  dir?: string;
  _source?: string;
}

/**
 * Normalize adsb.lol aircraft data into TrackedFlight format
 * Handles both altitude types and maps fields appropriately
 */
const toAltMeters = (value: number | string | undefined | null): number => {
  if (value === undefined || value === null || value === "ground") return 0;
  if (typeof value === "string") {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
  }
  if (typeof value === "number") {
    // adsb.lol alt_baro is in feet, alt_geom is in feet
    return Math.max(0, value * 0.3048);
  }
  return 0;
};

/**
 * Classify flight based on callsign patterns and aircraft type
 */
const classifyFlight = (callsign: string | null, type: string | null): TrackedFlight["category"] => {
  const normalizedCallsign = (callsign ?? "").replace(/\s+/g, "").toUpperCase();
  const normalizedType = (type ?? "").toUpperCase();

  // Military type codes
  if (/^(C17|C5|KC135|KC46|KC10|C130|E3|E8|E4|B52|B1B|B2A|F22|F35|RF4|U2|SR71|AN124|IL76|A100|A101|A400|M76|TU204|TU330|AN124)\b/i.test(normalizedType)) {
    return "unknown"; // Military/special ops classified as unknown (not commercial)
  }

  if (!normalizedCallsign) return "unknown";

  // Commercial airline pattern: 2-3 letter code + 1-4 digits + optional letter
  if (/^[A-Z]{2,3}\d{1,4}[A-Z]?$/i.test(normalizedCallsign)) {
    return "commercial";
  }

  // Private/general aviation: starts with registration patterns
  // US: N + digits + optional letters
  // UK: G + letters/numbers
  // Canada: C + letters/numbers + digits
  // Germany: D + letters/numbers
  // France: F + letters
  // Switzerland: HB + letters
  // Japan: JA + letters/numbers
  if (/^(N\d{1,5}[A-Z]{0,2}|C[A-Z0-9]{2,5}|G[A-Z0-9]{2,5}|D[A-Z0-9]{2,5}|F[A-Z0-9]{2,5}|HB[A-Z0-9]{1,4}|JA[A-Z0-9]{1,4}|RA[A-Z0-9]{1,4}|VH[A-Z0-9]{1,4}|Z[A-Z0-9]{2,5}|VQ-B|VP-B|G-\w+|C\w+|B\w+|9[A-Z]{1,3}|HL\d+|B-\w+|J-\w+|ZS-\w+|ZS[\w-]+)/i.test(normalizedCallsign)) {
    return "private";
  }

  // Private aircraft with registration pattern in type or short callsign
  if (normalizedCallsign.length <= 3) {
    return "private";
  }

  // Numeric-only callsigns are typically military or test
  if (/^\d+$/.test(normalizedCallsign)) {
    return "unknown";
  }

  return "unknown";
};

/**
 * Detect if a squawk is "emergency" or "special"
 */
/**
 * Main normalization function
 */
export function normalizeAdsbLolAircraft(aircraft: AdsbLolAircraft[]): TrackedFlight[] {
  return aircraft
    .filter((ac) => {
      // Validate required fields
      if (!ac.hex || !ac.hex.trim()) return false;
      if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) return false;
      return true;
    })
    .map((ac) => {
      // Primary altitude: use barometric altitude if available, fall back to geometric
      const altitudeMeters = ac.alt_baro !== undefined
        ? toAltMeters(ac.alt_baro)
        : toAltMeters(ac.alt_geom);

      const callsign = (ac.flight ?? "").replace(/\s+/g, "").toUpperCase() || ac.hex.toUpperCase();
      const category = classifyFlight(callsign, ac.t || ac.type);
      return {
        id: ac.hex.toLowerCase(),
        callsign,
        longitude: ac.lon,
        latitude: ac.lat,
        altitudeMeters,
        trueTrack: ac.track ?? 0,
        velocity: (ac.gs ?? 0) * 0.514444,
        originCountry: ac.r ?? "Unknown",
        verticalRate: null,
        onGround: ac.alt_baro === "ground",
        squawk: ac.squawk || null,
        category,
      };
    });
}
