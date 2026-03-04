"use client";

import "cesium/Build/Cesium/Widgets/widgets.css";

import {
  ArcType,
  Cartographic,
  Cartesian2,
  Cartesian3,
  Color,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  Entity,
  HeadingPitchRoll,
  Ion,
  JulianDate,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  SceneMode as CesiumSceneMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  defined,
} from "cesium";
import { useCallback, useEffect, useRef, useState } from "react";

import { ARGUS_CONFIG, CAMERA_PRESETS } from "@/lib/config";
import { CctvLayer } from "@/lib/cesium/layers/cctvLayer";
import { FlightLayer } from "@/lib/cesium/layers/flightLayer";
import { MilitaryLayer } from "@/lib/cesium/layers/militaryLayer";
import { RasterLayer } from "@/lib/cesium/layers/rasterLayer";
import { BasesLayer } from "@/lib/cesium/layers/basesLayer";
import { OutageLayer } from "@/lib/cesium/layers/outageLayer";
import { ThreatLayer } from "@/lib/cesium/layers/threatLayer";
import { SatelliteLayer } from "@/lib/cesium/layers/satelliteLayer";
import { SeismicLayer } from "@/lib/cesium/layers/seismicLayer";
import { VisualModeController } from "@/lib/cesium/shaders/visualModes";
import { fetchMilitaryFlights } from "@/lib/ingest/adsb";
import { fetchCctvCameras } from "@/lib/ingest/cctv";
import { fetchOpenSkyFlights } from "@/lib/ingest/opensky";
import { fetchAircraftPhoto } from "@/lib/ingest/planespotters";
import { PollingManager } from "@/lib/ingest/pollingManager";
import { computeSatellitePositions, fetchTleRecords } from "@/lib/ingest/tle";
import { fetchInternetOutages } from "@/lib/ingest/cloudflareRadar";
import { fetchThreatPulses } from "@/lib/ingest/otx";
import { fetchFredObservations } from "@/lib/ingest/fred";
import { fetchAisSnapshotCount } from "@/lib/ingest/aisstream";
import { fetchUsgsQuakes } from "@/lib/ingest/usgs";
import { recordFlights, recordMilitary, recordSatellites, recordQuakes, recordOutages, recordThreats } from "@/lib/ingest/recorder";
import {
  analyzeFlights,
  analyzeMilitary,
  analyzeSatellites,
  analyzeSeismic,
  generateBriefing,
} from "@/lib/intel/analysisEngine";
import type { IntelAlert } from "@/lib/intel/analysisEngine";
import { useArgusStore } from "@/store/useArgusStore";
import type { SearchResult } from "@/store/useArgusStore";
import type { IntelDatum, IntelImportance, SelectedIntel } from "@/types/intel";

import { HudOverlay } from "./HudOverlay";

type CesiumGlobeProps = {
  className?: string;
};

type AnalyticsLayer = {
  variable: string;
  tile_url: string | null;
  source_file?: string | null;
  error?: string | null;
};

