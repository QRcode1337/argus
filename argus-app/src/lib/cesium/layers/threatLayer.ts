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
import type { ThreatPulse } from "@/lib/ingest/otx";

export class ThreatLayer {
  private viewer: Viewer;
  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  update(threats: ThreatPulse[]): number {
    const seen = new Set<string>();

    for (const threat of threats) {
      const entityId = `threat-${threat.id}`;
      seen.add(entityId);

      if (this.entities.has(entityId)) continue;

      const adversaryLabel = threat.adversary ? `[${threat.adversary}]` : "";
      const malwareLabel = threat.malwareFamilies.slice(0, 2).join(", ");
      const topLine = [adversaryLabel, malwareLabel].filter(Boolean).join(" ") || threat.name.slice(0, 40);

      const entity = this.viewer.entities.add({
        id: entityId,
        position: Cartesian3.fromDegrees(threat.lon, threat.lat),
        billboard: {
          image: new ConstantProperty(
            createTacticalMarkerSvg({
              fill: "#ff3366",
              glow: "#ff99bb",
              stroke: "#2a101a",
            }),
          ),
          scale: 0.85,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1_000_000, 1.4, 25_000_000, 0.5),
        },
        label: {
          text: `${topLine}\n${threat.targetedCountry}`,
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: Color.fromCssColorString("#ff99bb"),
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.75),
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(500_000, 0.85, 8_000_000, 0),
        },
        properties: {
          kind: "threat",
          name: threat.name,
          adversary: threat.adversary ?? "Unknown",
          malware: threat.malwareFamilies.join(", ") || "N/A",
          industries: threat.industries.join(", ") || "N/A",
          targetedCountry: threat.targetedCountry,
          indicators: `${threat.indicatorCount} IOCs`,
          tags: threat.tags.slice(0, 8).join(", "),
          created: threat.created,
          modified: threat.modified,
          tlp: threat.tlp.toUpperCase(),
        },
      });

      this.entities.set(entityId, entity);
    }

    // Remove stale
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
