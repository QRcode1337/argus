import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  Entity,
  HeightReference,
  LabelStyle,
  NearFarScalar,
  type Viewer,
} from "cesium";

import type { MilitaryFlight } from "@/types/intel";

export class MilitaryLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  upsertFlights(flights: MilitaryFlight[]): number {
    const seen = new Set<string>();

    for (const flight of flights) {
      seen.add(flight.id);

      const position = Cartesian3.fromDegrees(
        flight.longitude,
        flight.latitude,
        Math.max(0, flight.altitudeMeters),
      );

      const existing = this.entities.get(flight.id);
      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }
        continue;
      }

      const entity = this.viewer.entities.add({
        id: `mil-${flight.id}`,
        position,
        point: {
          pixelSize: 5,
          color: Color.ORANGE,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(2_000_000, 1.4, 20_000_000, 0.4),
        },
        label: {
          text: `MIL ${flight.callsign}`,
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: Color.ORANGE,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.65),
          pixelOffset: new Cartesian2(0, -16),
          scaleByDistance: new NearFarScalar(2_000_000, 1, 8_000_000, 0),
        },
        properties: {
          kind: "military",
          callsign: flight.callsign,
          velocity: flight.velocity,
          track: flight.trueTrack,
          type: flight.type ?? "unknown",
        },
      });

      this.entities.set(flight.id, entity);
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
