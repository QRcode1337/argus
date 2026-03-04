import {
  ArcType,
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

  private orbitEntity: Entity | null = null;

  private selectedSatId: string | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  setRecords(records: SatelliteRecord[]): void {
    this.records = records;
  }

  getRecords(): SatelliteRecord[] {
    return this.records;
  }

  update(at: Date, orbitSamples: number, orbitStepMinutes: number): number {
    const positions = computeSatellitePositions(this.records, at);
    const seen = new Set<string>();

    for (const sat of positions) {
      seen.add(sat.id);

      const position = Cartesian3.fromDegrees(sat.longitude, sat.latitude, sat.altitudeKm * 1000);

      const existing = this.entities.get(sat.id);
      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }
        continue;
      }

      const record = this.records.find((item) => item.id === sat.id);
      if (!record) continue;

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
      if (seen.has(id)) continue;
      this.viewer.entities.remove(entity);
      this.entities.delete(id);
    }

    // Refresh orbit trail for the selected satellite
    if (this.selectedSatId) {
      this.refreshOrbit(at, orbitSamples, orbitStepMinutes);
    }

    return this.entities.size;
  }

  /** Show orbit trail for a satellite. Pass null to hide. */
  showOrbit(satId: string | null, orbitSamples: number, orbitStepMinutes: number): void {
    // Clear previous orbit
    if (this.orbitEntity) {
      this.viewer.entities.remove(this.orbitEntity);
      this.orbitEntity = null;
    }
    this.selectedSatId = satId;

    if (!satId) return;
    this.refreshOrbit(new Date(), orbitSamples, orbitStepMinutes);
  }

  private refreshOrbit(at: Date, orbitSamples: number, orbitStepMinutes: number): void {
    const record = this.records.find((r) => r.id === this.selectedSatId);
    if (!record) return;

    const orbit = computeOrbitTrack(record, at, orbitSamples, orbitStepMinutes);
    const allCartesians = orbit.map(
      (pt) => Cartesian3.fromDegrees(pt[0], pt[1], pt[2])
    );
    const filtered: Cartesian3[] = [];
    for (const c of allCartesians) {
      if (filtered.length === 0) { filtered.push(c); continue; }
      if (Cartesian3.distance(filtered[filtered.length - 1], c) > 0.1) {
        filtered.push(c);
      }
    }
    if (filtered.length < 2) return;

    if (this.orbitEntity) {
      this.orbitEntity.polyline!.positions = new ConstantProperty(filtered);
    } else {
      this.orbitEntity = this.viewer.entities.add({
        polyline: {
          positions: new ConstantProperty(filtered),
          width: 1.5,
          material: Color.LIME.withAlpha(0.6),
          arcType: new ConstantProperty(ArcType.NONE),
        },
      });
    }
  }

  setVisible(visible: boolean): void {
    for (const entity of this.entities.values()) {
      entity.show = visible;
    }
    if (this.orbitEntity) {
      this.orbitEntity.show = visible;
    }
  }
}
