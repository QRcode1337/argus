# Live/Playback Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add WorldView-style LIVE + PLAYBACK modes so Argus records entity positions during live polling and replays them on a draggable timeline with speed controls.

**Architecture:** During LIVE mode, a RecordingBuffer captures timestamped snapshots of every poll result (flights, military, satellites). When the user switches to PLAYBACK, polling stops, and a PlaybackEngine creates Cesium entities with SampledPositionProperty for smooth interpolated replay. Cesium's built-in Clock drives the timeline. A timeline bar in HudOverlay provides scrubber, play/pause, and speed controls.

**Tech Stack:** CesiumJS (SampledPositionProperty, Clock, JulianDate, PathGraphics), Zustand, React, TypeScript

---

### Task 1: Extend Types

**Files:**
- Modify: `src/types/intel.ts:4` (PlatformMode)

**Step 1: Add "playback" to PlatformMode and new playback types**

Add `"playback"` to the existing `PlatformMode` union, plus new types for the recording system.

In `src/types/intel.ts`, change line 4 from:
```typescript
export type PlatformMode = "live" | "analytics";
```
to:
```typescript
export type PlatformMode = "live" | "playback" | "analytics";
```

Then add these types at the end of the file (after `SelectedIntel`):

```typescript
export type PlaybackSpeed = 1 | 3 | 5 | 15 | 60;

export interface RecordedFlightFrame {
  timestamp: number;
  data: TrackedFlight[];
}

export interface RecordedMilitaryFrame {
  timestamp: number;
  data: MilitaryFlight[];
}

export interface RecordedSatelliteFrame {
  timestamp: number;
  data: SatellitePosition[];
}
```

**Step 2: Verify types compile**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in files referencing `"live" | "analytics"` literally (CesiumGlobe.tsx). This is expected — we'll fix those in later tasks. The new types themselves should have no errors.

**Step 3: Commit**

```bash
git add src/types/intel.ts
git commit -m "feat: add playback to PlatformMode and recording frame types"
```

---

### Task 2: Create RecordingBuffer Module

**Files:**
- Create: `src/lib/playback/recordingBuffer.ts`

**Step 1: Create the recording buffer**

Create directory `src/lib/playback/` and file `recordingBuffer.ts`:

```typescript
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
```

**Step 2: Verify it compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | grep recordingBuffer || echo "No errors in recordingBuffer"`
Expected: No errors specific to recordingBuffer.ts

**Step 3: Commit**

```bash
git add src/lib/playback/recordingBuffer.ts
git commit -m "feat: add RecordingBuffer for timestamped position history"
```

---

### Task 3: Create PlaybackEngine Module

**Files:**
- Create: `src/lib/playback/playbackEngine.ts`

**Step 1: Create the playback engine**

This module takes recorded frames and creates Cesium entities with SampledPositionProperty for interpolated time-dynamic replay.

Create `src/lib/playback/playbackEngine.ts`:

```typescript
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
```

**Step 2: Verify it compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | grep playbackEngine || echo "No errors in playbackEngine"`
Expected: No errors specific to playbackEngine.ts

**Step 3: Commit**

```bash
git add src/lib/playback/playbackEngine.ts
git commit -m "feat: add PlaybackEngine with SampledPositionProperty replay"
```

---

### Task 4: Extend Zustand Store with Playback State

**Files:**
- Modify: `src/store/useArgusStore.ts`

**Step 1: Add playback state and actions**

In `src/store/useArgusStore.ts`, add the new import at the top:

```typescript
import type { PlaybackSpeed } from "@/types/intel";
```

Add these fields to the `ArgusStore` type (after `searchResults` / `setSearchResults`):

```typescript
  playbackSpeed: PlaybackSpeed;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackTimeRange: { start: number; end: number } | null;
  setPlaybackTimeRange: (range: { start: number; end: number } | null) => void;
  playbackCurrentTime: number;
  setPlaybackCurrentTime: (time: number) => void;
```

Add the default values and setters to the `create<ArgusStore>((set) => ({` block (after `setSearchResults`):

```typescript
  playbackSpeed: 1,
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  isPlaying: false,
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  playbackTimeRange: null,
  setPlaybackTimeRange: (range) => set({ playbackTimeRange: range }),
  playbackCurrentTime: 0,
  setPlaybackCurrentTime: (time) => set({ playbackCurrentTime: time }),
```

