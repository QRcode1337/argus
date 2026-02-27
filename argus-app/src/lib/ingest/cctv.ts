import type { CameraCategory, CctvCamera } from "@/types/intel";

// ---------------------------------------------------------------------------
// Intelligence-grade camera positions — curated monitoring locations with
// strategic, environmental, or infrastructure value.
// ---------------------------------------------------------------------------
const INTEL_CAMERAS: CctvCamera[] = [
  // ── Wildlife Monitoring ──────────────────────────────────────────────
  {
    id: "intel-decorah-eagles",
    name: "Decorah Eagles Nest",
    longitude: -91.7857,
    latitude: 43.3036,
    imageUrl: "/camera-placeholder.svg",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-katmai-bears",
    name: "Katmai Bear Cam — Brooks Falls",
    longitude: -155.7834,
    latitude: 58.7519,
    imageUrl: "/camera-placeholder.svg",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-yellowstone-wolves",
    name: "Yellowstone Wolf Pack — Lamar Valley",
    longitude: -110.2175,
    latitude: 44.8967,
    imageUrl: "/camera-placeholder.svg",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-channel-islands-eagles",
    name: "Channel Islands Bald Eagle Nest",
    longitude: -119.7295,
    latitude: 34.0137,
    imageUrl: "/camera-placeholder.svg",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-mpala-wildlife",
    name: "Mpala Wildlife Corridor — Kenya",
    longitude: 36.8968,
    latitude: 0.2927,
    imageUrl: "/camera-placeholder.svg",
    category: "Wildlife",
    provider: "Hardcoded",
  },

  // ── Nature / Environmental ───────────────────────────────────────────
  {
    id: "intel-old-faithful",
    name: "Old Faithful Geyser — Geothermal Monitor",
    longitude: -110.8281,
    latitude: 44.4605,
    imageUrl: "/camera-placeholder.svg",
    category: "Nature",
    provider: "Hardcoded",
  },
  {
    id: "intel-kilauea-volcano",
    name: "Kilauea Volcano — USGS Thermal Cam",
    longitude: -155.2867,
    latitude: 19.4069,
    imageUrl: "/camera-placeholder.svg",
    category: "Nature",
    provider: "Hardcoded",
  },
  {
    id: "intel-great-barrier-reef",
    name: "Great Barrier Reef — Marine Ecosystem",
    longitude: 145.7753,
    latitude: -16.2864,
    imageUrl: "/camera-placeholder.svg",
    category: "Nature",
    provider: "Hardcoded",
  },
  {
    id: "intel-amazon-canopy",
    name: "Amazon Canopy — Deforestation Monitor",
    longitude: -60.0217,
    latitude: -3.1190,
    imageUrl: "/camera-placeholder.svg",
    category: "Nature",
    provider: "Hardcoded",
  },
  {
    id: "intel-arctic-sea-ice",
    name: "Svalbard Arctic Sea Ice — Climate Indicator",
    longitude: 15.6356,
    latitude: 78.2232,
    imageUrl: "/camera-placeholder.svg",
    category: "Nature",
    provider: "Hardcoded",
  },

  // ── Coastal / Maritime Chokepoints ───────────────────────────────────
  {
    id: "intel-cape-hatteras",
    name: "Cape Hatteras — Hurricane Corridor",
    longitude: -75.5249,
    latitude: 35.2271,
    imageUrl: "/camera-placeholder.svg",
    category: "Scenic",
    provider: "Hardcoded",
  },
  {
    id: "intel-point-reyes",
    name: "Point Reyes — Pacific Coastal Monitor",
    longitude: -122.9987,
    latitude: 38.0956,
    imageUrl: "/camera-placeholder.svg",
    category: "Scenic",
    provider: "Hardcoded",
  },
  {
    id: "intel-strait-hormuz",
    name: "Strait of Hormuz Approach — Maritime Chokepoint",
    longitude: 56.2676,
    latitude: 26.5944,
    imageUrl: "/camera-placeholder.svg",
    category: "Scenic",
    provider: "Hardcoded",
  },
  {
    id: "intel-panama-canal",
    name: "Panama Canal Approach — Shipping Corridor",
    longitude: -79.9195,
    latitude: 9.0800,
    imageUrl: "/camera-placeholder.svg",
    category: "Scenic",
    provider: "Hardcoded",
  },
  {
    id: "intel-suez-canal",
    name: "Suez Canal Approach — Trade Route Monitor",
    longitude: 32.3447,
    latitude: 30.4572,
    imageUrl: "/camera-placeholder.svg",
    category: "Scenic",
    provider: "Hardcoded",
  },

  // ── Infrastructure / Strategic ───────────────────────────────────────
  {
    id: "intel-hoover-dam",
    name: "Hoover Dam — Critical Infrastructure",
    longitude: -114.7377,
    latitude: 36.0160,
    imageUrl: "/camera-placeholder.svg",
    category: "Infrastructure",
    provider: "Hardcoded",
  },
  {
    id: "intel-three-gorges",
    name: "Three Gorges Dam — Hydroelectric Monitor",
    longitude: 111.0037,
    latitude: 30.8231,
    imageUrl: "/camera-placeholder.svg",
    category: "Infrastructure",
    provider: "Hardcoded",
  },
  {
    id: "intel-ivanpah-solar",
    name: "Ivanpah Solar Facility — Energy Grid",
    longitude: -115.4569,
    latitude: 35.5567,
    imageUrl: "/camera-placeholder.svg",
    category: "Infrastructure",
    provider: "Hardcoded",
  },
  {
    id: "intel-kennedy-space-center",
    name: "Kennedy Space Center — Launch Facility",
    longitude: -80.6041,
    latitude: 28.5728,
    imageUrl: "/camera-placeholder.svg",
    category: "Infrastructure",
    provider: "Hardcoded",
  },
  {
    id: "intel-cern",
    name: "CERN — Particle Research Facility",
    longitude: 6.0535,
    latitude: 46.2340,
    imageUrl: "/camera-placeholder.svg",
    category: "Infrastructure",
    provider: "Hardcoded",
  },

  // ── Urban Monitoring ─────────────────────────────────────────────────
  {
    id: "intel-shibuya-crossing",
    name: "Shibuya Crossing — Urban Density Patterns",
    longitude: 139.7005,
    latitude: 35.6595,
    imageUrl: "/camera-placeholder.svg",
    category: "Traffic",
    provider: "Hardcoded",
  },
  {
    id: "intel-times-square",
    name: "Times Square — Public Gathering Monitor",
    longitude: -73.9851,
    latitude: 40.7580,
    imageUrl: "/camera-placeholder.svg",
    category: "Traffic",
    provider: "Hardcoded",
  },
];

