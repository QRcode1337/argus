interface PlanespottersPhoto {
  id: string;
  thumbnail: { src: string };
  thumbnail_large: { src: string };
  link: string;
}

interface PlanespottersResponse {
  photos?: PlanespottersPhoto[];
}

const photoCache = new Map<string, string | null>();
const MAX_CACHE_SIZE = 500;

export async function fetchAircraftPhoto(icaoHex: string): Promise<string | null> {
  const key = icaoHex.toLowerCase();

  if (photoCache.has(key)) {
    return photoCache.get(key) ?? null;
  }

  try {
    const response = await fetch(`/api/feeds/planespotters?hex=${encodeURIComponent(key)}`);

    if (!response.ok) {
      photoCache.set(key, null);
      return null;
    }

    const data = (await response.json()) as PlanespottersResponse;
    const photo = data.photos?.[0];
    const url = photo?.thumbnail_large?.src ?? photo?.thumbnail?.src ?? null;

    if (photoCache.size >= MAX_CACHE_SIZE) {
      const firstKey = photoCache.keys().next().value;
      if (firstKey !== undefined) {
        photoCache.delete(firstKey);
      }
    }

    photoCache.set(key, url);
    return url;
  } catch {
    photoCache.set(key, null);
    return null;
  }
}
