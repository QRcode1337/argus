import { create } from "zustand";

import type { IntelBriefing } from "@/lib/intel/analysisEngine";
import type {
  AnalyticsLayerKey,
  CameraReadout,
  ClickedCoordinates,
  CorroborationAlert,
  FeedHealth,
  FeedKey,
  LayerKey,
  PlaybackSpeed,
  PlatformMode,
  SceneMode,
  VisualMode,
  VisualParams,
} from "@/types/intel";

import type { BreakingNewsCard } from "@/lib/analysis/breakingNews";
import type { NewsCluster } from "@/lib/analysis/newsClustering";
import type { ThreatRadarThreat } from "@/lib/ingest/threatradar";
import type { TrackedFlight } from "@/types/intel";

export type AcledEvent = { event_type: string; country: string; location: string; fatalities: number; actor1: string; event_date: string; latitude: number; longitude: number };
export type PolymarketEvent = { question: string; probability: number; volume: number; category: string; slug: string };
export type GdacsEvent = { type: string; severity: string; country: string; title: string; populationExposed: number; date: string; lat: number; lon: number };
export type FaaDelay = { airport: string; delayType: string; reason: string; avgDelay: string };
export type FaaNotam = { id: string; location: string; type: string; description: string };

export interface SearchResult {
  id: string;
  name: string;
  kind: string;
  lat: number | null;
  lon: number | null;
}

type ArgusStore = {
  layers: Record<LayerKey, boolean>;
  counts: {
    flights: number;
    military: number;
    satellites: number;
    satelliteLinks: number;
    seismic: number;
    bases: number;
    outages: number;
    threats: number;
    gdelt: number;
    anomalies: number;
    weather: number;
    vessels: number;
  };
  ciiScores: Record<string, { score: number; signals: Record<string, number>; updatedAt: number }>;
  setCiiScores: (scores: Record<string, { score: number; signals: Record<string, number>; updatedAt: number }>) => void;
  alerts: CorroborationAlert[];
  addAlert: (alert: CorroborationAlert) => void;
  updateAlert: (id: string, patch: Partial<CorroborationAlert>) => void;
  feedHealth: Record<FeedKey, FeedHealth>;
  activePoiId: string | null;
  camera: CameraReadout;
  visualMode: VisualMode;
  visualIntensity: number;
  visualParams: VisualParams;
  platformMode: PlatformMode;
  analyticsLayers: Record<AnalyticsLayerKey, boolean>;
  activeGfsCogPath: string | null;
  toggleLayer: (layer: LayerKey) => void;
  setLayer: (layer: LayerKey, enabled: boolean) => void;
  setCount: (
    key:
      | "flights"
      | "military"
      | "adsblol"
      | "satellites"
      | "satelliteLinks"
      | "seismic"
      | "bases"
      | "outages"
      | "threats"
      | "gdelt"
      | "anomalies"
      | "weather"
      | "vessels",
    value: number,
  ) => void;
  setFeedHealthy: (key: FeedKey) => void;
  setFeedError: (key: FeedKey, message: string) => void;
  setCamera: (camera: CameraReadout) => void;
  setActivePoiId: (poiId: string | null) => void;
  setVisualMode: (mode: VisualMode) => void;
  setVisualIntensity: (value: number) => void;
  setPlatformMode: (mode: PlatformMode) => void;
  setVisualParam: <
    K extends keyof VisualParams,
    P extends keyof VisualParams[K],
  >(
    mode: K,
    key: P,
    value: number,
  ) => void;
  toggleAnalyticsLayer: (key: AnalyticsLayerKey) => void;
  setActiveGfsCogPath: (path: string | null) => void;
  intelBriefing: IntelBriefing | null;
  setIntelBriefing: (briefing: IntelBriefing | null) => void;
  trackedEntityId: string | null;
  setTrackedEntityId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  sceneMode: SceneMode;
  clickedCoordinates: ClickedCoordinates | null;
  // DVR Playback
  playbackTime: Date | null;
  playbackSpeed: PlaybackSpeed;
  isPlaying: boolean;
  setPlaybackTime: (time: Date | null) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setIsPlaying: (playing: boolean) => void;
  playbackTimeRange: { start: number; end: number } | null;
  setPlaybackTimeRange: (range: { start: number; end: number } | null) => void;
  playbackCurrentTime: number;
  setPlaybackCurrentTime: (time: number) => void;
  setSceneMode: (mode: SceneMode) => void;
  setClickedCoordinates: (coords: ClickedCoordinates | null) => void;
  dayNight: boolean;
  toggleDayNight: () => void;
  // New feed data
  acledEvents: AcledEvent[];
  setAcledEvents: (events: AcledEvent[]) => void;
  polymarketEvents: PolymarketEvent[];
  setPolymarketEvents: (events: PolymarketEvent[]) => void;
  gdacsEvents: GdacsEvent[];
  setGdacsEvents: (events: GdacsEvent[]) => void;
  faaDelays: FaaDelay[];
  setFaaDelays: (delays: FaaDelay[]) => void;
  faaNotams: FaaNotam[];
  setFaaNotams: (notams: FaaNotam[]) => void;
  breakingNews: BreakingNewsCard[];
  setBreakingNews: (news: BreakingNewsCard[]) => void;
  threatradarData: ThreatRadarThreat[];
  setThreatradarData: (threats: ThreatRadarThreat[]) => void;
  newsClusters: NewsCluster<{ title: string; score: number }>[];
  setNewsClusters: (clusters: NewsCluster<{ title: string; score: number }>[]) => void;
  adsbLolData: TrackedFlight[];
  setAdsbLolData: (data: TrackedFlight[]) => void;
};

