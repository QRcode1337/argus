# EPIC FURY Mode Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock EPIC FURY mode with a live hybrid ops overlay pulling from GDELT, military flights, AIS vessels, and USGS seismic feeds, with time filtering and hotspot region lock-on.

**Architecture:** New `useEpicFuryStore` Zustand store owns all EPIC FURY state (active toggle, time window, locked region, unified incidents). Existing feed pollers in CesiumGlobe forward data to this store. Three rewritten UI components read from the store. CrossingEvents deleted.

**Tech Stack:** TypeScript, React, Zustand, Next.js 14 (App Router), Cesium.js

**Spec:** `docs/superpowers/specs/2026-04-04-epic-fury-update-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `argus-app/src/store/useEpicFuryStore.ts` | EPIC FURY state: active, timeWindow, lockedRegion, incidents, regionStats, filteredIncidents |
| Rewrite | `argus-app/src/components/EpicFuryHud.tsx` | Left panel: header, time buttons, live incident feed |
| Rewrite | `argus-app/src/components/AnalystControls.tsx` | Right panel: global stats, region stats, layer toggles |
| Rewrite | `argus-app/src/components/TimelineScrubber.tsx` | Bottom bar: time window buttons, incident count, latest timestamp |
| Delete | `argus-app/src/components/CrossingEvents.tsx` | Remove — no real data backing |
| Modify | `argus-app/src/components/CesiumGlobe.tsx` | Wire store: remove local state, forward feed data, hook up region lock |

---

### Task 1: Create `useEpicFuryStore`

**Files:**
- Create: `argus-app/src/store/useEpicFuryStore.ts`

- [ ] **Step 1: Create the store file with types and state**

```ts
// argus-app/src/store/useEpicFuryStore.ts
import { create } from "zustand";
import type { GdeltEvent } from "@/types/gdelt";
import type { MilitaryFlight, EarthquakeFeature } from "@/types/intel";
import type { AisVessel } from "@/types/vessel";

export type TimeWindow = "1h" | "6h" | "24h" | "7d" | "all";

export type IncidentType = "gdelt" | "military" | "vessel" | "seismic";
export type Severity = "critical" | "high" | "medium" | "low";

export interface EpicFuryIncident {
  type: IncidentType;
  id: string;
  lat: number;
  lon: number;
  timestamp: number;
  title: string;
  severity: Severity;
  detail: string;
  source: string;
}

export interface ZoomRegion {
  id: string;
  label: string;
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface RegionStats {
  militaryInRegion: number;
  vesselsInRegion: number;
  incidentsLastHour: number;
  seismicInRegion: number;
}

const TIME_WINDOW_MS: Record<TimeWindow, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  all: Infinity,
};

const MAX_INCIDENTS = 500;

function isInRegion(lat: number, lon: number, r: ZoomRegion): boolean {
  return lat >= r.south && lat <= r.north && lon >= r.west && lon <= r.east;
}

type EpicFuryStore = {
  active: boolean;
  timeWindow: TimeWindow;
  lockedRegion: ZoomRegion | null;
  incidents: EpicFuryIncident[];

  setActive: (on: boolean) => void;
  setTimeWindow: (w: TimeWindow) => void;
  lockRegion: (r: ZoomRegion) => void;
  unlockRegion: () => void;
  pushIncidents: (items: EpicFuryIncident[]) => void;
  filteredIncidents: () => EpicFuryIncident[];
  regionStats: () => RegionStats;
};

