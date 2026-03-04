# WorldView 4D Replay System for Argus

**Date**: 2026-03-04
**Status**: Approved

## Summary

Add a DVR-style recording and timeline playback system to Argus, turning it from a live-only dashboard into a 4D geospatial event reconstruction platform. All existing OSINT feeds are continuously recorded to TimescaleDB. A timeline scrubber lets you rewind, fast-forward, and replay events on the 3D globe. New layers add GPS jamming detection, NOTAM/airspace closures, and satellite-to-ground correlation.

## Decisions

- **Recording mode**: Always-on DVR (continuous persistence of all feeds)
- **Playback UI**: Timeline scrubber with speed controls (1x, 5x, 15x, 60x)
- **Retention**: 7-day rolling window with automatic purge
- **Storage**: `/mnt/volume-nyc3-01` (DigitalOcean block storage)
- **Database**: TimescaleDB extension on existing PostGIS
- **GPS jamming**: Derived from ADS-B NACp/NIC/SIL fields
- **NOTAMs**: FAA NOTAM API + Eurocontrol
- **Satellite correlation**: AOI footprint intersection with correlation lines
- **Build order**: Phase 1 (DVR + playback pipeline), Phase 2 (new layers)
- **Implementation**: Parallel subagents for independent tasks

## Architecture

### Phase 1: DVR + Timeline Playback

#### Database (TimescaleDB Hypertables)

Replace PostGIS Docker image with `timescale/timescaledb-ha:pg16-latest` (includes PostGIS + TimescaleDB). Mount data to `/mnt/volume-nyc3-01/pgdata`.

Tables (all hypertables with 7-day retention):

| Table | Key Columns | Source Feed |
|-------|-------------|-------------|
| `recorded_flights` | ts, icao24, callsign, lat, lon, alt_m, velocity, heading, is_military, nacp, nic, sil, geom, raw | OpenSky + ADS-B |
| `recorded_satellites` | ts, norad_id, name, lat, lon, alt_km, geom, tle_line1, tle_line2 | CelesTrak |
| `recorded_vessels` | ts, mmsi, name, lat, lon, speed_knots, heading, ship_type, geom, raw | AISStream |
| `recorded_quakes` | ts, event_id, lat, lon, depth_km, magnitude, place, geom | USGS |
| `recorded_outages` | ts, country, asn, severity, raw | Cloudflare Radar |
| `recorded_threats` | ts, pulse_id, name, lat, lon, geom, raw | AlienVault OTX |

All tables have spatial (GIST) + temporal indexes. Retention via `add_retention_policy('table', INTERVAL '7 days')`.

#### Recording Flow

```
PollingManager.fetch()
  → normalize data
  → update Zustand store (existing live view)
  → POST /api/record/{feed} → batch INSERT to TimescaleDB
```

New Express routes in `argus-api/src/routes/record.js`:
- `POST /api/record/flights` - batch insert flight positions
- `POST /api/record/satellites` - batch insert satellite positions
- `POST /api/record/vessels` - batch insert vessel positions
- `POST /api/record/quakes` - insert earthquake events
- `POST /api/record/outages` - insert outage events
- `POST /api/record/threats` - insert threat events

Uses `ON CONFLICT DO NOTHING` for dedup on (ts, primary_id).

#### Playback API

New Express routes in `argus-api/src/routes/playback.js`:
- `GET /api/playback/flights?ts={ISO}&window={seconds}` - flights within window of ts
- `GET /api/playback/satellites?ts={ISO}&window={seconds}`
- `GET /api/playback/vessels?ts={ISO}&window={seconds}`
- `GET /api/playback/quakes?ts={ISO}&window={seconds}`
- `GET /api/playback/outages?ts={ISO}&window={seconds}`
- `GET /api/playback/threats?ts={ISO}&window={seconds}`

Each returns entities in the same format as the live feed, so existing layer renderers work unchanged.

#### Zustand Store Additions

```typescript
interface PlaybackState {
  mode: 'live' | 'playback';
  playbackTime: Date | null;
  playbackSpeed: number;          // 1, 5, 15, 60
  isPlaying: boolean;
  timeRange: { start: Date; end: Date };
}
```

