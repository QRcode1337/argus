export interface AisVessel {
  mmsi: string;
  lat: number;
  lon: number;
  sog: number;     // speed over ground (knots)
  cog: number;     // course over ground (degrees)
  heading: number;
  navStatus: number;
  timestamp: string;
  vesselName: string;
  callsign: string;
}

export const NAV_STATUS_LABELS: Record<number, string> = {
  0: "Under Way (Engine)",
  1: "At Anchor",
  2: "Not Under Command",
  3: "Restricted Maneuverability",
  4: "Constrained by Draught",
  5: "Moored",
  6: "Aground",
  7: "Engaged in Fishing",
  8: "Under Way (Sailing)",
  9: "Reserved (HSC)",
  10: "Reserved (WIG)",
  11: "Power-driven Towing Astern",
  12: "Pushing/Towing",
  14: "AIS-SART",
  15: "Undefined",
};
