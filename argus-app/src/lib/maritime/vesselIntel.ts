/**
 * Maritime vessel intelligence module — extracted and adapted from Sephiroth.
 * Provides vessel classification, chokepoint proximity detection, dark ship
 * detection, and MMSI-based country identification for the Argus dashboard.
 */

// ---------------------------------------------------------------------------
// Naval Chokepoints — strategic maritime bottlenecks
// ---------------------------------------------------------------------------
export const NAVAL_CHOKEPOINTS = [
  { name: "Strait of Hormuz", lat: 26.5, lon: 56.5, radius: 2 },
  { name: "Suez Canal", lat: 30.0, lon: 32.5, radius: 1 },
  { name: "Strait of Malacca", lat: 2.5, lon: 101.5, radius: 2 },
  { name: "Bab el-Mandeb", lat: 12.5, lon: 43.5, radius: 1.5 },
  { name: "Panama Canal", lat: 9.0, lon: -79.5, radius: 1 },
  { name: "Taiwan Strait", lat: 24.5, lon: 119.5, radius: 2 },
  { name: "South China Sea", lat: 15.0, lon: 115.0, radius: 5 },
  { name: "Black Sea", lat: 43.5, lon: 34.0, radius: 3 },
  { name: "Baltic Sea", lat: 58.0, lon: 20.0, radius: 4 },
  { name: "Sea of Japan", lat: 40.0, lon: 135.0, radius: 4 },
  { name: "Persian Gulf", lat: 26.5, lon: 52.0, radius: 4 },
  { name: "Eastern Mediterranean", lat: 34.5, lon: 33.0, radius: 3 },
] as const;

export type NavalChokepoint = (typeof NAVAL_CHOKEPOINTS)[number];

// ---------------------------------------------------------------------------
// Naval Bases — known major military port facilities
// ---------------------------------------------------------------------------
export const NAVAL_BASES = [
  { name: "Norfolk Naval Station", lat: 36.95, lon: -76.3, country: "USA" },
  { name: "San Diego Naval Base", lat: 32.68, lon: -117.15, country: "USA" },
  { name: "Pearl Harbor", lat: 21.35, lon: -157.95, country: "USA" },
  { name: "Yokosuka Naval Base", lat: 35.29, lon: 139.67, country: "Japan" },
  { name: "Qingdao Naval Base", lat: 36.07, lon: 120.38, country: "China" },
  { name: "Sevastopol", lat: 44.62, lon: 33.53, country: "Russia" },
  { name: "Portsmouth Naval Base", lat: 50.8, lon: -1.1, country: "UK" },
  { name: "Toulon Naval Base", lat: 43.12, lon: 5.93, country: "France" },
  { name: "Tartus Naval Base", lat: 34.89, lon: 35.87, country: "Syria" },
  { name: "Zhanjiang Naval Base", lat: 21.2, lon: 110.4, country: "China" },
  { name: "Vladivostok", lat: 43.12, lon: 131.9, country: "Russia" },
  { name: "Diego Garcia", lat: -7.32, lon: 72.42, country: "UK/USA" },
] as const;

// ---------------------------------------------------------------------------
// Known Naval Vessels — match by name or hull number
// ---------------------------------------------------------------------------
export interface KnownNavalVessel {
  name: string;
  hullNumber?: string;
  operator: string;
  country: string;
  vesselType: string;
}

export const KNOWN_NAVAL_VESSELS: KnownNavalVessel[] = [
  // US Aircraft Carriers
  { name: "NIMITZ", hullNumber: "CVN-68", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "EISENHOWER", hullNumber: "CVN-69", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "CARL VINSON", hullNumber: "CVN-70", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "ROOSEVELT", hullNumber: "CVN-71", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "LINCOLN", hullNumber: "CVN-72", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "WASHINGTON", hullNumber: "CVN-73", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "STENNIS", hullNumber: "CVN-74", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "TRUMAN", hullNumber: "CVN-75", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "REAGAN", hullNumber: "CVN-76", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "BUSH", hullNumber: "CVN-77", operator: "USN", country: "USA", vesselType: "carrier" },
  { name: "FORD", hullNumber: "CVN-78", operator: "USN", country: "USA", vesselType: "carrier" },
  // UK Carriers
  { name: "QUEEN ELIZABETH", hullNumber: "R08", operator: "RN", country: "UK", vesselType: "carrier" },
  { name: "PRINCE OF WALES", hullNumber: "R09", operator: "RN", country: "UK", vesselType: "carrier" },
  // Chinese Carriers
  { name: "LIAONING", operator: "PLAN", country: "China", vesselType: "carrier" },
  { name: "SHANDONG", operator: "PLAN", country: "China", vesselType: "carrier" },
  { name: "FUJIAN", operator: "PLAN", country: "China", vesselType: "carrier" },
  // Russian Carrier
  { name: "KUZNETSOV", operator: "VMF", country: "Russia", vesselType: "carrier" },
];