export const useEpicFuryStore = create<EpicFuryStore>((set, get) => ({
  active: false,
  timeWindow: "24h",
  lockedRegion: null,
  incidents: [],

  setActive: (on) => set({ active: on }),
  setTimeWindow: (w) => set({ timeWindow: w }),
  lockRegion: (r) => set({ lockedRegion: r }),
  unlockRegion: () => set({ lockedRegion: null }),

  pushIncidents: (items) =>
    set((state) => {
      const existing = new Set(state.incidents.map((i) => i.id));
      const fresh = items.filter((i) => !existing.has(i.id));
      if (fresh.length === 0) return state;
      const merged = [...fresh, ...state.incidents];
      return { incidents: merged.slice(0, MAX_INCIDENTS) };
    }),

  filteredIncidents: () => {
    const { incidents, timeWindow, lockedRegion } = get();
    const cutoff = timeWindow === "all" ? 0 : Date.now() - TIME_WINDOW_MS[timeWindow];
    return incidents.filter((i) => {
      if (i.timestamp < cutoff) return false;
      if (lockedRegion && !isInRegion(i.lat, i.lon, lockedRegion)) return false;
      return true;
    });
  },

  regionStats: () => {
    const { incidents, lockedRegion } = get();
    if (!lockedRegion) return { militaryInRegion: 0, vesselsInRegion: 0, incidentsLastHour: 0, seismicInRegion: 0 };
    const inRegion = incidents.filter((i) => isInRegion(i.lat, i.lon, lockedRegion));
    const oneHourAgo = Date.now() - 3_600_000;
    return {
      militaryInRegion: inRegion.filter((i) => i.type === "military").length,
      vesselsInRegion: inRegion.filter((i) => i.type === "vessel").length,
      incidentsLastHour: inRegion.filter((i) => i.timestamp >= oneHourAgo).length,
      seismicInRegion: inRegion.filter((i) => i.type === "seismic").length,
    };
  },
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to `useEpicFuryStore.ts`

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/store/useEpicFuryStore.ts
git commit -m "feat(epic-fury): add useEpicFuryStore with incidents, time filter, region lock"
```

---

### Task 2: Create incident mappers

**Files:**
- Create: `argus-app/src/lib/epicFuryMappers.ts`

These pure functions convert each feed's data type into `EpicFuryIncident[]`.

- [ ] **Step 1: Create the mappers file**

```ts
// argus-app/src/lib/epicFuryMappers.ts
import type { GdeltEvent } from "@/types/gdelt";
import type { MilitaryFlight, EarthquakeFeature } from "@/types/intel";
import type { AisVessel } from "@/types/vessel";
import type { EpicFuryIncident, Severity } from "@/store/useEpicFuryStore";

export function mapGdeltIncidents(events: GdeltEvent[]): EpicFuryIncident[] {
  return events
    .filter((e) => e.latitude !== 0 && e.longitude !== 0)
    .map((e) => {
      let severity: Severity = "medium";
      if (e.quadClass === 4) severity = "critical";
      else if (e.quadClass === 3) severity = "high";

      return {
        type: "gdelt" as const,
        id: e.id,
        lat: e.latitude,
        lon: e.longitude,
        timestamp: Date.parse(e.dateAdded) || Date.now(),
        title: e.actionGeoName || "Unknown Location",
        severity,
        detail: `${e.actor1Name || "?"} → ${e.actor2Name || "?"} | ${e.eventCode}`,
        source: "GDELT",
      };
    });
}

export function mapMilitaryIncidents(flights: MilitaryFlight[]): EpicFuryIncident[] {
  return flights.map((f) => ({
    type: "military" as const,
    id: `mil-${f.id}`,
    lat: f.latitude,
    lon: f.longitude,
    timestamp: Date.now(),
    title: f.callsign,
    severity: "medium" as const,
    detail: f.type || "Unknown aircraft",
    source: "ADSB",
  }));
}

export function mapVesselIncidents(vessels: AisVessel[]): EpicFuryIncident[] {
  return vessels.map((v) => ({
    type: "vessel" as const,
    id: `ais-${v.mmsi}`,
    lat: v.lat,
    lon: v.lon,
    timestamp: Date.parse(v.timestamp) || Date.now(),
    title: v.vesselName || `MMSI ${v.mmsi}`,
    severity: "low" as const,
    detail: `SOG: ${v.sog}kn, HDG: ${v.heading}°`,
    source: "AIS",
  }));
}

export function mapSeismicIncidents(quakes: EarthquakeFeature[]): EpicFuryIncident[] {
  return quakes.map((q) => {
    let severity: Severity = "low";
    if (q.magnitude >= 6) severity = "critical";
    else if (q.magnitude >= 4.5) severity = "high";
    else if (q.magnitude >= 3) severity = "medium";

    return {
      type: "seismic" as const,
      id: `usgs-${q.id}`,
      lat: q.latitude,
      lon: q.longitude,
      timestamp: q.timestamp,
      title: q.place || "Unknown Location",
      severity,
      detail: `M${q.magnitude.toFixed(1)} at ${q.depthKm}km depth`,
      source: "USGS",
    };
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to `epicFuryMappers.ts`

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/lib/epicFuryMappers.ts
git commit -m "feat(epic-fury): add incident mapper functions for all four feeds"
```

---

### Task 3: Wire feed pollers in CesiumGlobe to push incidents

**Files:**
- Modify: `argus-app/src/components/CesiumGlobe.tsx`

Add imports and one `pushIncidents()` call inside each of the four existing feed pollers.

- [ ] **Step 1: Add imports near the top of CesiumGlobe.tsx**

After the existing import of `EpicFuryHud` (line 86), add:

```ts
import { useEpicFuryStore } from "@/store/useEpicFuryStore";
import {
  mapGdeltIncidents,
  mapMilitaryIncidents,
  mapVesselIncidents,
  mapSeismicIncidents,
} from "@/lib/epicFuryMappers";
```

- [ ] **Step 2: Get `pushIncidents` from the store**

Inside the component function, near the other store destructuring (around line 525), add:

```ts
const pushIncidents = useEpicFuryStore((s) => s.pushIncidents);
```

- [ ] **Step 3: Forward ADSB military data**

In the `adsb-military` poller (around line 1135, after `setFeedHealthy("adsb")`), add:

```ts
          pushIncidents(mapMilitaryIncidents(bounded));
```

- [ ] **Step 4: Forward USGS seismic data**

In the `usgs` poller (around line 1191, after `setFeedHealthy("usgs")`), add:

```ts
          pushIncidents(mapSeismicIncidents(quakes));
```

- [ ] **Step 5: Forward AIS vessel data**

In the `aisstream` poller (around line 1288, after `setFeedHealthy("ais")`), add:

```ts
          pushIncidents(mapVesselIncidents(vessels));
```

- [ ] **Step 6: Forward GDELT data**

In the `gdelt` poller (around line 1303, after `setFeedHealthy("gdelt")`), add:

```ts
          pushIncidents(mapGdeltIncidents(events));
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat(epic-fury): wire four feed pollers to push incidents to store"
```

---

### Task 4: Replace `isEpicFuryMode` local state with store + wire region lock

**Files:**
- Modify: `argus-app/src/components/CesiumGlobe.tsx`

- [ ] **Step 1: Remove local `isEpicFuryMode` state**

Find and remove (around line 534):
```ts
  const [isEpicFuryMode, setIsEpicFuryMode] = useState(false);
```

- [ ] **Step 2: Read `active` and `setActive` from the store**

Near the `pushIncidents` selector added in Task 3, add:

```ts
const epicFuryActive = useEpicFuryStore((s) => s.active);
const setEpicFuryActive = useEpicFuryStore((s) => s.setActive);
```

- [ ] **Step 3: Replace all `isEpicFuryMode` references**

Replace every occurrence of `isEpicFuryMode` with `epicFuryActive` and `setIsEpicFuryMode` with `setEpicFuryActive`. There are 5 occurrences:

1. Toggle button onClick (around line 1939): `setIsEpicFuryMode(!isEpicFuryMode)` → `setEpicFuryActive(!epicFuryActive)`
2. Toggle button className (around line 1941): `isEpicFuryMode` → `epicFuryActive`
3. Toggle button text (around line 1946): `isEpicFuryMode` → `epicFuryActive`
4. EPIC FURY components conditional (around line 1927): `isEpicFuryMode` → `epicFuryActive`
5. HudOverlay conditional (around line 1950): `!isEpicFuryMode` → `!epicFuryActive`

- [ ] **Step 4: Wire region lock into hotspot click handler**

In the zoom-region click handler (around line 922-934), after the existing `flyTo` call, add region locking. Replace the entire block:

```ts
      if (clickedEntity.id?.startsWith("zr-") && clickedEntity.properties) {
        const props = clickedEntity.properties;
        const cLon = props.centerLon?.getValue(JulianDate.now()) as number | undefined;
        const cLat = props.centerLat?.getValue(JulianDate.now()) as number | undefined;
        const zH = props.zoomHeight?.getValue(JulianDate.now()) as number | undefined;
        if (cLon != null && cLat != null && zH != null) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(cLon, cLat, zH),
            duration: 1.8,
          });
        }
        return;
      }
```

With:

```ts
      if (clickedEntity.id?.startsWith("zr-") && clickedEntity.properties) {
        const props = clickedEntity.properties;
        const cLon = props.centerLon?.getValue(JulianDate.now()) as number | undefined;
        const cLat = props.centerLat?.getValue(JulianDate.now()) as number | undefined;
        const zH = props.zoomHeight?.getValue(JulianDate.now()) as number | undefined;
        if (cLon != null && cLat != null && zH != null) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(cLon, cLat, zH),
            duration: 1.8,
          });
          // Lock region in EPIC FURY mode
          if (useEpicFuryStore.getState().active) {
            const region = ZOOM_REGIONS.find((r) => r.id === clickedEntity.id);
            if (region) {
              useEpicFuryStore.getState().lockRegion({
                id: region.id,
                label: region.label,
                west: region.west,
                south: region.south,
                east: region.east,
                north: region.north,
              });
            }
          }
        }
        return;
      }
