import type {
  MilitaryFlight,
  RecordedFlightFrame,
  RecordedMilitaryFrame,
  RecordedSatelliteFrame,
  SatellitePosition,
  TrackedFlight,
} from "@/types/intel";

const MAX_FRAMES = 180; // ~30 min at 10s intervals

export class RecordingBuffer {
  private flightFrames: RecordedFlightFrame[] = [];
  private militaryFrames: RecordedMilitaryFrame[] = [];
  private satelliteFrames: RecordedSatelliteFrame[] = [];

  pushFlights(timestamp: number, data: TrackedFlight[]): void {
    this.flightFrames.push({ timestamp, data });
    if (this.flightFrames.length > MAX_FRAMES) {
      this.flightFrames.shift();
    }
  }

  pushMilitary(timestamp: number, data: MilitaryFlight[]): void {
    this.militaryFrames.push({ timestamp, data });
    if (this.militaryFrames.length > MAX_FRAMES) {
      this.militaryFrames.shift();
    }
  }

  pushSatellites(timestamp: number, data: SatellitePosition[]): void {
    this.satelliteFrames.push({ timestamp, data });
    if (this.satelliteFrames.length > MAX_FRAMES) {
      this.satelliteFrames.shift();
    }
  }

  getFlightFrames(): RecordedFlightFrame[] {
    return this.flightFrames;
  }

  getMilitaryFrames(): RecordedMilitaryFrame[] {
    return this.militaryFrames;
  }

  getSatelliteFrames(): RecordedSatelliteFrame[] {
    return this.satelliteFrames;
  }

  getTimeRange(): { start: number; end: number } | null {
    const allTimestamps = [
      ...this.flightFrames.map((f) => f.timestamp),
      ...this.militaryFrames.map((f) => f.timestamp),
      ...this.satelliteFrames.map((f) => f.timestamp),
    ];
    if (allTimestamps.length === 0) return null;
    return {
      start: Math.min(...allTimestamps),
      end: Math.max(...allTimestamps),
    };
  }

  frameCount(): number {
    return (
      this.flightFrames.length +
      this.militaryFrames.length +
      this.satelliteFrames.length
    );
  }

  clear(): void {
    this.flightFrames = [];
    this.militaryFrames = [];
    this.satelliteFrames = [];
  }
}
