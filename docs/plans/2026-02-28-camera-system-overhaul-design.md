# Camera System Overhaul Design

Date: 2026-02-28

## Problem

The CCTV layer uses fake Unsplash stock photos for "scenic" cameras and only shows static snapshots in the intel panel. No live video playback exists.

## Solution

### 1. Extended Camera Data Model

Add `feedType` and `streamUrl` to `CctvCamera`:

```typescript
export interface CctvCamera {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  imageUrl: string;          // billboard thumbnail + fallback
  feedType: "embed" | "hls" | "snapshot";
  streamUrl?: string;        // iframe src or .m3u8 URL
}
```

### 2. Hybrid Camera Player (Intel Panel)

The intel panel renders a smart player based on `feedType`:

- **embed**: `<iframe>` with YouTube Live / SkylineWebcams embed URL
- **hls**: HLS.js `<video>` element with play/pause
- **snapshot**: `<img>` with auto-refresh every 5 seconds + fade transition

Globe billboards remain static `imageUrl` thumbnails for performance.

### 3. Curated World Cameras

Replace all 6 fake scenic presets with verified real public webcams:

| Location | Source | Feed Type |
|----------|--------|-----------|
| Shibuya Crossing | SkylineWebcams YouTube | embed |
| Times Square | EarthCam YouTube Live | embed |
| Abbey Road | Abbey Road Studios | snapshot |
| Venice Grand Canal | SkylineWebcams | embed |
| ISS Earth View | NASA YouTube | embed |
| Jackson Hole | Town Square webcam | snapshot |
| Banff Bow Valley | Parks Canada | snapshot |
| Mt. Fuji | Fujigoko Live | embed |
| Northern Lights | LiveFromIceland | embed |
| Amalfi Coast | SkylineWebcams | embed |

TFL JamCam stays as-is (real snapshots, feedType: "snapshot").

### 4. Quick Wins

- CCTV layer defaults to ON in Zustand store
- Fly-to-camera on entity click (auto camera flyTo for CCTV entities)
- Feed error red dot indicator on layer toggle buttons
- HLS.js added as dependency (lightweight, tree-shakeable)

## Files Modified

- `argus-app/src/types/intel.ts` — extend CctvCamera type
- `argus-app/src/lib/ingest/cctv.ts` — replace scenic presets, add feedType
- `argus-app/src/lib/cesium/layers/cctvLayer.ts` — pass feedType/streamUrl to entity properties
- `argus-app/src/components/CesiumGlobe.tsx` — fly-to on CCTV click
- `argus-app/src/components/HudOverlay.tsx` — camera player component, feed error dots
- `argus-app/src/store/useArgusStore.ts` — CCTV default on
- `argus-app/package.json` — add hls.js dependency

## New Files

- `argus-app/src/components/CameraPlayer.tsx` — smart player component (embed/hls/snapshot)
