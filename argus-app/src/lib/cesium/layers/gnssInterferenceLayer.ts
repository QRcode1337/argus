import {
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Entity,
  type Viewer,
} from "cesium";

import { GNSS_INTERFERENCE_ZONES } from "@/lib/gnss/interference";

export class GnssInterferenceLayer {
  private viewer: Viewer;
  private entities: Entity[] = [];
  private loaded = false;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  load(): number {
    if (this.loaded) return this.entities.length;

    for (const zone of GNSS_INTERFERENCE_ZONES) {
      const color =
        zone.severity === "severe"
          ? Color.fromCssColorString("#fb4934")
          : Color.fromCssColorString("#fabd2f");

      const entity = this.viewer.entities.add({
        id: `gnss-zone-${zone.id}`,
        position: Cartesian3.fromDegrees(zone.lon, zone.lat, 0),
        ellipse: {
          semiMajorAxis: zone.radiusKm * 1000,
          semiMinorAxis: zone.radiusKm * 1000,
          material: color.withAlpha(zone.severity === "severe" ? 0.14 : 0.1),
          outline: true,
          outlineColor: color.withAlpha(0.85),
          height: 0,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: `GNSS ${zone.severity.toUpperCase()} ${zone.label}`,
          font: "bold 11px monospace",
          style: LabelStyle.FILL_AND_OUTLINE,
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -8),
          scaleByDistance: new NearFarScalar(500_000, 1, 12_000_000, 0.2),
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.55),
        },
        properties: {
          kind: "gnss",
          name: `GNSS Interference ${zone.label}`,
          severity: zone.severity,
          source: zone.source,
          radiusKm: zone.radiusKm,
          summary: zone.summary,
        },
      });

      this.entities.push(entity);
    }

    this.loaded = true;
    return this.entities.length;
  }

  setVisible(visible: boolean): void {
    for (const entity of this.entities) {
      entity.show = visible;
    }
  }
}
