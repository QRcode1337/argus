import {
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import { createAirplaneSvg } from "@/lib/cesium/tacticalMarker";
import type { TrackedFlight } from "@/types/intel";

const MAX_TRAIL_POSITIONS = 60;

export class FlightLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();
  private positionHistory = new Map<string, Cartesian3[]>();
  private trailEntity: Entity | null = null;
  private activeTrailFlightId: string | null = null;

  private readonly marker = createAirplaneSvg({
    fill: "#fabd2f",
    glow: "#f9e2af",
    stroke: "#3c3836",
  });

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  upsertFlights(flights: TrackedFlight[]): number {
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

      const existing = this.entities.get(flight.id);
      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
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

      const entity = this.viewer.entities.add({
        id: `flight-${flight.id}`,
        position,
        billboard: {
          image: new ConstantProperty(this.marker),
          scale: 0.85,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(2_000_000, 1.3, 20_000_000, 0.4),
        },
        properties: {
          kind: "flight",
          callsign: flight.callsign,
          flightCategory: flight.category,
          velocity: flight.velocity,
          track: flight.trueTrack,
          originCountry: flight.originCountry,
          verticalRate: flight.verticalRate,
          onGround: flight.onGround,
          squawk: flight.squawk,
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
    const originCountry = entity?.properties?.originCountry?.getValue(this.viewer.clock.currentTime) ?? "";
    const color = this.getCountryColor(originCountry);

    this.trailEntity = this.viewer.entities.add({
      id: `flight-trail-${flightId}`,
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
        return Color.fromCssColorString("#ebdbb2");
    }
  }

  setVisible(visible: boolean): void {
    for (const entity of this.entities.values()) {
      entity.show = visible;
    }
  }
}
