import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import { createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";
import { lookupAircraftType } from "@/lib/data/aircraftTypes";
import type { MilitaryFlight } from "@/types/intel";

export class MilitaryLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();
  private readonly marker = createTacticalMarkerSvg({
    fill: "#e3ad50",
    glow: "#ffd088",
    stroke: "#2f1b08",
  });

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

      const typeInfo = lookupAircraftType(flight.type);

      const entity = this.viewer.entities.add({
        id: `mil-${flight.id}`,
        position,
        billboard: {
          image: new ConstantProperty(this.marker),
          scale: 0.72,
          verticalOrigin: VerticalOrigin.CENTER,
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
          aircraftFullName: typeInfo?.fullName ?? null,
          aircraftCategory: typeInfo?.category ?? null,
          aircraftManufacturer: typeInfo?.manufacturer ?? null,
          aircraftOrigin: typeInfo?.originCountry ?? null,
          imageUrl: typeInfo?.silhouettePath ?? "/aircraft/generic.svg",
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