type AnalyticsResponse = {
  layers: AnalyticsLayer[];
  available_file_count?: number;
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
    | (Record<string, unknown> & { propertyNames?: string[] })
    | undefined;

  if (!bag || !Array.isArray(bag.propertyNames)) {
    return values;
  }

  for (const key of bag.propertyNames) {
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
  if (id.startsWith("cctv-")) return "cctv";
  if (id.startsWith("base-")) return "base";
  if (id.startsWith("outage-")) return "outage";
  if (id.startsWith("threat-")) return "threat";
  return "unknown";
};

const PRIORITY_THRESHOLDS = {
  earthquakeMagnitude: 4.5,
  flightVelocityMps: 220,
} as const;

const classifyImportance = (kind: string, props: Record<string, unknown>): IntelImportance => {
  if (kind === "military" || kind === "threat") return "important";

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
    case "cctv":
      pushQuick("Camera", props.name);
      pushQuick("Category", props.category);
      pushQuick("Provider", props.provider);
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
    default:
      break;
  }

  const fullFacts: IntelDatum[] = [{ label: "Entity ID", value: entity.id }];
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || key === "kind") continue;
    fullFacts.push({ label: key, value: formatValue(value) });
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
  const cctvLayerRef = useRef<CctvLayer | null>(null);
  const basesLayerRef = useRef<BasesLayer | null>(null);
  const outageLayerRef = useRef<OutageLayer | null>(null);
  const threatLayerRef = useRef<ThreatLayer | null>(null);
  const rasterLayerRef = useRef<RasterLayer | null>(null);
  const visualModeRef = useRef<VisualModeController | null>(null);
  const pickerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const platformModeRef = useRef<"live" | "analytics">("live");
  const hoveredEntityRef = useRef<Entity | null>(null);
  const hoveredOriginalSizeRef = useRef<number | null>(null);
  const selectionRingRef = useRef<Entity | null>(null);

  const flightAlertsRef = useRef<IntelAlert[]>([]);
  const militaryAlertsRef = useRef<IntelAlert[]>([]);
  const satelliteAlertsRef = useRef<IntelAlert[]>([]);
  const seismicAlertsRef = useRef<IntelAlert[]>([]);

  const [selectedIntel, setSelectedIntel] = useState<SelectedIntel | null>(null);
  const [showFullIntel, setShowFullIntel] = useState(false);
  const [analyticsStatus, setAnalyticsStatus] = useState<string | null>(null);
  const [collisionEnabled, setCollisionEnabled] = useState(false);
  const collisionEnabledRef = useRef(collisionEnabled);
  useEffect(() => {
    collisionEnabledRef.current = collisionEnabled;
  }, [collisionEnabled]);

  const layers = useArgusStore((s) => s.layers);
  const platformMode = useArgusStore((s) => s.platformMode);
  const analyticsLayers = useArgusStore((s) => s.analyticsLayers);
  const activeGfsCogPath = useArgusStore((s) => s.activeGfsCogPath);
  const setActiveGfsCogPath = useArgusStore((s) => s.setActiveGfsCogPath);
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
  const setCameras = useArgusStore((s) => s.setCameras);
  const searchQuery = useArgusStore((s) => s.searchQuery);
  const sceneMode = useArgusStore((s) => s.sceneMode);
  const dayNight = useArgusStore((s) => s.dayNight);
  const setSearchResults = useArgusStore((s) => s.setSearchResults);

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
    if (!entity) return;

    const position = entity.position?.getValue(JulianDate.now());
    if (!position) return;

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
  }, [selectedIntel]);

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
    const cameraController = viewer.scene.screenSpaceCameraController;
    cameraController.enableCollisionDetection = collisionEnabledRef.current;
    cameraController.inertiaSpin = 0.82;
    cameraController.inertiaTranslate = 0.82;
    cameraController.inertiaZoom = 0.74;
    cameraController.minimumZoomDistance = 15;
    cameraController.maximumZoomDistance = 60_000_000;

    viewer.scene.globe.enableLighting = true;
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
    const cctvLayer = new CctvLayer(viewer);
    const basesLayer = new BasesLayer(viewer);
    const outageLayer = new OutageLayer(viewer);
    const threatLayer = new ThreatLayer(viewer);
    const rasterLayer = new RasterLayer(viewer);
    const visualController = new VisualModeController(viewer);
    const picker = new ScreenSpaceEventHandler(viewer.scene.canvas);

    flightLayerRef.current = flightLayer;
    militaryLayerRef.current = militaryLayer;
    satLayerRef.current = satLayer;
    seismicLayerRef.current = seismicLayer;
    cctvLayerRef.current = cctvLayer;
    basesLayerRef.current = basesLayer;
    outageLayerRef.current = outageLayer;
    threatLayerRef.current = threatLayer;
    rasterLayerRef.current = rasterLayer;

    // Load static bases layer immediately
    const basesCount = basesLayer.load();
    setCount("bases", basesCount);
    visualModeRef.current = visualController;
    pickerRef.current = picker;
    viewerRef.current = viewer;

    picker.setInputAction((event: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(event.position);
      if (
        !defined(picked) ||
        typeof picked !== "object" ||
        !("id" in picked) ||
        !(picked.id instanceof Entity)
      ) {
        setSelectedIntel(null);
        setShowFullIntel(false);
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
        hoveredEntityRef.current = null;
        hoveredOriginalSizeRef.current = null;
      }

      if (newEntity && newEntity.point && newEntity !== hoveredEntityRef.current) {
        const currentSize = newEntity.point.pixelSize;
        const sizeValue = typeof currentSize === "object" && currentSize !== null && "getValue" in currentSize
          ? (currentSize as { getValue: (time: JulianDate) => number }).getValue(JulianDate.now())
          : (currentSize as unknown as number);
        hoveredOriginalSizeRef.current = sizeValue;
        newEntity.point.pixelSize = (sizeValue * 1.5) as unknown as import("cesium").Property;
        hoveredEntityRef.current = newEntity;
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
        if (platformModeRef.current === "analytics") return;
        try {
          const flights = await fetchOpenSkyFlights(ARGUS_CONFIG.endpoints.openSky);
          const bounded = flights.slice(0, ARGUS_CONFIG.limits.maxFlights);
          const count = flightLayer.upsertFlights(bounded);
          setCount("flights", count);
          setFeedHealthy("opensky");
          flightAlertsRef.current = analyzeFlights(bounded);
          recordFlights(bounded);
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
        if (platformModeRef.current === "analytics") return;
        try {
          const flights = await fetchMilitaryFlights(ARGUS_CONFIG.endpoints.adsbMilitary);
          const bounded = flights.slice(0, ARGUS_CONFIG.limits.maxMilitaryFlights);
          const count = militaryLayer.upsertFlights(bounded);
          setCount("military", count);
          setFeedHealthy("adsb");
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
        if (platformModeRef.current === "analytics") return;
        try {
          const now = Date.now();
          if (now - lastTleFetchAt > 60_000 || useArgusStore.getState().counts.satellites === 0) {
            const records = await fetchTleRecords(ARGUS_CONFIG.endpoints.celestrak);
            satLayer.setRecords(records.slice(0, ARGUS_CONFIG.limits.maxSatellites));
            lastTleFetchAt = now;
          }

          const count = satLayer.update(
            new Date(),
            ARGUS_CONFIG.limits.orbitSamples,
            ARGUS_CONFIG.limits.orbitSampleStepMinutes,
          );
          setCount("satellites", count);
          setFeedHealthy("celestrak");
          satelliteAlertsRef.current = analyzeSatellites(count);
          const satPositions = computeSatellitePositions(
            satLayer.getRecords(),
            new Date(),
          );
          recordSatellites(satPositions.map((s) => ({
            ...s,
            tle1: satLayer.getRecords().find((r) => r.id === s.id)?.tle1,
            tle2: satLayer.getRecords().find((r) => r.id === s.id)?.tle2,
          })));
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
        if (platformModeRef.current === "analytics") return;
        try {
          const quakes = await fetchUsgsQuakes(ARGUS_CONFIG.endpoints.usgs);
          const count = seismicLayer.upsertEarthquakes(quakes);
          setCount("seismic", count);
          setFeedHealthy("usgs");
          seismicAlertsRef.current = analyzeSeismic(count);
          recordQuakes(quakes);
        } catch (error) {
          setFeedError("usgs", error instanceof Error ? error.message : "Failed to fetch USGS");
        }
      },
    });

    poller.add({
      id: "cctv",
      intervalMs: ARGUS_CONFIG.pollMs.cctv,
      run: async () => {
        if (platformModeRef.current === "analytics") return;
        try {
          const cameras = await fetchCctvCameras(ARGUS_CONFIG.endpoints.cctv, ARGUS_CONFIG.endpoints.webcams);
          setCameras(cameras);
          const categoryFilter = useArgusStore.getState().cctvCategoryFilter;
          const filtered = categoryFilter === "All"
            ? cameras
            : cameras.filter((c) => c.category === categoryFilter);
          const count = cctvLayer.upsertCameras(filtered.slice(0, ARGUS_CONFIG.limits.maxCctv));
          setCount("cctv", count);
          setFeedHealthy("tfl");
        } catch (error) {
          setFeedError("tfl", error instanceof Error ? error.message : "Failed to fetch CCTV");
        }
      },
    });

    poller.add({
      id: "cloudflare-radar",
      intervalMs: ARGUS_CONFIG.pollMs.cloudflareRadar,
      run: async () => {
        if (platformModeRef.current === "analytics") return;
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
        if (platformModeRef.current === "analytics") return;
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
        if (platformModeRef.current === "analytics") return;
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
        if (platformModeRef.current === "analytics") return;
        try {
          await fetchAisSnapshotCount(ARGUS_CONFIG.endpoints.aisstream);
          setFeedHealthy("ais");
        } catch (error) {
          setFeedError("ais", error instanceof Error ? error.message : "Failed to fetch AISStream");
        }
      },
    });

    return () => {
      poller.stopAll();
      rasterLayer.unload();
      viewer.camera.changed.removeEventListener(onCameraChanged);

      if (selectionRingRef.current) {
        viewer.entities.remove(selectionRingRef.current);
        selectionRingRef.current = null;
      }
      hoveredEntityRef.current = null;
      hoveredOriginalSizeRef.current = null;

      picker.destroy();
      visualController.destroy();
      viewer.destroy();

      viewerRef.current = null;
      flightLayerRef.current = null;
      militaryLayerRef.current = null;
      satLayerRef.current = null;
      seismicLayerRef.current = null;
      cctvLayerRef.current = null;
      basesLayerRef.current = null;
      outageLayerRef.current = null;
      threatLayerRef.current = null;
      rasterLayerRef.current = null;
      visualModeRef.current = null;
      pickerRef.current = null;
    };
  }, [setCamera, setCameras, setCount, setFeedError, setFeedHealthy]);

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
  }, [selectedIntel]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (!trackedEntityId) {
      viewer.trackedEntity = undefined;
      return;
    }

    const entity = viewer.entities.getById(trackedEntityId);
    if (entity) {
      viewer.trackedEntity = entity;
    }
  }, [trackedEntityId]);

  useEffect(() => {
    platformModeRef.current = platformMode;

    if (platformMode === "analytics") {
      flightLayerRef.current?.setVisible(false);
      militaryLayerRef.current?.setVisible(false);
      satLayerRef.current?.setVisible(false);
      seismicLayerRef.current?.setVisible(false);
      cctvLayerRef.current?.setVisible(false);
      basesLayerRef.current?.setVisible(false);
      outageLayerRef.current?.setVisible(false);
      threatLayerRef.current?.setVisible(false);
    } else {
      const { layers } = useArgusStore.getState();
      flightLayerRef.current?.setVisible(layers.flights);
      militaryLayerRef.current?.setVisible(layers.military);
      satLayerRef.current?.setVisible(layers.satellites);
      seismicLayerRef.current?.setVisible(layers.seismic);
      cctvLayerRef.current?.setVisible(layers.cctv);
      basesLayerRef.current?.setVisible(layers.bases);
      outageLayerRef.current?.setVisible(layers.outages);
      threatLayerRef.current?.setVisible(layers.threats);
    }
  }, [platformMode]);

  useEffect(() => {
    if (platformMode !== "analytics") {
      return;
    }

    void fetch("/api/analytics/layers", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Analytics endpoint returned ${response.status}`);
        }
        return response.json() as Promise<AnalyticsResponse>;
      })
      .then((data) => {
        const gfsLayer = data.layers.find((layer) => layer.variable === "t2m");
        if (gfsLayer?.tile_url) {
          setActiveGfsCogPath(gfsLayer.tile_url);
          setAnalyticsStatus(
            gfsLayer.source_file
              ? `Using ${gfsLayer.source_file.split("/").pop()}`
              : "GFS raster layer ready",
          );
          return;
        }

        setActiveGfsCogPath(null);
        setAnalyticsStatus(
          gfsLayer?.error ??
            "No GFS raster output found yet. Let the ingestor produce a .tif/.tiff tile source.",
        );
      })
      .catch((error) => {
        setActiveGfsCogPath(null);
        setAnalyticsStatus(
          error instanceof Error ? error.message : "Failed to load analytics layer metadata",
        );
      });
  }, [platformMode, setActiveGfsCogPath]);

  useEffect(() => {
    const rasterLayer = rasterLayerRef.current;
    if (!rasterLayer) return;

    if (platformMode === "analytics" && analyticsLayers.gfs_weather && activeGfsCogPath) {
      rasterLayer.load(activeGfsCogPath);
    } else {
      rasterLayer.unload();
    }
  }, [platformMode, analyticsLayers.gfs_weather, activeGfsCogPath]);

  useEffect(() => {
    flightLayerRef.current?.setVisible(layers.flights);
    militaryLayerRef.current?.setVisible(layers.military);
    satLayerRef.current?.setVisible(layers.satellites);
    seismicLayerRef.current?.setVisible(layers.seismic);
    cctvLayerRef.current?.setVisible(layers.cctv);
    basesLayerRef.current?.setVisible(layers.bases);
    outageLayerRef.current?.setVisible(layers.outages);
    threatLayerRef.current?.setVisible(layers.threats);
  }, [layers.bases, layers.cctv, layers.flights, layers.military, layers.outages, layers.satellites, layers.seismic, layers.threats]);

  // Globe ↔ Map scene mode toggle
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scene.mode = sceneMode === "map"
      ? CesiumSceneMode.SCENE2D
      : CesiumSceneMode.SCENE3D;
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

  return (
    <div className={`relative h-screen w-screen overflow-hidden ${className ?? ""}`}>
      <div className="argus-noise pointer-events-none absolute inset-0 z-0" />
      <div className="argus-grid pointer-events-none absolute inset-0 z-0" />

      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="argus-viewport">
          <div ref={mountRef} className="h-full w-full" />
          {visualMode === "crt" ? (
            <div className="argus-scanlines pointer-events-none absolute inset-0" />
          ) : null}
        </div>
      </div>

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
      />
    </div>
  );
}
