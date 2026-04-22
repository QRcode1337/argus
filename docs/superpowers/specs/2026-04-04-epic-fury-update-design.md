# EPIC FURY Mode Update — Design Spec

## Overview

Update EPIC FURY from a static mock-data demo into a hybrid ops mode that overlays real conflict-focused data on the globe. Iran/Israel/GCC theater overview by default, with click-to-lock deep-dive into existing hotspot regions inside that theater.

## Decisions

- **Approach:** New `useEpicFuryStore` Zustand slice + rewritten components (Approach B)
- **Focus:** Hybrid — Iran/Israel/GCC theater view with hotspot lock-on
- **Feeds:** Conflict-focused — GDELT, military flights (ADSB), AIS vessels, USGS seismic
- **Time filter:** Real buttons (1H / 6H / 24H / 7D / ALL) that filter the incident feed
- **Region lock:** Click existing zoom-box hotspot regions to deep-dive
- **Analyst panel:** Live store counts + computed regional/temporal stats
- **Removed:** CrossingEvents component (no real data backing), oil risk matrix, fake charts

---

## 1. Store — `useEpicFuryStore`

**File:** `argus-app/src/store/useEpicFuryStore.ts`

### State

```ts
type TimeWindow = '1h' | '6h' | '24h' | '7d' | 'all';

type EpicFuryIncident = {
  type: 'gdelt' | 'military' | 'vessel' | 'seismic';
  id: string;
  lat: number;
  lon: number;
  timestamp: number;        // unix ms
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detail: string;
  source: string;
  raw: GdeltEvent | MilitaryFlight | AisVessel | EarthquakeFeature;
};

type ZoomRegion = {
  id: string;
  label: string;
  west: number;
  south: number;
  east: number;
  north: number;
};

type RegionStats = {
  militaryFlightsInRegion: number;
  vesselsInRegion: number;
  incidentsLastHour: number;
  seismicInRegion: number;
};

// Store shape
{
  active: boolean;
  timeWindow: TimeWindow;
  lockedRegion: ZoomRegion | null;
  incidents: EpicFuryIncident[];      // rolling buffer, max 500
  regionStats: RegionStats;           // recomputed on region/incident change
}
```

### Actions

- `setActive(on: boolean)` — toggle EPIC FURY mode
- `setTimeWindow(window: TimeWindow)` — change time filter
- `lockRegion(region: ZoomRegion)` — deep-dive into a hotspot
- `unlockRegion()` — return to theater view
- `pushIncidents(incidents: EpicFuryIncident[])` — deduplicate by id, append, evict oldest past 500 cap

### Derived

- `filteredIncidents` — getter that filters `incidents` by:
  - `timestamp >= (Date.now() - windowMs)` (skipped for 'all')
  - `lat/lon within EPIC FURY theater bounds`
  - `lat/lon within lockedRegion bounds` (skipped when null)
  - Sorted newest-first

### Severity Mapping

| Feed | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| GDELT | quadClass 4 (material conflict) | quadClass 3 (verbal conflict) | other | — |
| Seismic | magnitude >= 6.0 | magnitude >= 4.5 | magnitude >= 3.0 | < 3.0 |
| Military | — | — | all (presence is signal) | — |
| Vessels | — | — | in locked region | default |

---

## 2. Components

### EpicFuryHud (left panel) — rewrite

**File:** `argus-app/src/components/EpicFuryHud.tsx`

- Header: "EPIC FURY — IRAN / ISRAEL / GCC" or "EPIC FURY — [REGION LABEL]" when locked
- Time window buttons: 1H / 6H / 24H / 7D / ALL — call `setTimeWindow()`, active button highlighted
- Incident feed: reads `filteredIncidents` from store, sorted newest-first
- Incident cards show: type icon, severity color-coded left border, title, detail, relative timestamp, source badge, lat/lon
- Click incident -> `flyToCoordinates(lat, lon)`
- Remove: oil risk matrix, fake bar chart, mock data

### AnalystControls (right panel) — rewrite

**File:** `argus-app/src/components/AnalystControls.tsx`

