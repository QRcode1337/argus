# GDELT Event Feed — Design

## Summary
Add GDELT 2.0 Event Database as a real-time intelligence layer in ARGUS, rendering on both CesiumGlobe (3D) and FlatMapView (2D).

## Data Source
- GDELT v2 15-minute CSV export files from `data.gdeltproject.org/gdeltv2/`
- `lastupdate.txt` gives latest file URLs
- ~1500 events per 15-min batch, TSV format, 61 columns
- Key fields: GlobalEventID, CAMEO codes, GoldsteinScale, NumMentions, ActionGeo lat/lon, SourceURL

## Approach
Server-side API route fetches latest CSV export, parses TSV, filters to high-signal geolocated events, returns GeoJSON. Client polls every 15 min.

## Filtering (server-side)
- Must have ActionGeo lat/lon (non-zero)
- GoldsteinScale <= -5 (conflict) OR >= 7 (cooperation) OR NumMentions >= 5
- Target: ~100-300 events per cycle

## Color by QuadClass
- 1 (Verbal Cooperation) → #3498db (blue)
- 2 (Material Cooperation) → #2ecc71 (green)
- 3 (Verbal Conflict) → #f39c12 (amber)
- 4 (Material Conflict) → #e74c3c (red)

## Files

| Action | File |
|--------|------|
| Create | `argus-app/src/app/api/feeds/gdelt/route.ts` |
| Create | `argus-app/src/types/gdelt.ts` |
| Create | `argus-app/src/lib/ingest/gdelt.ts` |
| Create | `argus-app/src/lib/cesium/layers/gdeltLayer.ts` |
| Modify | `argus-app/src/components/FlatMapView.tsx` |
| Modify | `argus-app/src/components/CesiumGlobe.tsx` |
| Modify | `argus-app/src/components/HudOverlay.tsx` |
| Modify | `argus-app/src/store/useArgusStore.ts` |
| Modify | `argus-app/src/types/intel.ts` |
| Modify | `argus-app/src/lib/config.ts` |
