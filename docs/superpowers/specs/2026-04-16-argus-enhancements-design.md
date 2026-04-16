# Argus Intelligence Enhancements — Design Spec

**Date**: 2026-04-16
**Scope**: Infrastructure upgrades, analysis engine, new data sources, bug fixes

---

## 1. Infrastructure Layer

### 1.1 Smart Polling Engine

**File**: `argus-app/src/lib/ingest/pollingManager.ts` (rewrite)

The current `PollingManager` uses fixed `setInterval` with in-flight protection only. Replace with:

**Exponential Backoff**:
- On failure, double the interval (capped at 4x base interval)
- Reset to base interval on success
- Backoff state tracked per feed

**Hidden-Tab Throttle**:
- Listen to `document.visibilitychange`
- When `document.hidden === true`, multiply all intervals by 5x
- Restore original intervals on focus
- Prevents wasting API calls when the user isn't looking

**Circuit Breaker Per Feed**:
- Track consecutive failures per feed
- States: `closed` (normal) → `open` (after 2 consecutive failures, 5-minute cooldown) → `half-open` (single probe request after cooldown)
- On `half-open`: if probe succeeds → `closed`; if fails → back to `open` with fresh cooldown
- Expose circuit state to the Zustand store

**Jitter**:
- Add ±10% random jitter to all computed intervals
- Prevents synchronized polling storms across feeds

### 1.2 Negative Cache

**Location**: Server-side, per API route in `argus-app/src/app/api/feeds/*/route.ts`

**Shared utility**: `argus-app/src/lib/cache/negativeCache.ts`

Behavior:
- When an upstream API request fails, cache the failure for a configurable TTL (default 2 minutes)
- Subsequent requests within TTL return the last good cached response with `{ _stale: true, _cached_at, _error }` metadata
- If no good response exists, return a structured error response (not a 500)
- Per-feed TTL overrides: GDELT 5min, Polymarket 30s, FRED 5min, others 2min
- Prevents hammering downed upstreams every poll cycle

Feeds that already have caching (OpenSky 30s, AISStream 45s, GDELT 10min, ISS 180s) get negative caching layered on top — the negative cache only activates when the positive cache misses AND the upstream fails.

### 1.3 Feed Health State Expansion

**File**: `argus-app/src/store/useArgusStore.ts`

Expand `feedHealth[key]` from:
```typescript
{ status: "ok" | "error", lastSuccessAt: number, lastError: string | null }
```

To:
```typescript
{
  status: "ok" | "error" | "cooldown",
  freshness: "fresh" | "aging" | "stale" | "critical",
  lastSuccessAt: number,
  lastError: string | null,
  nextRefreshAt: number,
  consecutiveFailures: number,
  circuitState: "closed" | "open" | "half-open"
}
```

**Freshness computation** (elapsed = `Date.now() - lastSuccessAt`, expected = base poll interval):
- `fresh`: elapsed < 1x expected
- `aging`: elapsed 1-2x expected
- `stale`: elapsed 2-4x expected
- `critical`: elapsed > 4x expected

Freshness is derived (computed on read, not stored) to avoid stale state.

### 1.4 Health Panel UI

**Header Badge** (in `HudOverlay.tsx` header area):
- Compact text: "11/12" or "11/12 feeds"
- Color: green (all fresh/aging), yellow (any stale), red (any critical or error)
- Click action: opens/scrolls to Status workspace tab

**Upgraded Status Tab** (existing Status section in `HudOverlay.tsx`):
- Each feed row shows:
  - Feed name
  - Freshness dot (green/yellow/orange/red)
  - Last update as relative time ("2m ago", "14m ago")
  - Next refresh countdown ("in 45s")
  - Circuit breaker state badge (only shown if not `closed`)
  - Consecutive error count (only shown if > 0)
- Sort order: errors/critical first, then stale, then aging, then fresh
- Total counts at top: "10 fresh, 1 aging, 1 error"

---

## 2. Analysis Layer

### 2.1 Welford Temporal Baselines

**File**: `argus-app/src/lib/analysis/baselines.ts`

Maintains running statistics per `(eventType, region)` pair using Welford's online algorithm for numerically stable variance computation.

**Tracked metrics** (examples):
- Military flights in EUCOM per hour
- GDELT articles mentioning a country per 15min
- Seismic events in Pacific per day
- OTX threat pulses per region per hour
- News article volume per region per poll

**State per metric**:
```typescript
interface BaselineStat {
  count: number;    // observations seen
  mean: number;     // running mean
  m2: number;       // sum of squared deviations (for variance)
  lastUpdated: number;
}
```

**Update** (on each poll observation):
```
count += 1
delta = observed - mean
mean += delta / count
delta2 = observed - mean
m2 += delta * delta2
```

