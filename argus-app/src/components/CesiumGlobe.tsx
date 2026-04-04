"use client";
import { AnalystControls } from "./AnalystControls";
import { TimelineScrubber } from "./TimelineScrubber";

import "cesium/Build/Cesium/Widgets/widgets.css";

import {
  ArcType,
  Cartographic,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  Entity,
  HeadingPitchRoll,
  HorizontalOrigin,
  Ion,
  JulianDate,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  Rectangle,
  SceneMode as CesiumSceneMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  defined,
} from "cesium";
import { useCallback, useEffect, useRef, useState } from "react";

import { ARGUS_CONFIG, CAMERA_PRESETS } from "@/lib/config";
import { FlightLayer } from "@/lib/cesium/layers/flightLayer";
import { MilitaryLayer } from "@/lib/cesium/layers/militaryLayer";
import { RasterLayer } from "@/lib/cesium/layers/rasterLayer";
import { BasesLayer } from "@/lib/cesium/layers/basesLayer";
import { OutageLayer } from "@/lib/cesium/layers/outageLayer";
import { ThreatLayer } from "@/lib/cesium/layers/threatLayer";
import { AnomalyLayer } from "@/lib/cesium/layers/anomalyLayer";
import { SatelliteLayer } from "@/lib/cesium/layers/satelliteLayer";
import { SeismicLayer } from "@/lib/cesium/layers/seismicLayer";
import { GdeltLayer } from "@/lib/cesium/layers/gdeltLayer";
import { WeatherLayer } from "@/lib/cesium/layers/weatherLayer";
import { VesselLayer } from "@/lib/cesium/layers/vesselLayer";
import { VisualModeController } from "@/lib/cesium/shaders/visualModes";
import { fetchMilitaryFlights } from "@/lib/ingest/adsb";
import { fetchOpenSkyFlights } from "@/lib/ingest/opensky";
import { fetchAircraftPhoto } from "@/lib/ingest/planespotters";
import { PollingManager } from "@/lib/ingest/pollingManager";
import { computeSatellitePositions, fetchTleRecords } from "@/lib/ingest/tle";
import { fetchInternetOutages } from "@/lib/ingest/cloudflareRadar";
import { fetchThreatPulses } from "@/lib/ingest/otx";
import { fetchFredObservations } from "@/lib/ingest/fred";
import { fetchAisVessels } from "@/lib/ingest/aisstream";
import { fetchUsgsQuakes } from "@/lib/ingest/usgs";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import { fetchIssIntel } from "@/lib/ingest/iss";
import { recordFlights, recordMilitary, recordSatellites, recordQuakes, recordOutages, recordThreats } from "@/lib/ingest/recorder";
import {
  analyzeFlights,
  analyzeMilitary,
  analyzeSatellites,
  analyzeSeismic,
  analyzePhantomResults,
  generateBriefing,
} from "@/lib/intel/analysisEngine";
import type { IntelAlert, PhantomAnomaly } from "@/lib/intel/analysisEngine";
import { useArgusStore } from "@/store/useArgusStore";
import type { SearchResult } from "@/store/useArgusStore";
import type {
  IntelDatum,
  IntelImportance,
  PlatformMode,
  SceneMode,
  SelectedIntel,
  SatelliteRecord,
} from "@/types/intel";

import { HudOverlay } from "./HudOverlay";
import { EpicFuryHud } from "./EpicFuryHud";
import { useEpicFuryStore } from "@/store/useEpicFuryStore";
import {
  mapGdeltIncidents,
  mapMilitaryIncidents,
  mapVesselIncidents,
  mapSeismicIncidents,
} from "@/lib/epicFuryMappers";
import { FlatMapView } from "./FlatMapView";

type CesiumGlobeProps = {
  className?: string;
};

type AnalyticsLayer = {
  id: string;
  label: string;
  source: string;
  type: string;
  tileUrl: string;
  maximumLevel?: number;
  available: boolean;
  // legacy fields from old argus-api format
  variable?: string;
  tile_url?: string | null;
  source_file?: string | null;
  error?: string | null;
};

type AnalyticsResponse = {
  layers: AnalyticsLayer[];
  available_file_count?: number;
  fallback?: boolean;
  error?: string;
};

type TileErrorLike = {
  message?: unknown;
  error?: unknown;
  retry?: boolean;
};

type ImageryProviderWithErrorEvent = {
  errorEvent?: {
    addEventListener?: (listener: (error: TileErrorLike) => void) => (() => void) | void;
  };
};

type ImageryLayerWithProvider = {
  imageryProvider?: ImageryProviderWithErrorEvent;
};

/** Zoom-box hotspot regions rendered as rectangles on the globe */
const ZOOM_REGIONS = [
  { id: "zr-mideast", label: "MIDEAST", west: 30, south: 12, east: 63, north: 42, color: "#fb4934", height: 1_200_000 },
  { id: "zr-europe", label: "EUROPE", west: -12, south: 35, east: 45, north: 72, color: "#83a598", height: 2_500_000 },
  { id: "zr-east-asia", label: "E. ASIA", west: 100, south: 18, east: 150, north: 50, color: "#fabd2f", height: 3_000_000 },
  { id: "zr-south-asia", label: "S. ASIA", west: 60, south: 5, east: 100, north: 40, color: "#d3869b", height: 2_000_000 },
  { id: "zr-north-am", label: "N. AMERICA", west: -130, south: 24, east: -65, north: 55, color: "#8ec07c", height: 4_000_000 },
  { id: "zr-south-am", label: "S. AMERICA", west: -82, south: -56, east: -34, north: 14, color: "#fe8019", height: 4_000_000 },
  { id: "zr-africa", label: "AFRICA", west: -18, south: -36, east: 52, north: 38, color: "#b8bb26", height: 4_500_000 },
  { id: "zr-arctic", label: "ARCTIC", west: -180, south: 66, east: 180, north: 90, color: "#458588", height: 3_500_000 },
  { id: "zr-oceania", label: "OCEANIA", west: 110, south: -48, east: 180, north: -8, color: "#689d6a", height: 3_500_000 },
  { id: "zr-ukraine", label: "UKRAINE", west: 22, south: 44, east: 41, north: 53, color: "#fb4934", height: 800_000 },
  { id: "zr-taiwan-str", label: "TAIWAN STR.", west: 115, south: 21, east: 125, north: 28, color: "#fb4934", height: 600_000 },
  { id: "zr-horn-africa", label: "HORN / RED SEA", west: 36, south: 2, east: 55, north: 18, color: "#fe8019", height: 800_000 },
] as const;

const UNSUPPORTED_ZOOM_ERROR = /zoom level not supported/i;

const isUnsupportedZoomError = (value: unknown): boolean => {
  if (!value) {
    return false;
  }

  if (typeof value === "string") {
    return UNSUPPORTED_ZOOM_ERROR.test(value);
  }

  if (value instanceof Error) {
    return UNSUPPORTED_ZOOM_ERROR.test(value.message);
  }

  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    return (
      isUnsupportedZoomError(candidate.message) ||
      isUnsupportedZoomError(candidate.error) ||
      isUnsupportedZoomError(candidate.title)
    );
  }

  return false;
};

const suppressUnsupportedZoomErrors = (viewer: Viewer): (() => void) => {
  const cleanupFns: Array<() => void> = [];
  const seenProviders = new WeakSet<object>();
  const imageryLayers = viewer.imageryLayers;
  const widget = viewer.cesiumWidget as unknown as {
    showErrorPanel?: (...args: unknown[]) => void;
  };
  const removeUnsupportedErrorPanels = () => {
    const panels = viewer.container.querySelectorAll(".cesium-widget-errorPanel");
    for (const panel of panels) {
      const text = panel.textContent ?? "";
      if (UNSUPPORTED_ZOOM_ERROR.test(text)) {
        panel.remove();
      }
    }
  };

  const attachProvider = (provider?: ImageryProviderWithErrorEvent) => {
    if (!provider || typeof provider !== "object" || seenProviders.has(provider)) {
      return;
    }

    seenProviders.add(provider);
    const removeListener = provider.errorEvent?.addEventListener?.((tileError) => {
      if (isUnsupportedZoomError(tileError)) {
        tileError.retry = false;
      }
    });

    if (typeof removeListener === "function") {
      cleanupFns.push(removeListener);
    }
  };

  const attachLayer = (layer?: ImageryLayerWithProvider) => {
    attachProvider(layer?.imageryProvider);
  };

  for (let index = 0; index < imageryLayers.length; index += 1) {
    attachLayer(imageryLayers.get(index) as ImageryLayerWithProvider);
  }

  const removeLayerAddedListener = imageryLayers.layerAdded.addEventListener((layer) => {
    attachLayer(layer as ImageryLayerWithProvider);
  });
  if (typeof removeLayerAddedListener === "function") {
    cleanupFns.push(removeLayerAddedListener);
  }

  const originalShowErrorPanel = widget.showErrorPanel;
  if (typeof originalShowErrorPanel === "function") {
    widget.showErrorPanel = (...args: unknown[]) => {
      if (args.some(isUnsupportedZoomError)) {
        removeUnsupportedErrorPanels();
        return;
      }

      originalShowErrorPanel.apply(widget, args);
    };

    cleanupFns.push(() => {
      widget.showErrorPanel = originalShowErrorPanel;
    });
  }

  const observer = new MutationObserver(() => {
    removeUnsupportedErrorPanels();
  });
  observer.observe(viewer.container, { childList: true, subtree: true });
  cleanupFns.push(() => observer.disconnect());

  return () => {
    for (const cleanup of cleanupFns.reverse()) {
      cleanup();
    }
  };
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "n/a";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "n/a";
    }
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readPropertyBag = (entity: Entity, at: JulianDate): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  const bag = entity.properties as
    | (Record<string, unknown> & { propertyNames?: string[]; getValue?: (time: JulianDate) => Record<string, unknown> })
    | undefined;

  if (!bag) return values;

  // Try PropertyBag.getValue() first — returns all properties as a plain object
  if (typeof bag.getValue === "function") {
    try {
      const all = bag.getValue(at);
      if (all && typeof all === "object") return all as Record<string, unknown>;
    } catch { /* fall through */ }
  }

  // Standard path: iterate propertyNames
  if (Array.isArray(bag.propertyNames)) {
    for (const key of bag.propertyNames) {
      const candidate = bag[key] as { getValue?: (time: JulianDate) => unknown } | undefined;
      values[key] =
        typeof candidate?.getValue === "function" ? candidate.getValue(at) : candidate;
    }
    return values;
  }

  // Fallback: iterate own keys (handles plain object properties)
  for (const key of Object.keys(bag)) {
    if (key === "propertyNames" || key === "definitionChanged" || key === "isConstant") continue;
    const candidate = bag[key] as { getValue?: (time: JulianDate) => unknown } | undefined;
    values[key] =
      typeof candidate?.getValue === "function" ? candidate.getValue(at) : candidate;
  }

  return values;
};

