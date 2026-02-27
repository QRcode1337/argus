# ARGUS Build Plan (MVP -> V2)

## MVP (implemented baseline)

- `src/components/CesiumGlobe.tsx`: client-only Cesium viewer, no default widgets, OSM buildings, lifecycle-safe init/destroy.
- `src/components/HudOverlay.tsx`: spy-style HUD overlay with layer toggles, feed health, camera readout, POI jumps.
- `src/store/useArgusStore.ts`: global state for layers, feed status, counts, active POI, camera position.
- `src/lib/ingest/pollingManager.ts`: non-overlapping poll scheduler.
- `src/lib/ingest/opensky.ts`: OpenSky fetch + state-vector normalization.
- `src/lib/ingest/tle.ts`: CelesTrak TLE parser + satellite.js position/orbit calculation.
- `src/lib/ingest/usgs.ts`: USGS GeoJSON fetch + quake normalization.
- `src/lib/ingest/adsb.ts`: ADS-B military flight normalization.
- `src/lib/ingest/cctv.ts`: TFL JamCam normalization with image URL extraction.
- `src/lib/cesium/layers/flightLayer.ts`: mutable plane entities (update-in-place, stale cleanup).
- `src/lib/cesium/layers/militaryLayer.ts`: mutable military flight entities.
- `src/lib/cesium/layers/satelliteLayer.ts`: mutable satellite points + orbit polylines.
- `src/lib/cesium/layers/seismicLayer.ts`: mutable quake entities with magnitude scaling.
- `src/lib/cesium/layers/cctvLayer.ts`: mutable CCTV billboard entities.
- `src/lib/cesium/shaders/visualModes.ts`: NVG/FLIR/CRT post-process stage controller.
- `src/app/api/feeds/*`: local proxy endpoints for OpenSky/CelesTrak/USGS/ADS-B/TFL feeds.

## V2 backlog (next)

- `src/lib/correlator/rules.ts`: geofence + event correlation rules engine.
- `src/lib/replay/timeline.ts`: time-scrub + historical replay abstraction.
- `src/lib/network/fanout.ts`: optional server-side proxy/fanout via SSE/WebSocket.
- `src/lib/perf/governor.ts`: FPS-aware LOD controls and adaptive sampling.
- `src/components/IncidentNotebook.tsx`: capture/shareable brief snapshots.
- `src/components/FeedStatusConsole.tsx`: latency/retry/staleness diagnostics panel.
- `src/components/TimeReplayPanel.tsx`: time scrub + replay controls.

## Notes

- Current architecture mutates existing Cesium entities to reduce churn and GC spikes.
