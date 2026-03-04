const RECORD_BASE = "/api/record";

async function recordBatch(endpoint: string, body: Record<string, unknown>): Promise<void> {
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

export function recordFlights(flights: Array<Record<string, unknown>>): void {
  if (flights.length === 0) return;
  void recordBatch("flights", { flights });
}

export function recordMilitary(flights: Array<Record<string, unknown>>): void {
  if (flights.length === 0) return;
  void recordBatch("military", { flights });
}

export function recordSatellites(satellites: Array<Record<string, unknown>>): void {
  if (satellites.length === 0) return;
  void recordBatch("satellites", { satellites });
}

export function recordQuakes(quakes: Array<Record<string, unknown>>): void {
  if (quakes.length === 0) return;
  void recordBatch("quakes", { quakes });
}

export function recordOutages(outages: Array<Record<string, unknown>>): void {
  if (outages.length === 0) return;
  void recordBatch("outages", { outages });
}

export function recordThreats(threats: Array<Record<string, unknown>>): void {
  if (threats.length === 0) return;
  void recordBatch("threats", { threats });
}
