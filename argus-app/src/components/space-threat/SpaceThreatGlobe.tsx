"use client";

import "cesium/Build/Cesium/Widgets/widgets.css";

import { useEffect, useRef, useState } from "react";
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  HeadingPitchRange,
  LabelStyle,
  Matrix4,
  NearFarScalar,
  TileMapServiceImageryProvider,
  VerticalOrigin,
  Viewer,
} from "cesium";

import {
  SPACE_THREAT_SCENARIO,
  type SpaceThreatAssessment,
  type SpaceThreatObservation,
} from "@/lib/spaceThreat/demoScenario";

export type SpaceThreatGlobeFrame = {
  runId: string;
  observation: SpaceThreatObservation;
  assessment: SpaceThreatAssessment;
  ingressStartedAt: number;
};

type SpaceThreatGlobeProps = {
  frame: SpaceThreatGlobeFrame | null;
  onFrameRendered: (runId: string, observationId: string, latencyMs: number) => void;
};

const DYNAMIC_ENTITY_IDS = [
  "space-demo-suspect",
  "space-demo-miss-vector",
  "space-demo-observed-track",
  ...SPACE_THREAT_SCENARIO.observations.map((observation) => `space-demo-cue-${observation.id}`),
];

const confidenceColor = (confidence: number): Color => {
  if (confidence >= 0.8) return Color.fromCssColorString("#fb4934");
  if (confidence >= 0.6) return Color.fromCssColorString("#fabd2f");
  return Color.fromCssColorString("#83a598");
};

const toCartesian = (position: { lonDeg: number; latDeg: number; altitudeKm: number }): Cartesian3 =>
  Cartesian3.fromDegrees(position.lonDeg, position.latDeg, position.altitudeKm * 1_000);

function buildReferenceTrack(): Cartesian3[] {
  const anchor = SPACE_THREAT_SCENARIO.protectedObject.displayPosition;
  return Array.from({ length: 49 }, (_, index) => {
    const offset = index - 24;
    return Cartesian3.fromDegrees(
      anchor.lonDeg + offset * 1.25,
      anchor.latDeg + Math.sin(offset / 8) * 5.5,
      anchor.altitudeKm * 1_000,
    );
  });
}

function removeDynamicEntities(viewer: Viewer): void {
  for (const id of DYNAMIC_ENTITY_IDS) {
    viewer.entities.removeById(id);
  }
}

