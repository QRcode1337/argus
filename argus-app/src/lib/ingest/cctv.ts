import type { CameraCategory, CctvCamera } from "@/types/intel";

const SCENIC_CAMERAS: CctvCamera[] = [
  {
    id: "scenic-shibuya",
    name: "Shibuya Crossing (Live)",
    longitude: 139.7005,
    latitude: 35.6595,
    imageUrl: "https://images.unsplash.com/photo-1542051812871-757500850028?w=800&q=80",
    category: "Scenic",
    provider: "Hardcoded",
  },
  {
    id: "scenic-times-square",
    name: "Times Square EarthCam",
    longitude: -73.9851,
    latitude: 40.7580,
    imageUrl: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800&q=80",
    category: "Landmark",
    provider: "Hardcoded",
  },
  {
    id: "scenic-banff",
    name: "Banff National Park Reserve",
    longitude: -115.5564,
    latitude: 51.4968,
    imageUrl: "https://images.unsplash.com/photo-1610488057207-68691f13bce3?w=800&q=80",
    category: "Nature",
    provider: "Hardcoded",
  },
  {
    id: "scenic-venice",
    name: "Venice Grand Canal",
    longitude: 12.3155,
    latitude: 45.4408,
    imageUrl: "https://images.unsplash.com/photo-1514890547357-a9ee288728e0?w=800&q=80",
    category: "Landmark",
    provider: "Hardcoded",
  },
  {
    id: "scenic-yellowstone",
    name: "Yellowstone Old Faithful",
    longitude: -110.8281,
    latitude: 44.4605,
    imageUrl: "https://images.unsplash.com/photo-1528646271970-1282260c679a?w=800&q=80",
    category: "Nature",
    provider: "Hardcoded",
  },
  {
    id: "scenic-fuji",
    name: "Mount Fuji Live View",
    longitude: 138.7274,
    latitude: 35.3606,
    imageUrl: "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=800&q=80",
    category: "Scenic",
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

  return [...SCENIC_CAMERAS, ...tflCameras, ...windyCameras];
}
