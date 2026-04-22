import {
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  NearFarScalar,
  type Viewer,
} from "cesium";

import { createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";
import { getCountry } from "@/lib/analysis/countryLookup";

interface CiiEntry {
  iso: string;
  score: number;
  signals: Record<string, number>;
}

const scoreColor = (score: number): string => {
  if (score >= 80) return "#dc2626";
  if (score >= 60) return "#f97316";
  if (score >= 40) return "#eab308";
  return "#22c55e";
};

const scoreScale = (score: number): number => {
  return 0.6 + ((score - 60) / 40) * 0.8;
};

export class CiiLayer {
  private viewer: Viewer;
  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  updateHotspots(entries: CiiEntry[]): number {
    const seen = new Set<string>();

    for (const entry of entries) {
      if (entry.score <= 60) continue;

      const country = getCountry(entry.iso);
      if (!country) continue;

      seen.add(entry.iso);
      const position = Cartesian3.fromDegrees(country.centroid[1], country.centroid[0]);
      const existing = this.entities.get(entry.iso);

      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) positionProperty.setValue(position);

        if (existing.billboard) {
          existing.billboard.image = new ConstantProperty(
            createTacticalMarkerSvg({
              fill: scoreColor(entry.score),
              glow: scoreColor(entry.score),
              stroke: "#121820",
            }),
          );
          existing.billboard.scale = new ConstantProperty(scoreScale(entry.score));
        }
        continue;
      }

      const entity = this.viewer.entities.add({
        id: `cii-${entry.iso}`,
        position,
        billboard: {
          image: new ConstantProperty(
            createTacticalMarkerSvg({
              fill: scoreColor(entry.score),
              glow: scoreColor(entry.score),
              stroke: "#121820",
            }),
          ),
          scale: new ConstantProperty(scoreScale(entry.score)),
          scaleByDistance: new NearFarScalar(1_000_000, 1.2, 20_000_000, 0.5),
          disableDepthTestDistance: 0,
        },
        description: `${country.name} — CII: ${entry.score.toFixed(0)}/100\n${Object.entries(entry.signals).map(([k, v]) => `${k}: ${v.toFixed(0)}`).join(", ")}`,
        properties: {
          kind: "cii",
          iso: entry.iso,
          score: entry.score,
        },
      });

      this.entities.set(entry.iso, entity);
    }

    for (const [iso, entity] of this.entities.entries()) {
      if (!seen.has(iso)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(iso);
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
