import {
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  LabelStyle,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  type Viewer,
} from "cesium";

import { computeOrbitTrack, computeSatellitePositions } from "@/lib/ingest/tle";
import type { SatelliteRecord } from "@/types/intel";

function classifySatellite(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("STARLINK")) return "Communications (LEO Constellation)";
  if (upper.includes("ONEWEB")) return "Communications (LEO Constellation)";
  if (upper.includes("ISS") || upper.includes("ZARYA")) return "Space Station (Manned)";
  if (upper.includes("TIANGONG")) return "Space Station (Manned)";
  if (upper.includes("GOES") || upper.includes("METEOSAT") || upper.includes("NOAA")) return "Meteorological / Weather";
  if (upper.includes("GPS") || upper.includes("NAVSTAR") || upper.includes("GLONASS") || upper.includes("GALILEO") || upper.includes("BEIDOU")) return "Navigation / Positioning";
  if (upper.includes("IRIDIUM") || upper.includes("GLOBALSTAR")) return "Communications (Voice/Data)";
  if (upper.includes("LANDSAT") || upper.includes("SENTINEL")) return "Earth Observation";
  if (upper.includes("HUBBLE") || upper.includes("JWST") || upper.includes("CHANDRA")) return "Space Telescope";
  return "General Purpose / LEO Object";
}

export class SatelliteLayer {
  private viewer: Viewer;

  private records: SatelliteRecord[] = [];

  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  setRecords(records: SatelliteRecord[]): void {
    this.records = records;
  }

  update(at: Date, orbitSamples: number, orbitStepMinutes: number): number {
    const positions = computeSatellitePositions(this.records, at);
    const seen = new Set<string>();

    for (const sat of positions) {
      seen.add(sat.id);
      const record = this.records.find((item) => item.id === sat.id);
      if (!record) {
        continue;
      }

      const position = Cartesian3.fromDegrees(sat.longitude, sat.latitude, sat.altitudeKm * 1000);
      const orbit = computeOrbitTrack(record, at, orbitSamples, orbitStepMinutes);
      const orbitPositions = Cartesian3.fromDegreesArrayHeights(orbit.flat());

      const existing = this.entities.get(sat.id);
      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }
        if (existing.polyline) {
          existing.polyline.positions = new ConstantProperty(orbitPositions);
        }
        continue;
      }

      const entity = this.viewer.entities.add({
        id: `sat-${sat.id}`,
        position,
        point: {
          pixelSize: 4,
          color: Color.LIME,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          scaleByDistance: new NearFarScalar(2_000_000, 1.5, 25_000_000, 0.45),
        },
        label: {
          text: sat.name,
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: Color.LIME,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.65),
          scaleByDistance: new NearFarScalar(3_000_000, 0.9, 10_000_000, 0),
        },
        polyline: {
          positions: new ConstantProperty(orbitPositions),
          width: 1,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.1,
            color: Color.LIME.withAlpha(0.5),
          }),
        },
        properties: {
          kind: "satellite",
          name: sat.name,
          classification: classifySatellite(sat.name),
        },
      });

      this.entities.set(sat.id, entity);
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
