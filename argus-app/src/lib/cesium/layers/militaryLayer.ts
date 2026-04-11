import {
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  Math as CesiumMath,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import { createTacticalMarkerSvg, createAirplaneSvg } from "@/lib/cesium/tacticalMarker";
import { lookupAircraftType } from "@/lib/data/aircraftTypes";
import type { MilitaryFlight } from "@/types/intel";

const MAX_TRAIL_POSITIONS = 60;

export class MilitaryLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();
  private positionHistory = new Map<string, Cartesian3[]>();
  private trailEntity: Entity | null = null;
  private activeTrailFlightId: string | null = null;

  private readonly marker = createAirplaneSvg({
    fill: "#cc241d",
    glow: "#fb4934",
    stroke: "#3c3836",
  });

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  upsertFlights(flights: MilitaryFlight[]): number {
    const seen = new Set<string>();

    for (const flight of flights) {
      seen.add(flight.id);

      if (!Number.isFinite(flight.longitude) || !Number.isFinite(flight.latitude)) continue;

      const position = Cartesian3.fromDegrees(
        flight.longitude,
        flight.latitude,
        Math.max(0, flight.altitudeMeters || 0),
      );

      // Append position to history (circular buffer)
      let history = this.positionHistory.get(flight.id);
      if (!history) {
        history = [];
        this.positionHistory.set(flight.id, history);
      }
      const last = history[history.length - 1];
      if (!last || !Cartesian3.equals(last, position)) {
        history.push(position);
        if (history.length > MAX_TRAIL_POSITIONS) {
          history.shift();
        }
      }

      const heading = flight.trueTrack ?? 0;
      const rotation = -CesiumMath.toRadians(heading);

      const existing = this.entities.get(flight.id);
      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }
        if (existing.billboard) {
          existing.billboard.rotation = new ConstantProperty(rotation) as any;
        }

        // Update trail if this flight is being tracked
        if (this.activeTrailFlightId === flight.id && this.trailEntity) {
          const polyline = this.trailEntity.polyline;
          if (polyline && history.length >= 2) {
            polyline.positions = new ConstantProperty(history.slice()) as any;
          }
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
          rotation: new ConstantProperty(rotation) as any,
          alignedAxis: new ConstantProperty(Cartesian3.ZERO) as any,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(2_000_000, 1.4, 20_000_000, 0.4),
          disableDepthTestDistance: 0,
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
      this.positionHistory.delete(id);

      if (this.activeTrailFlightId === id) {
        this.hideTrail();
      }
    }

    return this.entities.size;
  }

  showTrail(flightId: string): void {
    // Only one trail at a time
    this.hideTrail();

    const history = this.positionHistory.get(flightId);
    if (!history || history.length < 2) return;

    const entity = this.entities.get(flightId);
    const originCountry = entity?.properties?.aircraftOrigin?.getValue(this.viewer.clock.currentTime) ?? "";
    const color = this.getCountryColor(originCountry);

    this.trailEntity = this.viewer.entities.add({
      id: `mil-trail-${flightId}`,
      polyline: {
        positions: new ConstantProperty(history.slice()) as any,
        width: new ConstantProperty(3),
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color,
        }),
      },
    });

    this.activeTrailFlightId = flightId;
  }

  hideTrail(): void {
    if (this.trailEntity) {
      this.viewer.entities.remove(this.trailEntity);
      this.trailEntity = null;
    }
    this.activeTrailFlightId = null;
  }

  getCountryColor(country: string): Color {
    switch (country) {
      case "United States":
        return Color.fromCssColorString("#2ad4ff");
      case "Russia":
      case "Russian Federation":
        return Color.fromCssColorString("#fb4934");
      case "China":
        return Color.fromCssColorString("#fabd2f");
      case "United Kingdom":
        return Color.fromCssColorString("#458588");
      case "France":
        return Color.fromCssColorString("#b16286");
      case "Germany":
        return Color.fromCssColorString("#b8bb26");
      default:
        // Default to red for military flights with no country info
        return Color.fromCssColorString(country ? "#ebdbb2" : "#fb4934");
    }
  }

  setVisible(visible: boolean): void {
    for (const entity of this.entities.values()) {
      entity.show = visible;
    }
  }
}
