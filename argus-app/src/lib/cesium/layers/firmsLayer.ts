import {
  Cartesian3,
  Color,
  ConstantPositionProperty,
  Entity,
  HeightReference,
  NearFarScalar,
  type Viewer,
} from "cesium";

import type { FirmsConfidence, ThermalAnomaly } from "@/types/intel";

const confidenceColor = (confidence: FirmsConfidence): Color => {
  if (confidence === "high") return Color.fromCssColorString("#fb4934");
  if (confidence === "low") return Color.fromCssColorString("#fabd2f");
  return Color.fromCssColorString("#fe8019");
};

const brightnessSize = (brightness: number, frp: number | null): number => {
  const frpBoost = frp && Number.isFinite(frp) ? Math.min(frp / 25, 1.4) : 0;
  if (brightness >= 360) return 14 + frpBoost * 6;
  if (brightness >= 330) return 11 + frpBoost * 5;
  if (brightness >= 310) return 8 + frpBoost * 4;
  return 6 + frpBoost * 3;
};

export class FirmsLayer {
  private viewer: Viewer;
  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  upsertAnomalies(anomalies: ThermalAnomaly[]): number {
    const seen = new Set<string>();

    for (const anomaly of anomalies) {
      seen.add(anomaly.id);
      const position = Cartesian3.fromDegrees(anomaly.longitude, anomaly.latitude);
      const existing = this.entities.get(anomaly.id);

      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }
        continue;
      }

      const color = confidenceColor(anomaly.confidence);
      const pixelSize = brightnessSize(anomaly.brightness, anomaly.frp);

      const entity = this.viewer.entities.add({
        id: anomaly.id,
        position,
        point: {
          pixelSize,
          color: color.withAlpha(0.92),
          outlineColor: Color.fromCssColorString("#fff5b8").withAlpha(0.85),
          outlineWidth: 1.4,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(500_000, 1.3, 25_000_000, 0.35),
          translucencyByDistance: new NearFarScalar(500_000, 1.0, 25_000_000, 0.35),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          kind: "thermal",
          brightness: anomaly.brightness,
          brightnessT31: anomaly.brightnessT31,
          confidence: anomaly.confidence,
          confidenceRaw: anomaly.confidenceRaw,
          satellite: anomaly.satellite,
          instrument: anomaly.instrument,
          frp: anomaly.frp,
          daynight: anomaly.daynight,
          acquiredAt: anomaly.acquiredAt,
          version: anomaly.version,
          scan: anomaly.scan,
          track: anomaly.track,
        },
      });

      this.entities.set(anomaly.id, entity);
    }

    for (const [id, entity] of this.entities.entries()) {
      if (seen.has(id)) continue;
      this.viewer.entities.remove(entity);
      this.entities.delete(id);
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
