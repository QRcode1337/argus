import { create } from "zustand";

export type TimeWindow = "1h" | "6h" | "24h" | "7d" | "all";

export type IncidentType = "gdelt" | "military" | "vessel" | "seismic";
export type Severity = "critical" | "high" | "medium" | "low";

export interface EpicFuryIncident {
  type: IncidentType;
  id: string;
  lat: number;
  lon: number;
  timestamp: number;
  title: string;
  severity: Severity;
  detail: string;
  source: string;
}

export interface ZoomRegion {
  id: string;
  label: string;
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface RegionStats {
  militaryInRegion: number;
  vesselsInRegion: number;
  incidentsLastHour: number;
  seismicInRegion: number;
}

const TIME_WINDOW_MS: Record<TimeWindow, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  all: Infinity,
};

const MAX_INCIDENTS = 500;

function isInRegion(lat: number, lon: number, r: ZoomRegion): boolean {
  return lat >= r.south && lat <= r.north && lon >= r.west && lon <= r.east;
}

export function filterEpicFuryIncidents(
  incidents: EpicFuryIncident[],
  timeWindow: TimeWindow,
  lockedRegion: ZoomRegion | null,
  now = Date.now(),
): EpicFuryIncident[] {
  const cutoff = timeWindow === "all" ? 0 : now - TIME_WINDOW_MS[timeWindow];
  return incidents.filter((incident) => {
    if (incident.timestamp < cutoff) return false;
    if (lockedRegion && !isInRegion(incident.lat, incident.lon, lockedRegion)) return false;
    return true;
  });
}

export function computeEpicFuryRegionStats(
  incidents: EpicFuryIncident[],
  lockedRegion: ZoomRegion | null,
  now = Date.now(),
): RegionStats {
  if (!lockedRegion) {
    return { militaryInRegion: 0, vesselsInRegion: 0, incidentsLastHour: 0, seismicInRegion: 0 };
  }

  const inRegion = incidents.filter((incident) => isInRegion(incident.lat, incident.lon, lockedRegion));
  const oneHourAgo = now - 3_600_000;
  return {
    militaryInRegion: inRegion.filter((incident) => incident.type === "military").length,
    vesselsInRegion: inRegion.filter((incident) => incident.type === "vessel").length,
    incidentsLastHour: inRegion.filter((incident) => incident.timestamp >= oneHourAgo).length,
    seismicInRegion: inRegion.filter((incident) => incident.type === "seismic").length,
  };
}

type EpicFuryStore = {
  active: boolean;
  timeWindow: TimeWindow;
  lockedRegion: ZoomRegion | null;
  incidents: EpicFuryIncident[];

  setActive: (on: boolean) => void;
  setTimeWindow: (w: TimeWindow) => void;
  lockRegion: (r: ZoomRegion) => void;
  unlockRegion: () => void;
  pushIncidents: (items: EpicFuryIncident[]) => void;
  filteredIncidents: () => EpicFuryIncident[];
  regionStats: () => RegionStats;
};

export const useEpicFuryStore = create<EpicFuryStore>((set, get) => ({
  active: false,
  timeWindow: "24h",
  lockedRegion: null,
  incidents: [],

  setActive: (on) => set({ active: on }),
  setTimeWindow: (w) => set({ timeWindow: w }),
  lockRegion: (r) => set({ lockedRegion: r }),
  unlockRegion: () => set({ lockedRegion: null }),

  pushIncidents: (items) =>
    set((state) => {
      const existing = new Set(state.incidents.map((i) => i.id));
      const fresh = items.filter((i) => !existing.has(i.id));
      if (fresh.length === 0) return state;
      const merged = [...fresh, ...state.incidents];
      return { incidents: merged.slice(0, MAX_INCIDENTS) };
    }),

  filteredIncidents: () => {
    const { incidents, timeWindow, lockedRegion } = get();
    return filterEpicFuryIncidents(incidents, timeWindow, lockedRegion);
  },

  regionStats: () => {
    const { incidents, lockedRegion } = get();
    return computeEpicFuryRegionStats(incidents, lockedRegion);
  },
}));
