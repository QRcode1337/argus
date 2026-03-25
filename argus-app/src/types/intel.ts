export type LayerKey =
  | "flights"
  | "military"
  | "satellites"
  | "satelliteLinks"
  | "seismic"
  | "bases"
  | "outages"
  | "threats"
  | "gdelt"
  | "anomalies"
  | "weather"
  | "vessels";
export type SceneMode = "globe_sat" | "globe_street" | "globe_map" | "flat_map";
export type FeedKey = "opensky" | "celestrak" | "usgs" | "adsb" | "cfradar" | "otx" | "fred" | "ais" | "gdelt" | "threatradar" | "phantom";
export type VisualMode = "normal" | "nvg" | "flir" | "crt";
export type PlatformMode = "live" | "playback" | "analytics";
export type AnalyticsLayerKey = "gfs_weather" | "sentinel_imagery";
export type CameraCategory = "Traffic" | "Nature" | "Landmark" | "Wildlife" | "Scenic" | "Infrastructure";
export type CameraProvider = "TFL" | "Windy" | "Hardcoded";
export type FlightCategory = "commercial" | "private" | "unknown";

export type NvgVisualParams = {
  gain: number;
  bloom: number;
  scanlines: number;
  pixelation: number;
};

export type FlirVisualParams = {
  bias: number;
  contrast: number;
  posterize: number;
};

export type CrtVisualParams = {
  scanlineDensity: number;
  chromaticShift: number;
  distortion: number;
  instability: number;
};

export type VisualParams = {
  nvg: NvgVisualParams;
  flir: FlirVisualParams;
  crt: CrtVisualParams;
};

export type FeedStatus = "idle" | "ok" | "stale" | "error";

export interface FeedHealth {
  status: FeedStatus;
  lastSuccessAt: number | null;
  lastError: string | null;
}

export interface CameraReadout {
  lat: number;
  lon: number;
  altMeters: number;
}

export interface PoiPreset {
  id: string;
  label: string;
  lon: number;
  lat: number;
  height: number;
  heading?: number;
  pitch?: number;
  roll?: number;
}

export interface OpenSkyState {
  icao24: string;
  callsign: string | null;
  originCountry: string;
  timePosition: number | null;
  lastContact: number;
  longitude: number | null;
  latitude: number | null;
  baroAltitude: number | null;
  onGround: boolean;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate: number | null;
  geoAltitude: number | null;
  squawk: string | null;
  spi: boolean;
  positionSource: number;
}

export interface TrackedFlight {
  id: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitudeMeters: number;
  trueTrack: number;
  velocity: number;
  originCountry: string;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
  category: FlightCategory;
}

export interface PlaybackFlightSnapshot {
  id: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitudeMeters: number;
}

export interface MilitaryFlight {
  id: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitudeMeters: number;
  trueTrack: number;
  velocity: number;
  type: string | null;
}

export interface PlaybackMilitarySnapshot {
  id: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitudeMeters: number;
}

export type OrbitType = "LEO" | "MEO" | "GEO" | "HEO" | "SSO" | "Unknown";
export type RcsSize = "SMALL" | "MEDIUM" | "LARGE" | "Unknown";

export interface SatelliteMetadata {
  objectType: string | null;
  countryCode: string | null;
  launchDate: string | null;
  launchSite: string | null;
  rcsSize: RcsSize;
  periodMinutes: number | null;
  inclinationDeg: number | null;
  apogeeKm: number | null;
  perigeeKm: number | null;
  decayDate: string | null;
  orbitType: OrbitType;
}

export interface SatelliteRecord {
  id: string;
  name: string;
  tle1: string;
  tle2: string;
  metadata?: SatelliteMetadata;
}

export interface SatellitePosition {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  altitudeKm: number;
}

export interface PlaybackSatelliteSnapshot {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  altitudeKm: number;
}

export interface EarthquakeFeature {
  id: string;
  longitude: number;
  latitude: number;
  depthKm: number;
  magnitude: number;
  place: string;
  timestamp: number;
}

export interface CctvCamera {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  imageUrl: string;
  streamUrl?: string;
  category: CameraCategory;
  provider: CameraProvider;
}

export interface IntelDatum {
  label: string;
  value: string;
}

export type IntelImportance = "normal" | "important";

export interface SelectedIntel {
  id: string;
  name: string;
  kind: string;
  importance: IntelImportance;
  quickFacts: IntelDatum[];
  fullFacts: IntelDatum[];
  imageUrl?: string;
  streamUrl?: string;
  externalUrl?: string;
  externalLabel?: string;
  analysisSummary?: string;
  coordinates?: {
    lat: number;
    lon: number;
    altMeters?: number | null;
  };
}

export interface ClickedCoordinates {
  lat: number;
  lon: number;
  altMeters?: number | null;
}

export type PlaybackSpeed = 1 | 3 | 5 | 15 | 60;

export interface RecordedFlightFrame {
  timestamp: number;
  data: PlaybackFlightSnapshot[];
}

export interface RecordedMilitaryFrame {
  timestamp: number;
  data: PlaybackMilitarySnapshot[];
}

export interface RecordedSatelliteFrame {
  timestamp: number;
  data: PlaybackSatelliteSnapshot[];
}