// ---------------------------------------------------------------------------
// AIS Ship Type Map — decode numeric AIS ship type codes
// ---------------------------------------------------------------------------
const AIS_TYPE_MAP: Record<number, string> = {
  0: "Not Available",
  30: "Fishing",
  31: "Towing",
  32: "Towing (Large)",
  33: "Dredging/Underwater Ops",
  34: "Diving Ops",
  35: "Military Ops",
  36: "Sailing",
  37: "Pleasure Craft",
  40: "High Speed Craft",
  50: "Pilot Vessel",
  51: "Search & Rescue",
  52: "Tug",
  53: "Port Tender",
  54: "Anti-Pollution",
  55: "Law Enforcement",
  58: "Medical Transport",
  60: "Passenger",
  69: "Passenger",
  70: "Cargo",
  79: "Cargo",
  80: "Tanker",
  89: "Tanker",
  90: "Other",
  99: "Other",
};

export function getAisShipTypeName(shipType: number | undefined): string | undefined {
  if (shipType === undefined) return undefined;
  if (AIS_TYPE_MAP[shipType]) return AIS_TYPE_MAP[shipType];
  if (shipType >= 20 && shipType <= 29) return "Wing in Ground";
  if (shipType >= 40 && shipType <= 49) return "High Speed Craft";
  if (shipType >= 60 && shipType <= 69) return "Passenger";
  if (shipType >= 70 && shipType <= 79) return "Cargo";
  if (shipType >= 80 && shipType <= 89) return "Tanker";
  if (shipType >= 90 && shipType <= 99) return "Other";
  return undefined;
}

// ---------------------------------------------------------------------------
// MMSI → Country mapping (Maritime Identification Digits)
// ---------------------------------------------------------------------------
const MID_COUNTRY: Record<string, string> = {
  "211": "Germany", "219": "Denmark", "220": "Denmark",
  "224": "Spain", "225": "Spain", "226": "France", "227": "France",
  "228": "France", "230": "Finland", "232": "UK", "233": "UK",
  "234": "UK", "235": "UK", "240": "Greece", "241": "Greece",
  "244": "Netherlands", "245": "Netherlands", "246": "Netherlands",
  "247": "Italy", "255": "Portugal", "257": "Norway", "258": "Norway",
  "259": "Norway", "261": "Poland", "265": "Sweden", "266": "Sweden",
  "271": "Turkey", "272": "Ukraine", "273": "Russia",
  "316": "Canada", "338": "USA", "366": "USA", "367": "USA",
  "368": "USA", "369": "USA", "370": "Panama", "371": "Panama",
  "372": "Panama", "403": "Saudi Arabia", "412": "China",
  "413": "China", "414": "China", "416": "Taiwan", "419": "India",
  "422": "Iran", "428": "Israel", "431": "Japan", "432": "Japan",
  "440": "South Korea", "441": "South Korea", "445": "North Korea",
  "447": "Kuwait", "461": "Oman", "466": "Qatar", "470": "UAE",
  "477": "Hong Kong", "503": "Australia", "512": "New Zealand",
  "525": "Indonesia", "533": "Malaysia", "548": "Philippines",
  "563": "Singapore", "564": "Singapore", "567": "Thailand",
  "574": "Vietnam",
};

export function getCountryByMmsi(mmsi: string): string | undefined {
  if (!mmsi || mmsi.length < 3) return undefined;
  return MID_COUNTRY[mmsi.substring(0, 3)];
}

// ---------------------------------------------------------------------------
// Vessel intelligence analysis
// ---------------------------------------------------------------------------
export interface VesselIntelReport {
  mmsi: string;
  country?: string;
  isPotentialMilitary: boolean;
  knownVessel?: KnownNavalVessel;
  nearChokepoint?: string;
  nearBase?: string;
  isDark: boolean;
  aisGapMinutes?: number;
  shipTypeName?: string;
}

/**
 * Check if a vessel name matches any known naval vessel.
 */
export function matchKnownVessel(name: string): KnownNavalVessel | undefined {
  if (!name) return undefined;
  const normalized = name.toUpperCase().trim();
  for (const vessel of KNOWN_NAVAL_VESSELS) {
    if (
      normalized.includes(vessel.name.toUpperCase()) ||
      (vessel.hullNumber && normalized.includes(vessel.hullNumber))
    ) {
      return vessel;
    }
  }
  return undefined;
}

/**
 * Check if an MMSI pattern indicates a potential military vessel.
 */
