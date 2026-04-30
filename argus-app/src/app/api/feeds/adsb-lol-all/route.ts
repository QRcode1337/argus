import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface AdsbLolAircraft {
  hex: string;
  type?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  nav_qnh?: number;
  nav_altitude_mcp?: number;
  nav_modes?: string[];
  nic?: number;
  rc?: number;
  seen_pos?: number;
  version?: number;
  nic_baro?: number;
  nac_p?: number;
  nac_v?: number;
  sil?: number;
  sil_type?: string;
  gva?: number;
  sda?: number;
  alert?: number;
  spi?: number;
  mlat?: boolean;
  tisb?: boolean;
  messages?: number;
  seen?: number;
  rssi?: number;
  dst?: number;
  dir?: string;
  dbFlags?: number;
}

interface AdsbLolResponse {
  ac?: AdsbLolAircraft[];
}

// Regional polling points (lat, lon, radius_nm, label)
const REGIONAL_POINTS = [
  { lat: 39.0, lon: -98.0, radius: 250, label: "US-CONUS" },
  { lat: 50.0, lon: 10.0, radius: 200, label: "EUROPE" },
  { lat: 25.0, lon: 55.0, radius: 200, label: "MIDDLE-EAST" },
  { lat: 20.0, lon: 115.0, radius: 180, label: "SOUTH-CHINA" },
  { lat: 52.0, lon: 20.0, radius: 180, label: "EASTERN-EUROPE" },
  { lat: 35.0, lon: 135.0, radius: 180, label: "JAPAN-KOREA" },
  { lat: 22.0, lon: 78.0, radius: 200, label: "INDIA" },
  { lat: 30.0, lon: 10.0, radius: 180, label: "NORTH-AFRICA" },
  { lat: 35.0, lon: -110.0, radius: 200, label: "US-WEST" },
  { lat: -33.0, lon: 145.0, radius: 200, label: "AUSTRALIA" },
] as const;

// Key aircraft types for military/transp
const AIRCRAFT_TYPES = [
  "B747", "B767", "B777", "B787", "C17", "C5", "KC135",
  "A330", "A400", "C130", "B737", "A320", "E170", "E190",
  "DH8", "AT4", "B757", "A310", "MD11", "L1011",
];

// Squawk codes for emergencies
const EMERGENCY_SQUAWKS = ["7500", "7600", "7700"];

async function pollJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function pollAll(): Promise<{ hex: string; ac: AdsbLolAircraft[]; source: string }[]> {
  const BASE = "https://api.adsb.lol";
  const results: { hex: string; ac: AdsbLolAircraft[]; source: string }[] = [];
  const seen = new Set<string>();

  // 1. Regional polling
  for (const pt of REGIONAL_POINTS) {
    const url = `${BASE}/v2/point/${pt.lat}/${pt.lon}/${pt.radius}`;
    const data = await pollJson<AdsbLolResponse>(url);
    const ac = data?.ac ?? [];
    const newAircraft = ac.filter((a) => {
      if (!a.hex || !a.lat || !a.lon) return false;
      if (seen.has(a.hex)) return false;
      seen.add(a.hex);
      return true;
    });
    if (newAircraft.length > 0) {
      results.push({ hex: `region-${pt.label}`, ac: newAircraft, source: pt.label });
    }
  }

  // 2. Aircraft type filtering (for specific aircraft of interest)
  for (const type of AIRCRAFT_TYPES) {
    const url = `${BASE}/v2/type/${type}`;
    const data = await pollJson<AdsbLolResponse>(url);
    const ac = data?.ac ?? [];
    const newAircraft = ac.filter((a) => {
      if (!a.hex || !a.lat || !a.lon) return false;
      if (seen.has(a.hex)) return false;
      seen.add(a.hex);
      return true;
    });
    if (newAircraft.length > 0) {
      results.push({ hex: `type-${type}`, ac: newAircraft, source: `TYPE:${type}` });
    }
  }

  // 3. Emergency squawks
  for (const sqk of EMERGENCY_SQUAWKS) {
    const url = `${BASE}/v2/squawk/${sqk}`;
    const data = await pollJson<AdsbLolResponse>(url);
    const ac = data?.ac ?? [];
    const newAircraft = ac.filter((a) => {
      if (!a.hex || !a.lat || !a.lon) return false;
      if (seen.has(a.hex)) return false;
      seen.add(a.hex);
      return true;
    });
    if (newAircraft.length > 0) {
      results.push({ hex: `squawk-${sqk}`, ac: newAircraft, source: `SQUAWK:${sqk}` });
    }
  }

  // 4. LADD aircraft (restricted/classified)
  const laddUrl = `${BASE}/v2/ladd`;
  const laddData = await pollJson<AdsbLolResponse>(laddUrl);
  const laddAc = laddData?.ac ?? [];
  const newLaddAc = laddAc.filter((a) => {
    if (!a.hex || !a.lat || !a.lon) return false;
    if (seen.has(a.hex)) return false;
    seen.add(a.hex);
    return true;
  });
  if (newLaddAc.length > 0) {
    results.push({ hex: "ladd", ac: newLaddAc, source: "LADD" });
  }

  // 5. PIA aircraft (privacy-protected, may include sensitive ops)
  const piaUrl = `${BASE}/v2/pia`;
  const piaData = await pollJson<AdsbLolResponse>(piaUrl);
  const piaAc = piaData?.ac ?? [];
  const newPiaAc = piaAc.filter((a) => {
    if (!a.hex || !a.lat || !a.lon) return false;
    if (seen.has(a.hex)) return false;
    seen.add(a.hex);
    return true;
  });
  if (newPiaAc.length > 0) {
    results.push({ hex: "pia", ac: newPiaAc, source: "PIA" });
  }

  // 6. Closest to key strategic points (chokepoints)
  const chokepoints = [
    { lat: 26.7, lon: 56.3, label: "HORMUZ" }, // Strait of Hormuz
    { lat: 3.5, lon: 103.7, label: "MALACCA" }, // Strait of Malacca
    { lat: 33.0, lon: 35.0, label: "MED" }, // Mediterranean
    { lat: 62.0, lon: 16.0, label: "GIUL" }, // North Atlantic (GIUL waypoint area)
    { lat: 48.0, lon: 130.0, label: "BFOG" }, // Bering Sea
  ];
  for (const cp of chokepoints) {
    const url = `${BASE}/v2/closest/${cp.lat}/${cp.lon}/10`;
    const data = await pollJson<{ ac?: AdsbLolAircraft[] }>(url);
    const ac = data?.ac ?? [];
    const newAircraft = ac.filter((a) => {
      if (!a.hex || !a.lat || !a.lon) return false;
      if (seen.has(a.hex)) return false;
      seen.add(a.hex);
      return true;
    });
    if (newAircraft.length > 0) {
      results.push({ hex: `choke-${cp.label}`, ac: newAircraft, source: cp.label });
    }
  }

  return results;
}

export async function GET() {
  try {
    const results = await pollAll();

    // Flatten into a single deduplicated array
    const allAircraft: Record<string, AdsbLolAircraft> = {};
    for (const r of results) {
      for (const ac of r.ac) {
        if (!allAircraft[ac.hex]) {
          allAircraft[ac.hex] = { ...ac, ...r }; // Merge source info
        }
      }
    }

    const aircraftArray = Object.values(allAircraft);

    return NextResponse.json({
      aircraft: aircraftArray,
      sourceCount: results.length,
      totalCount: aircraftArray.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "adsb.lol poll failed" },
      { status: 502 },
    );
  }
}
