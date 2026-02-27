/**
 * Static aircraft type identification database.
 * Maps ICAO type designator codes to aircraft metadata and category-based silhouette paths.
 */

export type AircraftCategory =
  | "Fighter"
  | "Bomber"
  | "Transport"
  | "Tanker"
  | "Reconnaissance"
  | "Helicopter"
  | "UAV"
  | "Trainer"
  | "Commercial"
  | "Maritime"
  | "AWACS"
  | "Unknown";

export interface AircraftTypeInfo {
  fullName: string;
  category: AircraftCategory;
  manufacturer: string;
  originCountry: string;
  silhouettePath: string;
}

const CATEGORY_SILHOUETTE: Record<AircraftCategory, string> = {
  Fighter: "/aircraft/fighter.svg",
  Bomber: "/aircraft/bomber.svg",
  Transport: "/aircraft/transport.svg",
  Tanker: "/aircraft/tanker.svg",
  Helicopter: "/aircraft/helicopter.svg",
  UAV: "/aircraft/uav.svg",
  Reconnaissance: "/aircraft/recon.svg",
  AWACS: "/aircraft/awacs.svg",
  Maritime: "/aircraft/maritime.svg",
  Trainer: "/aircraft/trainer.svg",
  Commercial: "/aircraft/commercial.svg",
  Unknown: "/aircraft/generic.svg",
};

const entry = (
  fullName: string,
  category: AircraftCategory,
  manufacturer: string,
  originCountry: string,
): AircraftTypeInfo => ({
  fullName,
  category,
  manufacturer,
  originCountry,
  silhouettePath: CATEGORY_SILHOUETTE[category],
});