```

Note: Uses `useEpicFuryStore.getState()` instead of the hook because this is inside a Cesium event callback (not React render).

- [ ] **Step 5: Remove `CrossingEvents` import and render**

Remove the import (around line 87 area — find the exact line):
```ts
import { CrossingEvents } from "./CrossingEvents";
```

Remove the render inside the `epicFuryActive &&` block (around line 1931):
```tsx
          <CrossingEvents />
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat(epic-fury): use store for active state, wire region lock, remove CrossingEvents"
```

---

### Task 5: Delete `CrossingEvents.tsx`

**Files:**
- Delete: `argus-app/src/components/CrossingEvents.tsx`

- [ ] **Step 1: Grep for any remaining references**

Run: `cd /home/volta/argus && grep -r "CrossingEvents" argus-app/src/`
Expected: No results (import was removed in Task 4)

- [ ] **Step 2: Delete the file**

```bash
rm argus-app/src/components/CrossingEvents.tsx
```

- [ ] **Step 3: Verify build**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add -u argus-app/src/components/CrossingEvents.tsx
git commit -m "chore(epic-fury): delete CrossingEvents component (no real data backing)"
```

---

### Task 6: Rewrite `EpicFuryHud`

**Files:**
- Rewrite: `argus-app/src/components/EpicFuryHud.tsx`

