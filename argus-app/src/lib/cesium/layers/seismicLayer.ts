import {
  Cartesian3,
  Color,
  ConstantPositionProperty,
  Entity,
  HeightReference,
  type Viewer,
} from "cesium";

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
        point: {
          pixelSize: magSize(quake.magnitude),
          color: magColor(quake.magnitude),
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
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
