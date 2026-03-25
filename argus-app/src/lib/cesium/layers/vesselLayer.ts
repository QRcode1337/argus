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

import { createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";
import type { AisVessel } from "@/types/vessel";

const MAX_TRAIL_POSITIONS = 30;

export class VesselLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();
  private positionHistory = new Map<string, Cartesian3[]>();
  private trailEntity: Entity | null = null;
  private activeTrailVesselId: string | null = null;

  private readonly marker = createTacticalMarkerSvg({
    fill: "#458588",
    glow: "#83a598",
    stroke: "#1d2021",
  });

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  upsertVessels(vessels: AisVessel[]): number {
    const seen = new Set<string>();

    for (const vessel of vessels) {
      seen.add(vessel.mmsi);

      const position = Cartesian3.fromDegrees(
        vessel.lon,
        vessel.lat,
        0,
      );

      // Append position to history (circular buffer)
      let history = this.positionHistory.get(vessel.mmsi);
      if (!history) {
        history = [];
        this.positionHistory.set(vessel.mmsi, history);
      }
      history.push(position);
      if (history.length > MAX_TRAIL_POSITIONS) {
        history.shift();
      }

      const existing = this.entities.get(vessel.mmsi);
      if (existing) {
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) {
          positionProperty.setValue(position);
        } else {
          existing.position = new ConstantPositionProperty(position);
        }

        // Update trail if this vessel is being tracked
        if (this.activeTrailVesselId === vessel.mmsi && this.trailEntity) {
          const polyline = this.trailEntity.polyline;
          if (polyline) {
            polyline.positions = new ConstantProperty(history.slice()) as any;
          }
        }

        continue;
      }

      const entity = this.viewer.entities.add({
        id: `vessel-${vessel.mmsi}`,
        position,
        billboard: {
          image: new ConstantProperty(this.marker),
          scale: 0.7,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(500_000, 1.5, 10_000_000, 0.3),
        },
        properties: {
          kind: "vessel",
          mmsi: vessel.mmsi,
          vesselName: vessel.vesselName,
          callsign: vessel.callsign,
          sog: vessel.sog,
          cog: vessel.cog,
          heading: vessel.heading,
          navStatus: vessel.navStatus,
        },
      });

      this.entities.set(vessel.mmsi, entity);
    }

    for (const [id, entity] of this.entities.entries()) {
      if (seen.has(id)) {
        continue;
      }

      this.viewer.entities.remove(entity);
      this.entities.delete(id);
      this.positionHistory.delete(id);

      if (this.activeTrailVesselId === id) {
        this.hideTrail();
      }
    }

    return this.entities.size;
  }

  showTrail(vesselId: string): void {
    // Only one trail at a time
    this.hideTrail();

    const history = this.positionHistory.get(vesselId);
    if (!history || history.length < 2) return;

    const color = Color.fromCssColorString("#458588");

    this.trailEntity = this.viewer.entities.add({
      id: `vessel-trail-${vesselId}`,
      polyline: {
        positions: new ConstantProperty(history.slice()) as any,
        width: new ConstantProperty(3),
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color,
        }),
      },
    });

    this.activeTrailVesselId = vesselId;
  }

  hideTrail(): void {
    if (this.trailEntity) {
      this.viewer.entities.remove(this.trailEntity);
      this.trailEntity = null;
    }
    this.activeTrailVesselId = null;
  }

  setVisible(visible: boolean): void {
    for (const entity of this.entities.values()) {
      entity.show = visible;
    }
  }
}
