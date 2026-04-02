import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  Entity,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import { createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";
import type { PhantomAnomaly } from "@/lib/intel/analysisEngine";

const SEVERITY_COLORS: Record<string, { fill: string; glow: string }> = {
  Critical: { fill: "#ff0000", glow: "#ff6666" },
  High: { fill: "#ff6600", glow: "#ffaa66" },
  Medium: { fill: "#ffcc00", glow: "#ffee66" },
  Low: { fill: "#00ccff", glow: "#66ddff" },
};

export class AnomalyLayer {
  private viewer: Viewer;
  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  update(anomalies: PhantomAnomaly[]): number {
    const seen = new Set<string>();

    for (const anomaly of anomalies) {
      const entityId = `anomaly-${anomaly.entity_id}`;
      seen.add(entityId);

      if (this.entities.has(entityId)) continue;

      const colors = SEVERITY_COLORS[anomaly.severity] ?? SEVERITY_COLORS.Low;
      const label = anomaly.anomaly_type.replace(/_/g, " ");

      const entity = this.viewer.entities.add({
        id: entityId,
        position: Cartesian3.fromDegrees(anomaly.lon, anomaly.lat),
        billboard: {
          image: new ConstantProperty(
            createTacticalMarkerSvg({
              fill: colors.fill,
              glow: colors.glow,
              stroke: "#1a0a0a",
            }),
          ),
          scale: 0.9,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1_000_000, 1.4, 25_000_000, 0.5),
          disableDepthTestDistance: 0,
        },
        label: {
          text: label,
          font: "bold 11px monospace",
          style: LabelStyle.FILL,
          fillColor: Color.fromCssColorString(colors.glow),
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.75),
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -18),
          scaleByDistance: new NearFarScalar(500_000, 0.85, 8_000_000, 0),
        },
        properties: {
          kind: "anomaly",
          entity_id: anomaly.entity_id,
          anomaly_type: anomaly.anomaly_type,
          chaos_score: anomaly.chaos_score,
          severity: anomaly.severity,
          lat: anomaly.lat,
          lon: anomaly.lon,
          detail: anomaly.detail,
          detected_at: anomaly.detected_at,
          name: label,
        },
      });
      this.entities.set(entityId, entity);
    }

    // Remove stale entities
    for (const [id, entity] of this.entities) {
      if (!seen.has(id)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(id);
      }
    }

    return this.entities.size;
  }

  setVisible(visible: boolean): void {
    for (const entity of this.entities.values()) {
      entity.show = visible;
    }
  }

  clear(): void {
    for (const entity of this.entities.values()) {
      this.viewer.entities.remove(entity);
    }
    this.entities.clear();
  }
}
