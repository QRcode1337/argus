import { create } from "zustand";

import type { IntelBriefing } from "@/lib/intel/analysisEngine";
import type {
  AnalyticsLayerKey,
  CameraCategory,
  CameraReadout,
  CctvCamera,
  FeedHealth,
  FeedKey,
  LayerKey,
  PlaybackSpeed,
  PlatformMode,
  SceneMode,
  VisualMode,
  VisualParams,
} from "@/types/intel";

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
    cctv: number;
    bases: number;
    outages: number;
    threats: number;
  };
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
      | "satellites"
      | "satelliteLinks"
      | "seismic"
      | "cctv"
      | "bases"
      | "outages"
      | "threats",
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
  cctvCategoryFilter: CameraCategory | "All";
  setCctvCategoryFilter: (filter: CameraCategory | "All") => void;
  toggleAnalyticsLayer: (key: AnalyticsLayerKey) => void;
  setActiveGfsCogPath: (path: string | null) => void;
  intelBriefing: IntelBriefing | null;
  setIntelBriefing: (briefing: IntelBriefing | null) => void;
  trackedEntityId: string | null;
  setTrackedEntityId: (id: string | null) => void;
  cameras: CctvCamera[];
  setCameras: (cameras: CctvCamera[]) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  sceneMode: SceneMode;
  // DVR Playback
  playbackTime: Date | null;
  playbackSpeed: PlaybackSpeed;
  isPlaying: boolean;
  setPlaybackTime: (time: Date | null) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setIsPlaying: (playing: boolean) => void;
  playbackTimeRange: { start: number; end: number } | null;
  setPlaybackTimeRange: (range: { start: number; end: number } | null) => void;
  setSceneMode: (mode: SceneMode) => void;
  dayNight: boolean;
  toggleDayNight: () => void;
};

const emptyFeed = (): FeedHealth => ({
  status: "idle",
  lastSuccessAt: null,
  lastError: null,
});

export const useArgusStore = create<ArgusStore>((set) => ({
  layers: {
    flights: false,
    military: true,
    satellites: false,
    satelliteLinks: true,
    seismic: false,
    cctv: true,
    bases: true,
    outages: true,
    threats: true,
  },
  counts: {
    flights: 0,
    military: 0,
    satellites: 0,
    satelliteLinks: 0,
    seismic: 0,
    cctv: 0,
    bases: 0,
    outages: 0,
    threats: 0,
  },
  feedHealth: {
    opensky: emptyFeed(),
    celestrak: emptyFeed(),
    usgs: emptyFeed(),
    adsb: emptyFeed(),
    cctv: emptyFeed(),
    cfradar: emptyFeed(),
    otx: emptyFeed(),
    fred: emptyFeed(),
    ais: emptyFeed(),
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
  cctvCategoryFilter: "All",
  setCctvCategoryFilter: (filter) => set({ cctvCategoryFilter: filter }),
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
    set((state) => ({
      feedHealth: {
        ...state.feedHealth,
        [key]: {
          status: "ok",
          lastSuccessAt: Date.now(),
          lastError: null,
        },
      },
    })),
  setFeedError: (key, message) =>
    set((state) => ({
      feedHealth: {
        ...state.feedHealth,
        [key]: {
          ...state.feedHealth[key],
          status: "error",
          lastError: message,
        },
      },
    })),
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
  cameras: [],
  setCameras: (cameras) => set({ cameras }),
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  sceneMode: "globe",
  setSceneMode: (mode) => set({ sceneMode: mode }),
  // DVR Playback
  playbackTime: null,
  playbackSpeed: 1,
  isPlaying: false,
  setPlaybackTime: (time) => set({ playbackTime: time }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  playbackTimeRange: null,
  setPlaybackTimeRange: (range) => set({ playbackTimeRange: range }),
  dayNight: false,
  toggleDayNight: () => set((state) => ({ dayNight: !state.dayNight })),
}));
