import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import type { CctvCamera } from "@/types/intel";

export class CctvLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  upsertCameras(cameras: CctvCamera[]): number {
    const seen = new Set<string>();

    for (const camera of cameras) {
      seen.add(camera.id);

      const position = Cartesian3.fromDegrees(camera.longitude, camera.latitude, 10);
      const existing = this.entities.get(camera.id);

      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }

        if (existing.billboard) {
          const imageProperty = existing.billboard.image as ConstantProperty | undefined;
          if (imageProperty?.setValue) {
            imageProperty.setValue(camera.imageUrl);
          } else {
            existing.billboard.image = new ConstantProperty(camera.imageUrl);
          }
        }

        continue;
      }

      const entity = this.viewer.entities.add({
        id: `cctv-${camera.id}`,
        position,
        billboard: {
          image: new ConstantProperty(camera.imageUrl),
          scale: 0.4,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1_000, 0.7, 2_500_000, 0.2),
        },
        label: {
          text: camera.name,
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: Color.LIME,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.65),
          pixelOffset: new Cartesian2(0, -8),
          scaleByDistance: new NearFarScalar(2_000, 1, 150_000, 0),
        },
        properties: {
          kind: "cctv",
          imageUrl: camera.imageUrl,
          streamUrl: camera.streamUrl ?? null,
          name: camera.name,
          category: camera.category,
          provider: camera.provider,
        },
      });

      this.entities.set(camera.id, entity);
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
