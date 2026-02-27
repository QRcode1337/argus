import type { CctvCamera } from "@/types/intel";

const SCENIC_CAMERAS: CctvCamera[] = [
  {
    id: "scenic-shibuya",
    name: "Shibuya Crossing (Live)",
    longitude: 139.7005,
    latitude: 35.6595,
    imageUrl: "https://images.unsplash.com/photo-1542051812871-757500850028?w=800&q=80",
  },
  {
    id: "scenic-times-square",
    name: "Times Square EarthCam",
    longitude: -73.9851,
    latitude: 40.7580,
    imageUrl: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800&q=80",
  },
  {
    id: "scenic-banff",
    name: "Banff National Park Reserve",
    longitude: -115.5564,
    latitude: 51.4968,
    imageUrl: "https://images.unsplash.com/photo-1610488057207-68691f13bce3?w=800&q=80",
  },
  {
    id: "scenic-venice",
    name: "Venice Grand Canal",
    longitude: 12.3155,
    latitude: 45.4408,
    imageUrl: "https://images.unsplash.com/photo-1514890547357-a9ee288728e0?w=800&q=80",
  },
  {
    id: "scenic-yellowstone",
    name: "Yellowstone Old Faithful",
    longitude: -110.8281,
    latitude: 44.4605,
    imageUrl: "https://images.unsplash.com/photo-1528646271970-1282260c679a?w=800&q=80",
  },
  {
    id: "scenic-fuji",
    name: "Mount Fuji Live View",
    longitude: 138.7274,
    latitude: 35.3606,
    imageUrl: "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=800&q=80",
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

export async function fetchCctvCameras(endpoint: string): Promise<CctvCamera[]> {
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CCTV HTTP ${response.status}`);
  }

  const data = (await response.json()) as TflResponse;
  const places = data.places ?? [];

  const tflCameras = places
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .map((item) => {
      const imageUrl = findImageUrl(item) ?? "/camera-placeholder.svg";
      return {
        id: item.id,
        name: item.commonName,
        longitude: item.lon as number,
        latitude: item.lat as number,
        imageUrl,
      };
    });

  return [...SCENIC_CAMERAS, ...tflCameras];
}
