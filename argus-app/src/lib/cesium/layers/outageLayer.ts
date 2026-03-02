import {
  Cartesian3,
  Color,
  Entity,
  HeightReference,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import type { InternetOutage } from "@/lib/ingest/cloudflareRadar";

const CAUSE_COLORS: Record<string, Color> = {
  GOVERNMENT_DIRECTED: Color.fromCssColorString("#e74c3c"),
  CABLE_CUT: Color.fromCssColorString("#e67e22"),
  POWER_OUTAGE: Color.fromCssColorString("#f39c12"),
  TECHNICAL_PROBLEM: Color.fromCssColorString("#3498db"),
  WEATHER: Color.fromCssColorString("#9b59b6"),
  PLATFORM: Color.fromCssColorString("#1abc9c"),
};

const DEFAULT_COLOR = Color.fromCssColorString("#e74c3c");

export class OutageLayer {
  private viewer: Viewer;
  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  update(outages: InternetOutage[]): number {
    const seen = new Set<string>();

    for (const outage of outages) {
      const entityId = `outage-${outage.id}`;
      seen.add(entityId);

      if (this.entities.has(entityId)) continue;

      const color = CAUSE_COLORS[outage.cause] ?? DEFAULT_COLOR;
      const isActive = !outage.endDate;
      const label = outage.locationName ?? outage.scope ?? "Unknown";
      const causeLabel = outage.cause.replace(/_/g, " ");

      const entity = this.viewer.entities.add({
        id: entityId,
        position: Cartesian3.fromDegrees(outage.lon, outage.lat),
        point: {
          pixelSize: isActive ? 10 : 7,
          color: isActive ? color : color.withAlpha(0.5),
          outlineColor: isActive ? Color.WHITE : Color.GRAY,
          outlineWidth: isActive ? 2 : 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1_000_000, 1.5, 25_000_000, 0.6),
        },
        label: {
          text: `${isActive ? "!! " : ""}${label}\n${causeLabel}`,
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: isActive ? Color.WHITE : Color.LIGHTGRAY,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.75),
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1_000_000, 0.9, 10_000_000, 0),
        },
        properties: {
          kind: "outage",
          name: `${label} — ${causeLabel}`,
          description: outage.description,
          cause: outage.cause,
          type: outage.type,
          startDate: outage.startDate,
          endDate: outage.endDate ?? "Ongoing",
          locationCode: outage.locationCode,
          asnName: outage.asnName,
          linkedUrl: outage.linkedUrl,
        },
      });

      this.entities.set(entityId, entity);
    }

    // Remove stale outages
    for (const [id, entity] of this.entities.entries()) {
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
}