**Step 2: Verify it compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -20`
Expected: May still see errors from CesiumGlobe.tsx (the `"live" | "analytics"` literal). Store itself should be clean.

**Step 3: Commit**

```bash
git add src/store/useArgusStore.ts
git commit -m "feat: add playback state to Zustand store"
```

---

### Task 5: Integrate Recording into CesiumGlobe.tsx

**Files:**
- Modify: `src/components/CesiumGlobe.tsx`

**Step 1: Add RecordingBuffer ref and imports**

At the top of `CesiumGlobe.tsx`, add import:

```typescript
import { RecordingBuffer } from "@/lib/playback/recordingBuffer";
```

Inside the component, add a ref (near the other layer refs):

```typescript
const recordingBufferRef = useRef<RecordingBuffer>(new RecordingBuffer());
```

**Step 2: Update polling guards from "analytics" to non-"live"**

Find every instance of:
```typescript
if (platformModeRef.current === "analytics") return;
```

Replace each with:
```typescript
if (platformModeRef.current !== "live") return;
```

There are 5 instances across the polling tasks (opensky, adsb-military, satellites, usgs, cctv).

**Step 3: Add recording calls inside poll callbacks**

In the **opensky polling task** (the one that calls `flightLayerRef.current.upsertFlights`), after the upsert call, add:

```typescript
recordingBufferRef.current.pushFlights(Date.now(), flights);
```

(where `flights` is the array passed to `upsertFlights`)

In the **adsb-military polling task**, after the military upsert call, add:

```typescript
recordingBufferRef.current.pushMilitary(Date.now(), militaryFlights);
```

In the **satellites polling task**, after `satLayerRef.current.update(...)`, the satellite positions are computed inside the layer. We need to also record them. Add after the update call:

```typescript
const satPositions = computeSatellitePositions(satLayerRef.current["records"] as SatelliteRecord[], now);
recordingBufferRef.current.pushSatellites(Date.now(), satPositions);
```

Note: This requires importing `computeSatellitePositions` (already imported) and accessing the records. A cleaner approach: add a `getRecords()` getter to `SatelliteLayer` if the private field access is problematic. Alternatively, store the satellite records in a separate ref in CesiumGlobe.

**Cleaner alternative for satellites**: Store satellite records in a ref:

```typescript
const satRecordsRef = useRef<SatelliteRecord[]>([]);
```

When setting records on the satellite layer, also store them:
```typescript
satLayerRef.current.setRecords(records);
satRecordsRef.current = records;
```

Then in the satellite poll, after the update:
```typescript
const satPositions = computeSatellitePositions(satRecordsRef.current, now);
recordingBufferRef.current.pushSatellites(Date.now(), satPositions);
```

Also add import at top:
```typescript
import type { SatelliteRecord } from "@/types/intel";
import { computeSatellitePositions } from "@/lib/ingest/tle";
```

(Check if `computeSatellitePositions` is already imported — it likely is.)

**Step 4: Fix the platformModeRef type**

Change the ref type from:
```typescript
const platformModeRef = useRef<"live" | "analytics">("live");
```
to:
```typescript
const platformModeRef = useRef<PlatformMode>("live");
```

Make sure `PlatformMode` is imported from `@/types/intel`.

**Step 5: Verify it compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: Fewer errors than before. CesiumGlobe should be cleaner now.

**Step 6: Commit**

```bash
git add src/components/CesiumGlobe.tsx
git commit -m "feat: integrate recording buffer into live polling cycle"
```

---

### Task 6: Add Playback Mode Logic to CesiumGlobe.tsx

**Files:**
- Modify: `src/components/CesiumGlobe.tsx`

**Step 1: Add PlaybackEngine ref and imports**

Add import:
```typescript
import { PlaybackEngine } from "@/lib/playback/playbackEngine";
```

Add ref:
```typescript
const playbackEngineRef = useRef<PlaybackEngine | null>(null);
```

**Step 2: Add store selectors for playback state**

Near the existing store selectors, add:

```typescript
const setPlaybackTimeRange = useArgusStore((s) => s.setPlaybackTimeRange);
const setPlaybackCurrentTime = useArgusStore((s) => s.setPlaybackCurrentTime);
const setIsPlaying = useArgusStore((s) => s.setIsPlaying);
const playbackSpeed = useArgusStore((s) => s.playbackSpeed);
```

**Step 3: Extend the platform mode effect**

In the existing `useEffect` that handles platform mode changes (around line 850), add a `"playback"` case.

The existing effect hides/shows layers for "live" vs "analytics". Extend it:

```typescript
// Inside the platform mode useEffect:
if (platformMode === "playback") {
  // Hide live layers
  flightLayerRef.current?.setVisible(false);
  militaryLayerRef.current?.setVisible(false);
  satLayerRef.current?.setVisible(false);
  seismicLayerRef.current?.setVisible(false);
  cctvLayerRef.current?.setVisible(false);

  // Initialize playback engine
  const viewer = viewerRef.current;
  if (viewer && !playbackEngineRef.current) {
    playbackEngineRef.current = new PlaybackEngine(viewer);
  }

  const engine = playbackEngineRef.current;
  if (engine) {
    const buffer = recordingBufferRef.current;
    const range = engine.load(
      buffer.getFlightFrames(),
      buffer.getMilitaryFrames(),
      buffer.getSatelliteFrames(),
    );

    if (range) {
      setPlaybackTimeRange(range);
      setPlaybackCurrentTime(range.start);

      engine.onTick((timestampMs) => {
        setPlaybackCurrentTime(timestampMs);
      });
    }
  }
} else if (platformMode === "live") {
  // Clean up playback engine
  if (playbackEngineRef.current) {
    playbackEngineRef.current.clear();
    playbackEngineRef.current = null;
  }
  setPlaybackTimeRange(null);
  setIsPlaying(false);

  // Restore live layers (existing logic)
  flightLayerRef.current?.setVisible(layers.flights);
  militaryLayerRef.current?.setVisible(layers.military);
  satLayerRef.current?.setVisible(layers.satellites);
  seismicLayerRef.current?.setVisible(layers.seismic);
  cctvLayerRef.current?.setVisible(layers.cctv);
}
// "analytics" case stays as-is
```

**Step 4: Add playback control callbacks**

Add these functions inside the component (before the return statement):

```typescript
const handlePlayPause = useCallback(() => {
  const engine = playbackEngineRef.current;
  if (!engine) return;
  const playing = useArgusStore.getState().isPlaying;
  if (playing) {
    engine.pause();
    setIsPlaying(false);
  } else {
    engine.play();
    setIsPlaying(true);
  }
}, [setIsPlaying]);