**Deviation query**:
```
variance = m2 / (count - 1)
sigma = sqrt(variance)
zScore = (observed - mean) / sigma
```

**Minimum sample size**: Require `count >= 20` before reporting deviations. Before that, return `null` z-score to prevent false alarms during cold start.

**Region bucketing**: Use existing combatant command regions (CENTCOM, EUCOM, INDOPACOM, AFRICOM, SOUTHCOM, NORTHCOM) plus "GLOBAL" for non-geographic metrics. Country-level bucketing for CII inputs.

**Persistence**: Serialize baseline state to `localStorage` under key `argus_baselines`. Restore on page load. Baselines stabilize within a few hours of continuous polling. If cleared, cold start from scratch.

### 2.2 Country Instability Index (CII)

**File**: `argus-app/src/lib/analysis/cii.ts`

Composite 0-100 score per country, recomputed every 15 minutes (aligned with GDELT poll).

**Input signals (weighted)**:

| Signal | Weight | Source | Normalization |
|--------|--------|--------|---------------|
| GDELT tone/Goldstein | 40% | GDELT feed | Negative avg tone → 0-100, low Goldstein → high score |
| Military flight density | 15% | ADS-B military | σ-deviation from Welford baseline → 0-100 |
| Economic stress | 15% | FRED data | Unemployment/inflation deviation from mean → 0-100 |
| Cyber threat density | 10% | OTX pulses | Count of IOCs targeting country → 0-100 |
| Internet outages | 10% | Cloudflare Radar | Outage severity in country → 0-100 |
| Seismic stress | 10% | USGS | Cumulative magnitude near country → 0-100 |

**Country mapping**: Static ISO-3166 country code → bounding box lookup table. Reverse-map event coordinates to countries via point-in-bbox test (fast, no API calls). Simplified — a few edge cases at borders are acceptable.

**Computation flow**:
1. Gather latest data from each feed (already in Zustand store)
2. Filter/aggregate events per country
3. Normalize each signal to 0-100
4. Apply weights, sum to composite score
5. Store in Zustand: `ciiScores: Record<string, { score: number, signals: Record<string, number>, updatedAt: number }>`

**Visualization**:

*Default mode* — Hotspot markers only:
- Only countries scoring >60 shown
- Pulsing circle marker at country centroid
- Size proportional to score (60-100 mapped to small-large)
- Color: orange (60-80), red (80-100)
- Click shows breakdown card with per-signal scores

*Toggle-on mode* — Full choropleth:
- New layer toggle "Instability" in layer panel
- Country polygons from simplified GeoJSON (~200KB, loaded on-demand)
- 5-stop color gradient: green (0-20), yellow (20-40), orange (40-60), red (60-80), dark red (80-100)
- Cesium `GeoJsonDataSource` with per-feature color based on CII score
- Z-fighting prevention: polygon altitude slightly below other layers

**Layer files**:
- `argus-app/src/lib/cesium/layers/ciiLayer.ts` — Cesium layer class following existing pattern
- GeoJSON asset: `argus-app/public/data/countries-simplified.geojson`

### 2.3 Five-Stage Corroboration Engine

**File**: `argus-app/src/lib/analysis/corroboration.ts`

Maintains a rolling window of events bucketed by (region, time-window) and counts independent source domains reporting.

**Source domains** (8 independent domains):

| Domain | Feeds |
|--------|-------|
| News | RSS aggregator |
| GDELT | GDELT events |
| Military | ADS-B military |
| Seismic | USGS + GDACS |
| Maritime | AISStream |
| Economic | FRED |
| Cyber | OTX + ThreatRadar |
| Infrastructure | Cloudflare Radar |

Two sources from the same domain count as one signal. Independence requires different domain types.

**Stage definitions**:

| Stage | Name | Criteria | UI Treatment |
|-------|------|----------|-------------|
| 1 | Raw Signal | Single domain reports event | Subdued feed item |
| 2 | Developing | Welford baseline detects >2σ spike in any metric for the region | Yellow "developing" tag in feed |
| 3 | Corroborated | 2+ independent domains report within 2-hour window for same region | Yellow highlight card, keyword badge |
| 4 | High Confidence | 3+ independent domains converge, OR economic indicators align with kinetic signals | Orange card with multi-source summary |
| 5 | Strategic Alert | Stage 4 conditions met AND country CII >60 | Red alert card, header badge pulses, browser Notification API (if permitted) |

**Event ingestion**:
Each poll result feeds events into the engine:
```typescript
interface CorroborationEvent {
  domain: SourceDomain;
  region: string;         // combatant command or country ISO
  timestamp: number;
  severity: number;       // 0-1 normalized
  keywords: string[];     // extracted terms for matching
}
```