When `mode === 'playback'`:
- Layers query playback API instead of using live data
- `requestAnimationFrame` loop advances `playbackTime` by `playbackSpeed * deltaTime`
- PollingManager continues recording but doesn't update display

#### Timeline Scrubber Component

```
[<<] [<] [▶/❚❚] [>] [>>]  ─────●─────────────  [1x ▾]  [LIVE]
                            12:00    12:30   13:00
```

- Horizontal bar at bottom of HUD (below existing controls)
- Draggable scrub head sets `playbackTime`
- Speed dropdown: 1x, 5x, 15x, 60x
- LIVE button: returns to `mode: 'live'`
- Time range defaults to last 6 hours, adjustable

#### Layer Adaptation

Each layer class gets a conditional data source:

```typescript
async update(viewer, store) {
  if (store.mode === 'playback') {
    const data = await fetch(`/api/playback/{feed}?ts=${store.playbackTime.toISOString()}&window=30`);
    this.render(viewer, data);
  } else {
    this.render(viewer, store.liveData);
  }
}
```

Render logic stays identical.

### Phase 2: New Intelligence Layers

#### GPS Jamming Detection

**Source**: Derived from `recorded_flights` NACp/NIC/SIL fields.

**Detection**: Background job every 30 seconds:
- Grid world into 0.5-degree tiles
- Per tile: count flights with NACp < 7 (degraded GPS)
- Per tile: detect position jumps > 5km between consecutive same-aircraft reports
- If degraded_ratio > 0.3 → jamming detected

**Table**: `computed_gps_jamming` (ts, tile_lon, tile_lat, severity, sample_count, degraded_count, geom polygon)

**Visualization**: Red/orange translucent rectangles. Intensity = severity.

#### NOTAM / Airspace Closures

**Sources**: FAA NOTAM API, Eurocontrol B2B NOP.

**Table**: `recorded_notams` (ts, notam_id, effective, expires, type, description, geom polygon)

**Visualization**: Semi-transparent polygons. Red = closure, orange = TFR, yellow = restriction. Appear/disappear based on effective/expires timestamps during playback.

#### Satellite-AOI Correlation

**Tables**:
- `areas_of_interest` (id, name, category, geom polygon) - user-defined watch zones
- `computed_sat_correlations` (ts, norad_id, sat_name, aoi_id, aoi_name, sat_nation, geom_line)

**Logic**: When satellite footprint (based on altitude + sensor FOV estimate) intersects an AOI, record the correlation. Draw dashed lines from satellite to AOI center.

**Color coding**: US military = blue, Russian = red, Chinese = yellow, commercial = white.

### Docker Changes

```yaml
# docker-compose.yml
postgis:
  image: timescale/timescaledb-ha:pg16-latest
  volumes:
    - /mnt/volume-nyc3-01/pgdata:/home/postgres/pgdata
  environment:
    POSTGRES_DB: argus
    POSTGRES_USER: argus
    POSTGRES_PASSWORD: argus_dev
```

Init SQL updated to:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
-- followed by all hypertable CREATE statements
```

## Implementation Order

### Phase 1 (Core DVR + Playback)
1. Docker: Swap PostGIS image to TimescaleDB, mount `/mnt/volume-nyc3-01`
2. Database: Init SQL with all hypertable schemas + retention policies
3. Backend: Recording API routes (`/api/record/*`)
4. Backend: Playback API routes (`/api/playback/*`)
5. Frontend: Zustand playback state
6. Frontend: PollingManager → recording integration
7. Frontend: Layer classes → playback mode support
8. Frontend: Timeline scrubber component
9. Integration testing: record → rewind → verify

### Phase 2 (New Layers)
10. Backend: GPS jamming computation job
11. Frontend: GPS jamming layer + visualization
12. Backend: NOTAM ingestion (FAA API)
13. Frontend: NOTAM/airspace closure layer
14. Backend: AOI management + satellite correlation computation
15. Frontend: Satellite correlation layer + AOI management UI
