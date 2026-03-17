import type { FlightCategory, OpenSkyState, TrackedFlight } from "@/types/intel";

const OPEN_SKY_STATE_INDEX = {
  icao24: 0,
  callsign: 1,
  originCountry: 2,
  timePosition: 3,
  lastContact: 4,
  longitude: 5,
  latitude: 6,
  baroAltitude: 7,
  onGround: 8,
  velocity: 9,
  trueTrack: 10,
  verticalRate: 11,
  geoAltitude: 13,
  squawk: 14,
  spi: 15,
  positionSource: 16,
} as const;

type OpenSkyResponse = {
  time: number;
  states: unknown[][] | null;
};

const asNum = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asStr = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asBool = (value: unknown): boolean => value === true;

const COMMERCIAL_CALLSIGN_PATTERN = /^[A-Z]{2,3}\d{1,4}[A-Z]?$/;
const PRIVATE_CALLSIGN_PATTERN = /^(N\d{1,5}[A-Z]{0,2}|C[A-Z0-9]{2,5}|G[A-Z0-9]{2,5}|D[A-Z0-9]{2,5}|F[A-Z0-9]{2,5}|HB[A-Z0-9]{1,4}|JA[A-Z0-9]{1,4}|RA[A-Z0-9]{1,4}|VH[A-Z0-9]{1,4}|Z[A-Z0-9]{2,5})$/;

const normalizeCallsign = (value: string | null): string => (value ?? "").replace(/\s+/g, "").toUpperCase();

const classifyFlight = (callsign: string | null, originCountry: string): FlightCategory => {
  const normalizedCallsign = normalizeCallsign(callsign);
  if (!normalizedCallsign) return "unknown";

  if (COMMERCIAL_CALLSIGN_PATTERN.test(normalizedCallsign)) {
    return "commercial";
  }

  if (
    PRIVATE_CALLSIGN_PATTERN.test(normalizedCallsign) ||
    normalizedCallsign.length <= 3 ||
    normalizedCallsign === originCountry.toUpperCase()
  ) {
    return "private";
  }

  if (/^\d+$/.test(normalizedCallsign)) {
    return "unknown";
  }

  return "unknown";
};

const parseState = (row: unknown[]): OpenSkyState => ({
  icao24: (asStr(row[OPEN_SKY_STATE_INDEX.icao24]) ?? "unknown").toLowerCase(),
  callsign: asStr(row[OPEN_SKY_STATE_INDEX.callsign]),
  originCountry: asStr(row[OPEN_SKY_STATE_INDEX.originCountry]) ?? "Unknown",
  timePosition: asNum(row[OPEN_SKY_STATE_INDEX.timePosition]),
  lastContact: asNum(row[OPEN_SKY_STATE_INDEX.lastContact]) ?? 0,
  longitude: asNum(row[OPEN_SKY_STATE_INDEX.longitude]),
  latitude: asNum(row[OPEN_SKY_STATE_INDEX.latitude]),
  baroAltitude: asNum(row[OPEN_SKY_STATE_INDEX.baroAltitude]),
  onGround: asBool(row[OPEN_SKY_STATE_INDEX.onGround]),
  velocity: asNum(row[OPEN_SKY_STATE_INDEX.velocity]),
  trueTrack: asNum(row[OPEN_SKY_STATE_INDEX.trueTrack]),
  verticalRate: asNum(row[OPEN_SKY_STATE_INDEX.verticalRate]),
  geoAltitude: asNum(row[OPEN_SKY_STATE_INDEX.geoAltitude]),
  squawk: asStr(row[OPEN_SKY_STATE_INDEX.squawk]),
  spi: asBool(row[OPEN_SKY_STATE_INDEX.spi]),
  positionSource: asNum(row[OPEN_SKY_STATE_INDEX.positionSource]) ?? 0,
});

export async function fetchOpenSkyFlights(endpoint: string): Promise<TrackedFlight[]> {
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`OpenSky HTTP ${response.status}`);
  }

  const json = (await response.json()) as OpenSkyResponse;
  const states = json.states ?? [];

  return states
    .map(parseState)
    .filter((state) => state.latitude !== null && state.longitude !== null)
    .map((state) => {
      const callsign = state.callsign ?? state.icao24.toUpperCase();
      const category = classifyFlight(callsign, state.originCountry);

      return {
        id: state.icao24,
        callsign,
        latitude: state.latitude as number,
        longitude: state.longitude as number,
        altitudeMeters: state.geoAltitude ?? state.baroAltitude ?? 0,
        trueTrack: state.trueTrack ?? 0,
        velocity: state.velocity ?? 0,
        originCountry: state.originCountry,
        verticalRate: state.verticalRate,
        onGround: state.onGround,
        squawk: state.squawk,
        category,
      };
    });
}
