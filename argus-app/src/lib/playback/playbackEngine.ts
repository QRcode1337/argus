import {
  Cartesian2,
  Cartesian3,
  ClockRange,
  ClockStep,
  Color,
  Entity,
  JulianDate,
  LabelStyle,
  NearFarScalar,
  PathGraphics,
  SampledPositionProperty,
  type Viewer,
} from "cesium";

import type {
  RecordedFlightFrame,
  RecordedMilitaryFrame,
  RecordedSatelliteFrame,
} from "@/types/intel";

export class PlaybackEngine {
  private viewer: Viewer;
  private entities = new Map<string, Entity>();
  private tickListener: (() => void) | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  load(
    flightFrames: RecordedFlightFrame[],
    militaryFrames: RecordedMilitaryFrame[],
    satelliteFrames: RecordedSatelliteFrame[],
  ): { start: number; end: number } | null {
    this.clear();

    const allTimestamps = [
      ...flightFrames.map((f) => f.timestamp),
      ...militaryFrames.map((f) => f.timestamp),
      ...satelliteFrames.map((f) => f.timestamp),
    ];
    if (allTimestamps.length === 0) return null;

    const startMs = Math.min(...allTimestamps);
    const endMs = Math.max(...allTimestamps);
    const startTime = JulianDate.fromDate(new Date(startMs));
    const stopTime = JulianDate.fromDate(new Date(endMs));

    // Configure Cesium Clock
    const clock = this.viewer.clock;
    clock.startTime = startTime.clone();
    clock.stopTime = stopTime.clone();
    clock.currentTime = startTime.clone();
    clock.clockRange = ClockRange.CLAMPED;
    clock.clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
    clock.multiplier = 1;
    clock.shouldAnimate = false;

    // Build flight entities
    this.buildFlightEntities(flightFrames);
    this.buildMilitaryEntities(militaryFrames);
    this.buildSatelliteEntities(satelliteFrames);

    return { start: startMs, end: endMs };
  }