- [ ] **Step 1: Rewrite the component**

```tsx
"use client";

import React from "react";
import { useEpicFuryStore, type TimeWindow, type EpicFuryIncident } from "@/store/useEpicFuryStore";

const TIME_WINDOWS: TimeWindow[] = ["1h", "6h", "24h", "7d", "all"];

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-400",
  medium: "border-l-cyan-500",
  low: "border-l-cyan-900",
};

const TYPE_ICON: Record<string, string> = {
  gdelt: "🌐",
  military: "✈️",
  vessel: "🚢",
  seismic: "🔴",
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export const EpicFuryHud: React.FC<{
  onFlyToCoordinates: (lat: number, lon: number) => void;
}> = ({ onFlyToCoordinates }) => {
  const timeWindow = useEpicFuryStore((s) => s.timeWindow);
  const setTimeWindow = useEpicFuryStore((s) => s.setTimeWindow);
  const lockedRegion = useEpicFuryStore((s) => s.lockedRegion);
  const incidents = useEpicFuryStore((s) => s.filteredIncidents());

  return (
    <div className="absolute top-[5.5rem] left-8 w-[400px] bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-4 font-mono text-xs text-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.2)] z-50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-cyan-900/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">👁️</span>
          <h2 className="text-lg font-bold tracking-widest text-cyan-500">
            {lockedRegion ? `EPIC FURY — ${lockedRegion.label}` : "EPIC FURY — GLOBAL OPS"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-cyan-500 font-bold animate-pulse">●</span>
          <span className="text-cyan-400 font-bold">LIVE</span>
        </div>
      </div>

      {/* Time Window Buttons */}
      <div className="flex gap-2 mb-4 border-b border-cyan-900/50 pb-2">
        {TIME_WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setTimeWindow(w)}
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
              timeWindow === w
                ? "bg-cyan-900/60 text-cyan-400 border border-cyan-500/50"
                : "text-cyan-700 hover:text-cyan-400"
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      {/* Incident Count */}
      <div className="text-[10px] text-cyan-600 mb-2">
        {incidents.length} INCIDENT{incidents.length !== 1 ? "S" : ""} IN WINDOW
      </div>

      {/* Incident Feed */}
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
        {incidents.length === 0 ? (
          <div className="text-cyan-700 text-center py-8">No incidents in current window</div>
        ) : (
          incidents.map((incident) => (
            <div
              key={incident.id}
              className={`bg-cyan-950/20 border border-cyan-900/50 border-l-2 ${SEVERITY_BORDER[incident.severity]} rounded p-3 cursor-pointer hover:bg-cyan-900/40 transition-colors`}
              onClick={() => onFlyToCoordinates(incident.lat, incident.lon)}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span>{TYPE_ICON[incident.type]}</span>
                  <span className="font-bold text-white">{incident.title}</span>
                </div>
                <span className="text-[10px] text-cyan-600 whitespace-nowrap ml-2">
                  {relativeTime(incident.timestamp)}
                </span>
              </div>
              <div className="text-cyan-200/80 mb-2">{incident.detail}</div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="bg-cyan-900/50 px-2 py-0.5 rounded text-cyan-300">{incident.source}</span>
                <span className="text-cyan-600">
                  {incident.lat.toFixed(2)}, {incident.lon.toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/components/EpicFuryHud.tsx
git commit -m "feat(epic-fury): rewrite EpicFuryHud with live incident feed and time filtering"
```