**Window management**:
- 2-hour sliding windows per region
- Events older than 2 hours are evicted
- Stage re-evaluated on each new event ingestion
- Stage can only escalate within a window, never de-escalate (a window that reached Stage 4 stays there until it expires)

**Stage transitions emit to store**:
```typescript
interface Alert {
  id: string;
  stage: 1 | 2 | 3 | 4 | 5;
  region: string;
  domains: SourceDomain[];
  keywords: string[];
  summary: string;
  createdAt: number;
  updatedAt: number;
}
```

Stored in Zustand as `alerts: Alert[]`, sorted by stage descending then recency.

### 2.4 Breaking News Pipeline

**File**: `argus-app/src/lib/analysis/breakingNews.ts`

Specialized pipeline sitting on top of the corroboration engine, specifically for news-driven events:

1. **RSS ingestion**: On each news poll, extract keywords from new headlines
2. **Spike detection**: Compare keyword frequencies against Welford baselines. Flag keywords exceeding 2σ.
3. **Hotspot check**: Query corroboration engine — is this region already accumulating signals from other domains?
4. **Cross-domain verification**: If spiking keywords match a region with non-news domain signals, escalate
5. **Breaking card generation**: Produce a "BREAKING" card with: headline cluster, source count, corroboration domains, confidence stage, timestamp

This prevents a single viral story from triggering high-level alerts without independent confirmation from non-news domains.

### 2.5 News Clustering — Jaccard Similarity

**File**: `argus-app/src/lib/analysis/newsClustering.ts`

Groups near-duplicate headlines from the news feed:

**Algorithm**:
1. For each news item, compute token set: lowercase, remove punctuation, filter stopwords, stem to first 10 significant tokens (reuse existing `titleSignature` logic from `news/route.ts`)
2. Pairwise Jaccard similarity: `|A ∩ B| / |A ∪ B|`
3. Threshold: similarity > 0.4 → cluster together
4. Use union-find to merge transitive clusters (A~B and B~C → A,B,C in one cluster)

**Display**:
- Show cluster lead (highest-scored item) as the primary card
- Badge: "+N related articles" if cluster size > 1
- Expandable: click badge to see all clustered items
- Clustering runs client-side on each news poll result (n typically 10-50 items, O(n²) is fine)

**Integration**: Applied in `HudOverlay.tsx` when rendering news feed items, before display. Does not modify the raw data in the store.

---

## 3. New Data Sources (Feed Panel Only)

All new sources appear in the sidebar feed panel only — no globe markers.

### 3.1 ACLED — Armed Conflict Events

**API route**: `argus-app/src/app/api/feeds/acled/route.ts`
**Endpoint**: ACLED API (`acleddata.com/acled/curated-data-files/`)
**Auth**: API key (env var `ACLED_API_KEY` + email `ACLED_EMAIL`)
**Poll interval**: 30 minutes
**Data shape**:
```typescript
interface AcledEvent {
  event_type: "Battles" | "Protests" | "Riots" | "Violence against civilians" | "Explosions/Remote violence" | "Strategic developments";
  country: string;
  location: string;
  fatalities: number;
  actors: string[];
  date: string;
  notes: string;
}
```
**Feed panel**: Grouped by region, sorted by recency. Card shows event type icon, location, fatality count if >0, actors. Color-coded border by event type.
**Corroboration domain**: Adds as a 9th independent domain "Conflict" (distinct from GDELT which is news-derived). Updates domain table to 9 domains.
**CII contribution**: Can supplement the GDELT signal — conflict events directly indicate instability.

### 3.2 Polymarket — Prediction Markets

**API route**: `argus-app/src/app/api/feeds/polymarket/route.ts`
**Endpoint**: Polymarket Gamma API (public, no key)
**Poll interval**: 5 minutes
**Data shape**:
```typescript
interface PolymarketEvent {
  question: string;
  probability: number;     // 0-1
  change24h: number;       // delta from 24h ago
  volume: number;          // total volume in USD
  category: string;
  endDate: string;
}
```
**Feed panel**: Sorted by volume. Card shows question text, probability bar (visual), trend arrow with 24h change, volume. Filter to geopolitical/conflict/election categories on the server side.
**Corroboration**: Not integrated into scoring for v1. Display only — forward-looking sentiment indicator.

### 3.3 GDACS — Natural Disasters

