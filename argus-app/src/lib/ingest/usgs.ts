import type { EarthquakeFeature } from "@/types/intel";

type UsgsFeature = {
  id: string;
  properties: {
    mag: number | null;
    place: string;
    time: number;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number, number];
  };
};

type UsgsResponse = {
  features: UsgsFeature[];
};

export async function fetchUsgsQuakes(endpoint: string): Promise<EarthquakeFeature[]> {
  const response = await fetch(endpoint, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`USGS HTTP ${response.status}`);
  }

  const json = (await response.json()) as UsgsResponse;

  return json.features
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature) => {
      const [longitude, latitude, depthKm] = feature.geometry.coordinates;
      return {
        id: feature.id,
        longitude,
        latitude,
        depthKm,
        magnitude: feature.properties.mag ?? 0,
        place: feature.properties.place,
        timestamp: feature.properties.time,
      };
    });
}