const handleSeek = useCallback((timestampMs: number) => {
  playbackEngineRef.current?.seekTo(timestampMs);
  setPlaybackCurrentTime(timestampMs);
}, [setPlaybackCurrentTime]);

const handlePlaybackSpeedChange = useCallback((speed: number) => {
  playbackEngineRef.current?.setSpeed(speed);
}, []);
```

**Step 5: Pass playback callbacks to HudOverlay**

Update the `<HudOverlay>` JSX to include the new callbacks:

```typescript
<HudOverlay
  // ... existing props
  onPlayPause={handlePlayPause}
  onSeek={handleSeek}
  onPlaybackSpeedChange={handlePlaybackSpeedChange}
/>
```

**Step 6: Watch playbackSpeed changes**

Add a `useEffect` to sync speed changes from the store to the engine:

```typescript
useEffect(() => {
  playbackEngineRef.current?.setSpeed(playbackSpeed);
}, [playbackSpeed]);
```

**Step 7: Cleanup on unmount**

In the existing cleanup effect (the one that calls `pollerRef.current.stopAll()`), add:

```typescript
playbackEngineRef.current?.clear();
```

**Step 8: Verify it compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors about HudOverlay not accepting the new props. This is expected — we'll fix in Task 7.

**Step 9: Commit**

```bash
git add src/components/CesiumGlobe.tsx
git commit -m "feat: add playback engine integration and mode switching"
```

---

### Task 7: Build Timeline UI in HudOverlay.tsx

**Files:**
- Modify: `src/components/HudOverlay.tsx`

**Step 1: Extend HudOverlayProps**

Add to the `HudOverlayProps` interface:

```typescript
onPlayPause?: () => void;
onSeek?: (timestampMs: number) => void;
onPlaybackSpeedChange?: (speed: number) => void;
```

**Step 2: Add store selectors inside HudOverlay**

Inside the HudOverlay component, add:

```typescript
const isPlaying = useArgusStore((s) => s.isPlaying);
const playbackSpeed = useArgusStore((s) => s.playbackSpeed);
const setPlaybackSpeed = useArgusStore((s) => s.setPlaybackSpeed);
const playbackTimeRange = useArgusStore((s) => s.playbackTimeRange);
const playbackCurrentTime = useArgusStore((s) => s.playbackCurrentTime);
```

Also import `PlaybackSpeed` from `@/types/intel`.

**Step 3: Add "Playback" option to platform mode selector**

Find the platform mode `<select>` (around line 866-876) and add the new option:

```typescript
<select
  value={platformMode}
  onChange={(event) =>
    setPlatformMode(event.target.value as PlatformMode)
  }
  className={/* existing classes */}
