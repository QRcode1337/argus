import {
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

import { createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";
import type { GdeltEvent } from "@/types/gdelt";
import { QUAD_CLASS_COLORS } from "@/types/gdelt";

export class GdeltLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();

  private markerByQuadClass = new Map<number, string>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  private getMarker(quadClass: number): string {
    const cached = this.markerByQuadClass.get(quadClass);
    if (cached) return cached;

    const colorHex = QUAD_CLASS_COLORS[quadClass as keyof typeof QUAD_CLASS_COLORS] ?? "#888888";
    const fill = Color.fromCssColorString(colorHex);
    const glow = fill.brighten(0.2, new Color());

    const svg = createTacticalMarkerSvg({
      fill: fill.toCssColorString(),
      glow: glow.toCssColorString(),
      stroke: "#121820",
    });

    this.markerByQuadClass.set(quadClass, svg);
    return svg;
  }

  update(events: GdeltEvent[]): number {
    const seen = new Set<string>();

    for (const event of events) {
      seen.add(event.id);

      const position = Cartesian3.fromDegrees(event.longitude, event.latitude);
      const existing = this.entities.get(event.id);

      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }
        continue;
      }

      const colorHex = QUAD_CLASS_COLORS[event.quadClass] ?? "#888888";
      const labelColor = Color.fromCssColorString(colorHex);

      const entity = this.viewer.entities.add({
        id: `gdelt-${event.id}`,
        position,
        billboard: {
          image: new ConstantProperty(this.getMarker(event.quadClass)),
          scale: 0.55,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1_000_000, 1.2, 20_000_000, 0.4),
        },
        label: {
          text: event.actionGeoName.length > 9 ? `${event.actionGeoName.slice(0, 9)}…` : event.actionGeoName,
          font: "bold 11px monospace",
          style: LabelStyle.FILL_AND_OUTLINE,
          fillColor: labelColor,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.55),
          scaleByDistance: new NearFarScalar(1_000_000, 1.0, 20_000_000, 0.35),
        },
        properties: {
          kind: "gdelt",
          quadClass: event.quadClass,
          goldsteinScale: event.goldsteinScale,
          numMentions: event.numMentions,
          actor1Name: event.actor1Name,
          actor1Country: event.actor1Country,
          actor2Name: event.actor2Name,
          actor2Country: event.actor2Country,
          eventCode: event.eventCode,
          sourceUrl: event.sourceUrl,
          actionGeoName: event.actionGeoName,
          avgTone: event.avgTone,
        },
      });

      this.entities.set(event.id, entity);
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
