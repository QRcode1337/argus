import type { MilitaryFlight } from "@/types/intel";

type AdsbAircraft = {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  track?: number;
  gs?: number;
  t?: string;
};

type AdsbResponse = {
  ac?: AdsbAircraft[];
};

const toMeters = (value: number | "ground" | undefined): number => {
  if (value === "ground" || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, value * 0.3048);
};

export async function fetchMilitaryFlights(endpoint: string): Promise<MilitaryFlight[]> {
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ADS-B HTTP ${response.status}`);
  }

  const data = (await response.json()) as AdsbResponse;
  const aircraft = data.ac ?? [];

  return aircraft
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon) && !!item.hex)
    .map((item) => ({
      id: (item.hex ?? "unknown").toLowerCase(),
      callsign: item.flight?.trim() || (item.hex ?? "UNK").toUpperCase(),
      longitude: item.lon as number,
      latitude: item.lat as number,
      altitudeMeters: toMeters(item.alt_baro),
      trueTrack: item.track ?? 0,
      velocity: item.gs ? item.gs * 0.514444 : 0,
      type: item.t ?? null,
    }));
}