>
  <option value="live">Live</option>
  <option value="playback">Playback</option>
  <option value="analytics">Analytics</option>
</select>
```

Make sure the `onChange` cast uses `PlatformMode` (imported from `@/types/intel`) instead of a literal.

**Step 4: Add Timeline Bar component**

Add a timeline bar that renders when in playback mode. Place this just before the closing `</>` of the outermost fragment, or inside the bottom bar area:

```typescript
{platformMode === "playback" && playbackTimeRange && (
  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded border border-cyan-800/50 bg-black/80 px-4 py-2 font-mono text-xs text-cyan-400 backdrop-blur-sm">
    {/* Play/Pause */}
    <button
      onClick={onPlayPause}
      className="flex h-7 w-7 items-center justify-center rounded border border-cyan-700/50 bg-cyan-900/30 text-cyan-400 transition-colors hover:bg-cyan-800/40"
      title={isPlaying ? "Pause" : "Play"}
    >
      {isPlaying ? "⏸" : "▶"}
    </button>

    {/* Time display */}
    <span className="min-w-[70px] text-center tabular-nums">
      {new Date(playbackCurrentTime).toLocaleTimeString()}
    </span>

    {/* Scrubber */}
    <input
      type="range"
      min={playbackTimeRange.start}
      max={playbackTimeRange.end}
      value={playbackCurrentTime}
      onChange={(e) => onSeek?.(Number(e.target.value))}
      className="h-1 w-48 cursor-pointer accent-cyan-500"
    />

    {/* Speed selector */}
    <select
      value={playbackSpeed}
      onChange={(e) => {
        const speed = Number(e.target.value) as PlaybackSpeed;
        setPlaybackSpeed(speed);
        onPlaybackSpeedChange?.(speed);
      }}
      className="rounded border border-cyan-800/50 bg-black/60 px-1.5 py-0.5 text-xs text-cyan-400"
    >
      <option value={1}>1x</option>
      <option value={3}>3x</option>
      <option value={5}>5x</option>
      <option value={15}>15x</option>
      <option value={60}>60x</option>
    </select>

    {/* LIVE button */}
    <button
      onClick={() => setPlatformMode("live")}
      className="rounded border border-red-700/50 bg-red-900/30 px-2 py-0.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-800/40"
    >
      LIVE
    </button>
  </div>
)}
```

**Step 5: Add recording indicator in live mode**

When in live mode and the recording buffer has data, show a small red dot indicator. Add this near the platform mode selector:

```typescript
{platformMode === "live" && (
  <span className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" title="Recording" />
)}
```

**Step 6: Verify it compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: Clean compile — all new props are optional so no breaking changes.

**Step 7: Commit**

```bash
git add src/components/HudOverlay.tsx
git commit -m "feat: add playback timeline bar with scrubber and speed controls"
```

---

### Task 8: Full Build Verification

**Step 1: Run TypeScript type check**

Run: `cd argus-app && npx tsc --noEmit`
Expected: Clean — zero errors.

If there are errors, fix them. Common issues:
- Import paths
- Missing type imports
- Literal type mismatches (fix any remaining `"live" | "analytics"` literals)

**Step 2: Run lint**

Run: `cd argus-app && npm run lint`
Expected: Clean or only pre-existing warnings.

**Step 3: Run build**

Run: `cd argus-app && npm run build`
Expected: Successful build.

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve build errors for playback feature"
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│                    HudOverlay                        │
│  ┌──────────────────────────────────────────────┐   │
│  │  Timeline Bar (playback mode only)            │   │
│  │  [⏸] 14:32:05 ═══●═══════════ [3x] [LIVE]  │   │
│  └──────────────────────────────────────────────┘   │
│  Platform: [Live ▼] [Playback] [Analytics]          │
└───────────────────────┬─────────────────────────────┘
                        │ callbacks
                        ▼
┌─────────────────────────────────────────────────────┐
│                  CesiumGlobe                         │
│                                                      │
│  LIVE mode:                                          │
│    PollingManager → layers → RecordingBuffer         │
│                                                      │
│  PLAYBACK mode:                                      │
│    RecordingBuffer → PlaybackEngine → Cesium Clock   │
│    (SampledPositionProperty + PathGraphics)           │
└─────────────────────────────────────────────────────┘

Data flow:
  Poll → upsertFlights() → RecordingBuffer.pushFlights()
  Mode switch → PlaybackEngine.load() → SampledPositionProperty
  Clock tick → store.setPlaybackCurrentTime() → UI scrubber
  User scrub → PlaybackEngine.seekTo() → Clock.currentTime
```
