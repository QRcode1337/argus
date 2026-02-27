"use client";

import "cesium/Build/Cesium/Widgets/widgets.css";

import {
  Cartographic,
  Cartesian2,
  Cartesian3,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  Entity,
  HeadingPitchRoll,
  Ion,
  JulianDate,
  Math as CesiumMath,
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
import { SatelliteLayer } from "@/lib/cesium/layers/satelliteLayer";
import { SeismicLayer } from "@/lib/cesium/layers/seismicLayer";
import { VisualModeController } from "@/lib/cesium/shaders/visualModes";
import { fetchMilitaryFlights } from "@/lib/ingest/adsb";
import { fetchCctvCameras } from "@/lib/ingest/cctv";
import { fetchOpenSkyFlights } from "@/lib/ingest/opensky";
import { PollingManager } from "@/lib/ingest/pollingManager";
import { fetchTleRecords } from "@/lib/ingest/tle";
import { fetchUsgsQuakes } from "@/lib/ingest/usgs";
import { useArgusStore } from "@/store/useArgusStore";
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
  return "unknown";
};

const PRIORITY_THRESHOLDS = {
  earthquakeMagnitude: 4.5,
  flightVelocityMps: 220,
} as const;

const classifyImportance = (kind: string, props: Record<string, unknown>): IntelImportance => {
  if (kind === "military") return "important";

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
      pushQuick("Velocity (m/s)", props.velocity);
      pushQuick("Track (deg)", props.track);
      break;
    case "military":
      pushQuick("Callsign", props.callsign);
      pushQuick("Type", props.type);
      pushQuick("Velocity (m/s)", props.velocity);
      break;
    case "earthquake":
      pushQuick("Magnitude", props.magnitude);
      pushQuick("Depth (km)", props.depthKm);
      break;
    case "satellite":
      pushQuick("Name", props.name);
      pushQuick("Class", props.classification);
      break;
    case "cctv":
      pushQuick("Camera", props.name);
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
    imageUrl: typeof props.imageUrl === "string" ? props.imageUrl : undefined,
  };
};

export function CesiumGlobe({ className }: CesiumGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);

  const flightLayerRef = useRef<FlightLayer | null>(null);
  const militaryLayerRef = useRef<MilitaryLayer | null>(null);
  const satLayerRef = useRef<SatelliteLayer | null>(null);
  const seismicLayerRef = useRef<SeismicLayer | null>(null);
  const cctvLayerRef = useRef<CctvLayer | null>(null);
  const rasterLayerRef = useRef<RasterLayer | null>(null);
  const visualModeRef = useRef<VisualModeController | null>(null);
  const pickerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const platformModeRef = useRef<"live" | "analytics">("live");

  const [selectedIntel, setSelectedIntel] = useState<SelectedIntel | null>(null);
  const [showFullIntel, setShowFullIntel] = useState(false);
  const [analyticsStatus, setAnalyticsStatus] = useState<string | null>(null);
  const [collisionEnabled, setCollisionEnabled] = useState(false);

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
    cameraController.enableCollisionDetection = collisionEnabled;
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
    const rasterLayer = new RasterLayer(viewer);
    const visualController = new VisualModeController(viewer);
    const picker = new ScreenSpaceEventHandler(viewer.scene.canvas);

    flightLayerRef.current = flightLayer;
    militaryLayerRef.current = militaryLayer;
    satLayerRef.current = satLayer;
    seismicLayerRef.current = seismicLayer;
    cctvLayerRef.current = cctvLayer;
    rasterLayerRef.current = rasterLayer;
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
    }, ScreenSpaceEventType.LEFT_CLICK);

    const poller = new PollingManager();
    let lastTleFetchAt = 0;

    poller.add({
      id: "opensky",
      intervalMs: ARGUS_CONFIG.pollMs.openSky,
      run: async () => {
        if (platformModeRef.current === "analytics") return;
        try {
          const flights = await fetchOpenSkyFlights(ARGUS_CONFIG.endpoints.openSky);
          const count = flightLayer.upsertFlights(flights.slice(0, ARGUS_CONFIG.limits.maxFlights));
          setCount("flights", count);
          setFeedHealthy("opensky");
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
          const count = militaryLayer.upsertFlights(
            flights.slice(0, ARGUS_CONFIG.limits.maxMilitaryFlights),
          );
          setCount("military", count);
          setFeedHealthy("adsb");
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
          const cameras = await fetchCctvCameras(ARGUS_CONFIG.endpoints.cctv);
          const count = cctvLayer.upsertCameras(cameras.slice(0, ARGUS_CONFIG.limits.maxCctv));
          setCount("cctv", count);
          setFeedHealthy("tfl");
        } catch (error) {
          setFeedError("tfl", error instanceof Error ? error.message : "Failed to fetch CCTV");
        }
      },
    });

    return () => {
      poller.stopAll();
      rasterLayer.unload();
      viewer.camera.changed.removeEventListener(onCameraChanged);
      picker.destroy();
      visualController.destroy();
      viewer.destroy();

      viewerRef.current = null;
      flightLayerRef.current = null;
      militaryLayerRef.current = null;
      satLayerRef.current = null;
      seismicLayerRef.current = null;
      cctvLayerRef.current = null;
      rasterLayerRef.current = null;
      visualModeRef.current = null;
      pickerRef.current = null;
    };
  }, [setCamera, setCount, setFeedError, setFeedHealthy]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = collisionEnabled;
  }, [collisionEnabled]);

  useEffect(() => {
    platformModeRef.current = platformMode;

    if (platformMode === "analytics") {
      flightLayerRef.current?.setVisible(false);
      militaryLayerRef.current?.setVisible(false);
      satLayerRef.current?.setVisible(false);
      seismicLayerRef.current?.setVisible(false);
      cctvLayerRef.current?.setVisible(false);
    } else {
      const { layers } = useArgusStore.getState();
      flightLayerRef.current?.setVisible(layers.flights);
      militaryLayerRef.current?.setVisible(layers.military);
      satLayerRef.current?.setVisible(layers.satellites);
      seismicLayerRef.current?.setVisible(layers.seismic);
      cctvLayerRef.current?.setVisible(layers.cctv);
    }
  }, [platformMode]);

  useEffect(() => {
    if (platformMode !== "analytics") {
      setAnalyticsStatus(null);
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
  }, [layers.cctv, layers.flights, layers.military, layers.satellites, layers.seismic]);

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
        analyticsStatus={analyticsStatus}
        selectedIntel={selectedIntel}
        showFullIntel={showFullIntel}
        onToggleFullIntel={() => setShowFullIntel((current) => !current)}
        onCloseIntel={() => {
          setSelectedIntel(null);
          setShowFullIntel(false);
        }}
      />
    </div>
  );
}