---

### Task 7: Rewrite `AnalystControls`

**Files:**
- Rewrite: `argus-app/src/components/AnalystControls.tsx`

- [ ] **Step 1: Rewrite the component**

```tsx
"use client";

import React from "react";
import { useEpicFuryStore } from "@/store/useEpicFuryStore";
import { useArgusStore } from "@/store/useArgusStore";
import type { LayerKey } from "@/types/intel";

const CONFLICT_LAYERS: { key: LayerKey; label: string }[] = [
  { key: "military", label: "MILITARY" },
  { key: "vessels", label: "VESSELS" },
  { key: "seismic", label: "SEISMIC" },
  { key: "gdelt", label: "GDELT" },
  { key: "flights", label: "FLIGHTS" },
];

export const AnalystControls: React.FC = () => {
  const counts = useArgusStore((s) => s.counts);
  const layers = useArgusStore((s) => s.layers);
  const toggleLayer = useArgusStore((s) => s.toggleLayer);
  const lockedRegion = useEpicFuryStore((s) => s.lockedRegion);
  const unlockRegion = useEpicFuryStore((s) => s.unlockRegion);
  const stats = useEpicFuryStore((s) => s.regionStats());

  return (
    <div className="absolute top-[5.5rem] right-8 w-80 bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-4 font-mono text-xs text-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.2)] z-50 backdrop-blur-md">
      {/* Global Stats */}
      <div className="text-[10px] text-cyan-700 font-bold mb-2">GLOBAL COUNTS</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">MILITARY</div>
          <div className="text-lg font-bold text-white">{counts.military.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">VESSELS</div>
          <div className="text-lg font-bold text-white">{counts.vessels.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">SATELLITES</div>
          <div className="text-lg font-bold text-white">{counts.satellites.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">SEISMIC</div>
          <div className="text-lg font-bold text-white">{counts.seismic.toLocaleString()}</div>
        </div>
      </div>

      {/* Region Stats (only when locked) */}
      {lockedRegion && (
        <div className="mb-4 border-t border-cyan-900/50 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-cyan-400 font-bold">{lockedRegion.label} REGION</div>
            <button
              onClick={unlockRegion}
              className="text-[10px] text-red-400 hover:text-red-300 font-bold border border-red-900/50 px-2 py-0.5 rounded"
            >
              UNLOCK
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
              <div className="text-[10px] text-cyan-600 mb-1">MIL. IN REGION</div>
              <div className="text-lg font-bold text-cyan-400">{stats.militaryInRegion.toLocaleString()}</div>
            </div>
            <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
              <div className="text-[10px] text-cyan-600 mb-1">VESSELS IN REGION</div>
              <div className="text-lg font-bold text-cyan-400">{stats.vesselsInRegion.toLocaleString()}</div>
            </div>
            <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
              <div className="text-[10px] text-cyan-600 mb-1">INCIDENTS (1H)</div>
              <div className="text-lg font-bold text-cyan-400">{stats.incidentsLastHour.toLocaleString()}</div>
            </div>
            <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
              <div className="text-[10px] text-cyan-600 mb-1">SEISMIC IN REGION</div>
              <div className="text-lg font-bold text-cyan-400">{stats.seismicInRegion.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* Layer Toggles */}
      <div className="border-t border-cyan-900/50 pt-3">
        <div className="text-[10px] text-cyan-700 font-bold mb-3">LAYERS</div>
        <div className="space-y-2">
          {CONFLICT_LAYERS.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between hover:bg-cyan-900/20 p-1 rounded cursor-pointer transition-colors"
              onClick={() => toggleLayer(key)}
            >
              <span className={layers[key] ? "text-cyan-100" : "text-cyan-700"}>{label}</span>
              <div
                className={`w-8 h-4 rounded-full border ${
                  layers[key] ? "bg-cyan-900 border-cyan-500" : "border-cyan-900/50"
                } relative`}
              >
                <div
                  className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                    layers[key] ? "bg-cyan-400 right-0.5" : "bg-cyan-900/50 left-0.5"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/components/AnalystControls.tsx
git commit -m "feat(epic-fury): rewrite AnalystControls with live counts, region stats, layer toggles"
```

