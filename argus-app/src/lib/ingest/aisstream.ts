import type { AisVessel } from "@/types/vessel";

interface AisStreamResponse {
  vessels?: Record<string, unknown>[];
  data?: Record<string, unknown>[];
}

function toAisVessel(raw: Record<string, unknown>): AisVessel {
  return {
    mmsi: String(raw.mmsi ?? ""),
    lat: Number(raw.lat ?? 0),
    lon: Number(raw.lon ?? 0),
    sog: Number(raw.sog ?? 0),
    cog: Number(raw.cog ?? 0),
    heading: Number(raw.heading ?? 0),
    navStatus: Number(raw.navStatus ?? 15),
    timestamp: String(raw.timestamp ?? ""),
    vesselName: String(raw.vesselName ?? ""),
    callsign: String(raw.callsign ?? ""),
  };
}

export async function fetchAisVessels(endpoint: string): Promise<AisVessel[]> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`AISStream returned ${response.status}`);

  const data = (await response.json()) as AisStreamResponse | Record<string, unknown>[];

  let rawList: Record<string, unknown>[];

  if (Array.isArray(data)) {
    rawList = data;
  } else if (Array.isArray((data as AisStreamResponse).vessels)) {
    rawList = (data as AisStreamResponse).vessels!;
  } else if (Array.isArray((data as AisStreamResponse).data)) {
    rawList = (data as AisStreamResponse).data!;
  } else {
    return [];
  }

  return rawList.map(toAisVessel);
}

export async function fetchAisSnapshotCount(endpoint: string): Promise<number> {
  const vessels = await fetchAisVessels(endpoint);
  return vessels.length;
}
