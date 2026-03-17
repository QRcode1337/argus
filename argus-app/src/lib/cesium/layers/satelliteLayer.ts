import {
  ArcType,
  Cartesian3,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  Entity,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  type Viewer,
} from "cesium";

import { buildSatelliteLinkTargets } from "@/data/satelliteLinkTargets";
import { createIssMarkerSvg, createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";
import { computeOrbitTrack, computeSatellitePositions } from "@/lib/ingest/tle";
import type { PlaybackSatelliteSnapshot, SatelliteRecord } from "@/types/intel";

export class SatelliteLayer {
  private viewer: Viewer;

  private records: SatelliteRecord[] = [];

  private entities = new Map<string, Entity>();
  private linkEntities = new Map<string, Entity>();

  private orbitEntity: Entity | null = null;

  private selectedSatId: string | null = null;
  private linksVisible = true;
  private linkCount = 0;
  private visible = true;
  private readonly marker = createTacticalMarkerSvg({
    fill: "#99ffca",
    glow: "#ceffe4",
    stroke: "#082015",
  });
  private readonly issMarker = createIssMarkerSvg({
    fill: "#89c2ff",
    glow: "#cee7ff",
    stroke: "#0f2d53",
  });

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  setRecords(records: SatelliteRecord[]): void {
    this.records = records;
  }

  getRecords(): SatelliteRecord[] {
    return this.records;
  }

  getLinkCount(): number {
    return this.linkCount;
  }

  setLinkVisible(visible: boolean): void {
    this.linksVisible = visible;
    if (!visible) {
      for (const entity of this.linkEntities.values()) {
        this.viewer.entities.remove(entity);
      }
      this.linkEntities.clear();
      this.linkCount = 0;
      return;
    }

    for (const entity of this.linkEntities.values()) {
      entity.show = true;
    }
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
      const isIss = this.isIssName(sat.name);

      const entity = this.viewer.entities.add({
        id: `sat-${sat.id}`,
        position,
        billboard: {
          image: new ConstantProperty(isIss ? this.issMarker : this.marker),
          scale: isIss ? 1.05 : 0.72,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(2_000_000, 1.5, 25_000_000, 0.45),
        },
        label: {
          text: sat.name.length > 9 ? `${sat.name.slice(0, 9)}…` : sat.name,
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
          isIss,
          classification: record.metadata?.objectType ?? "Unknown",
          orbitType: record.metadata?.orbitType ?? "Unknown",
          countryCode: record.metadata?.countryCode ?? "Unknown",
          launchDate: record.metadata?.launchDate ?? "Unknown",
          rcsSize: record.metadata?.rcsSize ?? "Unknown",
          periodMinutes: record.metadata?.periodMinutes,
          inclinationDeg: record.metadata?.inclinationDeg,
          apogeeKm: record.metadata?.apogeeKm,
          perigeeKm: record.metadata?.perigeeKm,
          sourceUrl: isIss ? "https://www.nasa.gov/international-space-station/" : undefined,
          streamUrl: isIss ? "https://www.youtube.com/embed/21X5lGlDOfg" : undefined,
        },
      });

      this.entities.set(sat.id, entity);
    }

    for (const [id, entity] of this.entities.entries()) {
      if (seen.has(id)) continue;
      this.viewer.entities.remove(entity);
      this.entities.delete(id);
    }

    if (this.linksVisible) {
      this.refreshUtilizationLinks(positions, at);
    } else {
      this.linkCount = 0;
    }

    // Refresh orbit trail for the selected satellite
    if (this.selectedSatId) {
      this.refreshOrbit(at, orbitSamples, orbitStepMinutes);
    }

    return this.entities.size;
  }

  upsertPlaybackSatellites(satellites: PlaybackSatelliteSnapshot[]): number {
    const seen = new Set<string>();

    for (const sat of satellites) {
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
        existing.show = this.visible;
        continue;
      }

      const entity = this.viewer.entities.add({
        id: `sat-${sat.id}`,
        position,
        show: this.visible,
        billboard: {
          image: new ConstantProperty(this.isIssName(sat.name) ? this.issMarker : this.marker),
          scale: this.isIssName(sat.name) ? 1.05 : 0.72,
          verticalOrigin: VerticalOrigin.CENTER,
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
          isIss: this.isIssName(sat.name),
          sourceUrl: this.isIssName(sat.name) ? "https://www.nasa.gov/international-space-station/" : undefined,
          streamUrl: this.isIssName(sat.name) ? "https://www.youtube.com/embed/21X5lGlDOfg" : undefined,
        },
      });

      this.entities.set(sat.id, entity);
    }

    for (const [id, entity] of this.entities.entries()) {
      if (seen.has(id)) continue;
      this.viewer.entities.remove(entity);
      this.entities.delete(id);
    }

    this.showOrbit(null, 0, 0);
    this.setLinkVisible(false);
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

  private refreshUtilizationLinks(
    positions: ReturnType<typeof computeSatellitePositions>,
    at: Date,
  ): void {
    const seenLinks = new Set<string>();
    const targets = buildSatelliteLinkTargets(at);

    for (const sat of positions) {
      const target = this.findClosestTarget(sat.latitude, sat.longitude, sat.altitudeKm, targets);
      if (!target) continue;

      const id = `satlink-${sat.id}-${target.id}`;
      seenLinks.add(id);

      const satPos = Cartesian3.fromDegrees(sat.longitude, sat.latitude, sat.altitudeKm * 1000);
      const targetPos = Cartesian3.fromDegrees(target.lon, target.lat, 0);
      const current = this.linkEntities.get(id);

      if (current?.polyline) {
        current.polyline.positions = new ConstantProperty([satPos, targetPos]);
        continue;
      }

      const line = this.viewer.entities.add({
        id,
        polyline: {
          positions: [satPos, targetPos],
          width: target.kind === "carrier" ? 1.8 : 1.2,
          material: new PolylineGlowMaterialProperty({
            glowPower: target.kind === "carrier" ? 0.26 : 0.18,
            color:
              target.kind === "carrier"
                ? Color.fromCssColorString("#ff85a9").withAlpha(0.72)
                : Color.fromCssColorString("#9bcbff").withAlpha(0.62),
          }),
          arcType: ArcType.GEODESIC,
        },
        properties: {
          kind: "satellite-link",
          satName: sat.name,
          targetName: target.name,
          targetType: target.kind,
        },
      });

      this.linkEntities.set(id, line);
    }

    for (const [id, entity] of this.linkEntities.entries()) {
      if (!seenLinks.has(id)) {
        this.viewer.entities.remove(entity);
        this.linkEntities.delete(id);
      }
    }

    this.linkCount = this.linkEntities.size;
  }

  private findClosestTarget(
    satLat: number,
    satLon: number,
    satAltKm: number,
    targets: ReturnType<typeof buildSatelliteLinkTargets>,
  ): ReturnType<typeof buildSatelliteLinkTargets>[number] | null {
    let best: ReturnType<typeof buildSatelliteLinkTargets>[number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    const maxRangeKm = satAltKm > 14_000 ? 5_600 : satAltKm > 3_500 ? 3_400 : 1_550;

    for (const target of targets) {
      const distanceKm = this.haversineKm(satLat, satLon, target.lat, target.lon);
      const targetCapKm = target.kind === "carrier" ? maxRangeKm * 0.78 : maxRangeKm;
      if (distanceKm > targetCapKm || distanceKm >= bestDistance) continue;
      bestDistance = distanceKm;
      best = target;
    }

    return best;
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const phi1 = CesiumMath.toRadians(lat1);
    const phi2 = CesiumMath.toRadians(lat2);
    const dPhi = CesiumMath.toRadians(lat2 - lat1);
    const dLambda = CesiumMath.toRadians(lon2 - lon1);

    const a =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371 * c;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const entity of this.entities.values()) {
      entity.show = visible;
    }
    if (this.orbitEntity) {
      this.orbitEntity.show = visible;
    }
    for (const entity of this.linkEntities.values()) {
      entity.show = visible && this.linksVisible;
    }
  }

  private isIssName(name: string): boolean {
    const upper = name.toUpperCase();
    return upper.includes("ISS") || upper.includes("ZARYA");
  }
}