---

### Task 8: Rewrite `TimelineScrubber`

**Files:**
- Rewrite: `argus-app/src/components/TimelineScrubber.tsx`

- [ ] **Step 1: Rewrite the component**

```tsx
"use client";

import React from "react";
import { useEpicFuryStore, type TimeWindow } from "@/store/useEpicFuryStore";

const TIME_WINDOWS: TimeWindow[] = ["1h", "6h", "24h", "7d", "all"];

const WINDOW_LABELS: Record<TimeWindow, string> = {
  "1h": "LAST 1 HOUR",
  "6h": "LAST 6 HOURS",
  "24h": "LAST 24 HOURS",
  "7d": "LAST 7 DAYS",
  all: "ALL TIME",
};

export const TimelineScrubber: React.FC = () => {
  const timeWindow = useEpicFuryStore((s) => s.timeWindow);
  const setTimeWindow = useEpicFuryStore((s) => s.setTimeWindow);
  const incidents = useEpicFuryStore((s) => s.filteredIncidents());

  const newest = incidents.length > 0 ? incidents[0].timestamp : null;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-3 font-mono text-xs z-50 backdrop-blur-md shadow-[0_0_20px_rgba(8,145,178,0.2)]">
      <div className="flex items-center gap-6">
        {/* Time Window Buttons */}
        <div className="flex gap-1">
          {TIME_WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`px-4 py-2 rounded font-bold text-[11px] uppercase transition-colors ${
                timeWindow === w
                  ? "bg-cyan-900/60 text-cyan-400 border border-cyan-500/50"
                  : "text-cyan-700 hover:text-cyan-400 border border-transparent"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-cyan-900/50" />

        {/* Stats */}
        <div className="flex items-center gap-6 text-[10px]">
          <div className="text-cyan-600">
            WINDOW: <span className="text-white font-bold">{WINDOW_LABELS[timeWindow]}</span>
          </div>
          <div className="text-cyan-600">
            INCIDENTS: <span className="text-white font-bold">{incidents.length.toLocaleString()}</span>
          </div>
          {newest && (
            <div className="text-cyan-600">
              LATEST:{" "}
              <span className="text-cyan-400 font-bold">
                {new Date(newest).toISOString().replace("T", " ").slice(0, 19)} UTC
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/components/TimelineScrubber.tsx
git commit -m "feat(epic-fury): rewrite TimelineScrubber with real time window buttons and incident stats"
```

---

### Task 9: Full build verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit`
Expected: Clean — no errors

- [ ] **Step 2: Run Next.js build**

Run: `cd /home/volta/argus/argus-app && npx next build 2>&1 | tail -30`
Expected: Build succeeds. Watch for warnings about unused imports or missing references.

- [ ] **Step 3: Fix any issues found**

If the build fails, fix the issues. Common things to watch for:
- Missing imports (check that `useEpicFuryStore` exports all needed types)
- Stale references to `CrossingEvents` anywhere
- Type mismatches in the mapper functions

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(epic-fury): address build issues"
```
