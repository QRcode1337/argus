# Context for Gemini 3.1 Pro

You are assisting on **ARGUS**, a real-time geospatial intelligence dashboard (spy-thriller/HUD aesthetic) built with open-source tools.

## Mission
Build and refine a browser-based intelligence UI that fuses live geospatial feeds into a performant Cesium globe with tactical overlays and shader modes.

## Current Stack
- Next.js App Router + React + TypeScript
- Tailwind CSS
- CesiumJS
- Zustand state
- satellite.js

## Current Status (Already Implemented)
- Cesium globe with OSM buildings and HUD overlays.
- Data ingestion + polling for:
  - OpenSky (commercial flights)
  - ADS-B military feed
  - CelesTrak TLE satellites + orbit paths
  - USGS earthquakes
  - TFL CCTV metadata
- Local API proxy routes for all feed endpoints.
- Shader modes: `normal`, `nvg`, `flir`, `crt`.
- Mode-specific parameter model in state + shader uniform wiring.
- Circular tactical viewport style with scanline/noise overlays.

## Important Constraints
- Do **not** add visual crosshairs/reticles that obstruct map content.
- Keep browser performance stable (avoid DOM-heavy overlays for large entity sets).
- Mutate existing Cesium entities instead of recreating each tick.
- Preserve current project structure and style language.

## Key Files
- `src/components/CesiumGlobe.tsx`
- `src/components/HudOverlay.tsx`
- `src/lib/cesium/shaders/visualModes.ts`
- `src/store/useArgusStore.ts`
- `src/lib/ingest/*`
- `src/lib/cesium/layers/*`
- `src/app/api/feeds/*`

## What You Should Do
When asked to implement a change:
1. Use existing architecture and naming.
2. Keep updates incremental and production-safe.
3. Prefer minimal diffs over rewrites.
4. Maintain the tactical UI aesthetic (high contrast, data-dense, dark HUD).
5. Validate TypeScript and build compatibility.

## Output Expectations
- Provide concrete code edits (not generic advice).
- Explain tradeoffs briefly.
- Flag any assumptions about external APIs.
- Call out risks to performance, data freshness, or UX.