**API route**: `argus-app/src/app/api/feeds/gdacs/route.ts`
**Endpoint**: GDACS RSS feed (`gdacs.org/xml/rss.xml`, public, no key)
**Poll interval**: 10 minutes
**Data shape**:
```typescript
interface GdacsEvent {
  type: "EQ" | "FL" | "TC" | "VO" | "DR";  // earthquake, flood, tropical cyclone, volcano, drought
  severity: "green" | "orange" | "red";
  country: string;
  title: string;
  populationExposed: number;
  date: string;
  lat: number;
  lon: number;
}
```
**Feed panel**: Severity-colored left border (green/orange/red), disaster type icon, country, alert level, population at risk.
**Deduplication against USGS**: For earthquake events, check if USGS already has an event within ±50km and ±30min with similar magnitude (±0.5). If so, skip the GDACS duplicate.
**Corroboration domain**: Events feed into the existing "Seismic" domain (expanded to "Seismic/Environmental").

### 3.4 FAA Delays + NOTAM

**API route**: `argus-app/src/app/api/feeds/faa/route.ts`
**Endpoint**: FAA Airport Status Service API (public, no key) + FAA NOTAM API
**Poll interval**: 10 minutes
**Data shape**:
```typescript
interface FaaDelay {
  airport: string;          // IATA code
  delayType: "ground_stop" | "ground_delay" | "airspace_flow" | "closure";
  reason: string;
  avgDelay: string;         // e.g., "45 minutes"
}

interface Notam {
  id: string;
  location: string;
  type: "TFR" | "RESTRICTED" | "WARNING" | "OTHER";
  effectiveStart: string;
  effectiveEnd: string;
  description: string;
}
```
**Feed panel**: Airport delays as compact cards (airport code, delay type, reason, avg time). NOTAMs filtered to TFRs and restricted airspace only (most intelligence-relevant). TFR cards flagged as potentially interesting for military/VIP activity detection.
**Corroboration domain**: Feeds into corroboration as part of the "Military" domain (TFRs often correlate with military activity).

---

## 4. Bug Fixes

### 4.1 GDELT Lat/Lon Filter

**File**: `argus-app/src/app/api/feeds/gdelt/route.ts`, line 77

**Current** (buggy):
```typescript
if (!lat || !lon || (lat === 0 && lon === 0)) continue;
```

**Fix**:
```typescript
if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;
```

`!0` is `true` in JavaScript, so the current code rejects valid events at latitude 0 (equator) or longitude 0 (prime meridian). `isNaN` correctly catches unparseable values while preserving valid zero coordinates. The `(0, 0)` sentinel check remains — GDELT uses exact `0, 0` as a placeholder for unknown locations.

### 4.2 Playback Routes — Column Name Mismatch

**File**: `argus-api/src/routes/playback.js`

The Codex review identified that playback queries reference `ts` but TimescaleDB continuous aggregates expose `bucket` as the time column. Need to verify the actual schema in `infra/db/init.sql` and fix all 6 playback endpoints + the range query to use the correct column name consistently.

Affected locations:
- Range query (lines 225-226): `MIN(ts)` / `MAX(ts)` → likely `MIN(bucket)` / `MAX(bucket)`
- Quakes query: `ts AS timestamp` → `bucket AS timestamp`
- All 6 endpoint ORDER BY clauses if they reference the wrong column

### 4.3 GDELT Signal Filter Logic

**File**: `argus-app/src/app/api/feeds/gdelt/route.ts`, line 84

Verify intent of: `if (goldsteinScale > -5 && goldsteinScale < 7 && numMentions < 5) continue;`

This filters OUT events where Goldstein is between -5 and 7 AND mentions < 5. Read in context: it removes low-signal, moderate-tone events (the noise). Events with extreme Goldstein scores OR high mention counts are kept. This logic appears intentionally correct — it's filtering noise, not signal. Verify by reading surrounding comments and testing with sample data before changing.

---

## 5. Implementation Order

**Phase 1 — Infrastructure** (foundation for everything else):
1. Bug fixes (GDELT lat/lon, playback columns, GDELT filter verification)
2. Smart polling engine rewrite (backoff, throttle, circuit breakers, jitter)
3. Negative cache utility + integration into existing API routes
4. Feed health state expansion in Zustand store
5. Health panel UI (header badge + upgraded Status tab)

**Phase 2 — Analysis Engine**:
6. Welford temporal baselines
7. Country Instability Index (CII) computation + API route
8. CII visualization layer (hotspot markers + toggle choropleth)
9. Corroboration engine (5-stage)
10. Breaking news pipeline
11. News clustering (Jaccard)

**Phase 3 — New Data Sources**:
12. ACLED feed + panel cards
13. Polymarket feed + panel cards
14. GDACS feed + panel cards + USGS dedup
15. FAA delays/NOTAM feed + panel cards

**Phase 4 — Integration**:
16. Wire new feeds into corroboration engine
17. Wire ACLED + GDACS into CII scoring
18. Alert display in HUD (stage-colored cards, header badge pulsing, browser notifications)
19. End-to-end testing of corroboration pipeline
