import {
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  LabelStyle,
  NearFarScalar,
  type Viewer,
} from "cesium";

import { computeOrbitTrack, computeSatellitePositions } from "@/lib/ingest/tle";
import type { SatelliteRecord } from "@/types/intel";

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

      // Filter out near-duplicate points that cause Cesium polyline geometry errors.
      // Cesium requires a minimum Cartesian distance of 0.0125 between consecutive
      // polyline vertices; we use a generous margin to be safe.
      const allCartesians = orbit.map(
        (pt) => Cartesian3.fromDegrees(pt[0], pt[1], pt[2])
      );
      const orbitPositions: Cartesian3[] = [];
      for (const c of allCartesians) {
        if (orbitPositions.length === 0) { orbitPositions.push(c); continue; }
        const dist = Cartesian3.distance(orbitPositions[orbitPositions.length - 1], c);
        if (dist > 0.1) {
          orbitPositions.push(c);
        }
      }
      if (orbitPositions.length < 2) continue;

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
          material: Color.LIME.withAlpha(0.4),
        },
        properties: {
          kind: "satellite",
          name: sat.name,
          classification: record.metadata?.objectType ?? "Unknown",
          orbitType: record.metadata?.orbitType ?? "Unknown",
          countryCode: record.metadata?.countryCode ?? "Unknown",
          launchDate: record.metadata?.launchDate ?? "Unknown",
          rcsSize: record.metadata?.rcsSize ?? "Unknown",
          periodMinutes: record.metadata?.periodMinutes,
          inclinationDeg: record.metadata?.inclinationDeg,
          apogeeKm: record.metadata?.apogeeKm,
          perigeeKm: record.metadata?.perigeeKm,
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
