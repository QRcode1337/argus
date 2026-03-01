import type { CameraCategory, CctvCamera } from "@/types/intel";

// ---------------------------------------------------------------------------
// Intelligence-grade camera positions — curated monitoring locations with
// strategic, environmental, or infrastructure value.
// ---------------------------------------------------------------------------
const INTEL_CAMERAS: CctvCamera[] = [
  // ── Nature / Environmental ───────────────────────────────────────────
  {
    id: "intel-old-faithful",
    name: "Old Faithful Geyser — Geothermal Monitor",
    longitude: -110.8281,
    latitude: 44.4605,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/BWnloy8r0qU?autoplay=1&mute=1",
    category: "Nature",
    provider: "Hardcoded",
  },
  // ── Urban Monitoring ─────────────────────────────────────────────────
  {
    id: "intel-shibuya-crossing",
    name: "Shibuya Crossing — Urban Density Patterns",
    longitude: 139.7005,
    latitude: 35.6595,
    imageUrl: "https://img.youtube.com/vi/8H3nRCFVR6Y/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/8H3nRCFVR6Y?autoplay=1&mute=1",
    category: "Traffic",
    provider: "Hardcoded",
  },
  {
    id: "intel-times-square",
    name: "Times Square — Public Gathering Monitor",
    longitude: -73.9851,
    latitude: 40.7580,
    imageUrl: "https://img.youtube.com/vi/rnXIjl_Rzy4/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/rnXIjl_Rzy4?autoplay=1&mute=1",
    category: "Traffic",
    provider: "Hardcoded",
  },

  // ── Live Stream Landmarks ─────────────────────────────────────────────
  {
    id: "intel-tel-aviv-skyline",
    name: "Tel Aviv Skyline — Mediterranean Coast",
    longitude: 34.7818,
    latitude: 32.0853,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.skylinewebcams.com/webcam/israel/tel-aviv/tel-aviv/tel-aviv.html",
    category: "Landmark",
    provider: "Hardcoded",
  },
  {
    id: "intel-abbey-road",
    name: "Abbey Road Crossing — London",
    longitude: -0.1780,
    latitude: 51.5320,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/dqBs2x6AMXY?autoplay=1&mute=1",
    category: "Landmark",
    provider: "Hardcoded",
  },
  {
    id: "intel-jackson-hole",
    name: "Jackson Hole Town Square — Wyoming",
    longitude: -110.7624,
    latitude: 43.4799,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/DoEOrMsMKbQ?autoplay=1&mute=1",
    category: "Landmark",
    provider: "Hardcoded",
  },
  {
    id: "intel-venice-rialto",
    name: "Venice Rialto Bridge — Grand Canal",
    longitude: 12.3358,
    latitude: 45.4381,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/vPbQcM4k1Ys?autoplay=1&mute=1",
    category: "Landmark",
    provider: "Hardcoded",
  },
  {
    id: "intel-dubai-burj",
    name: "Dubai — Burj Khalifa Live",
    longitude: 55.2744,
    latitude: 25.1972,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/lot2bFAPeBM?autoplay=1&mute=1",
    category: "Landmark",
    provider: "Hardcoded",
  },
  {
    id: "intel-niagara-falls",
    name: "Niagara Falls — Horseshoe Falls",
    longitude: -79.0849,
    latitude: 43.0896,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/mPaB2kPqElo?autoplay=1&mute=1",
    category: "Nature",
    provider: "Hardcoded",
  },

  // ── Israel ─────────────────────────────────────────────────────────
  {
    id: "intel-western-wall",
    name: "Western Wall (Kotel) — Jerusalem",
    longitude: 35.2342,
    latitude: 31.7767,
    imageUrl: "https://img.youtube.com/vi/77akujLn4k8/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/77akujLn4k8?autoplay=1&mute=1",
    category: "Landmark",
    provider: "Hardcoded",
  },
  {
    id: "intel-tel-aviv-beach",
    name: "Tel Aviv Beach — Coastal Monitor",
    longitude: 34.7668,
    latitude: 32.0853,
    imageUrl: "https://img.youtube.com/vi/QtsTVL9xlw4/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/QtsTVL9xlw4?autoplay=1&mute=1",
    category: "Scenic",
    provider: "Hardcoded",
  },
  {
    id: "intel-israel-skyline-live",
    name: "Tel Aviv & Jerusalem Skyline — Live",
    longitude: 34.7818,
    latitude: 32.0853,
    imageUrl: "https://img.youtube.com/vi/qUDZ-lve5_k/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/qUDZ-lve5_k?autoplay=1&mute=1",
    category: "Landmark",
    provider: "Hardcoded",
  },

  // ── Nature / Wildlife Live Cams ────────────────────────────────────
  {
    id: "intel-tropical-reef",
    name: "Tropical Reef — Underwater Cam",
    longitude: -87.5209,
    latitude: 16.1004,
    imageUrl: "https://img.youtube.com/vi/DHUnz4dyb54/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/DHUnz4dyb54?autoplay=1&mute=1",
    category: "Nature",
    provider: "Hardcoded",
  },
  {
    id: "intel-iss-nasa",
    name: "ISS — Official NASA Live Stream",
    longitude: 0.0,
    latitude: 0.0,
    imageUrl: "https://img.youtube.com/vi/FV4Q9DryTG8/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/FV4Q9DryTG8?autoplay=1&mute=1",
    category: "Infrastructure",
    provider: "Hardcoded",
  },
  {
    id: "intel-iss-earth",
    name: "ISS — 24/7 Earth from Space",
    longitude: 0.0,
    latitude: 0.0,
    imageUrl: "https://img.youtube.com/vi/vytmBNhc9ig/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/vytmBNhc9ig?autoplay=1&mute=1",
    category: "Infrastructure",
    provider: "Hardcoded",
  },
  {
    id: "intel-iss-hdev",
    name: "ISS — HD Earth Viewing Experiment",
    longitude: 0.0,
    latitude: 0.0,
    imageUrl: "https://img.youtube.com/vi/0FBiyFpV__g/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/0FBiyFpV__g?autoplay=1&mute=1",
    category: "Infrastructure",
    provider: "Hardcoded",
  },
  {
    id: "intel-santorini",
    name: "Santorini — Caldera View",
    longitude: 25.4615,
    latitude: 36.3932,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/mn2TinyBexs?autoplay=1&mute=1",
    category: "Scenic",
    provider: "Hardcoded",
  },
  {
    id: "intel-miami-beach",
    name: "Miami Beach — South Beach Live",
    longitude: -80.1300,
    latitude: 25.7826,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/NMpmKjKJbhI?autoplay=1&mute=1",
    category: "Scenic",
    provider: "Hardcoded",
  },
  {
    id: "intel-tokyo-tower",
    name: "Tokyo Tower — City Panorama",
    longitude: 139.7454,
    latitude: 35.6586,
    imageUrl: "/camera-placeholder.svg",
    streamUrl: "https://www.youtube.com/embed/5VoVCqmGTXo?autoplay=1&mute=1",
    category: "Landmark",
    provider: "Hardcoded",
  },

  // ── Wildlife Live Cams ─────────────────────────────────────────────
  {
    id: "intel-wolf-center-north",
    name: "International Wolf Center — North Cam",
    longitude: -91.4952,
    latitude: 47.9038,
    imageUrl: "https://img.youtube.com/vi/5e4lsEe4Vew/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/5e4lsEe4Vew?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-wolf-center-south",
    name: "International Wolf Center — South Cam",
    longitude: -91.4952,
    latitude: 47.9035,
    imageUrl: "https://img.youtube.com/vi/DRxYSIoBusQ/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/DRxYSIoBusQ?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-decorah-eagles-live",
    name: "Decorah Eagles Nest — 4K Live",
    longitude: -91.7857,
    latitude: 43.3036,
    imageUrl: "https://img.youtube.com/vi/GGIE1E-kaMQ/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/GGIE1E-kaMQ?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-west-end-eagles",
    name: "West End Bald Eagle Cam",
    longitude: -122.7723,
    latitude: 49.3260,
    imageUrl: "https://img.youtube.com/vi/RmmAzrAkKqI/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/RmmAzrAkKqI?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-gray-seal-cam",
    name: "Gray Seal Pupping Cam — North Atlantic",
    longitude: -69.9882,
    latitude: 43.7654,
    imageUrl: "https://img.youtube.com/vi/JqjHlNFz7PU/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/JqjHlNFz7PU?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-manatee-cam",
    name: "Underwater Manatee Cam — Homosassa Springs",
    longitude: -82.5857,
    latitude: 28.7998,
    imageUrl: "https://img.youtube.com/vi/Fz6sl9YJZE0/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/Fz6sl9YJZE0?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-jellyfish-cam",
    name: "Jellyfish Cam — Aquarium of the Pacific",
    longitude: -118.1956,
    latitude: 33.7616,
    imageUrl: "https://img.youtube.com/vi/ObR7SBKrkXc/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/ObR7SBKrkXc?autoplay=1&mute=1",
    category: "Nature",
    provider: "Hardcoded",
  },
  {
    id: "intel-sloth-tv",
    name: "Sloth TV — Live Cam",
    longitude: -84.0907,
    latitude: 9.9281,
    imageUrl: "https://img.youtube.com/vi/g_L1Ay8P244/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/g_L1Ay8P244?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-texas-wildlife",
    name: "Texas Wildlife — Austin Backyard Cam",
    longitude: -97.7431,
    latitude: 30.2672,
    imageUrl: "https://img.youtube.com/vi/Jng6h2xYapk/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/Jng6h2xYapk?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-safari-live",
    name: "WildEarth SafariLIVE — South Africa",
    longitude: 31.4975,
    latitude: -24.9387,
    imageUrl: "https://img.youtube.com/vi/eEiJxokGlQQ/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/eEiJxokGlQQ?autoplay=1&mute=1",
    category: "Wildlife",
    provider: "Hardcoded",
  },
  {
    id: "intel-giraffe-cam",
    name: "Giraffe Paddock Cam — Greenville Zoo",
    longitude: -82.3940,
    latitude: 34.8526,
    imageUrl: "https://img.youtube.com/vi/1NoSs03ZrlY/hqdefault.jpg",
    streamUrl: "https://www.youtube.com/embed/1NoSs03ZrlY?autoplay=1&mute=1",
    category: "Wildlife",
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

type TflResponse = TflCamera[] | { places?: TflCamera[] };

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
        streamUrl: `https://webcams.windy.com/webcams/public/embed/player/${w.webcamId}/day`,
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
      const raw = await response.json();
      const places: TflCamera[] = Array.isArray(raw) ? raw : ((raw as { places?: TflCamera[] }).places ?? []);
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
