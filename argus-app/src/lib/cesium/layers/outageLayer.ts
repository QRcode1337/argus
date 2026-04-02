import {
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
        billboard: {
          image: new ConstantProperty(
            createTacticalMarkerSvg({
              fill: (isActive ? color : color.withAlpha(0.6)).toCssColorString(),
              glow: color.brighten(0.22, new Color()).toCssColorString(),
              stroke: isActive ? "#d9f5ff" : "#4d5d68",
            }),
          ),
          scale: isActive ? 0.95 : 0.72,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1_000_000, 1.5, 25_000_000, 0.6),
          disableDepthTestDistance: 0,
        },
        label: {
          text: (() => { const t = `${isActive ? "!! " : ""}${label}`; return t.length > 9 ? `${t.slice(0, 9)}…` : t; })(),
          font: "bold 12px monospace",
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
