const RECORD_BASE = "/api/record";

async function recordBatch(endpoint: string, body: unknown): Promise<void> {
  try {
    await fetch(`${RECORD_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Recording failures are non-critical — don't break live feeds
  }
}

export function recordFlights(flights: unknown[]): void {
  if (flights.length === 0) return;
  void recordBatch("flights", { flights });
}

export function recordMilitary(flights: unknown[]): void {
  if (flights.length === 0) return;
  void recordBatch("military", { flights });
}

export function recordSatellites(satellites: unknown[]): void {
  if (satellites.length === 0) return;
  void recordBatch("satellites", { satellites });
}

export function recordQuakes(quakes: unknown[]): void {
  if (quakes.length === 0) return;
  void recordBatch("quakes", { quakes });
}

export function recordOutages(outages: unknown[]): void {
  if (outages.length === 0) return;
  void recordBatch("outages", { outages });
}

export function recordThreats(threats: unknown[]): void {
  if (threats.length === 0) return;
  void recordBatch("threats", { threats });
}
