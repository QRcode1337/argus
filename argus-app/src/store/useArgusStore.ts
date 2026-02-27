import { create } from "zustand";

import type {
  AnalyticsLayerKey,
  CameraCategory,
  CameraReadout,
  FeedHealth,
  FeedKey,
  LayerKey,
  PlatformMode,
  VisualMode,
  VisualParams,
} from "@/types/intel";

type ArgusStore = {
  layers: Record<LayerKey, boolean>;
  counts: {
    flights: number;
    military: number;
    satellites: number;
    seismic: number;
    cctv: number;
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
    key: "flights" | "military" | "satellites" | "seismic" | "cctv",
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
  trackedEntityId: string | null;
  setTrackedEntityId: (id: string | null) => void;
};

const emptyFeed = (): FeedHealth => ({
  status: "idle",
  lastSuccessAt: null,
  lastError: null,
});

export const useArgusStore = create<ArgusStore>((set) => ({
  layers: {
    flights: true,
    military: false,
    satellites: true,
    seismic: true,
    cctv: false,
  },
  counts: {
    flights: 0,
    military: 0,
    satellites: 0,
    seismic: 0,
    cctv: 0,
  },
  feedHealth: {
    opensky: emptyFeed(),
    celestrak: emptyFeed(),
    usgs: emptyFeed(),
    adsb: emptyFeed(),
    tfl: emptyFeed(),
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
  trackedEntityId: null,
  setTrackedEntityId: (id) => set({ trackedEntityId: id }),
}));