  private buildFlightEntities(frames: RecordedFlightFrame[]): void {
    const entityPositions = new Map<
      string,
      { property: SampledPositionProperty; callsign: string }
    >();

    for (const frame of frames) {
      const time = JulianDate.fromDate(new Date(frame.timestamp));
      for (const flight of frame.data) {
        let entry = entityPositions.get(flight.id);
        if (!entry) {
          entry = {
            property: new SampledPositionProperty(),
            callsign: flight.callsign,
          };
          entityPositions.set(flight.id, entry);
        }
        entry.property.addSample(
          time,
          Cartesian3.fromDegrees(
            flight.longitude,
            flight.latitude,
            Math.max(0, flight.altitudeMeters),
          ),
        );
      }
    }

    for (const [id, { property, callsign }] of entityPositions) {
      const entity = this.viewer.entities.add({
        id: `pb-flight-${id}`,
        position: property,
        point: {
          pixelSize: 5,
          color: Color.CYAN,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          scaleByDistance: new NearFarScalar(2_000_000, 1.4, 20_000_000, 0.4),
        },
        label: {
          text: callsign || id,
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: Color.CYAN,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.65),
          pixelOffset: new Cartesian2(0, -16),
          scaleByDistance: new NearFarScalar(2_000_000, 1, 8_000_000, 0),
        },
        path: new PathGraphics({
          width: 1,
          material: Color.CYAN.withAlpha(0.4),
          leadTime: 0,
          trailTime: 600,
        }),
        properties: { kind: "flight-playback", callsign },
      });
      this.entities.set(id, entity);
    }
  }

  private buildMilitaryEntities(frames: RecordedMilitaryFrame[]): void {
    const entityPositions = new Map<
      string,
      { property: SampledPositionProperty; callsign: string }
    >();

    for (const frame of frames) {
      const time = JulianDate.fromDate(new Date(frame.timestamp));
      for (const flight of frame.data) {
        let entry = entityPositions.get(flight.id);
        if (!entry) {
          entry = {
            property: new SampledPositionProperty(),
            callsign: flight.callsign,
          };
          entityPositions.set(flight.id, entry);
        }
        entry.property.addSample(
          time,
          Cartesian3.fromDegrees(
            flight.longitude,
            flight.latitude,
            Math.max(0, flight.altitudeMeters),
          ),
        );
      }
    }

    for (const [id, { property, callsign }] of entityPositions) {
      const entity = this.viewer.entities.add({
        id: `pb-mil-${id}`,
        position: property,
        point: {
          pixelSize: 5,
          color: Color.ORANGE,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          scaleByDistance: new NearFarScalar(2_000_000, 1.4, 20_000_000, 0.4),
        },
        label: {
          text: `MIL ${callsign}`,
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: Color.ORANGE,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.65),
          pixelOffset: new Cartesian2(0, -16),
          scaleByDistance: new NearFarScalar(2_000_000, 1, 8_000_000, 0),
        },
        path: new PathGraphics({
          width: 1,
          material: Color.ORANGE.withAlpha(0.4),
          leadTime: 0,
          trailTime: 600,
        }),
        properties: { kind: "military-playback", callsign },
      });
      this.entities.set(id, entity);
    }
  }

  private buildSatelliteEntities(frames: RecordedSatelliteFrame[]): void {
    const entityPositions = new Map<
      string,
      { property: SampledPositionProperty; name: string }
    >();

    for (const frame of frames) {
      const time = JulianDate.fromDate(new Date(frame.timestamp));
      for (const sat of frame.data) {
        let entry = entityPositions.get(sat.id);
        if (!entry) {
          entry = {
            property: new SampledPositionProperty(),
            name: sat.name,
          };
          entityPositions.set(sat.id, entry);
        }
        entry.property.addSample(
          time,
          Cartesian3.fromDegrees(
            sat.longitude,
            sat.latitude,
            sat.altitudeKm * 1000,
          ),
        );
      }
    }

    for (const [id, { property, name }] of entityPositions) {
      const entity = this.viewer.entities.add({
        id: `pb-sat-${id}`,
        position: property,
        point: {
          pixelSize: 4,
          color: Color.LIME,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          scaleByDistance: new NearFarScalar(2_000_000, 1.5, 25_000_000, 0.45),
        },
        label: {
          text: name,
          font: "10px monospace",
          style: LabelStyle.FILL,
          fillColor: Color.LIME,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.65),
          scaleByDistance: new NearFarScalar(3_000_000, 0.9, 10_000_000, 0),
        },
        path: new PathGraphics({
          width: 1,
          material: Color.LIME.withAlpha(0.3),
          leadTime: 0,
          trailTime: 300,
        }),
        properties: { kind: "satellite-playback", name },
      });
      this.entities.set(id, entity);
    }
  }

  play(): void {
    this.viewer.clock.shouldAnimate = true;
  }

  pause(): void {
    this.viewer.clock.shouldAnimate = false;
  }

  setSpeed(multiplier: number): void {
    this.viewer.clock.multiplier = multiplier;
  }

  seekTo(timestampMs: number): void {
    this.viewer.clock.currentTime = JulianDate.fromDate(
      new Date(timestampMs),
    );
  }

  getCurrentTimeMs(): number {
    return JulianDate.toDate(this.viewer.clock.currentTime).getTime();
  }

  onTick(callback: (timestampMs: number) => void): void {
    this.tickListener = () => {
      callback(this.getCurrentTimeMs());
    };
    this.viewer.clock.onTick.addEventListener(this.tickListener);
  }

  clear(): void {
    if (this.tickListener) {
      this.viewer.clock.onTick.removeEventListener(this.tickListener);
      this.tickListener = null;
    }
    for (const entity of this.entities.values()) {
      this.viewer.entities.remove(entity);
    }
    this.entities.clear();
  }
}
