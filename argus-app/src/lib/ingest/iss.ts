export interface IssIntelPayload {
  craft: string;
  crew: string[];
  updatedAt: string;
  videoUrl?: string;
  moreInfoUrl?: string;
}

export async function fetchIssIntel(endpoint: string): Promise<IssIntelPayload> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ISS endpoint returned ${response.status}`);
  }

  const payload = (await response.json()) as IssIntelPayload;
  return {
    craft: payload.craft ?? "ISS",
    crew: Array.isArray(payload.crew) ? payload.crew : [],
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    videoUrl: payload.videoUrl,
    moreInfoUrl: payload.moreInfoUrl,
  };
}
