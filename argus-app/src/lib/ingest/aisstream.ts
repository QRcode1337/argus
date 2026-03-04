interface AisStreamResponse {
  vessels?: unknown[];
  data?: unknown[];
}

export async function fetchAisSnapshotCount(endpoint: string): Promise<number> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`AISStream returned ${response.status}`);

  const data = (await response.json()) as AisStreamResponse | unknown[];

  if (Array.isArray(data)) return data.length;
  if (Array.isArray((data as AisStreamResponse).vessels)) return (data as AisStreamResponse).vessels!.length;
  if (Array.isArray((data as AisStreamResponse).data)) return (data as AisStreamResponse).data!.length;

  return 0;
}