export const AIRCRAFT_TYPES: Map<string, AircraftTypeInfo> = new Map([
  // ── Fighters ──────────────────────────────────────────────
  ["F16", entry("F-16 Fighting Falcon", "Fighter", "Lockheed Martin", "US")],
  ["F15", entry("F-15 Eagle", "Fighter", "McDonnell Douglas", "US")],
  ["F18", entry("F/A-18 Hornet", "Fighter", "McDonnell Douglas", "US")],
  ["F22", entry("F-22 Raptor", "Fighter", "Lockheed Martin", "US")],
  ["F35", entry("F-35 Lightning II", "Fighter", "Lockheed Martin", "US")],
  ["FA18", entry("F/A-18 Super Hornet", "Fighter", "Boeing", "US")],
  ["EF2K", entry("Eurofighter Typhoon", "Fighter", "Airbus/BAE", "EU")],
  ["RFL", entry("Rafale", "Fighter", "Dassault", "FR")],
  ["GRPN", entry("Gripen", "Fighter", "Saab", "SE")],
  ["TOR", entry("Tornado", "Fighter", "Panavia", "EU")],
  ["MG29", entry("MiG-29 Fulcrum", "Fighter", "Mikoyan", "RU")],
  ["SU27", entry("Su-27 Flanker", "Fighter", "Sukhoi", "RU")],
  ["SU30", entry("Su-30 Flanker-H", "Fighter", "Sukhoi", "RU")],
  ["SU35", entry("Su-35 Flanker-E", "Fighter", "Sukhoi", "RU")],
  ["J10", entry("J-10 Vigorous Dragon", "Fighter", "Chengdu", "CN")],
  ["F5", entry("F-5 Tiger II", "Fighter", "Northrop", "US")],
  ["MIR2", entry("Mirage 2000", "Fighter", "Dassault", "FR")],
  ["A10", entry("A-10 Thunderbolt II", "Fighter", "Fairchild Republic", "US")],

  // ── Bombers ───────────────────────────────────────────────
  ["B52", entry("B-52 Stratofortress", "Bomber", "Boeing", "US")],
  ["B1", entry("B-1B Lancer", "Bomber", "Rockwell", "US")],
  ["B2", entry("B-2 Spirit", "Bomber", "Northrop Grumman", "US")],
  ["TU95", entry("Tu-95 Bear", "Bomber", "Tupolev", "RU")],
  ["TU160", entry("Tu-160 Blackjack", "Bomber", "Tupolev", "RU")],

  // ── Transport ─────────────────────────────────────────────
  ["C130", entry("C-130 Hercules", "Transport", "Lockheed Martin", "US")],
  ["C17", entry("C-17 Globemaster III", "Transport", "Boeing", "US")],
  ["C5", entry("C-5 Galaxy", "Transport", "Lockheed Martin", "US")],
  ["C2", entry("C-2 Greyhound", "Transport", "Grumman", "US")],
  ["A400", entry("A400M Atlas", "Transport", "Airbus", "EU")],
  ["C295", entry("C-295", "Transport", "Airbus", "EU")],
  ["C27J", entry("C-27J Spartan", "Transport", "Leonardo", "IT")],
  ["AN12", entry("An-12", "Transport", "Antonov", "UA")],
  ["AN26", entry("An-26", "Transport", "Antonov", "UA")],
  ["IL76", entry("Il-76 Candid", "Transport", "Ilyushin", "RU")],

  // ── Tankers ───────────────────────────────────────────────
  ["KC10", entry("KC-10 Extender", "Tanker", "McDonnell Douglas", "US")],
  ["KC46", entry("KC-46 Pegasus", "Tanker", "Boeing", "US")],
  ["KC135", entry("KC-135 Stratotanker", "Tanker", "Boeing", "US")],
  ["A330", entry("A330 MRTT", "Tanker", "Airbus", "EU")],

  // ── Helicopters ───────────────────────────────────────────
  ["H60", entry("UH-60 Black Hawk", "Helicopter", "Sikorsky", "US")],
  ["H64", entry("AH-64 Apache", "Helicopter", "Boeing", "US")],
  ["H47", entry("CH-47 Chinook", "Helicopter", "Boeing", "US")],
  ["H53", entry("CH-53 Sea Stallion", "Helicopter", "Sikorsky", "US")],
  ["V22", entry("V-22 Osprey", "Helicopter", "Bell/Boeing", "US")],
  ["EC35", entry("EC135", "Helicopter", "Airbus Helicopters", "EU")],
  ["B412", entry("Bell 412", "Helicopter", "Bell", "US")],
  ["AS32", entry("AS332 Super Puma", "Helicopter", "Airbus Helicopters", "EU")],
  ["S70", entry("S-70", "Helicopter", "Sikorsky", "US")],

  // ── UAVs ──────────────────────────────────────────────────
  ["MQ9", entry("MQ-9 Reaper", "UAV", "General Atomics", "US")],
  ["MQ1", entry("MQ-1 Predator", "UAV", "General Atomics", "US")],
  ["RQ4", entry("RQ-4 Global Hawk", "UAV", "Northrop Grumman", "US")],
  ["HRON", entry("Heron", "UAV", "IAI", "IL")],

  // ── Reconnaissance / AWACS / Special ──────────────────────
  ["E3", entry("E-3 Sentry AWACS", "AWACS", "Boeing", "US")],
  ["E2", entry("E-2 Hawkeye", "AWACS", "Northrop Grumman", "US")],
  ["P3", entry("P-3 Orion", "Maritime", "Lockheed", "US")],
  ["P8", entry("P-8 Poseidon", "Maritime", "Boeing", "US")],
  ["RC135", entry("RC-135 Rivet Joint", "Reconnaissance", "Boeing", "US")],
  ["U2", entry("U-2 Dragon Lady", "Reconnaissance", "Lockheed", "US")],
  ["E6", entry("E-6 Mercury", "Reconnaissance", "Boeing", "US")],
  ["EP3", entry("EP-3 Aries II", "Reconnaissance", "Lockheed", "US")],

  // ── Trainers ──────────────────────────────────────────────
  ["T6", entry("T-6 Texan II", "Trainer", "Beechcraft", "US")],
  ["T38", entry("T-38 Talon", "Trainer", "Northrop", "US")],
  ["T45", entry("T-45 Goshawk", "Trainer", "BAE/Boeing", "US")],
  ["PC21", entry("PC-21", "Trainer", "Pilatus", "CH")],
  ["HAWK", entry("Hawk", "Trainer", "BAE Systems", "GB")],

  // ── Commercial ────────────────────────────────────────────
  ["B738", entry("Boeing 737-800", "Commercial", "Boeing", "US")],
  ["B737", entry("Boeing 737", "Commercial", "Boeing", "US")],
  ["B744", entry("Boeing 747-400", "Commercial", "Boeing", "US")],
  ["B763", entry("Boeing 767-300", "Commercial", "Boeing", "US")],
  ["B772", entry("Boeing 777-200", "Commercial", "Boeing", "US")],
  ["A320", entry("Airbus A320", "Commercial", "Airbus", "EU")],
  ["A321", entry("Airbus A321", "Commercial", "Airbus", "EU")],
  ["A332", entry("Airbus A330-200", "Commercial", "Airbus", "EU")],
  ["A343", entry("Airbus A340-300", "Commercial", "Airbus", "EU")],
  ["CRJ7", entry("CRJ-700", "Commercial", "Bombardier", "CA")],
  ["E170", entry("Embraer 170", "Commercial", "Embraer", "BR")],
  ["E190", entry("Embraer 190", "Commercial", "Embraer", "BR")],
  ["GLF5", entry("Gulfstream V", "Commercial", "Gulfstream", "US")],
  ["C56X", entry("Citation Excel", "Commercial", "Cessna", "US")],
  ["LJ60", entry("Learjet 60", "Commercial", "Bombardier", "CA")],
  ["C750", entry("Citation X", "Commercial", "Cessna", "US")],
  ["CL60", entry("Challenger 600", "Commercial", "Bombardier", "CA")],
  ["FA7X", entry("Falcon 7X", "Commercial", "Dassault", "FR")],
  ["GLEX", entry("Global Express", "Commercial", "Bombardier", "CA")],
]);

/**
 * Look up aircraft type info by ICAO type designator code.
 * Returns null when the code is missing or unrecognised.
 */
export function lookupAircraftType(code: string | null): AircraftTypeInfo | null {
  if (!code) return null;
  return AIRCRAFT_TYPES.get(code.toUpperCase().trim()) ?? null;
}
