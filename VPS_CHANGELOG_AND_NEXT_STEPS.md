# Argus VPS Changelog + Next Steps

Date: 2026-02-27

## Scope
This log captures what was implemented on the VPS after your latest feedback:
- GFS weather not loading in Analytics mode
- HUD controls overlapping
- camera/navigation feeling sticky

## Implemented Changes

### 1) Analytics/GFS pipeline fixed to use real files
- `argus-api/src/routes/analytics.js`
  - Replaced mock behavior with filesystem scan under `TILES_DIR`.
  - Detects latest raster per variable (`t2m`, `u10`, `v10`) from `.tif/.tiff/.grib2/.grb2`.
  - Returns usable `tile_url` and `source_file` for each layer.
  - Updated TiTiler URL template to include matrix set:
    - `/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?...`

### 2) TiTiler data-path mismatch fixed
- `docker-compose.yml`
  - Updated `titiler` volume to mount at `/data/tiles` (read-only), matching the path used in API-generated URLs.
  - This aligns API `url=/data/tiles/...` with TiTiler filesystem visibility.

### 3) Ingestor tile URL template aligned with TiTiler route
- `ingestor/db.py`
  - Updated persisted tile URL template to include `WebMercatorQuad`.
  - Keeps future DB-written tile URLs consistent with the live endpoint format.

### 4) HUD overlap + controls refactor
- `argus-app/src/components/HudOverlay.tsx`
  - Removed invalid Tailwind positional classes that were causing overlaps.
  - Consolidated bottom controls into a single dock.
  - Switched Location / Platform / Camera Mode to dropdowns.
  - Added camera actions:
    - `Fly To Selected`
    - `Reset View`
    - `Terrain Collision: On/Off`
  - Added analytics status message area.

### 5) Camera navigation tuning
- `argus-app/src/components/CesiumGlobe.tsx`
  - Tuned camera controller inertia/zoom limits.
  - Added terrain collision toggle state and sync.
  - Added reset-camera action wiring.

## Runtime Verification Performed

Note: direct `curl http://localhost` from this agent shell is blocked by sandbox networking, so verification was run inside containers.

- `docker compose ps` shows all 6 services up:
  - `argus_nginx`, `argus_app`, `argus_api`, `argus_postgis`, `argus_titiler`, `argus_ingestor`
- API health from inside `argus-api`:
  - `GET /api/health` -> `{"ok":true,"service":"argus-api"}`
- Analytics metadata from inside `argus-api`:
  - `available_file_count: 3`
  - `t2m/u10/v10` now return non-null `tile_url`
- TiTiler from inside `titiler`:
  - `GET /cog/info?url=/data/tiles/raw/gfs_t2m_...grib2` -> `200`
  - `GET /cog/tiles/WebMercatorQuad/0/0/0.png?...` -> `200 image/png`
- Nginx proxy path from inside `argus-api`:
  - `GET http://nginx/tiles/cog/tiles/WebMercatorQuad/0/0/0.png?...` -> `200 image/png`

## What This Means
- The previous GFS failure path is fixed server-side:
  - route format fixed,
  - data path fixed,
  - tile endpoint verified end-to-end.
- If GFS still does not render on Mac, the next likely issues are frontend cache/state or layer toggles, not backend routing.

## Recommended Next Steps

1. Hard refresh the Mac browser and retest Analytics -> `GFS Weather` toggle.
2. Add a tiny on-screen diagnostics line in HUD showing:
   - active tile URL,
   - last tile load success/failure.
3. Add a compact mobile layout pass for HUD (small screens still need spacing polish).
4. Optional: add explicit camera preset buttons (Global / CONUS / AOI) next to `Reset View`.
5. Security cleanup: rotate the Cesium Ion token and replace `.env` value, since the token was shared in chat.

## Commands Used For Verification

```bash
docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Image}}'
docker compose exec -T argus-api node -e "fetch('http://localhost:3001/api/health')..."
docker compose exec -T argus-api node -e "fetch('http://localhost:3001/api/analytics/layers')..."
docker compose exec -T titiler python - <<'PY'
# checked /cog/info and /cog/tiles/WebMercatorQuad/0/0/0.png
PY
docker compose exec -T argus-api node -e "fetch('http://nginx/tiles/cog/tiles/WebMercatorQuad/0/0/0.png?...')..."
```