export function analyzeMmsi(mmsi: string): { isPotentialMilitary: boolean; country?: string } {
  if (!mmsi || mmsi.length < 9) return { isPotentialMilitary: false };
  const country = getCountryByMmsi(mmsi);
  const suffix = mmsi.substring(3);
  // Government/military vessels often use 00 or 99 suffix blocks
  if (suffix.startsWith("00") || suffix.startsWith("99")) {
    return { isPotentialMilitary: true, country };
  }
  // US Navy specific MMSI ranges
  if (mmsi.startsWith("3699") || mmsi.startsWith("369970")) {
    return { isPotentialMilitary: true, country: "USA" };
  }
  // UK Royal Navy
  if (mmsi.startsWith("2320")) {
    return { isPotentialMilitary: true, country: "UK" };
  }
  return { isPotentialMilitary: false, country };
}

/**
 * Find the nearest naval chokepoint, if within radius.
 */
export function getNearbyChokepoint(lat: number, lon: number): string | undefined {
  for (const cp of NAVAL_CHOKEPOINTS) {
    const dist = Math.sqrt((lat - cp.lat) ** 2 + (lon - cp.lon) ** 2);
    if (dist <= cp.radius) return cp.name;
  }
  return undefined;
}

/**
 * Find the nearest naval base, if within ~50 km (~0.5 degrees).
 */
export function getNearbyBase(lat: number, lon: number): string | undefined {
  for (const base of NAVAL_BASES) {
    const dist = Math.sqrt((lat - base.lat) ** 2 + (lon - base.lon) ** 2);
    if (dist <= 0.5) return base.name;
  }
  return undefined;
}

/**
 * Produce a full intelligence report for a vessel.
 */
export function analyzeVessel(
  mmsi: string,
  vesselName: string,
  lat: number,
  lon: number,
  lastUpdateMs?: number,
  shipType?: number,
): VesselIntelReport {
  const mmsiInfo = analyzeMmsi(mmsi);
  const knownVessel = matchKnownVessel(vesselName);
  const nearChokepoint = getNearbyChokepoint(lat, lon);
  const nearBase = getNearbyBase(lat, lon);

  let aisGapMinutes: number | undefined;
  let isDark = false;
  if (lastUpdateMs !== undefined) {
    aisGapMinutes = Math.round((Date.now() - lastUpdateMs) / 60_000);
    isDark = aisGapMinutes > 60;
  }

  return {
    mmsi,
    country: knownVessel?.country ?? mmsiInfo.country,
    isPotentialMilitary: mmsiInfo.isPotentialMilitary || !!knownVessel,
    knownVessel,
    nearChokepoint,
    nearBase,
    isDark,
    aisGapMinutes,
    shipTypeName: getAisShipTypeName(shipType),
  };
}

// ---------------------------------------------------------------------------
// Strategic Ports — key maritime infrastructure
// ---------------------------------------------------------------------------
export interface StrategicPort {
  name: string;
  lat: number;
  lon: number;
  country: string;
  type: "container" | "oil" | "lng" | "naval" | "mixed";
}

export const STRATEGIC_PORTS: StrategicPort[] = [
  // Persian Gulf / Strait of Hormuz region
  { name: "Ras Tanura", lat: 26.64, lon: 50.05, country: "Saudi Arabia", type: "oil" },
  { name: "Fujairah", lat: 25.12, lon: 56.33, country: "UAE", type: "oil" },
  { name: "Kharg Island", lat: 29.23, lon: 50.31, country: "Iran", type: "oil" },
  { name: "Ras Laffan", lat: 25.91, lon: 51.54, country: "Qatar", type: "lng" },
  { name: "Jebel Ali", lat: 25.0, lon: 55.06, country: "UAE", type: "container" },
  { name: "Bandar Abbas", lat: 27.19, lon: 56.27, country: "Iran", type: "mixed" },
  { name: "Mina Al Ahmadi", lat: 29.05, lon: 48.17, country: "Kuwait", type: "oil" },
  // Strategic chokepoint ports
  { name: "Port Said", lat: 31.26, lon: 32.3, country: "Egypt", type: "container" },
  { name: "Suez", lat: 29.97, lon: 32.55, country: "Egypt", type: "mixed" },
  { name: "Djibouti", lat: 11.59, lon: 43.15, country: "Djibouti", type: "naval" },
  { name: "Aden", lat: 12.79, lon: 45.01, country: "Yemen", type: "mixed" },
  // Major global hubs
  { name: "Singapore", lat: 1.26, lon: 103.83, country: "Singapore", type: "container" },
  { name: "Shanghai", lat: 30.63, lon: 122.07, country: "China", type: "container" },
  { name: "Rotterdam", lat: 51.89, lon: 4.29, country: "Netherlands", type: "container" },
];
