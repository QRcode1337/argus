export interface FredObservation {
  date: string;
  value: number;
}

interface FredResponse {
  observations?: Array<{ date?: string; value?: string }>;
}

export async function fetchFredObservations(endpoint: string): Promise<FredObservation[]> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`FRED returned ${response.status}`);

  const data = (await response.json()) as FredResponse;
  const observations = data.observations ?? [];

  return observations
    .map((o) => ({
      date: o.date ?? "",
      value: Number(o.value),
    }))
    .filter((o) => o.date && Number.isFinite(o.value));
}
