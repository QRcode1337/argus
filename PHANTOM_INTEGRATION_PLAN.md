# Phantom Integration Plan — ARGUS Anomaly Detection

## Overview
Wire Phantom (Rust anomaly detection engine) into ARGUS live feeds for real-time pattern detection and threat alerting.

## Current State
- **ARGUS:** Live at argusweb.bond with real-time feeds (OpenSky, ADS-B, USGS, seismic)
- **Phantom:** Compiled, running locally in ~/Documents/PROJECTS/phantom/
  - FTLE/Lyapunov chaos detection (flight altitude series, seismic patterns)
  - Weather edge detection (ensemble divergence → Kalshi signals)
  - Price regime detection (BTC + prediction market prices)

## Integration Goals

### Phase 1: Flight Anomaly Detection
**Input:** OpenSky + ADS-B feed (real-time flight data)
**Processing:** 
- Track flight altitude/lat/lon/time as 4D trajectory
- Compute Lyapunov exponent (chaos score) over 10-point windows
- Detect regime changes (stable → chaotic transitions)
- Flag anomalies >0.7 chaos score

**Output:**
- REST API: `POST /api/anomalies/flight` → { flightId, latitude, longitude, chaoScore, severity }
- WebSocket: Stream anomaly alerts to ARGUS HUD
- Database: Log to PostGIS for historical replay

### Phase 2: Seismic + Weather Correlation
**Input:** USGS earthquake feed + NOAA GFS atmospheric layers
**Processing:**
- Detect seismic pattern anomalies (P-wave timing, magnitude clusters)
- Overlay weather pressure/wind anomalies
- Correlate spatial proximity (earthquake → nearby pressure drop, etc.)

**Output:**
- `POST /api/anomalies/seismic` → { location, magnitude, pressure_anomaly, correlation_score }
- Real-time alerts in ARGUS map

### Phase 3: Trading Signal Integration
**Input:** Kalshi/Polymarket prices + Phantom weather/price regime detection
**Processing:**
- Feed live market prices to Phantom's PriceRegimeDetector
- Generate chaos scores for regime stability
- Cross-reference with weather edge signals

**Output:**
- Trading signal API for bots (Kalshi, Polymarket auto-execute if anomaly confirmed)

## Technical Requirements

### API Endpoints
```
POST /api/anomalies/flight
  Input: { flightId, altitude, lat, lon, timestamp }
  Output: { chaoScore: 0.0-1.0, severity: "low|medium|high", anomalyType: string }

POST /api/anomalies/seismic
  Input: { lat, lon, magnitude, depth, pWaveTime }
  Output: { chaoScore, seismicPattern, correlations[] }

POST /api/anomalies/weather
  Input: { lat, lon, temperature, pressure, windSpeed }
  Output: { edgeScore, regimeType, confidence }

GET /api/anomalies/history?timeRange=24h&type=flight
  Output: [{ timestamp, anomalies[] }]

WS /ws/anomalies/realtime
  Stream: { type: "flight|seismic|weather", alert: {...} }
```

### Database Schema (PostGIS)
```sql
-- Anomaly events log
CREATE TABLE anomalies (
  id UUID PRIMARY KEY,
  type VARCHAR(50), -- flight, seismic, weather
  lat FLOAT, lon FLOAT,
  chaos_score FLOAT (0.0-1.0),
  severity VARCHAR(20), -- low, medium, high, critical
  source_data JSONB, -- original feed data
  detected_at TIMESTAMP,
  SPATIAL INDEX (lat, lon)
);

-- Real-time anomaly streams (partitioned by hour)
CREATE TABLE anomaly_streams (
  id UUID,
  window_start TIMESTAMP,
  window_end TIMESTAMP,
  chaos_trajectory FLOAT[], -- time series of chaos scores
  pattern_type VARCHAR(100),
  confidence FLOAT
);
```

### Deployment Architecture
```
┌─────────────────┐
│   ARGUS Live    │
│  (Cesium Globe) │
└────────┬────────┘
         │
    ┌────┴─────────────────┐
    │                      │
    ▼                      ▼
┌────────────┐      ┌─────────────┐
│ Real-time  │      │   Phantom   │
│  Feeds     │      │  (Rust)     │
│ (OpenSky,  │─────▶│  Anomaly    │
│  ADS-B,    │      │  Detection  │
│  USGS)     │      │  Engine     │
└────────────┘      └─────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
                    ▼             ▼
               ┌────────────┐  ┌───────────┐
               │ PostGIS    │  │ WebSocket │
               │ (History)  │  │ (Live)    │
               └────────────┘  └───────────┘
                    │             │
                    └─────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ ARGUS HUD     │
                  │ (Alerts +     │
                  │  Visualization)
                  └───────────────┘
```

### Implementation Checklist
- [ ] Create `/api/anomalies/*` REST endpoints (Express.js or Next.js API routes)
- [ ] Wire Phantom subprocess/IPC for real-time chaos computation
- [ ] Implement WebSocket for anomaly streaming
- [ ] Create PostGIS schema + insertion logic
- [ ] Add HUD overlay for anomaly visualization (red/yellow/orange markers)
- [ ] Integrate Phantom's spatial correlation queries
- [ ] Add alert thresholds (configurable per anomaly type)
- [ ] Test with live feeds (OpenSky, ADS-B)
- [ ] Add trading signal bridge (Kalshi/Polymarket alerts)

### Success Criteria
- ✅ Phantom processes feed data < 200ms latency
- ✅ WebSocket delivers anomaly alerts in real-time
- ✅ HUD visualizes anomalies (color-coded severity)
- ✅ Historical replay via PostGIS queries
- ✅ Trading bot receives signals + auto-executes on high-confidence anomalies

## Timeline
- **Phase 1 (Flight):** 4-6 hours
- **Phase 2 (Seismic/Weather):** 4-6 hours  
- **Phase 3 (Trading):** 2-3 hours
- **Testing + Deployment:** 1-2 hours

## Notes
- Phantom is compiled and ready (~/Documents/PROJECTS/phantom/)
- ARGUS feeds already live (no setup needed)
- Use PostGIS for spatial queries (already in VPS backend)
- Keep chaos thresholds tunable (start conservative, 0.6-0.8)

---

**Status:** Ready for agent handoff. Blank slate. Implement per this plan.
