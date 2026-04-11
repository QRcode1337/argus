import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  HorizontalOrigin,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import { createBoatSvg } from "@/lib/cesium/tacticalMarker";
import { analyzeVessel } from "@/lib/maritime/vesselIntel";
import type { AisVessel } from "@/types/vessel";

const MAX_TRAIL_POSITIONS = 30;

export class VesselLayer {
  private viewer: Viewer;

  private entities = new Map<string, Entity>();
  private positionHistory = new Map<string, Cartesian3[]>();
  private trailEntity: Entity | null = null;
  private activeTrailVesselId: string | null = null;

  private readonly marker = createBoatSvg({
    fill: "#458588",
    glow: "#83a598",
    stroke: "#1d2021",
  });

  private readonly militaryMarker = createBoatSvg({
    fill: "#fabd2f",
    glow: "#fe8019",
    stroke: "#1d2021",
  });

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  upsertVessels(vessels: AisVessel[]): number {
    const seen = new Set<string>();

    for (const vessel of vessels) {
      seen.add(vessel.mmsi);

      if (!Number.isFinite(vessel.lon) || !Number.isFinite(vessel.lat)) continue;

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
      const last = history[history.length - 1];
      if (!last || !Cartesian3.equals(last, position)) {
        history.push(position);
        if (history.length > MAX_TRAIL_POSITIONS) {
          history.shift();
        }
      }

      // Prefer true heading; fall back to course over ground
      const hdg = Number.isFinite(vessel.heading) && vessel.heading !== 511
        ? vessel.heading
        : (Number.isFinite(vessel.cog) ? vessel.cog : 0);
      const rotation = -CesiumMath.toRadians(hdg);

      const existing = this.entities.get(vessel.mmsi);
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

        // Update trail if this vessel is being tracked
        if (this.activeTrailVesselId === vessel.mmsi && this.trailEntity) {
          const polyline = this.trailEntity.polyline;
          if (polyline && history.length >= 2) {
            polyline.positions = new ConstantProperty(history.slice()) as any;
          }
        }

        continue;
      }

      const intel = analyzeVessel(
        vessel.mmsi,
        vessel.vesselName ?? "",
        vessel.lat,
        vessel.lon,
        vessel.timestamp ? new Date(vessel.timestamp).getTime() : undefined,
      );

      const displayName = vessel.vesselName?.trim() || vessel.callsign?.trim() || vessel.mmsi;
      const isMilitary = intel.isPotentialMilitary;
      const labelColor = isMilitary ? "#fabd2f" : "#83a598";

      const entity = this.viewer.entities.add({
        id: `vessel-${vessel.mmsi}`,
        position,
        billboard: {
          image: new ConstantProperty(isMilitary ? this.militaryMarker : this.marker),
          scale: isMilitary ? 0.85 : 0.7,
          rotation: new ConstantProperty(rotation) as any,
          alignedAxis: new ConstantProperty(Cartesian3.ZERO) as any,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(500_000, 1.5, 10_000_000, 0.3),
          disableDepthTestDistance: 500_000,
        },
        label: {
          text: new ConstantProperty(displayName),
          font: new ConstantProperty(isMilitary ? "bold 11px monospace" : "11px monospace"),
          fillColor: new ConstantProperty(Color.fromCssColorString(labelColor)),
          outlineColor: new ConstantProperty(Color.BLACK),
          outlineWidth: new ConstantProperty(2),
          style: new ConstantProperty(LabelStyle.FILL_AND_OUTLINE),
          verticalOrigin: new ConstantProperty(VerticalOrigin.TOP),
          horizontalOrigin: new ConstantProperty(HorizontalOrigin.CENTER),
          pixelOffset: new ConstantProperty(new Cartesian2(0, 14)),
          scaleByDistance: new NearFarScalar(500_000, 1.0, 5_000_000, 0.0),
          disableDepthTestDistance: 500_000,
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
          country: intel.country,
          isMilitary: intel.isPotentialMilitary,
          knownVessel: intel.knownVessel?.name,
          nearChokepoint: intel.nearChokepoint,
          nearBase: intel.nearBase,
          isDark: intel.isDark,
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