type TflAdditionalProperty = {
  key?: string;
  value?: string;
};

type TflCamera = {
  id: string;
  commonName: string;
  lat?: number;
  lon?: number;
  additionalProperties?: TflAdditionalProperty[];
};

type TflResponse = {
  places?: TflCamera[];
};

const findImageUrl = (camera: TflCamera): string | null => {
  const pairs = camera.additionalProperties ?? [];
  for (const pair of pairs) {
    if (pair.key?.toLowerCase() === "imageurl" && pair.value) {
      return pair.value;
    }
  }

  return null;
};

interface WindyWebcam {
  webcamId: number;
  title: string;
  location: {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
  };
  images?: {
    current?: { preview?: string; thumbnail?: string };
    daylight?: { preview?: string; thumbnail?: string };
  };
  categories?: { id: string; name: string }[];
}

interface WindyResponse {
  webcams?: WindyWebcam[];
}

function mapWindyCategory(categories: { id: string; name: string }[]): CameraCategory {
  const ids = categories.map((c) => c.id);
  if (ids.includes("wildlife")) return "Wildlife";
  if (ids.includes("nature") || ids.includes("outdoor") || ids.includes("forest") || ids.includes("mountain") || ids.includes("lake")) return "Nature";
  if (ids.includes("landmark") || ids.includes("city") || ids.includes("building")) return "Landmark";
  if (ids.includes("landscape")) return "Scenic";
  return "Nature";
}

export async function fetchWindyWebcams(endpoint: string): Promise<CctvCamera[]> {
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return [];

    const data = (await response.json()) as WindyResponse;
    const webcams = data.webcams ?? [];

    return webcams
      .filter((w) => Number.isFinite(w.location?.latitude) && Number.isFinite(w.location?.longitude))
      .map((w) => ({
        id: `windy-${w.webcamId}`,
        name: w.title,
        longitude: w.location.longitude,
        latitude: w.location.latitude,
        imageUrl: w.images?.current?.preview ?? w.images?.daylight?.preview ?? w.images?.current?.thumbnail ?? "/camera-placeholder.svg",
        category: mapWindyCategory(w.categories ?? []),
        provider: "Windy" as const,
      }));
  } catch {
    return [];
  }
}

export async function fetchCctvCameras(tflEndpoint: string, webcamsEndpoint?: string): Promise<CctvCamera[]> {
  const tflPromise = fetch(tflEndpoint, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`CCTV HTTP ${response.status}`);
      const data = (await response.json()) as TflResponse;
      const places = data.places ?? [];
      return places
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
        .map((item) => ({
          id: item.id,
          name: item.commonName,
          longitude: item.lon as number,
          latitude: item.lat as number,
          imageUrl: findImageUrl(item) ?? "/camera-placeholder.svg",
          category: "Traffic" as const,
          provider: "TFL" as const,
        }));
    })
    .catch(() => [] as CctvCamera[]);

  const windyPromise = webcamsEndpoint
    ? fetchWindyWebcams(webcamsEndpoint)
    : Promise.resolve([] as CctvCamera[]);

  const [tflCameras, windyCameras] = await Promise.all([tflPromise, windyPromise]);

  return [...INTEL_CAMERAS, ...tflCameras, ...windyCameras];
}
