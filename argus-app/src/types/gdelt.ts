export type GdeltQuadClass = 1 | 2 | 3 | 4;

export interface GdeltEvent {
  id: string;
  dateAdded: string;
  actor1Name: string;
  actor1Country: string;
  actor2Name: string;
  actor2Country: string;
  eventCode: string;
  eventBaseCode: string;
  eventRootCode: string;
  quadClass: GdeltQuadClass;
  goldsteinScale: number;
  numMentions: number;
  numSources: number;
  avgTone: number;
  actionGeoName: string;
  actionGeoCountry: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
}

export const QUAD_CLASS_LABELS: Record<GdeltQuadClass, string> = {
  1: "Verbal Cooperation",
  2: "Material Cooperation",
  3: "Verbal Conflict",
  4: "Material Conflict",
};

export const QUAD_CLASS_COLORS: Record<GdeltQuadClass, string> = {
  1: "#3498db",
  2: "#2ecc71",
  3: "#f39c12",
  4: "#e74c3c",
};
