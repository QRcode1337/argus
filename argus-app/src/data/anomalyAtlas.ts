import raw from "./googleEarthAnomalies.json";

export type AnomalyCategory =
  | "geometric"
  | "crater"
  | "censored"
  | "desert"
  | "underwater"
  | "military"
  | "natural"
  | "vanished"
  | "antarctica"
  | "other";

export type AnomalyStatus = "confirmed" | "ambiguous" | "unresolved" | "unexplained" | "unknown";

export interface AnomalySite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: AnomalyCategory;
  status: AnomalyStatus;
  description: string;
}

export const ANOMALY_SITES: AnomalySite[] = raw as AnomalySite[];

export const CATEGORY_COLORS: Record<AnomalyCategory, string> = {
  geometric: "#fabd2f",
  crater: "#fe8019",
  censored: "#d3869b",
  desert: "#b8bb26",
  underwater: "#83a598",
  military: "#fb4934",
  natural: "#8ec07c",
  vanished: "#928374",
  antarctica: "#7daea3",
  other: "#d5c4a1",
};

export const CATEGORY_LABELS: Record<AnomalyCategory, string> = {
  geometric: "Geometric",
  crater: "Crater",
  censored: "Censored",
  desert: "Desert",
  underwater: "Underwater",
  military: "Military",
  natural: "Natural",
  vanished: "Vanished",
  antarctica: "Antarctica",
  other: "Other",
};

export const STATUS_ICONS: Record<AnomalyStatus, string> = {
  confirmed: "\u2705",
  ambiguous: "\u26a0\ufe0f",
  unresolved: "\u2753",
  unexplained: "\ud83d\udd34",
  unknown: "\u2b55",
};
