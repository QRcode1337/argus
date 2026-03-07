import type {
  MilitaryFlight,
  PlaybackFlightSnapshot,
  PlaybackMilitarySnapshot,
  PlaybackSatelliteSnapshot,
  RecordedFlightFrame,
  RecordedMilitaryFrame,
  RecordedSatelliteFrame,
  SatellitePosition,
  TrackedFlight,
} from "@/types/intel";

const MAX_FLIGHT_SNAPSHOTS = 24_000;
const MAX_MILITARY_SNAPSHOTS = 8_000;
const MAX_SATELLITE_SNAPSHOTS = 12_000;

const countSnapshots = <T extends { data: unknown[] }>(frames: T[]): number =>
  frames.reduce((sum, frame) => sum + frame.data.length, 0);

const trimToBudget = <T extends { data: unknown[] }>(frames: T[], maxSnapshots: number): void => {
  let snapshotCount = countSnapshots(frames);

  while (frames.length > 1 && snapshotCount > maxSnapshots) {
    const removed = frames.shift();
    snapshotCount -= removed?.data.length ?? 0;
  }
};

const toPlaybackFlight = (flight: TrackedFlight): PlaybackFlightSnapshot => ({
  id: flight.id,
  callsign: flight.callsign,
  longitude: flight.longitude,
  latitude: flight.latitude,
  altitudeMeters: flight.altitudeMeters,
});

const toPlaybackMilitary = (flight: MilitaryFlight): PlaybackMilitarySnapshot => ({
  id: flight.id,
  callsign: flight.callsign,
  longitude: flight.longitude,
  latitude: flight.latitude,
  altitudeMeters: flight.altitudeMeters,
});

const toPlaybackSatellite = (satellite: SatellitePosition): PlaybackSatelliteSnapshot => ({
  id: satellite.id,
  name: satellite.name,
  longitude: satellite.longitude,
  latitude: satellite.latitude,
  altitudeKm: satellite.altitudeKm,
});

export class RecordingBuffer {
  private flightFrames: RecordedFlightFrame[] = [];
  private militaryFrames: RecordedMilitaryFrame[] = [];
  private satelliteFrames: RecordedSatelliteFrame[] = [];

  pushFlights(timestamp: number, data: TrackedFlight[]): void {
    this.flightFrames.push({ timestamp, data: data.map(toPlaybackFlight) });
    trimToBudget(this.flightFrames, MAX_FLIGHT_SNAPSHOTS);
  }

  pushMilitary(timestamp: number, data: MilitaryFlight[]): void {
    this.militaryFrames.push({ timestamp, data: data.map(toPlaybackMilitary) });
    trimToBudget(this.militaryFrames, MAX_MILITARY_SNAPSHOTS);
  }

  pushSatellites(timestamp: number, data: SatellitePosition[]): void {
    this.satelliteFrames.push({ timestamp, data: data.map(toPlaybackSatellite) });
    trimToBudget(this.satelliteFrames, MAX_SATELLITE_SNAPSHOTS);
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