const emptyFeed = (): FeedHealth => ({
  status: "idle",
  lastSuccessAt: null,
  lastError: null,
  nextRefreshAt: null,
  consecutiveFailures: 0,
  circuitState: "closed",
});

export const useArgusStore = create<ArgusStore>((set) => ({
  layers: {
    flights: false,
    military: true,
    satellites: false,
    satelliteLinks: true,
    seismic: false,
    bases: true,
    outages: true,
    threats: true,
    gdelt: true,
    anomalies: true,
    weather: false,
    vessels: true,
    instability: false,
    adsblol: false,
  },
  counts: {
    flights: 0,
    military: 0,
    adsblol: 0,
    satellites: 0,
    satelliteLinks: 0,
    seismic: 0,
    bases: 0,
    outages: 0,
    threats: 0,
    gdelt: 0,
    anomalies: 0,
    weather: 0,
    vessels: 0,
  },
  feedHealth: {
    opensky: emptyFeed(),
    celestrak: emptyFeed(),
    usgs: emptyFeed(),
    adsb: emptyFeed(),
    adsblol: emptyFeed(),
    cfradar: emptyFeed(),
    otx: emptyFeed(),
    fred: emptyFeed(),
    ais: emptyFeed(),
    gdelt: emptyFeed(),
    threatradar: emptyFeed(),
    phantom: emptyFeed(),
    news: emptyFeed(),
    acled: emptyFeed(),
    polymarket: emptyFeed(),
    gdacs: emptyFeed(),
    faa: emptyFeed(),
  },
  activePoiId: null,
  camera: {
    lat: 0,
    lon: 0,
    altMeters: 0,
  },
  visualMode: "normal",
  visualIntensity: 0.75,
  platformMode: "live",
  analyticsLayers: {
    gfs_weather: true,
    sentinel_imagery: false,
  },
  activeGfsCogPath: null,
  visualParams: {
    nvg: {
      gain: 0.75,
      bloom: 0.45,
      scanlines: 0.6,
      pixelation: 0.2,
    },
    flir: {
      bias: 0.52,
      contrast: 0.68,
      posterize: 0.4,
    },
    crt: {
      scanlineDensity: 0.6,
      chromaticShift: 0.45,
      distortion: 0.2,
      instability: 0.35,
    },
  },
  toggleLayer: (layer) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layer]: !state.layers[layer],
      },
    })),
  setLayer: (layer, enabled) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layer]: enabled,
      },
    })),
  setCount: (key, value) =>
    set((state) => ({
      counts: {
        ...state.counts,
        [key]: value,
      },
    })),
  setFeedHealthy: (key) =>
    set((s) => ({
      feedHealth: {
        ...s.feedHealth,
        [key]: {
          status: "ok",
          lastSuccessAt: Date.now(),
          lastError: null,
          nextRefreshAt: s.feedHealth[key]?.nextRefreshAt ?? null,
          consecutiveFailures: 0,
          circuitState: "closed",
        },
      },
    })),
  setFeedError: (key, message) =>
    set((s) => {
      const prev = s.feedHealth[key];
      const failures = (prev?.consecutiveFailures ?? 0) + 1;
      return {
        feedHealth: {
          ...s.feedHealth,
          [key]: {
            status: failures >= 2 ? "cooldown" : "error",
            lastSuccessAt: prev?.lastSuccessAt ?? null,
            lastError: message,
            nextRefreshAt: prev?.nextRefreshAt ?? null,
            consecutiveFailures: failures,
            circuitState: failures >= 2 ? "open" : prev?.circuitState ?? "closed",
          },
        },
      };
    }),
  setCamera: (camera) => set({ camera }),
  setActivePoiId: (poiId) => set({ activePoiId: poiId }),
  setVisualMode: (mode) => set({ visualMode: mode }),
  setVisualIntensity: (value) => set({ visualIntensity: value }),
  setPlatformMode: (mode) => set({ platformMode: mode }),
  setVisualParam: (mode, key, value) =>
    set((state) => ({
      visualParams: {
        ...state.visualParams,
        [mode]: {
          ...state.visualParams[mode],
          [key]: value,
        },
      },
    })),
  toggleAnalyticsLayer: (key) =>
    set((state) => ({
      analyticsLayers: {
        ...state.analyticsLayers,
        [key]: !state.analyticsLayers[key],
      },
    })),
  setActiveGfsCogPath: (path) => set({ activeGfsCogPath: path }),
  intelBriefing: null,
  setIntelBriefing: (briefing) => set({ intelBriefing: briefing }),
  trackedEntityId: null,
  setTrackedEntityId: (id) => set({ trackedEntityId: id }),
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  sceneMode: "globe_sat",
  clickedCoordinates: null,
  setSceneMode: (mode) => set({ sceneMode: mode }),
  setClickedCoordinates: (coords) => set({ clickedCoordinates: coords }),
  // DVR Playback
  playbackTime: null,
  playbackSpeed: 1,
  isPlaying: false,
  setPlaybackTime: (time) => set({ playbackTime: time }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  playbackTimeRange: null,
  setPlaybackTimeRange: (range) => set({ playbackTimeRange: range }),
  playbackCurrentTime: 0,
  setPlaybackCurrentTime: (time) => set({ playbackCurrentTime: time }),
  dayNight: false,
  toggleDayNight: () => set((state) => ({ dayNight: !state.dayNight })),
  // New feed data
  acledEvents: [],
  setAcledEvents: (events) => set({ acledEvents: events }),
  polymarketEvents: [],
  setPolymarketEvents: (events) => set({ polymarketEvents: events }),
  gdacsEvents: [],
  setGdacsEvents: (events) => set({ gdacsEvents: events }),
  faaDelays: [],
  setFaaDelays: (delays) => set({ faaDelays: delays }),
  faaNotams: [],
  setFaaNotams: (notams) => set({ faaNotams: notams }),
  breakingNews: [],
  setBreakingNews: (news) => set({ breakingNews: news }),
  threatradarData: [],
  setThreatradarData: (threats) => set({ threatradarData: threats }),
  newsClusters: [],
  setNewsClusters: (clusters) => set({ newsClusters: clusters }),
  adsbLolData: [],
  setAdsbLolData: (data) => set({ adsbLolData: data }),
  ciiScores: {},
  setCiiScores: (scores) => set({ ciiScores: scores }),
  alerts: [],
  addAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 100) })),
  updateAlert: (id, patch) => set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
}));