export function SpaceThreatGlobe({ frame, onFrameRendered }: SpaceThreatGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const renderedCallbackRef = useRef(onFrameRendered);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    renderedCallbackRef.current = onFrameRendered;
  }, [onFrameRendered]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || viewerRef.current) return;

    (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium";

    const viewer = new Viewer(mount, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      scene3DOnly: true,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    });

    viewerRef.current = viewer;
    viewer.targetFrameRate = 30;
    viewer.resolutionScale = Math.min(1, 1 / Math.max(window.devicePixelRatio, 1));
    viewer.scene.globe.maximumScreenSpaceError = 3;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#101820");
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.fog.enabled = false;
    viewer.scene.skyAtmosphere = undefined;
    viewer.scene.sun = undefined;
    viewer.scene.moon = undefined;

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableCollisionDetection = false;
    controller.minimumZoomDistance = 250_000;
    controller.maximumZoomDistance = 30_000_000;

    const protectedPosition = SPACE_THREAT_SCENARIO.protectedObject.displayPosition;
    viewer.entities.add({
      id: "space-demo-protected",
      position: toCartesian(protectedPosition),
      point: {
        pixelSize: 12,
        color: Color.fromCssColorString("#2ad4ff"),
        outlineColor: Color.fromCssColorString("#d9fbff"),
        outlineWidth: 2,
        scaleByDistance: new NearFarScalar(500_000, 1.8, 8_000_000, 0.7),
      },
      label: {
        text: `${SPACE_THREAT_SCENARIO.protectedObject.id} // PROTECTED`,
        font: "600 12px monospace",
        fillColor: Color.fromCssColorString("#a5f0ff"),
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -15),
        scaleByDistance: new NearFarScalar(500_000, 1.2, 8_000_000, 0.45),
      },
    });

    viewer.entities.add({
      id: "space-demo-keepout",
      position: Cartesian3.fromDegrees(protectedPosition.lonDeg, protectedPosition.latDeg),
      ellipse: {
        semiMajorAxis: SPACE_THREAT_SCENARIO.keepOutRadiusKm * 1_000,
        semiMinorAxis: SPACE_THREAT_SCENARIO.keepOutRadiusKm * 1_000,
        height: protectedPosition.altitudeKm * 1_000,
        material: new ColorMaterialProperty(Color.fromCssColorString("#fb4934").withAlpha(0.12)),
        outline: true,
        outlineColor: Color.fromCssColorString("#fb4934").withAlpha(0.8),
      },
    });

    viewer.entities.add({
      id: "space-demo-reference-track",
      polyline: {
        positions: buildReferenceTrack(),
        width: 1.5,
        arcType: ArcType.NONE,
        material: new ColorMaterialProperty(Color.fromCssColorString("#2ad4ff").withAlpha(0.45)),
      },
    });

    viewer.camera.lookAt(
      toCartesian(protectedPosition),
      new HeadingPitchRange(0, -Math.PI / 3, 2_800_000),
    );
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    viewer.scene.canvas.addEventListener("webglcontextlost", onContextLost, false);

    let disposed = false;
    void TileMapServiceImageryProvider.fromUrl("/cesium/Assets/Textures/NaturalEarthII")
      .then((provider) => {
        if (disposed || viewer.isDestroyed()) return;
        viewer.imageryLayers.addImageryProvider(provider);
        viewer.scene.requestRender();
      })
      .catch(() => {
        // The globe base color remains usable if local imagery cannot be loaded.
      });

    viewer.scene.requestRender();

    return () => {
      disposed = true;
      viewer.scene.canvas.removeEventListener("webglcontextlost", onContextLost, false);
      viewerRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    removeDynamicEntities(viewer);
    if (!frame) {
      viewer.scene.requestRender();
      return;
    }

    const color = confidenceColor(frame.assessment.confidence);
    const visibleObservations = SPACE_THREAT_SCENARIO.observations.filter(
      (observation) => observation.sequence <= frame.observation.sequence,
    );
    const suspectPosition = toCartesian(frame.observation.displayPosition);
    const protectedPosition = toCartesian(SPACE_THREAT_SCENARIO.protectedObject.displayPosition);

    viewer.entities.add({
      id: "space-demo-suspect",
      position: suspectPosition,
      point: {
        pixelSize: 13,
        color,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        scaleByDistance: new NearFarScalar(500_000, 1.8, 8_000_000, 0.7),
      },
      label: {
        text: `${SPACE_THREAT_SCENARIO.suspectObject.id} // ${(frame.assessment.confidence * 100).toFixed(1)}%`,
        font: "600 12px monospace",
        fillColor: color,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -15),
        scaleByDistance: new NearFarScalar(500_000, 1.2, 8_000_000, 0.45),
      },
    });

    viewer.entities.add({
      id: "space-demo-miss-vector",
      polyline: {
        positions: [suspectPosition, protectedPosition],
        width: 2.5,
        arcType: ArcType.NONE,
        material: new ColorMaterialProperty(color.withAlpha(0.85)),
      },
    });

    if (visibleObservations.length > 1) {
      viewer.entities.add({
        id: "space-demo-observed-track",
        polyline: {
          positions: visibleObservations.map((observation) => toCartesian(observation.displayPosition)),
          width: 2,
          arcType: ArcType.NONE,
          material: new ColorMaterialProperty(Color.fromCssColorString("#fabd2f").withAlpha(0.72)),
        },
      });
    }

    for (const observation of visibleObservations) {
      const cueColor = observation.stance === "contradicts"
        ? Color.fromCssColorString("#8ec07c")
        : Color.fromCssColorString("#d79921");
      viewer.entities.add({
        id: `space-demo-cue-${observation.id}`,
        position: toCartesian(observation.displayPosition),
        point: {
          pixelSize: observation.id === frame.observation.id ? 7 : 4,
          color: cueColor.withAlpha(observation.id === frame.observation.id ? 1 : 0.55),
          outlineColor: Color.BLACK,
          outlineWidth: 1,
        },
      });
    }

    let listenerRemoved = false;
    const removePostRenderListener = viewer.scene.postRender.addEventListener(() => {
      if (listenerRemoved) return;
      listenerRemoved = true;
      removePostRenderListener();
      renderedCallbackRef.current(
        frame.runId,
        frame.observation.id,
        performance.now() - frame.ingressStartedAt,
      );
    });

    viewer.scene.requestRender();
    return () => {
      if (!listenerRemoved) {
        listenerRemoved = true;
        removePostRenderListener();
      }
    };
  }, [frame]);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-2xl border border-[#3c3836] bg-[#080d12] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div ref={mountRef} className="absolute inset-0" aria-label="Synthetic orbital event globe" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_48%,rgba(4,8,12,0.72)_100%)]" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-[#3c3836] bg-[#11161ddd] px-3 py-2 backdrop-blur">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#83a598]">Orbital scene</div>
        <div className="mt-1 font-mono text-[10px] text-[#d5c4a1]">WGS84 display projection · 15 km keep-out</div>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 font-mono text-[8px] uppercase tracking-[0.13em]">
        <span className="rounded border border-[#2f6f81] bg-[#0b1d25dd] px-2 py-1 text-[#a5f0ff]">● protected</span>
        <span className="rounded border border-[#7c631b] bg-[#241d0ddd] px-2 py-1 text-[#fabd2f]">● assessed object</span>
        <span className="rounded border border-[#496c45] bg-[#132015dd] px-2 py-1 text-[#8ec07c]">● contradiction</span>
      </div>
      {contextLost ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b1118e8] p-6 text-center">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#fb4934]">WebGL context lost</div>
            <p className="mt-2 max-w-sm text-[11px] leading-5 text-[#a89984]">
              Evidence fusion remains available. Reload this page to restore the orbital view.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
