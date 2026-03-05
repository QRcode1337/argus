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

import { MILITARY_BASES } from "@/data/militaryBases";
import { createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";

const BASE_COLORS: Record<string, Color> = {
  US: Color.fromCssColorString("#ff6b6b"),
  Russia: Color.fromCssColorString("#e74c3c"),
  China: Color.fromCssColorString("#f39c12"),
  UK: Color.fromCssColorString("#3498db"),
  France: Color.fromCssColorString("#2980b9"),
  NATO: Color.fromCssColorString("#1abc9c"),
  India: Color.fromCssColorString("#e67e22"),
  Israel: Color.fromCssColorString("#9b59b6"),
  Other: Color.fromCssColorString("#95a5a6"),
};

const TYPE_LABELS: Record<string, string> = {
  air: "AIR",
  naval: "NAV",
  army: "ARMY",
  joint: "JNT",
  missile: "MSL",
  space: "SPC",
  nuclear: "NUC",
};

export class BasesLayer {
  private viewer: Viewer;
  private entities: Entity[] = [];
  private loaded = false;
  private markerByOperator = new Map<string, string>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  load(): number {
    if (this.loaded) return this.entities.length;

    for (const base of MILITARY_BASES) {
      const color = BASE_COLORS[base.operator] ?? BASE_COLORS.Other;
      const typeTag = TYPE_LABELS[base.type] ?? base.type.toUpperCase();

      const entity = this.viewer.entities.add({
        id: `base-${base.id}`,
        position: Cartesian3.fromDegrees(base.lon, base.lat),
        billboard: {
          image: new ConstantProperty(this.markerForOperator(base.operator, color)),
          scale: 0.7,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1_000_000, 1.2, 20_000_000, 0.4),
        },
        label: {
          text: (() => { const t = `${typeTag} ${base.name}`; return t.length > 9 ? `${t.slice(0, 9)}…` : t; })(),
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: color,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.65),
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(500_000, 0.8, 5_000_000, 0),
        },
        properties: {
          kind: "base",
          name: base.name,
          country: base.country,
          operator: base.operator,
          baseType: base.type,
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

  private markerForOperator(operator: string, color: Color): string {
    const cached = this.markerByOperator.get(operator);
    if (cached) return cached;
    const marker = createTacticalMarkerSvg({
      fill: color.toCssColorString(),
      glow: color.brighten(0.25, new Color()).toCssColorString(),
      stroke: "#121820",
    });
    this.markerByOperator.set(operator, marker);
    return marker;
  }
}
