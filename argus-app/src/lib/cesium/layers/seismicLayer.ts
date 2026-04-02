import {
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import { createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";
import type { EarthquakeFeature } from "@/types/intel";

const magColor = (magnitude: number): Color => {
  if (magnitude >= 6) return Color.RED;
  if (magnitude >= 4.5) return Color.ORANGE;
  if (magnitude >= 3) return Color.YELLOW;
  return Color.CYAN;
};

const magSize = (magnitude: number): number => {
  if (magnitude <= 0) return 3;
  return Math.min(16, 3 + magnitude * 1.6);
};

export class SeismicLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  upsertEarthquakes(quakes: EarthquakeFeature[]): number {
    const seen = new Set<string>();

    for (const quake of quakes) {
      seen.add(quake.id);

      const position = Cartesian3.fromDegrees(quake.longitude, quake.latitude);
      const existing = this.entities.get(quake.id);

      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }
        continue;
      }

      const entity = this.viewer.entities.add({
        id: `quake-${quake.id}`,
        position,
        billboard: {
          image: new ConstantProperty(
            createTacticalMarkerSvg({
              fill: magColor(quake.magnitude).toCssColorString(),
              glow: magColor(quake.magnitude).brighten(0.2, new Color()).toCssColorString(),
              stroke: "#121820",
            }),
          ),
          scale: Math.max(0.46, Math.min(1.24, magSize(quake.magnitude) / 8)),
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1_000_000, 1.2, 20_000_000, 0.4),
          disableDepthTestDistance: 0,
        },
        description: `${quake.place} (M${quake.magnitude.toFixed(1)})`,
        properties: {
          kind: "earthquake",
          magnitude: quake.magnitude,
          depthKm: quake.depthKm,
        },
      });

      this.entities.set(quake.id, entity);
    }

    for (const [id, entity] of this.entities.entries()) {
      if (seen.has(id)) {
        continue;
      }

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
}