- Global stats cards: vessels, military flights, satellites, seismic — from `useArgusStore.counts`
- When region locked: additional row showing `regionStats` (military in region, vessels in region, incidents last hour, seismic in region)
- Layer toggles: vessels, military, seismic, gdelt, flights — wired to `useArgusStore.toggleLayer()`
- "RESET TO THEATER" button visible when `lockedRegion !== null`

### CrossingEvents — delete

**File:** `argus-app/src/components/CrossingEvents.tsx` — remove entirely.

No real data maps to this component.

### TimelineScrubber (bottom bar) — rewrite

**File:** `argus-app/src/components/TimelineScrubber.tsx`

- Time window buttons: 1H / 6H / 24H / 7D / ALL (larger, prominent — same state as HUD buttons)
- Display: active time window label, total incidents in current window, timestamp of newest incident
- Remove: fake playback controls, fake scrubber bar, fake timeline markers

---

## 3. Data Flow

### Incident ingestion

CesiumGlobe already polls all four feeds. After each existing fetch callback, add a lightweight mapping + `pushIncidents()` call:

1. **GDELT polling effect** — map `GdeltEvent[]` to `EpicFuryIncident[]`, call `pushIncidents()`
2. **ADSB military polling effect** — map `MilitaryFlight[]` to `EpicFuryIncident[]`, call `pushIncidents()`
3. **AIS vessel polling effect** — map `AisVessel[]` to `EpicFuryIncident[]`, call `pushIncidents()`
4. **USGS seismic polling effect** — map `EarthquakeFeature[]` to `EpicFuryIncident[]`, call `pushIncidents()`

No duplicate fetching — piggyback on existing ingest.

### Incident mapping

Each feed mapper produces `EpicFuryIncident`:

- **GDELT:** `id = event.id`, `title = actionGeoName`, `detail = actor1Name + " → " + actor2Name + " | " + eventCode`, `source = "GDELT"`, `timestamp = Date.parse(dateAdded)`, severity from quadClass
- **Military:** `id = "mil-" + flight.id`, `title = flight.callsign`, `detail = flight.type || "Unknown aircraft"`, `source = "ADSB"`, `timestamp = Date.now()` (real-time positions), severity = medium
- **Vessels:** `id = "ais-" + vessel.mmsi`, `title = vessel.vesselName || "MMSI " + vessel.mmsi`, `detail = "SOG: " + vessel.sog + "kn, HDG: " + vessel.heading`, `source = "AIS"`, `timestamp = Date.parse(vessel.timestamp)`, severity by region
- **Seismic:** `id = "usgs-" + quake.id`, `title = quake.place`, `detail = "M" + quake.magnitude + " at " + quake.depthKm + "km depth"`, `source = "USGS"`, `timestamp = quake.timestamp`, severity from magnitude

### Region locking

1. User clicks zoom-box hotspot on globe (existing `flyTo` behavior)
2. If `active === true`, also call `lockRegion({ id, label, west, south, east, north })`
3. `filteredIncidents` filters by bounding box
4. `regionStats` recomputes from full incidents filtered to region
5. "UNLOCK REGION" button calls `unlockRegion()`

### Rolling buffer

`pushIncidents()` deduplicates by `id`, appends new items, and evicts oldest entries when count exceeds 500. This prevents unbounded memory growth from continuous polling.

---

## 4. CesiumGlobe Changes

Minimal touch points in `CesiumGlobe.tsx`:

- **Remove:** `isEpicFuryMode` local state — read `active` from `useEpicFuryStore`
- **Remove:** `CrossingEvents` import and render
- **Modify:** Toggle button calls `setActive(!active)` on store
- **Add:** ~4 lines in each feed's polling effect to forward data to `pushIncidents()`
- **Modify:** Hotspot click handler — if EPIC FURY active, also call `lockRegion(region)`

---

## 5. Files Changed

| Action | File |
|--------|------|
| Create | `argus-app/src/store/useEpicFuryStore.ts` |
| Rewrite | `argus-app/src/components/EpicFuryHud.tsx` |
| Rewrite | `argus-app/src/components/AnalystControls.tsx` |
| Rewrite | `argus-app/src/components/TimelineScrubber.tsx` |
| Delete | `argus-app/src/components/CrossingEvents.tsx` |
| Modify | `argus-app/src/components/CesiumGlobe.tsx` |