const inferKindFromId = (id: string): string => {
  if (id.startsWith("flight-")) return "flight";
  if (id.startsWith("mil-")) return "military";
  if (id.startsWith("sat-")) return "satellite";
  if (id.startsWith("quake-")) return "earthquake";
  if (id.startsWith("anomaly-")) return "anomaly";

  if (id.startsWith("base-")) return "base";
  if (id.startsWith("outage-")) return "outage";
  if (id.startsWith("threat-")) return "threat";
  if (id.startsWith("vessel-")) return "vessel";
  return "unknown";
};

const buildFlightAwareUrl = (callsign: unknown): string | undefined => {
  if (typeof callsign !== "string") return undefined;
  const normalized = callsign.replace(/\s+/g, "").toUpperCase();
  if (!normalized) return undefined;
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(normalized)}`;
};

const buildAnalysisSummary = (kind: string, props: Record<string, unknown>, name: string): string => {
  switch (kind) {
    case "flight":
      return [
        `${name} is a ${String(props.flightCategory ?? "tracked")} civilian aircraft.`,
        props.originCountry ? `Origin country: ${props.originCountry}.` : null,
        typeof props.velocity === "number" ? `Current velocity is ${Math.round(props.velocity)} m/s.` : null,
        typeof props.track === "number" ? `Track is ${Math.round(props.track)} degrees.` : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "military":
      return [
        `${name} is a military aircraft track.`,
        props.aircraftFullName ? `Platform: ${props.aircraftFullName}.` : null,
        props.aircraftOrigin ? `Origin: ${props.aircraftOrigin}.` : null,
        typeof props.velocity === "number" ? `Current velocity is ${Math.round(props.velocity)} m/s.` : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "gdelt":
      return [
        `${name} is a GDELT event with ${props.numMentions ?? "unknown"} mentions across ${props.numSources ?? "unknown"} sources.`,
        typeof props.goldsteinScale === "number"
          ? `Goldstein score ${Number(props.goldsteinScale).toFixed(1)} indicates ${
              Number(props.goldsteinScale) < 0 ? "conflict pressure" : "cooperative posture"
            }.`
          : null,
        typeof props.avgTone === "number"
          ? `Average tone is ${Number(props.avgTone).toFixed(2)}.`
          : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "satellite":
      return [
        `${name} is ${props.isIss ? "the International Space Station" : "a tracked orbital object"}.`,
        props.orbitType ? `Orbit regime: ${props.orbitType}.` : null,
        props.countryCode ? `Country code: ${props.countryCode}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "anomaly":
      return [
        `${name} is a Phantom chaos anomaly.`,
        props.anomaly_type ? `Type: ${props.anomaly_type}.` : null,
        props.severity ? `Severity: ${props.severity}.` : null,
        typeof props.chaos_score === "number" ? `Chaos score: ${Number(props.chaos_score).toFixed(2)}.` : null,
        props.detail ? String(props.detail) : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "vessel":
      return [
        `${name} is an AIS-tracked vessel (MMSI: ${props.mmsi ?? "unknown"}).`,
        typeof props.sog === "number" ? `Speed over ground: ${Number(props.sog).toFixed(1)} knots.` : null,
        typeof props.cog === "number" ? `Course: ${Number(props.cog).toFixed(0)}°.` : null,
        props.callsign ? `Callsign: ${props.callsign}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
    default:
      return `${name} is the currently selected target. Review quick facts and full facts for supporting context.`;
  }
};

const isFlatMapMode = (sceneMode: SceneMode): boolean => sceneMode === "flat_map";

const PRIORITY_THRESHOLDS = {
  earthquakeMagnitude: 4.5,
  flightVelocityMps: 220,
} as const;

const classifyImportance = (kind: string, props: Record<string, unknown>): IntelImportance => {
  if (kind === "military" || kind === "threat") return "important";
  if (kind === "anomaly") {
    const severity = String(props.severity ?? "");
    const chaosScore = toNumber(props.chaos_score);
    if (severity === "Critical" || severity === "High" || (chaosScore !== null && chaosScore >= 0.7)) {
      return "important";
    }
    return "normal";
  }
  if (kind === "gdelt" && toNumber(props.goldsteinScale) !== null && (toNumber(props.goldsteinScale)! <= -7)) return "important";

  const magnitude = toNumber(props.magnitude);
  if (
    kind === "earthquake" &&
    magnitude !== null &&
    magnitude >= PRIORITY_THRESHOLDS.earthquakeMagnitude
  ) {
    return "important";
  }

  const velocity = toNumber(props.velocity);
  if (kind === "flight" && velocity !== null && velocity >= PRIORITY_THRESHOLDS.flightVelocityMps) {
    return "important";
  }

  return "normal";
};

const buildSelectedIntel = (entity: Entity): SelectedIntel | null => {
  const at = JulianDate.now();
  const props = readPropertyBag(entity, at);
  const inferredKind = inferKindFromId(entity.id);
  const kind = typeof props.kind === "string" ? props.kind : inferredKind;

  const labelText = (entity.label?.text as { getValue?: (time: JulianDate) => unknown } | undefined)
    ?.getValue?.(at);
  const name =
    (typeof props.callsign === "string" && props.callsign) ||
    (typeof props.name === "string" && props.name) ||
    (typeof props.place === "string" && props.place) ||
    (typeof labelText === "string" && labelText) ||
    entity.id;

  const position = entity.position?.getValue(at);
  const cartographic = position ? Cartographic.fromCartesian(position) : null;

  const quickFacts: IntelDatum[] = [];
  const pushQuick = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    quickFacts.push({ label, value: formatValue(value) });
  };

  pushQuick("Kind", kind);
  if (cartographic) {
    pushQuick("Lat", CesiumMath.toDegrees(cartographic.latitude).toFixed(4));
    pushQuick("Lon", CesiumMath.toDegrees(cartographic.longitude).toFixed(4));
    pushQuick("Alt (m)", cartographic.height.toFixed(0));
  }

  switch (kind) {
    case "flight":
      pushQuick("Callsign", props.callsign);
      pushQuick("Category", props.flightCategory);
      pushQuick("Origin", props.originCountry);
      pushQuick("Velocity (m/s)", props.velocity);
      pushQuick("Track (deg)", props.track);
      pushQuick("Vert Rate (m/s)", props.verticalRate);
      pushQuick("On Ground", props.onGround);
      pushQuick("Squawk", props.squawk);
      break;
    case "military":
      pushQuick("Callsign", props.callsign);
      pushQuick("Aircraft", props.aircraftFullName ?? props.type);
      pushQuick("Category", props.aircraftCategory);
      pushQuick("Manufacturer", props.aircraftManufacturer);
      pushQuick("Origin", props.aircraftOrigin);
      pushQuick("Velocity (m/s)", props.velocity);
      pushQuick("Track (deg)", props.track);
      break;
    case "earthquake":
      pushQuick("Magnitude", props.magnitude);
      pushQuick("Depth (km)", props.depthKm);
      break;
    case "satellite":
      pushQuick("Platform", props.isIss ? "ISS" : "Satellite");
      pushQuick("Name", props.name);
      pushQuick("Type", props.classification);
      pushQuick("Orbit", props.orbitType);
      pushQuick("Country", props.countryCode);
      pushQuick("Launch Date", props.launchDate);
      pushQuick("Size", props.rcsSize);
      pushQuick("Period (min)", props.periodMinutes);
      pushQuick("Inclination", props.inclinationDeg);
      pushQuick("Apogee (km)", props.apogeeKm);
      pushQuick("Perigee (km)", props.perigeeKm);
      break;
    case "anomaly":
      pushQuick("Type", props.anomaly_type);
      pushQuick("Severity", props.severity);
      pushQuick("Chaos Score", props.chaos_score);
      pushQuick("Detected", props.detected_at);
      pushQuick("Detail", props.detail);
      break;
    case "threat":
      pushQuick("Adversary", props.adversary);
      pushQuick("Malware", props.malware);
      pushQuick("Industries", props.industries);
      pushQuick("Target", props.targetedCountry);
      pushQuick("IOCs", props.indicators);
      pushQuick("TLP", props.tlp);
      pushQuick("Tags", props.tags);
      break;
    case "gdelt":
      pushQuick("Actor 1", `${props.actor1Name ?? ""} (${props.actor1Country ?? ""})`);
      pushQuick("Actor 2", `${props.actor2Name ?? ""} (${props.actor2Country ?? ""})`);
      pushQuick("Event Code", props.eventCode);
      pushQuick("Goldstein", props.goldsteinScale);
      pushQuick("Mentions", props.numMentions);
      pushQuick("Tone", props.avgTone);
      pushQuick("Location", props.actionGeoName);
      pushQuick("Source", props.sourceUrl);
      break;
    case "vessel":
      pushQuick("MMSI", props.mmsi);
      pushQuick("Name", props.vesselName);
      pushQuick("Callsign", props.callsign);
      pushQuick("Speed (kn)", props.sog);
      pushQuick("Course", props.cog);
      pushQuick("Heading", props.heading);
      pushQuick("Nav Status", props.navStatus);
      break;
    default:
      break;
  }

  const quickLabels = new Set(quickFacts.map((f) => f.label));
  const fullFacts: IntelDatum[] = [{ label: "Entity ID", value: entity.id }];
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || key === "kind") continue;
    const formatted = formatValue(value);
    // Skip properties already shown in quickFacts
    if (quickLabels.has(key) || quickFacts.some((f) => f.value === formatted)) continue;
    fullFacts.push({ label: key, value: formatted });
  }

  if (cartographic) {
    fullFacts.push({
      label: "Coordinates",
      value: `${CesiumMath.toDegrees(cartographic.latitude).toFixed(4)}, ${CesiumMath.toDegrees(
        cartographic.longitude,
      ).toFixed(4)}`,
    });
    fullFacts.push({
      label: "Altitude (m)",
      value: cartographic.height.toFixed(0),
    });
  }

  return {
    id: entity.id,
    name,
    kind,
    importance: classifyImportance(kind, props),
    quickFacts,
    fullFacts,
    imageUrl:
      typeof props.imageUrl === "string" && props.imageUrl !== "/camera-placeholder.svg"
        ? props.imageUrl
        : undefined,
    streamUrl: typeof props.streamUrl === "string" ? props.streamUrl : undefined,
    externalUrl:
      (kind === "flight" || kind === "military")
        ? buildFlightAwareUrl(props.callsign)
        : typeof props.sourceUrl === "string"
          ? props.sourceUrl
          : undefined,
    externalLabel:
      kind === "flight" || kind === "military"
        ? "FlightAware"
        : typeof props.sourceUrl === "string"
          ? "Source Link"
          : undefined,
    analysisSummary: buildAnalysisSummary(kind, props, name),
    coordinates: cartographic
      ? {
          lat: CesiumMath.toDegrees(cartographic.latitude),
          lon: CesiumMath.toDegrees(cartographic.longitude),
          altMeters: cartographic.height,
        }
      : undefined,
  };
};

const generateCirclePositions = (center: Cartesian3, radius: number, segments = 64): Cartesian3[] => {
  const positions: Cartesian3[] = [];
  const cartographic = Cartographic.fromCartesian(center);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const lat = cartographic.latitude + (radius / 6371000) * Math.cos(angle);
    const lon = cartographic.longitude + (radius / (6371000 * Math.cos(cartographic.latitude))) * Math.sin(angle);
    positions.push(Cartesian3.fromRadians(lon, lat, cartographic.height));
  }
  return positions;
};

export function CesiumGlobe({ className }: CesiumGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);

  const flightLayerRef = useRef<FlightLayer | null>(null);
  const militaryLayerRef = useRef<MilitaryLayer | null>(null);
  const satLayerRef = useRef<SatelliteLayer | null>(null);
  const seismicLayerRef = useRef<SeismicLayer | null>(null);
  const basesLayerRef = useRef<BasesLayer | null>(null);
  const outageLayerRef = useRef<OutageLayer | null>(null);
  const threatLayerRef = useRef<ThreatLayer | null>(null);
  const gdeltLayerRef = useRef<GdeltLayer | null>(null);
  const rasterLayerRef = useRef<RasterLayer | null>(null);
  const sentinelLayerRef = useRef<RasterLayer | null>(null);
  const anomalyLayerRef = useRef<AnomalyLayer | null>(null);
  const weatherLayerRef = useRef<WeatherLayer | null>(null);
  const vesselLayerRef = useRef<VesselLayer | null>(null);
  const visualModeRef = useRef<VisualModeController | null>(null);
  const pickerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const platformModeRef = useRef<PlatformMode>("live");
  const satRecordsRef = useRef<SatelliteRecord[]>([]);
  const hoveredEntityRef = useRef<Entity | null>(null);
  const hoveredOriginalSizeRef = useRef<number | null>(null);
  const hoveredOriginalScaleRef = useRef<number | null>(null);
  const selectionRingRef = useRef<Entity | null>(null);

  const flightAlertsRef = useRef<IntelAlert[]>([]);
  const militaryAlertsRef = useRef<IntelAlert[]>([]);
  const satelliteAlertsRef = useRef<IntelAlert[]>([]);
  const seismicAlertsRef = useRef<IntelAlert[]>([]);
  const phantomAlertsRef = useRef<IntelAlert[]>([]);
  const phantomRawRef = useRef<PhantomAnomaly[]>([]);

  const [selectedIntel, setSelectedIntel] = useState<SelectedIntel | null>(null);
  const [showFullIntel, setShowFullIntel] = useState(false);
  const [analyticsStatus, setAnalyticsStatus] = useState<string | null>(null);
  const [collisionEnabled, setCollisionEnabled] = useState(false);
  const pushIncidents = useEpicFuryStore((s) => s.pushIncidents);
  const epicFuryActive = useEpicFuryStore((s) => s.active);
  const setEpicFuryActive = useEpicFuryStore((s) => s.setActive);
  const collisionEnabledRef = useRef(collisionEnabled);
  useEffect(() => {
    collisionEnabledRef.current = collisionEnabled;
  }, [collisionEnabled]);

  const layers = useArgusStore((s) => s.layers);
  const platformMode = useArgusStore((s) => s.platformMode);
  const analyticsLayers = useArgusStore((s) => s.analyticsLayers);
  const visualMode = useArgusStore((s) => s.visualMode);
  const visualIntensity = useArgusStore((s) => s.visualIntensity);
  const visualParams = useArgusStore((s) => s.visualParams);
  const setCount = useArgusStore((s) => s.setCount);
  const setFeedHealthy = useArgusStore((s) => s.setFeedHealthy);
  const setFeedError = useArgusStore((s) => s.setFeedError);
  const setCamera = useArgusStore((s) => s.setCamera);
  const intelBriefing = useArgusStore((s) => s.intelBriefing);
  const setIntelBriefing = useArgusStore((s) => s.setIntelBriefing);
  const trackedEntityId = useArgusStore((s) => s.trackedEntityId);
  const setTrackedEntityId = useArgusStore((s) => s.setTrackedEntityId);
  const searchQuery = useArgusStore((s) => s.searchQuery);
  const sceneMode = useArgusStore((s) => s.sceneMode);
  const dayNight = useArgusStore((s) => s.dayNight);
  const setSearchResults = useArgusStore((s) => s.setSearchResults);
  const setPlaybackTimeRange = useArgusStore((s) => s.setPlaybackTimeRange);
  const setPlaybackCurrentTime = useArgusStore((s) => s.setPlaybackCurrentTime);
  const setPlaybackTime = useArgusStore((s) => s.setPlaybackTime);
  const setIsPlaying = useArgusStore((s) => s.setIsPlaying);
  const clickedCoordinates = useArgusStore((s) => s.clickedCoordinates);
  const setClickedCoordinates = useArgusStore((s) => s.setClickedCoordinates);

  const flyToPoi = useCallback((poiId: string) => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const poi = CAMERA_PRESETS.find((item) => item.id === poiId);
    if (!poi) {
      return;
    }

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(poi.lon, poi.lat, poi.height),
      orientation: new HeadingPitchRoll(
        poi.heading ?? 0,
        poi.pitch ?? CesiumMath.toRadians(-45),
        poi.roll ?? 0,
      ),
      duration: 1.2,
    });
  }, []);

  const resetCamera = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyHome(1.2);
  }, []);

  const toggleCollisionDetection = useCallback(() => {
    setCollisionEnabled((current) => !current);
  }, []);

  const zoomIn = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const height = viewer.camera.positionCartographic.height;
    const target = Math.max(height * 0.5, 15);
    viewer.camera.zoomIn(height - target);
  }, []);

  const zoomOut = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const height = viewer.camera.positionCartographic.height;
    const target = Math.min(height * 2, 60_000_000);
    viewer.camera.zoomOut(target - height);
  }, []);

  const tiltUp = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.lookUp(CesiumMath.toRadians(10));
  }, []);

  const tiltDown = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.lookDown(CesiumMath.toRadians(10));
  }, []);

  const rotateLeft = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.rotateLeft(CesiumMath.toRadians(15));
  }, []);

  const rotateRight = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.rotateRight(CesiumMath.toRadians(15));
  }, []);

  const flyToSelectedEntity = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedIntel) return;

    const entity = viewer.entities.getById(selectedIntel.id);

    // Fallback for intel items that are not Cesium entities (e.g. live feeds/news)
    if (!entity) {
      if (!selectedIntel.coordinates) return;

      setClickedCoordinates({
        lat: selectedIntel.coordinates.lat,
        lon: selectedIntel.coordinates.lon,
        altMeters: selectedIntel.coordinates.altMeters ?? null,
      });

      const cameraAlt = viewer.camera.positionCartographic.height;
      const targetAlt = Math.max(cameraAlt, 500_000);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          selectedIntel.coordinates.lon,
          selectedIntel.coordinates.lat,
          targetAlt,
        ),
        duration: 1.5,
      });
      return;
    }

    const position = entity.position?.getValue(JulianDate.now());
    if (!position) {
      if (!selectedIntel.coordinates) return;

      setClickedCoordinates({
        lat: selectedIntel.coordinates.lat,
        lon: selectedIntel.coordinates.lon,
        altMeters: selectedIntel.coordinates.altMeters ?? null,
      });

      const cameraAlt = viewer.camera.positionCartographic.height;
      const targetAlt = Math.max(cameraAlt, 500_000);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          selectedIntel.coordinates.lon,
          selectedIntel.coordinates.lat,
          targetAlt,
        ),
        duration: 1.5,
      });
      return;
    }

    const cameraAlt = viewer.camera.positionCartographic.height;
    const targetAlt = Math.max(cameraAlt, 50_000);
    const cartographic = Cartographic.fromCartesian(position);

    setClickedCoordinates({
      lat: CesiumMath.toDegrees(cartographic.latitude),
      lon: CesiumMath.toDegrees(cartographic.longitude),
      altMeters: cartographic.height,
    });

    viewer.camera.flyTo({
      destination: Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        targetAlt,
      ),
      duration: 1.5,
    });
  }, [selectedIntel, setClickedCoordinates]);

  const handleTrackEntity = useCallback(
    (entityId: string | null) => {
      setTrackedEntityId(entityId);
    },
    [setTrackedEntityId],
  );

  const flyToCoordinates = useCallback((lat: number, lon: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, 500_000),
      duration: 1.5,
    });
  }, []);

  const flyToEntityById = useCallback((entityId: string) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const entity = viewer.entities.getById(entityId);
    if (!entity) return;

    const position = entity.position?.getValue(JulianDate.now());
    if (!position) return;

    const intel = buildSelectedIntel(entity);
    if (intel) {
      setSelectedIntel(intel);
      setShowFullIntel(intel.importance === "important");
    }

    const cameraAlt = viewer.camera.positionCartographic.height;
    const targetAlt = Math.max(cameraAlt, 50_000);
    const cartographic = Cartographic.fromCartesian(position);

    viewer.camera.flyTo({
      destination: Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        targetAlt,
      ),
      duration: 1.5,
    });
  }, []);

  useEffect(() => {
    if (!mountRef.current || viewerRef.current) {
      return;
    }

    (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium";
    if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
      Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
    }

    const viewer = new Viewer(mountRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      selectionIndicator: false,
      timeline: false,
      shouldAnimate: true,
    });
    const restoreUnsupportedZoomHandling = suppressUnsupportedZoomErrors(viewer);
    const cameraController = viewer.scene.screenSpaceCameraController;
    cameraController.enableCollisionDetection = collisionEnabledRef.current;
    cameraController.inertiaSpin = 0.82;
    cameraController.inertiaTranslate = 0.82;
    cameraController.inertiaZoom = 0.74;
    cameraController.minimumZoomDistance = 15;
    cameraController.maximumZoomDistance = 60_000_000;

    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0b1118");
    if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
      void createWorldTerrainAsync({
        requestVertexNormals: true,
      })
        .then((terrain) => {
          viewer.terrainProvider = terrain;
        })
        .catch((error) => {
          console.error("Failed to load Cesium World Terrain", error);
        });
    }

    void createOsmBuildingsAsync().then((tileset) => {
      viewer.scene.primitives.add(tileset);
    });

    const onCameraChanged = () => {
      const cartographic = viewer.camera.positionCartographic;
      setCamera({
        lat: CesiumMath.toDegrees(cartographic.latitude),
        lon: CesiumMath.toDegrees(cartographic.longitude),
        altMeters: cartographic.height,
      });
    };

    viewer.camera.changed.addEventListener(onCameraChanged);

    const flightLayer = new FlightLayer(viewer);
    const militaryLayer = new MilitaryLayer(viewer);
    const satLayer = new SatelliteLayer(viewer);
    const seismicLayer = new SeismicLayer(viewer);
    const basesLayer = new BasesLayer(viewer);
    const outageLayer = new OutageLayer(viewer);
    const threatLayer = new ThreatLayer(viewer);
    const gdeltLayer = new GdeltLayer(viewer);
    const anomalyLayer = new AnomalyLayer(viewer);
    const vesselLayer = new VesselLayer(viewer);
    const weatherLayer = new WeatherLayer(viewer);
    void weatherLayer.init();
    const rasterLayer = new RasterLayer(viewer);
    const sentinelLayer = new RasterLayer(viewer);
    const visualController = new VisualModeController(viewer);
    const picker = new ScreenSpaceEventHandler(viewer.scene.canvas);

    flightLayerRef.current = flightLayer;
    militaryLayerRef.current = militaryLayer;
    satLayerRef.current = satLayer;
    seismicLayerRef.current = seismicLayer;
    basesLayerRef.current = basesLayer;
    outageLayerRef.current = outageLayer;
    threatLayerRef.current = threatLayer;
    gdeltLayerRef.current = gdeltLayer;
    anomalyLayerRef.current = anomalyLayer;
    vesselLayerRef.current = vesselLayer;
    weatherLayerRef.current = weatherLayer;
    rasterLayerRef.current = rasterLayer;
    sentinelLayerRef.current = sentinelLayer;

    // Load static bases layer immediately
    const basesCount = basesLayer.load();
    setCount("bases", basesCount);
    visualModeRef.current = visualController;
    pickerRef.current = picker;
    viewerRef.current = viewer;

    // --- Zoom-box hotspot regions ---
    for (const zr of ZOOM_REGIONS) {
      const baseColor = Color.fromCssColorString(zr.color);
      viewer.entities.add({
        id: zr.id,
        name: zr.label,
        rectangle: {
          coordinates: Rectangle.fromDegrees(zr.west, zr.south, zr.east, zr.north),
          material: new ColorMaterialProperty(baseColor.withAlpha(0.08)),
          outline: true,
          outlineColor: new ConstantProperty(baseColor.withAlpha(0.45)),
          outlineWidth: new ConstantProperty(1),
          height: 0,
        },
        label: {
          text: zr.label,
          font: "11px monospace",
          style: LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 3,
          outlineColor: Color.fromCssColorString("#0b1118"),
          fillColor: baseColor.withAlpha(0.85),
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1_500_000, 1.2, 20_000_000, 0.4),
          translucencyByDistance: new NearFarScalar(500_000, 0, 2_000_000, 1),
          pixelOffset: new Cartesian2(0, 0),
          showBackground: true,
          backgroundColor: Color.fromCssColorString("#0b1118").withAlpha(0.55),
          backgroundPadding: new Cartesian2(6, 3),
        },
        position: Cartesian3.fromDegrees(
          (zr.west + zr.east) / 2,
          (zr.south + zr.north) / 2,
          0,
        ),
        properties: {
          zoomRegion: true,
          zoomHeight: zr.height,
          centerLon: (zr.west + zr.east) / 2,
          centerLat: (zr.south + zr.north) / 2,
        } as unknown as Record<string, unknown>,
      });
    }

    picker.setInputAction((event: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(event.position);
      if (
        !defined(picked) ||
        typeof picked !== "object" ||
        !("id" in picked) ||
        !(picked.id instanceof Entity)
      ) {
        const globePosition = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
        if (globePosition) {
          const cartographic = Cartographic.fromCartesian(globePosition);
          setClickedCoordinates({
            lat: CesiumMath.toDegrees(cartographic.latitude),
            lon: CesiumMath.toDegrees(cartographic.longitude),
            altMeters: cartographic.height,
          });
        }
        setSelectedIntel(null);
        setShowFullIntel(false);
        return;
      }

      // Handle zoom-region box clicks — fly to region center
      const clickedEntity = picked.id as Entity;
      if (clickedEntity.id?.startsWith("zr-") && clickedEntity.properties) {
        const props = clickedEntity.properties;
        const cLon = props.centerLon?.getValue(JulianDate.now()) as number | undefined;
        const cLat = props.centerLat?.getValue(JulianDate.now()) as number | undefined;
        const zH = props.zoomHeight?.getValue(JulianDate.now()) as number | undefined;
        if (cLon != null && cLat != null && zH != null) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(cLon, cLat, zH),
            duration: 1.8,
          });
          // Lock region in EPIC FURY mode
          if (useEpicFuryStore.getState().active) {
            const region = ZOOM_REGIONS.find((r) => r.id === clickedEntity.id);
            if (region) {
              useEpicFuryStore.getState().lockRegion({
                id: region.id,
                label: region.label,
                west: region.west,
                south: region.south,
                east: region.east,
                north: region.north,
              });
            }
          }
        }
        return;
      }

      const intel = buildSelectedIntel(picked.id);
      if (!intel) {
        setSelectedIntel(null);
        setShowFullIntel(false);
        return;
      }

      setSelectedIntel(intel);
      setShowFullIntel(intel.importance === "important");
      setClickedCoordinates(
        intel.coordinates
          ? {
              lat: intel.coordinates.lat,
              lon: intel.coordinates.lon,
              altMeters: intel.coordinates.altMeters ?? null,
            }
          : null,
      );

      if (intel.kind === "flight" || intel.kind === "military") {
        const rawId = intel.id.replace(/^(flight-|mil-)/, "");
        void fetchAircraftPhoto(rawId).then((photoUrl) => {
          if (photoUrl) {
            setSelectedIntel((prev) =>
              prev && prev.id === intel.id ? { ...prev, imageUrl: photoUrl } : prev,
            );
          }
        });
      }

      if (intel.kind === "satellite" && /iss|zarya/i.test(intel.name)) {
        void fetchIssIntel(ARGUS_CONFIG.endpoints.iss)
          .then((iss) => {
            const crewLine = iss.crew.length > 0 ? iss.crew.join(", ") : "Crew data unavailable";
            setSelectedIntel((prev) => {
              if (!prev || prev.id !== intel.id) return prev;
              return {
                ...prev,
                quickFacts: [
                  ...prev.quickFacts.filter((fact) => fact.label !== "Crew Aboard"),
                  { label: "Crew Aboard", value: `${iss.crew.length}` },
                ],
                fullFacts: [
                  ...prev.fullFacts.filter((fact) => fact.label !== "ISS Crew"),
                  { label: "ISS Crew", value: crewLine },
                ],
                streamUrl: iss.videoUrl ?? prev.streamUrl,
                externalUrl: iss.moreInfoUrl ?? prev.externalUrl,
                externalLabel: "NASA ISS",
                analysisSummary: `${prev.analysisSummary ?? "ISS track acquired."} Crew aboard: ${crewLine}.`,
              };
            });
          })
          .catch(() => undefined);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    picker.setInputAction((event: { endPosition: Cartesian2 }) => {
      const picked = viewer.scene.pick(event.endPosition);
      const hasEntity =
        defined(picked) &&
        typeof picked === "object" &&
        "id" in picked &&
        picked.id instanceof Entity;

      const newEntity = hasEntity ? (picked.id as Entity) : null;

      if (hoveredEntityRef.current && hoveredEntityRef.current !== newEntity) {
        if (hoveredEntityRef.current.point && hoveredOriginalSizeRef.current !== null) {
          hoveredEntityRef.current.point.pixelSize = hoveredOriginalSizeRef.current as unknown as import("cesium").Property;
        }
        if (hoveredEntityRef.current.billboard && hoveredOriginalScaleRef.current !== null) {
          hoveredEntityRef.current.billboard.scale = hoveredOriginalScaleRef.current as unknown as import("cesium").Property;
        }
        hoveredEntityRef.current = null;
        hoveredOriginalSizeRef.current = null;
        hoveredOriginalScaleRef.current = null;
      }

      if (newEntity && newEntity !== hoveredEntityRef.current) {
        if (newEntity.point) {
          const currentSize = newEntity.point.pixelSize;
          const sizeValue =
            typeof currentSize === "object" && currentSize !== null && "getValue" in currentSize
              ? (currentSize as { getValue: (time: JulianDate) => number }).getValue(JulianDate.now())
              : (currentSize as unknown as number);
          hoveredOriginalSizeRef.current = sizeValue;
          hoveredOriginalScaleRef.current = null;
          newEntity.point.pixelSize = (sizeValue * 1.5) as unknown as import("cesium").Property;
          hoveredEntityRef.current = newEntity;
        } else if (newEntity.billboard) {
          const currentScale = newEntity.billboard.scale;
          const scaleValue =
            typeof currentScale === "object" && currentScale !== null && "getValue" in currentScale
              ? (currentScale as { getValue: (time: JulianDate) => number }).getValue(JulianDate.now())
              : (currentScale as unknown as number);
          hoveredOriginalScaleRef.current = scaleValue;
          hoveredOriginalSizeRef.current = null;
          newEntity.billboard.scale = (scaleValue * 1.3) as unknown as import("cesium").Property;
          hoveredEntityRef.current = newEntity;
        }
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    picker.setInputAction((event: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(event.position);
      if (
        !defined(picked) ||
        typeof picked !== "object" ||
        !("id" in picked) ||
        !(picked.id instanceof Entity)
      ) {
        return;
      }

      const entity = picked.id;
      const position = entity.position?.getValue(JulianDate.now());
      if (!position) return;

      const cameraAlt = viewer.camera.positionCartographic.height;
      const targetAlt = Math.max(cameraAlt, 50_000);

      viewer.camera.flyTo({
        destination: Cartesian3.fromRadians(
          Cartographic.fromCartesian(position).longitude,
          Cartographic.fromCartesian(position).latitude,
          targetAlt,
        ),
        duration: 1.5,
      });
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    const poller = new PollingManager();
    let lastTleFetchAt = 0;

    poller.add({
      id: "opensky",
      intervalMs: ARGUS_CONFIG.pollMs.openSky,
      run: async () => {
        if (platformModeRef.current !== "live") return;
        try {
          const flights = await fetchOpenSkyFlights(ARGUS_CONFIG.endpoints.openSky);
          const bounded = flights.slice(0, ARGUS_CONFIG.limits.maxFlights);
          const count = flightLayer.upsertFlights(bounded);
          setCount("flights", count);
          setFeedHealthy("opensky");
          flightAlertsRef.current = analyzeFlights(bounded);
          recordFlights(bounded);

          // Phantom anomaly detection (non-blocking, via server proxy)
          fetch("/api/phantom/flight", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ flights: bounded.map((f) => ({
              flight_id: f.id, callsign: f.callsign,
              lat: f.latitude, lon: f.longitude,
              altitude: f.altitudeMeters, velocity: f.velocity,
              timestamp: Date.now() / 1000,
            })) }),
            signal: AbortSignal.timeout(5000),
          })
            .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
            .then(({ anomalies }: { anomalies: PhantomAnomaly[] }) => {
              if (anomalies.length > 0) {
                phantomAlertsRef.current = [
                  ...phantomAlertsRef.current.filter(
                    (a) => Date.now() - a.timestamp < 60_000,
                  ),
                  ...analyzePhantomResults(anomalies),
                ];
                phantomRawRef.current = anomalies;
                if (useArgusStore.getState().layers.anomalies) {
                  anomalyLayer.update(anomalies);
                  setCount("anomalies", anomalies.length);
                }
                setFeedHealthy("phantom");
              }
            })
            .catch(() => {
              // Phantom is optional — don't set feed error on every miss
            });
        } catch (error) {
          setFeedError(
            "opensky",
            error instanceof Error ? error.message : "Failed to fetch OpenSky",
          );
        }
      },
    });

    poller.add({
      id: "adsb-military",
      intervalMs: ARGUS_CONFIG.pollMs.adsbMilitary,
      run: async () => {
        if (platformModeRef.current !== "live") return;
        try {
          const flights = await fetchMilitaryFlights(ARGUS_CONFIG.endpoints.adsbMilitary);
          const bounded = flights.slice(0, ARGUS_CONFIG.limits.maxMilitaryFlights);
          const count = militaryLayer.upsertFlights(bounded);
          setCount("military", count);
          setFeedHealthy("adsb");
          pushIncidents(mapMilitaryIncidents(bounded));
          militaryAlertsRef.current = analyzeMilitary(bounded);
          recordMilitary(bounded);
        } catch (error) {
          setFeedError("adsb", error instanceof Error ? error.message : "Failed to fetch ADS-B");
        }
      },
    });

    poller.add({
      id: "satellites",
      intervalMs: ARGUS_CONFIG.pollMs.satellites,
      run: async () => {
        if (platformModeRef.current !== "live") return;
        try {
          const now = Date.now();
          if (now - lastTleFetchAt > 60_000 || useArgusStore.getState().counts.satellites === 0) {
            const records = await fetchTleRecords(ARGUS_CONFIG.endpoints.celestrak);
            const bounded = records.slice(0, ARGUS_CONFIG.limits.maxSatellites);
            satLayer.setRecords(bounded);
            satRecordsRef.current = bounded;
            lastTleFetchAt = now;
          }

          const count = satLayer.update(
            new Date(),
            ARGUS_CONFIG.limits.orbitSamples,
            ARGUS_CONFIG.limits.orbitSampleStepMinutes,
          );
          setCount("satellites", count);
          setCount("satelliteLinks", satLayer.getLinkCount());
          setFeedHealthy("celestrak");
          satelliteAlertsRef.current = analyzeSatellites(count);
          if (satRecordsRef.current.length > 0) {
            const positions = computeSatellitePositions(satRecordsRef.current, new Date());
            recordSatellites(positions);
          }
        } catch (error) {
          setFeedError(
            "celestrak",
            error instanceof Error ? error.message : "Failed to fetch CelesTrak",
          );
        }
      },
    });

    poller.add({
      id: "usgs",
      intervalMs: ARGUS_CONFIG.pollMs.usgs,
      run: async () => {
        if (platformModeRef.current !== "live") return;
        try {
          const quakes = await fetchUsgsQuakes(ARGUS_CONFIG.endpoints.usgs);
          const count = seismicLayer.upsertEarthquakes(quakes);
          setCount("seismic", count);
          setFeedHealthy("usgs");
          pushIncidents(mapSeismicIncidents(quakes));
          seismicAlertsRef.current = analyzeSeismic(count);
          recordQuakes(quakes);

          // Phantom seismic anomaly detection (non-blocking, via server proxy)
          fetch("/api/phantom/seismic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events: quakes.map((q) => ({
              id: q.id, lat: q.latitude, lon: q.longitude,
              magnitude: q.magnitude, depth_km: q.depthKm,
              timestamp: q.timestamp / 1000,
            })) }),
            signal: AbortSignal.timeout(5000),
          })
            .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
            .then(({ anomalies }: { anomalies: PhantomAnomaly[] }) => {
              if (anomalies.length > 0) {
                phantomAlertsRef.current = [
                  ...phantomAlertsRef.current.filter(
                    (a) => Date.now() - a.timestamp < 300_000,
                  ),
                  ...analyzePhantomResults(anomalies),
                ];
                phantomRawRef.current = [
                  ...phantomRawRef.current.filter(
                    (a) => a.anomaly_type !== "magnitude_chaos" && a.anomaly_type !== "depth_cluster_chaos",
                  ),
                  ...anomalies,
                ];
                if (useArgusStore.getState().layers.anomalies) {
                  anomalyLayer.update(phantomRawRef.current);
                  setCount("anomalies", phantomRawRef.current.length);
                }
                setFeedHealthy("phantom");
              }
            })
            .catch(() => {});
        } catch (error) {
          setFeedError("usgs", error instanceof Error ? error.message : "Failed to fetch USGS");
        }
      },
    });

    poller.add({
      id: "cloudflare-radar",
      intervalMs: ARGUS_CONFIG.pollMs.cloudflareRadar,
      run: async () => {
        try {
          const outages = await fetchInternetOutages(ARGUS_CONFIG.endpoints.cloudflareRadar);
          const count = outageLayer.update(outages);
          setCount("outages", count);
          setFeedHealthy("cfradar");
          recordOutages(outages);
        } catch (error) {
          setFeedError("cfradar", error instanceof Error ? error.message : "Failed to fetch CF Radar");
        }
      },
    });

    poller.add({
      id: "otx",
      intervalMs: ARGUS_CONFIG.pollMs.otx,
      run: async () => {
        try {
          const threats = await fetchThreatPulses(ARGUS_CONFIG.endpoints.otx);
          const count = threatLayer.update(threats);
          setCount("threats", count);
          setFeedHealthy("otx");
          recordThreats(threats);
        } catch (error) {
          setFeedError("otx", error instanceof Error ? error.message : "Failed to fetch OTX");
        }
      },
    });

    poller.add({
      id: "fred",
      intervalMs: ARGUS_CONFIG.pollMs.fred,
      run: async () => {
        try {
          await fetchFredObservations(ARGUS_CONFIG.endpoints.fred);
          setFeedHealthy("fred");
        } catch (error) {
          setFeedError("fred", error instanceof Error ? error.message : "Failed to fetch FRED");
        }
      },
    });

    poller.add({
      id: "aisstream",
      intervalMs: ARGUS_CONFIG.pollMs.aisstream,
      run: async () => {
        try {
          const vessels = await fetchAisVessels(ARGUS_CONFIG.endpoints.aisstream);
          const count = vesselLayer.upsertVessels(vessels);
          setCount("vessels", count);
          setFeedHealthy("ais");
          pushIncidents(mapVesselIncidents(vessels));
        } catch (error) {
          setFeedError("ais", error instanceof Error ? error.message : "Failed to fetch AISStream");
        }
      },
    });

    poller.add({
      id: "gdelt",
      intervalMs: ARGUS_CONFIG.pollMs.gdelt,
      run: async () => {
        try {
          const events = await fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt);
          const count = gdeltLayer.update(events);
          setCount("gdelt", count);
          setFeedHealthy("gdelt");
          pushIncidents(mapGdeltIncidents(events));
        } catch (error) {
          setFeedError("gdelt", error instanceof Error ? error.message : "Failed to fetch GDELT");
        }
      },
    });

    return () => {
      poller.stopAll();
      rasterLayer.unload();
      viewer.camera.changed.removeEventListener(onCameraChanged);
      restoreUnsupportedZoomHandling();

      if (selectionRingRef.current) {
        viewer.entities.remove(selectionRingRef.current);
        selectionRingRef.current = null;
      }
      hoveredEntityRef.current = null;
      hoveredOriginalSizeRef.current = null;
      hoveredOriginalScaleRef.current = null;

      weatherLayer.destroy();
      picker.destroy();
      visualController.destroy();
      viewer.destroy();

      viewerRef.current = null;
      flightLayerRef.current = null;
      militaryLayerRef.current = null;
      satLayerRef.current = null;
      seismicLayerRef.current = null;
      basesLayerRef.current = null;
      outageLayerRef.current = null;
      threatLayerRef.current = null;
      gdeltLayerRef.current = null;
      rasterLayerRef.current = null;
      weatherLayerRef.current = null;
      visualModeRef.current = null;
      pickerRef.current = null;
    };
  }, [pushIncidents, setCamera, setClickedCoordinates, setCount, setFeedError, setFeedHealthy]);

  // DVR playback data loop
  const playbackModeState = useArgusStore((s) => s.platformMode);
  useEffect(() => {
    if (playbackModeState !== "playback") return;

    let animFrameId: number;
    let lastFrameTime = performance.now();
    let lastFetchTime = 0;
    const FETCH_INTERVAL = 500;

    const tick = async (now: number) => {
      const state = useArgusStore.getState();
      if (state.platformMode !== "playback") return;

      if (state.isPlaying && state.playbackTime) {
        const delta = (now - lastFrameTime) / 1000;
        const maxTime = state.playbackTimeRange?.end ?? Number.POSITIVE_INFINITY;
        const nextTimeMs = Math.min(
          state.playbackTime.getTime() + delta * state.playbackSpeed * 1000,
          maxTime,
        );
        useArgusStore.setState({
          playbackTime: new Date(nextTimeMs),
          playbackCurrentTime: nextTimeMs,
          isPlaying: nextTimeMs < maxTime ? state.isPlaying : false,
        });
      }
      lastFrameTime = now;

      if (now - lastFetchTime < FETCH_INTERVAL) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }
      lastFetchTime = now;

      const currentPlaybackTime = useArgusStore.getState().playbackTime;
      if (!currentPlaybackTime || !viewerRef.current) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      const ts = currentPlaybackTime.toISOString();

      try {
        const [flightsRes, milRes, satRes, quakeRes, outageRes, threatRes] =
          await Promise.all([
            fetch(`/api/playback/flights?ts=${ts}&window=30`).then((r) =>
              r.json(),
            ),
            fetch(`/api/playback/military?ts=${ts}&window=30`).then((r) =>
              r.json(),
            ),
            fetch(`/api/playback/satellites?ts=${ts}&window=30`).then((r) =>
              r.json(),
            ),
            fetch(`/api/playback/quakes?ts=${ts}&window=30`).then((r) =>
              r.json(),
            ),
            fetch(`/api/playback/outages?ts=${ts}&window=30`).then((r) =>
              r.json(),
            ),
            fetch(`/api/playback/threats?ts=${ts}&window=30`).then((r) =>
              r.json(),
            ),
          ]);

        const { layers: activeLayers, setCount } = useArgusStore.getState();

        if (flightLayerRef.current && flightsRes.flights) {
          flightLayerRef.current.upsertFlights(flightsRes.flights);
          setCount("flights", flightsRes.flights.length);
          flightLayerRef.current.setVisible(activeLayers.flights);
        }
        if (militaryLayerRef.current && milRes.flights) {
          militaryLayerRef.current.upsertFlights(milRes.flights);
          setCount("military", milRes.flights.length);
          militaryLayerRef.current.setVisible(activeLayers.military);
        }
        if (satLayerRef.current && satRes.satellites) {
          satLayerRef.current.upsertPlaybackSatellites(satRes.satellites);
          satLayerRef.current.setVisible(activeLayers.satellites);
          satLayerRef.current.setLinkVisible(false);
          setCount("satellites", satRes.satellites.length);
          setCount("satelliteLinks", 0);
        }
        if (seismicLayerRef.current && quakeRes.quakes) {
          seismicLayerRef.current.upsertEarthquakes(quakeRes.quakes);
          setCount("seismic", quakeRes.quakes.length);
          seismicLayerRef.current.setVisible(activeLayers.seismic);
        }
        if (outageLayerRef.current && outageRes.outages) {
          outageLayerRef.current.update(outageRes.outages);
          setCount("outages", outageRes.outages.length);
          outageLayerRef.current.setVisible(activeLayers.outages);
        }
        if (threatLayerRef.current && threatRes.threats) {
          threatLayerRef.current.update(threatRes.threats);
          setCount("threats", threatRes.threats.length);
          threatLayerRef.current.setVisible(activeLayers.threats);
        }
      } catch {
        // Playback fetch errors are non-critical
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [playbackModeState]);

  // Entity search — watches searchQuery in store, populates searchResults
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const q = searchQuery.toLowerCase().trim();
    const results: SearchResult[] = [];
    const at = JulianDate.now();

    const entities = viewer.entities.values;
    for (let i = 0; i < entities.length && results.length < 20; i++) {
      const entity = entities[i];
      const props = readPropertyBag(entity, at);

      const name =
        (typeof props.callsign === "string" && props.callsign) ||
        (typeof props.name === "string" && props.name) ||
        (typeof props.place === "string" && props.place) ||
        entity.id;

      const kind = inferKindFromId(entity.id);

      if (
        name.toLowerCase().includes(q) ||
        entity.id.toLowerCase().includes(q) ||
        kind.toLowerCase().includes(q)
      ) {
        const position = entity.position?.getValue(at);
        const cartographic = position ? Cartographic.fromCartesian(position) : null;

        results.push({
          id: entity.id,
          name,
          kind,
          lat: cartographic ? CesiumMath.toDegrees(cartographic.latitude) : null,
          lon: cartographic ? CesiumMath.toDegrees(cartographic.longitude) : null,
        });
      }
    }

    setSearchResults(results);
  }, [searchQuery, setSearchResults]);

  // Periodic intelligence briefing generation (every 15 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (platformModeRef.current === "analytics") return;

      const allAlerts = [
        ...flightAlertsRef.current,
        ...militaryAlertsRef.current,
        ...satelliteAlertsRef.current,
        ...seismicAlertsRef.current,
        ...phantomAlertsRef.current,
      ];

      const briefing = generateBriefing(allAlerts);
      setIntelBriefing(briefing);
    }, 15_000);

    return () => clearInterval(interval);
  }, [setIntelBriefing]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = collisionEnabled;
  }, [collisionEnabled]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (selectionRingRef.current) {
      viewer.entities.remove(selectionRingRef.current);
      selectionRingRef.current = null;
    }

    if (!selectedIntel) return;

    const entity = viewer.entities.getById(selectedIntel.id);
    if (!entity) return;

    const position = entity.position?.getValue(JulianDate.now());
    if (!position) return;

    const ringPositions = generateCirclePositions(position, 5000);
    const ringEntity = viewer.entities.add({
      polyline: {
        positions: ringPositions,
        width: 3,
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Color.fromCssColorString("#2ad4ff").withAlpha(0.7),
        }),
        clampToGround: false,
        arcType: ArcType.NONE,
      },
    });
    selectionRingRef.current = ringEntity;
  }, [selectedIntel]);

  // Show orbit trail only for the selected satellite
  useEffect(() => {
    const satLayer = satLayerRef.current;
    if (!satLayer) return;

    if (selectedIntel?.kind === "satellite") {
      const rawId = selectedIntel.id.replace(/^sat-/, "");
      satLayer.showOrbit(
        rawId,
        ARGUS_CONFIG.limits.orbitSamples,
        ARGUS_CONFIG.limits.orbitSampleStepMinutes,
      );
    } else {
      satLayer.showOrbit(null, 0, 0);
    }

    // Show trail for selected flights/military
    if (selectedIntel?.kind === "flight") {
      const rawId = selectedIntel.id.replace(/^flight-/, "");
      flightLayerRef.current?.showTrail(rawId);
    } else if (selectedIntel?.kind === "military") {
      const rawId = selectedIntel.id.replace(/^mil-/, "");
      militaryLayerRef.current?.showTrail(rawId);
    } else if (selectedIntel?.kind === "vessel") {
      const rawId = selectedIntel.id.replace(/^vessel-/, "");
      vesselLayerRef.current?.showTrail(rawId);
    } else {
      flightLayerRef.current?.hideTrail();
      militaryLayerRef.current?.hideTrail();
      vesselLayerRef.current?.hideTrail();
    }
  }, [selectedIntel]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (!trackedEntityId) {
      viewer.trackedEntity = undefined;
      flightLayerRef.current?.hideTrail();
      militaryLayerRef.current?.hideTrail();
      return;
    }

    const entity = viewer.entities.getById(trackedEntityId);
    if (entity) {
      viewer.trackedEntity = entity;
      // Show trail for tracked flights
      if (trackedEntityId.startsWith("flight-")) {
        const rawId = trackedEntityId.replace("flight-", "");
        flightLayerRef.current?.showTrail(rawId);
      } else if (trackedEntityId.startsWith("mil-")) {
        const rawId = trackedEntityId.replace("mil-", "");
        militaryLayerRef.current?.showTrail(rawId);
      }
    }
  }, [trackedEntityId]);

  useEffect(() => {
    platformModeRef.current = platformMode;

    if (platformMode === "analytics") {
      flightLayerRef.current?.setVisible(false);
      militaryLayerRef.current?.setVisible(false);
      satLayerRef.current?.setVisible(false);
      satLayerRef.current?.setLinkVisible(false);
      seismicLayerRef.current?.setVisible(false);

      basesLayerRef.current?.setVisible(false);
      outageLayerRef.current?.setVisible(layers.outages);
      threatLayerRef.current?.setVisible(layers.threats);
      gdeltLayerRef.current?.setVisible(layers.gdelt);
      anomalyLayerRef.current?.setVisible(layers.anomalies);
      vesselLayerRef.current?.setVisible(false);
    } else if (platformMode === "playback") {
      const { layers } = useArgusStore.getState();

      flightLayerRef.current?.setVisible(layers.flights);
      militaryLayerRef.current?.setVisible(layers.military);
      satLayerRef.current?.setVisible(layers.satellites);
      satLayerRef.current?.setLinkVisible(false);
      seismicLayerRef.current?.setVisible(layers.seismic);
      basesLayerRef.current?.setVisible(layers.bases);
      outageLayerRef.current?.setVisible(false);
      threatLayerRef.current?.setVisible(false);
      gdeltLayerRef.current?.setVisible(false);
      anomalyLayerRef.current?.setVisible(false);
      vesselLayerRef.current?.setVisible(false);
      setIsPlaying(false);

      void fetch("/api/playback/range", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Playback range returned ${response.status}`);
          }
          return response.json() as Promise<{ earliest: string | null; latest: string | null }>;
        })
        .then((range) => {
          if (!range.earliest || !range.latest) {
            setPlaybackTimeRange(null);
            setPlaybackCurrentTime(0);
            setPlaybackTime(null);
            return;
          }

          const start = new Date(range.earliest).getTime();
          const end = new Date(range.latest).getTime();
          setPlaybackTimeRange({ start, end });
          setPlaybackCurrentTime(end);
          setPlaybackTime(new Date(end));
        })
        .catch(() => {
          setPlaybackTimeRange(null);
          setPlaybackCurrentTime(0);
          setPlaybackTime(null);
        });
    } else {
      // "live" — clean up playback, restore live layers
      setPlaybackTimeRange(null);
      setPlaybackCurrentTime(0);
      setPlaybackTime(null);
      setIsPlaying(false);

      const { layers } = useArgusStore.getState();
      flightLayerRef.current?.setVisible(layers.flights);
      militaryLayerRef.current?.setVisible(layers.military);
      satLayerRef.current?.setVisible(layers.satellites);
      satLayerRef.current?.setLinkVisible(layers.satellites && layers.satelliteLinks);
      seismicLayerRef.current?.setVisible(layers.seismic);

      basesLayerRef.current?.setVisible(layers.bases);
      outageLayerRef.current?.setVisible(layers.outages);
      threatLayerRef.current?.setVisible(layers.threats);
      gdeltLayerRef.current?.setVisible(layers.gdelt);
      anomalyLayerRef.current?.setVisible(layers.anomalies);
      vesselLayerRef.current?.setVisible(layers.vessels);
    }
  }, [layers.gdelt, layers.outages, layers.threats, layers.anomalies, layers.vessels, platformMode, setIsPlaying, setPlaybackCurrentTime, setPlaybackTime, setPlaybackTimeRange]);

  // Fetch analytics tile URLs once on mount, store in refs
  const gfsTileUrlRef = useRef<string | null>(null);
  const gfsMaxLevelRef = useRef<number | undefined>(undefined);
  const sentinelTileUrlRef = useRef<string | null>(null);
  const sentinelMaxLevelRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    void fetch("/api/analytics/layers", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Analytics endpoint returned ${response.status}`);
        return response.json() as Promise<AnalyticsResponse>;
      })
      .then((data) => {
        for (const layer of data.layers) {
          if (layer.id === "gfs_precip_radar" || layer.id === "gfs_satellite_ir") {
            gfsTileUrlRef.current = layer.tileUrl;
            gfsMaxLevelRef.current = layer.maximumLevel;
          } else if (layer.id === "sentinel_imagery") {
            sentinelTileUrlRef.current = layer.tileUrl;
            sentinelMaxLevelRef.current = layer.maximumLevel;
          }
        }
        setAnalyticsStatus(`${data.layers.filter((l) => l.available).length} raster layers available`);
      })
      .catch(() => {
        setAnalyticsStatus("Failed to load analytics layer metadata");
      });
  }, []);

  // Toggle GFS weather raster based on store toggle
  useEffect(() => {
    const rasterLayer = rasterLayerRef.current;
    if (!rasterLayer) return;

    if (analyticsLayers.gfs_weather && gfsTileUrlRef.current) {
      rasterLayer.load(gfsTileUrlRef.current, { maximumLevel: gfsMaxLevelRef.current });
    } else {
      rasterLayer.unload();
    }
  }, [analyticsLayers.gfs_weather]);

  // Toggle Sentinel imagery raster based on store toggle
  useEffect(() => {
    const sentinel = sentinelLayerRef.current;
    if (!sentinel) return;

    if (analyticsLayers.sentinel_imagery && sentinelTileUrlRef.current) {
      sentinel.load(sentinelTileUrlRef.current, { maximumLevel: sentinelMaxLevelRef.current });
    } else {
      sentinel.unload();
    }
  }, [analyticsLayers.sentinel_imagery]);

  useEffect(() => {
    if (platformMode === "analytics") {
      flightLayerRef.current?.setVisible(false);
      militaryLayerRef.current?.setVisible(false);
      satLayerRef.current?.setVisible(false);
      satLayerRef.current?.setLinkVisible(false);
      seismicLayerRef.current?.setVisible(false);
      basesLayerRef.current?.setVisible(false);
      outageLayerRef.current?.setVisible(layers.outages);
      threatLayerRef.current?.setVisible(layers.threats);
      gdeltLayerRef.current?.setVisible(layers.gdelt);
      anomalyLayerRef.current?.setVisible(layers.anomalies);
      vesselLayerRef.current?.setVisible(false);
      weatherLayerRef.current?.setVisible(layers.weather);
      return;
    }

    flightLayerRef.current?.setVisible(layers.flights);
    militaryLayerRef.current?.setVisible(layers.military);
    satLayerRef.current?.setVisible(layers.satellites);
    satLayerRef.current?.setLinkVisible(layers.satellites && layers.satelliteLinks);
    seismicLayerRef.current?.setVisible(layers.seismic);
    basesLayerRef.current?.setVisible(layers.bases);
    outageLayerRef.current?.setVisible(layers.outages);
    threatLayerRef.current?.setVisible(layers.threats);
    gdeltLayerRef.current?.setVisible(layers.gdelt);
    anomalyLayerRef.current?.setVisible(layers.anomalies);
    vesselLayerRef.current?.setVisible(layers.vessels);
    weatherLayerRef.current?.setVisible(layers.weather);
  }, [
    platformMode,
    layers.bases,
    layers.flights,
    layers.gdelt,
    layers.military,
    layers.outages,
    layers.satelliteLinks,
    layers.satellites,
    layers.seismic,
    layers.threats,
    layers.anomalies,
    layers.vessels,
    layers.weather,
  ]);

  // Globe ↔ Map scene mode toggle
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // Map mode uses a dedicated non-Cesium flat map panel.
    // Keep Cesium in 3D for live ingest + smooth return to globe mode.
    viewer.scene.mode = CesiumSceneMode.SCENE3D;
    if (isFlatMapMode(sceneMode)) {
      return;
    }

    const layers = viewer.imageryLayers;
    const baseLayer = layers.length > 0 ? layers.get(0) : null;
    if (baseLayer) {
      layers.remove(baseLayer, true);
    }

    const satelliteProvider = new UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
    });
    const streetProvider = new UrlTemplateImageryProvider({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      maximumLevel: 19,
    });
    const darkProvider = new UrlTemplateImageryProvider({
      url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      maximumLevel: 19,
    });

    const provider =
      sceneMode === "globe_street"
        ? streetProvider
        : sceneMode === "globe_map"
          ? darkProvider
          : satelliteProvider;

    layers.addImageryProvider(provider, 0);
    viewer.scene.globe.baseColor =
      sceneMode === "globe_map"
        ? Color.fromCssColorString("#0b1118")
        : Color.fromCssColorString("#13212b");
  }, [sceneMode]);

  // Day/Night terminator toggle
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scene.globe.enableLighting = dayNight;
  }, [dayNight]);

  useEffect(() => {
    visualModeRef.current?.setMode(visualMode);
  }, [visualMode]);

  useEffect(() => {
    visualModeRef.current?.setIntensity(visualIntensity);
  }, [visualIntensity]);

  useEffect(() => {
    visualModeRef.current?.setParams(visualParams);
  }, [visualParams]);

  const handlePlayPause = useCallback(() => {
    const state = useArgusStore.getState();
    if (!state.playbackTimeRange) {
      return;
    }

    if (!state.playbackTime) {
      const latest = new Date(state.playbackTimeRange.end);
      setPlaybackCurrentTime(latest.getTime());
      setPlaybackTime(latest);
    }

    setIsPlaying(!state.isPlaying);
  }, [setIsPlaying, setPlaybackCurrentTime, setPlaybackTime]);

  const handleSeek = useCallback((timestampMs: number) => {
    setPlaybackCurrentTime(timestampMs);
    setPlaybackTime(new Date(timestampMs));
  }, [setPlaybackCurrentTime, setPlaybackTime]);

  return (
    <div className={`relative h-screen w-screen overflow-hidden ${className ?? ""}`}>
      <div className="argus-noise pointer-events-none absolute inset-0 z-0" />
      <div className="argus-grid pointer-events-none absolute inset-0 z-0" />

      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className={`argus-viewport ${isFlatMapMode(sceneMode) ? "argus-map-viewport" : ""}`}>
          <div ref={mountRef} className={isFlatMapMode(sceneMode) ? "hidden" : "h-full w-full"} />
          {isFlatMapMode(sceneMode) ? (
            <FlatMapView
              onSelectIntel={(intel) => {
                setSelectedIntel(intel);
                setShowFullIntel(Boolean(intel && intel.importance === "important"));
                setClickedCoordinates(
                  intel?.coordinates
                    ? {
                        lat: intel.coordinates.lat,
                        lon: intel.coordinates.lon,
                        altMeters: intel.coordinates.altMeters ?? null,
                      }
                    : null,
                );
              }}
              onSelectCoordinates={(coords) => {
                setClickedCoordinates(coords);
                setSelectedIntel({
                  id: `coords-${coords.lat.toFixed(4)}-${coords.lon.toFixed(4)}`,
                  name: "Map Coordinates",
                  kind: "coordinates",
                  importance: "normal",
                  quickFacts: [
                    { label: "Latitude", value: coords.lat.toFixed(4) },
                    { label: "Longitude", value: coords.lon.toFixed(4) },
                  ],
                  fullFacts: [
                    { label: "Latitude", value: coords.lat.toFixed(6) },
                    { label: "Longitude", value: coords.lon.toFixed(6) },
                  ],
                  coordinates: coords,
                  analysisSummary: "Manual map selection. Use these coordinates to pivot into nearby entities, incidents, or follow-on analysis.",
                });
                setShowFullIntel(false);
              }}
            />
          ) : null}
          {!isFlatMapMode(sceneMode) && visualMode === "crt" ? (
            <div className="argus-scanlines pointer-events-none absolute inset-0" />
          ) : null}
        </div>
      </div>

      {epicFuryActive && (
        <>
          <EpicFuryHud onFlyToCoordinates={flyToCoordinates} />
          <AnalystControls />
          <TimelineScrubber />
        </>
      )}

      {/* Top Bar Toggle */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-4">
        <button
          onClick={() => setEpicFuryActive(!epicFuryActive)}
          className={`px-6 py-2 rounded-lg font-mono text-sm font-bold tracking-widest border transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-md ${
            epicFuryActive
              ? "bg-cyan-900/80 text-cyan-400 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]"
              : "bg-black/60 text-gray-400 border-gray-600 hover:text-white hover:border-gray-400"
          }`}
        >
          {epicFuryActive ? "MODE: EPIC FURY ACTIVE" : "ACTIVATE OP: EPIC FURY"}
        </button>
      </div>

      {!epicFuryActive && (
        <HudOverlay
          onFlyToPoi={flyToPoi}
          onResetCamera={resetCamera}
          onToggleCollision={toggleCollisionDetection}
          collisionEnabled={collisionEnabled}
          analyticsStatus={platformMode !== "analytics" ? null : analyticsStatus}
          selectedIntel={selectedIntel}
          showFullIntel={showFullIntel}
          onToggleFullIntel={() => setShowFullIntel((current) => !current)}
          onCloseIntel={() => {
            setSelectedIntel(null);
            setShowFullIntel(false);
            if (trackedEntityId) {
              setTrackedEntityId(null);
            }
          }}
          onFlyToEntity={flyToSelectedEntity}
          onTrackEntity={handleTrackEntity}
          trackedEntityId={trackedEntityId}
          intelBriefing={intelBriefing}
          onFlyToCoordinates={flyToCoordinates}
          onFlyToEntityById={flyToEntityById}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onTiltUp={tiltUp}
          onTiltDown={tiltDown}
          onRotateLeft={rotateLeft}
          onRotateRight={rotateRight}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          clickedCoordinates={clickedCoordinates}
          onSelectIntel={setSelectedIntel}
        />
      )}
    </div>
  );
}
