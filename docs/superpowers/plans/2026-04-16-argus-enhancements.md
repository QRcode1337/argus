# Argus Intelligence Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add infrastructure resilience (smart polling, circuit breakers, negative caching, health panel), analysis intelligence (Welford baselines, CII scoring, 5-stage corroboration, breaking news pipeline, news clustering), four new feed-panel-only data sources (ACLED, Polymarket, GDACS, FAA), and fix three known bugs.

**Architecture:** Phased bottom-up build. Phase 1 lays infrastructure (polling engine, caching, health UI). Phase 2 builds the analysis layer on top (baselines, CII, corroboration). Phase 3 adds new data sources as feed-panel items. Phase 4 wires new sources into the analysis engine. Each phase is independently shippable.

**Tech Stack:** TypeScript, Next.js 14 App Router, React, Cesium.js, Zustand, D3.js

**Spec:** `docs/superpowers/specs/2026-04-16-argus-enhancements-design.md`

---

## File Structure

### New Files

```
argus-app/src/lib/ingest/pollingManager.ts        (rewrite — smart polling engine)
argus-app/src/lib/cache/negativeCache.ts           (negative cache utility)
argus-app/src/lib/analysis/baselines.ts            (Welford temporal baselines)
argus-app/src/lib/analysis/cii.ts                  (Country Instability Index)
argus-app/src/lib/analysis/corroboration.ts        (5-stage corroboration engine)
argus-app/src/lib/analysis/breakingNews.ts         (breaking news pipeline)
argus-app/src/lib/analysis/newsClustering.ts       (Jaccard similarity clustering)
argus-app/src/lib/analysis/countryLookup.ts        (ISO country → bbox/centroid mapping)
argus-app/src/lib/cesium/layers/ciiLayer.ts        (CII globe layer)
argus-app/src/app/api/feeds/acled/route.ts         (ACLED API route)
argus-app/src/app/api/feeds/polymarket/route.ts    (Polymarket API route)
argus-app/src/app/api/feeds/gdacs/route.ts         (GDACS API route)
argus-app/src/app/api/feeds/faa/route.ts           (FAA delays + NOTAM route)
argus-app/public/data/countries-simplified.geojson  (country boundaries for CII choropleth)
```

### Modified Files

```
argus-app/src/types/intel.ts                       (expand FeedKey, FeedHealth, LayerKey types)
argus-app/src/lib/config.ts                        (add new feed endpoints + poll intervals)
argus-app/src/store/useArgusStore.ts               (expanded health state, CII scores, alerts, new feed keys)
argus-app/src/components/HudOverlay.tsx             (health badge, upgraded status tab, alert cards, new feed panels, news clusters)
argus-app/src/components/CesiumGlobe.tsx            (CII layer init, new polling tasks, corroboration wiring)
argus-app/src/app/api/feeds/gdelt/route.ts         (lat/lon bug fix)
argus-api/src/routes/playback.js                   (ts→bucket column fix)
```

---

## Phase 1: Infrastructure

### Task 1: Bug Fixes

**Files:**
- Modify: `argus-app/src/app/api/feeds/gdelt/route.ts:77`
- Modify: `argus-api/src/routes/playback.js:152,155,225-238`

- [ ] **Step 1: Fix GDELT lat/lon filter**

In `argus-app/src/app/api/feeds/gdelt/route.ts`, line 77, replace:
```typescript
if (!lat || !lon || (lat === 0 && lon === 0)) continue;
```
with:
```typescript
if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;
```

- [ ] **Step 2: Fix playback quakes query — ts→bucket**

In `argus-api/src/routes/playback.js`, line 152, replace:
```javascript
        ts        AS timestamp
```
with:
```javascript
        bucket    AS timestamp
```

- [ ] **Step 3: Fix playback range query — ts→bucket**

In `argus-api/src/routes/playback.js`, lines 225-238, replace every occurrence of `SELECT ts FROM` with `SELECT bucket FROM`, and replace `MIN(ts)` / `MAX(ts)` with `MIN(bucket)` / `MAX(bucket)`:

```javascript
    const sql = `
      SELECT
        MIN(bucket) AS earliest,
        MAX(bucket) AS latest
      FROM (
        SELECT bucket FROM recorded_flights_1m
        UNION ALL
        SELECT bucket FROM recorded_military_1m
        UNION ALL
        SELECT bucket FROM recorded_satellites_1m
        UNION ALL
        SELECT bucket FROM recorded_quakes_1m
        UNION ALL
        SELECT bucket FROM recorded_outages_1m
        UNION ALL
        SELECT bucket FROM recorded_threats_1m
      ) AS recorded`;
```

- [ ] **Step 4: Verify GDELT signal filter logic**

Read `argus-app/src/app/api/feeds/gdelt/route.ts` line 84 in context. The filter `if (goldsteinScale > -5 && goldsteinScale < 7 && numMentions < 5) continue;` skips events that are both moderate-tone AND low-mention — keeping only extreme events or widely-reported ones. This is correct behavior (filtering noise). No change needed. Document this in a code comment:

```typescript
    // Filter to high-signal events: keep extreme Goldstein (≤-5 or ≥7) OR widely-mentioned (≥5)
    if (goldsteinScale > -5 && goldsteinScale < 7 && numMentions < 5) continue;
```

- [ ] **Step 5: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add argus-app/src/app/api/feeds/gdelt/route.ts argus-api/src/routes/playback.js
git commit -m "fix: GDELT lat/lon filter for equator/prime meridian, playback ts→bucket columns"
```

---

### Task 2: Smart Polling Engine

**Files:**
- Rewrite: `argus-app/src/lib/ingest/pollingManager.ts`
- Modify: `argus-app/src/components/CesiumGlobe.tsx:1285` (update PollingManager usage)

- [ ] **Step 1: Rewrite pollingManager.ts**

Replace the entire file `argus-app/src/lib/ingest/pollingManager.ts` with:

```typescript
export type PollingTask = {
  id: string;
  intervalMs: number;
  run: () => Promise<void>;
};

type CircuitState = "closed" | "open" | "half-open";

interface FeedState {
  task: PollingTask;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  consecutiveFailures: number;
  circuitState: CircuitState;
  cooldownUntil: number;
  currentIntervalMs: number;
}

const BACKOFF_CAP = 4;          // max multiplier on base interval
const CIRCUIT_OPEN_THRESHOLD = 2; // consecutive failures to open circuit
const COOLDOWN_MS = 5 * 60_000;   // 5 min circuit breaker cooldown
const HIDDEN_TAB_MULTIPLIER = 5;
const JITTER_RANGE = 0.1;         // ±10%

export class PollingManager {
  private feeds = new Map<string, FeedState>();
  private tabHidden = false;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        this.tabHidden = document.hidden;
        // Reschedule all feeds with new multiplier
        for (const state of this.feeds.values()) {
          if (state.timer !== null) {
            clearTimeout(state.timer);
            state.timer = null;
            this.scheduleNext(state);
          }
        }
      });
    }
  }

  add(task: PollingTask): void {
    if (this.feeds.has(task.id)) return;

    const state: FeedState = {
      task,
      timer: null,
      inFlight: false,
      consecutiveFailures: 0,
      circuitState: "closed",
      cooldownUntil: 0,
      currentIntervalMs: task.intervalMs,
    };

    this.feeds.set(task.id, state);
    void this.execute(state);
  }

  stop(id: string): void {
    const state = this.feeds.get(id);
    if (!state) return;
    if (state.timer !== null) clearTimeout(state.timer);
    this.feeds.delete(id);
  }

  stopAll(): void {
    for (const id of this.feeds.keys()) {
      this.stop(id);
    }
  }

  getState(id: string): { consecutiveFailures: number; circuitState: CircuitState } | null {
    const state = this.feeds.get(id);
    if (!state) return null;
    return {
      consecutiveFailures: state.consecutiveFailures,
      circuitState: state.circuitState,
    };
  }

  private computeInterval(state: FeedState): number {
    let ms = state.currentIntervalMs;
    if (this.tabHidden) ms *= HIDDEN_TAB_MULTIPLIER;
    // Jitter: ±10%
    const jitter = 1 + (Math.random() * 2 - 1) * JITTER_RANGE;
    return Math.round(ms * jitter);
  }

  private scheduleNext(state: FeedState): void {
    const delay = this.computeInterval(state);
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.execute(state);
    }, delay);
  }

  private async execute(state: FeedState): Promise<void> {
    if (state.inFlight) return;

    // Circuit breaker check
    if (state.circuitState === "open") {
      if (Date.now() < state.cooldownUntil) {
        this.scheduleNext(state);
        return;
      }
      // Cooldown expired → half-open (probe)
      state.circuitState = "half-open";
    }

    state.inFlight = true;
    try {
      await state.task.run();
      // Success: reset backoff + circuit
      state.consecutiveFailures = 0;
      state.currentIntervalMs = state.task.intervalMs;
      state.circuitState = "closed";
    } catch {
      state.consecutiveFailures++;
      // Exponential backoff (capped)
      const backoffMultiplier = Math.min(
        BACKOFF_CAP,
        Math.pow(2, state.consecutiveFailures - 1),
      );
      state.currentIntervalMs = state.task.intervalMs * backoffMultiplier;

      // Circuit breaker
      if (state.consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD) {
        state.circuitState = "open";
        state.cooldownUntil = Date.now() + COOLDOWN_MS;
      }
    } finally {
      state.inFlight = false;
      // Only schedule if still registered
      if (this.feeds.has(state.task.id)) {
        this.scheduleNext(state);
      }
    }
  }
}
```

Key changes from original:
- `setInterval` → `setTimeout` chain (allows dynamic interval changes)
- Exponential backoff on failure (2x, capped at 4x)
- Circuit breaker (closed → open after 2 failures → half-open after 5min)
- Hidden-tab throttle via `visibilitychange` (5x slower)
- ±10% jitter on all intervals
- `getState()` method to expose circuit state to UI

- [ ] **Step 2: Verify CesiumGlobe.tsx compatibility**

The existing `poller.add({ id, intervalMs, run })` call signature is unchanged. The `PollingTask` type is identical. No changes needed to `CesiumGlobe.tsx` for basic compatibility.

However, we need to make poll tasks throw on failure so the circuit breaker can catch them. Currently, each poll task catches its own errors and calls `setFeedError()`. We need to re-throw after calling `setFeedError()`.

In `argus-app/src/components/CesiumGlobe.tsx`, for each poller.add block that has a try/catch with `setFeedError`, add a re-throw. For example, the opensky block (around line 1334-1338):

Find:
```typescript
          setFeedError(
            "opensky",
            error instanceof Error ? error.message : "Failed to fetch OpenSky",
          );
```

After each `setFeedError(...)` call in a catch block, add:
```typescript
          throw error;
```

Apply this pattern to every feed's catch block in CesiumGlobe.tsx (opensky, adsb, celestrak, usgs, cfradar, otx, fred, ais, gdelt, threatradar). Each catch block should call `setFeedError()` then re-throw so the PollingManager can track failures for circuit breaking.

- [ ] **Step 3: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/lib/ingest/pollingManager.ts argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat: smart polling engine with backoff, circuit breakers, tab throttle, jitter"
```

---

### Task 3: Negative Cache

**Files:**
- Create: `argus-app/src/lib/cache/negativeCache.ts`

- [ ] **Step 1: Create the negativeCache utility**

Create `argus-app/src/lib/cache/negativeCache.ts`:

```typescript
interface CacheEntry<T> {
  data: T | null;
  error: string | null;
  cachedAt: number;
  isNegative: boolean;
}

interface NegativeCacheOptions {
  /** TTL for negative (failure) entries in ms. Default: 120_000 (2 min) */
  negativeTtlMs?: number;
  /** TTL for positive (success) entries in ms. Default: 0 (no positive caching) */
  positiveTtlMs?: number;
}

export class NegativeCache<T> {
  private entry: CacheEntry<T> | null = null;
  private readonly negativeTtlMs: number;
  private readonly positiveTtlMs: number;

  constructor(options: NegativeCacheOptions = {}) {
    this.negativeTtlMs = options.negativeTtlMs ?? 120_000;
    this.positiveTtlMs = options.positiveTtlMs ?? 0;
  }

  /**
   * Wrap a fetch function with negative caching.
   * On success: caches result, returns it.
   * On failure: if cached result exists (positive or negative), returns stale data with metadata.
   *             If no cached result, caches the failure and throws.
   */
  async fetch(fn: () => Promise<T>): Promise<T & { _stale?: boolean; _cached_at?: number; _error?: string }> {
    // Check positive cache
    if (this.entry && !this.entry.isNegative && this.positiveTtlMs > 0) {
      if (Date.now() - this.entry.cachedAt < this.positiveTtlMs) {
        return this.entry.data as T;
      }
    }

    // Check negative cache (don't even try upstream)
    if (this.entry?.isNegative) {
      if (Date.now() - this.entry.cachedAt < this.negativeTtlMs) {
        if (this.entry.data) {
          return {
            ...(this.entry.data as T & object),
            _stale: true,
            _cached_at: this.entry.cachedAt,
            _error: this.entry.error ?? undefined,
          } as T & { _stale?: boolean; _cached_at?: number; _error?: string };
        }
        throw new Error(this.entry.error ?? "Upstream unavailable (negative cached)");
      }
    }

    try {
      const result = await fn();
      this.entry = { data: result, error: null, cachedAt: Date.now(), isNegative: false };
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Store negative entry, preserving last good data if any
      const lastGoodData = this.entry?.data ?? null;
      this.entry = { data: lastGoodData, error: errorMsg, cachedAt: Date.now(), isNegative: true };

      if (lastGoodData) {
        return {
          ...(lastGoodData as T & object),
          _stale: true,
          _cached_at: this.entry.cachedAt,
          _error: errorMsg,
        } as T & { _stale?: boolean; _cached_at?: number; _error?: string };
      }
      throw err;
    }
  }
}
```

- [ ] **Step 2: Integrate into an existing API route (GDELT as example)**

In `argus-app/src/app/api/feeds/gdelt/route.ts`, the route already has an in-memory cache. Add negative caching on top. Near the top of the file (after imports), add:

```typescript
import { NegativeCache } from "@/lib/cache/negativeCache";

const negCache = new NegativeCache<ParsedEvent[]>({ negativeTtlMs: 5 * 60_000 });
```

Then wrap the main fetch logic inside the GET handler to use `negCache.fetch()`. The existing positive cache can remain — negative cache wraps around the whole fetch path as a fallback.

Apply the same pattern to other API routes that lack caching: news, fred, otx, celestrak, usgs, cloudflare-radar. Each gets its own `NegativeCache` instance with appropriate TTL.

- [ ] **Step 3: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/lib/cache/negativeCache.ts argus-app/src/app/api/feeds/gdelt/route.ts
git commit -m "feat: negative cache utility, integrated into GDELT and uncached feed routes"
```

---

### Task 4: Feed Health State Expansion

**Files:**
- Modify: `argus-app/src/types/intel.ts:15,49-55`
- Modify: `argus-app/src/store/useArgusStore.ts:42,113-117,148-160`
- Modify: `argus-app/src/lib/config.ts:23-37`

- [ ] **Step 1: Expand types in intel.ts**

In `argus-app/src/types/intel.ts`, replace:

```typescript
export type FeedKey = "opensky" | "celestrak" | "usgs" | "adsb" | "cfradar" | "otx" | "fred" | "ais" | "gdelt" | "threatradar" | "phantom";
```

with:

```typescript
export type FeedKey = "opensky" | "celestrak" | "usgs" | "adsb" | "cfradar" | "otx" | "fred" | "ais" | "gdelt" | "threatradar" | "phantom" | "acled" | "polymarket" | "gdacs" | "faa" | "news";
```

Replace:

```typescript
export type FeedStatus = "idle" | "ok" | "stale" | "error";

export interface FeedHealth {
  status: FeedStatus;
  lastSuccessAt: number | null;
  lastError: string | null;
}
```

with:

```typescript
export type FeedStatus = "idle" | "ok" | "error" | "cooldown";
export type FeedFreshness = "fresh" | "aging" | "stale" | "critical";
export type CircuitState = "closed" | "open" | "half-open";

export interface FeedHealth {
  status: FeedStatus;
  lastSuccessAt: number | null;
  lastError: string | null;
  nextRefreshAt: number | null;
  consecutiveFailures: number;
  circuitState: CircuitState;
}
```

- [ ] **Step 2: Add freshness computation helper and poll interval map**

Add to `argus-app/src/lib/config.ts` after the existing `ARGUS_CONFIG` export:

```typescript
/** Map from FeedKey to expected poll interval for freshness computation */
export const FEED_EXPECTED_INTERVAL: Record<string, number> = {
  opensky: ARGUS_CONFIG.pollMs.openSky,
  adsb: ARGUS_CONFIG.pollMs.adsbMilitary,
  celestrak: ARGUS_CONFIG.pollMs.satellites,
  usgs: ARGUS_CONFIG.pollMs.usgs,
  cfradar: ARGUS_CONFIG.pollMs.cloudflareRadar,
  otx: ARGUS_CONFIG.pollMs.otx,
  fred: ARGUS_CONFIG.pollMs.fred,
  ais: ARGUS_CONFIG.pollMs.aisstream,
  gdelt: ARGUS_CONFIG.pollMs.gdelt,
  news: ARGUS_CONFIG.pollMs.news,
  threatradar: ARGUS_CONFIG.pollMs.threatRadar,
  phantom: ARGUS_CONFIG.pollMs.phantom,
  acled: 30 * 60_000,
  polymarket: 5 * 60_000,
  gdacs: 10 * 60_000,
  faa: 10 * 60_000,
};

export function computeFreshness(feedKey: string, lastSuccessAt: number | null): import("@/types/intel").FeedFreshness {
  if (!lastSuccessAt) return "critical";
  const expected = FEED_EXPECTED_INTERVAL[feedKey] ?? 60_000;
  const elapsed = Date.now() - lastSuccessAt;
  if (elapsed < expected) return "fresh";
  if (elapsed < expected * 2) return "aging";
  if (elapsed < expected * 4) return "stale";
  return "critical";
}
```

- [ ] **Step 3: Update Zustand store**

In `argus-app/src/store/useArgusStore.ts`, update the `emptyFeed` function:

```typescript
const emptyFeed = (): FeedHealth => ({
  status: "idle",
  lastSuccessAt: null,
  lastError: null,
  nextRefreshAt: null,
  consecutiveFailures: 0,
  circuitState: "closed",
});
```

Add the new feed keys to the `feedHealth` initialization (after `phantom: emptyFeed()`):

```typescript
    news: emptyFeed(),
    acled: emptyFeed(),
    polymarket: emptyFeed(),
    gdacs: emptyFeed(),
    faa: emptyFeed(),
```

Update `setFeedHealthy` to also reset circuit state:

```typescript
  setFeedHealthy: (key) =>
    set((s) => ({
      feedHealth: {
        ...s.feedHealth,
        [key]: {
          status: "ok",
          lastSuccessAt: Date.now(),
          lastError: null,
          nextRefreshAt: s.feedHealth[key]?.nextRefreshAt ?? null,
          consecutiveFailures: 0,
          circuitState: "closed",
        },
      },
    })),
```

Update `setFeedError` to track consecutive failures:

```typescript
  setFeedError: (key, message) =>
    set((s) => {
      const prev = s.feedHealth[key];
      const failures = (prev?.consecutiveFailures ?? 0) + 1;
      return {
        feedHealth: {
          ...s.feedHealth,
          [key]: {
            status: failures >= 2 ? "cooldown" : "error",
            lastSuccessAt: prev?.lastSuccessAt ?? null,
            lastError: message,
            nextRefreshAt: prev?.nextRefreshAt ?? null,
            consecutiveFailures: failures,
            circuitState: failures >= 2 ? "open" : prev?.circuitState ?? "closed",
          },
        },
      };
    }),
```

- [ ] **Step 4: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

Fix any type errors from the expanded FeedHealth interface (other files referencing `feedHealth` may need updates for the new required fields).

- [ ] **Step 5: Commit**

```bash
git add argus-app/src/types/intel.ts argus-app/src/lib/config.ts argus-app/src/store/useArgusStore.ts
git commit -m "feat: expand feed health state with freshness, circuit breaker, consecutive failures"
```

---

### Task 5: Health Panel UI

**Files:**
- Modify: `argus-app/src/components/HudOverlay.tsx:577-580,1715-1728`

- [ ] **Step 1: Add freshness import and header badge**

At the top of `HudOverlay.tsx`, add the import:

```typescript
import { computeFreshness } from "@/lib/config";
```

Near line 577-580 where `activeFeedCount` is computed, add freshness aggregation:

```typescript
  const feedEntries = Object.entries(feedHealth) as [string, FeedHealth][];
  const activeFeedCount = feedEntries.filter(([, fh]) => fh.status === "ok").length;
  const feedTotal = feedEntries.length;

  const feedFreshnessCounts = feedEntries.reduce(
    (acc, [key, fh]) => {
      const f = computeFreshness(key, fh.lastSuccessAt);
      acc[f]++;
      return acc;
    },
    { fresh: 0, aging: 0, stale: 0, critical: 0 },
  );

  const healthBadgeColor =
    feedFreshnessCounts.critical > 0 || feedEntries.some(([, fh]) => fh.status === "error" || fh.status === "cooldown")
      ? "text-red-400"
      : feedFreshnessCounts.stale > 0
        ? "text-yellow-400"
        : "text-green-400";
```

- [ ] **Step 2: Add health badge to HUD header**

Find the header area in HudOverlay.tsx (look for the feed count display). Add a clickable health badge:

```tsx
<button
  onClick={() => setWorkspace("status")}
  className={`font-mono text-[10px] ${healthBadgeColor} hover:underline`}
  title={`${feedFreshnessCounts.fresh} fresh, ${feedFreshnessCounts.aging} aging, ${feedFreshnessCounts.stale} stale, ${feedFreshnessCounts.critical} critical`}
>
  {activeFeedCount}/{feedTotal} feeds
</button>
```

- [ ] **Step 3: Upgrade the Status tab**

Replace the Status section content (lines ~1718-1728) with a richer display. Replace the static feed list with:

```tsx
{workspace === "status" && (
<CollapsibleSection title="Status" badge={`${activeFeedCount}/${feedTotal}`}>
  <div className="space-y-1.5">
    <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 font-mono text-[10px] text-[#7fb4c5]">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">Feed Health</div>
      <div className="mb-1.5 text-[9px] text-[#a89984]">
        {feedFreshnessCounts.fresh} fresh &middot; {feedFreshnessCounts.aging} aging &middot; {feedFreshnessCounts.stale} stale &middot; {feedFreshnessCounts.critical} critical
      </div>
      {feedEntries
        .sort(([aKey, a], [bKey, b]) => {
          const order = { error: 0, cooldown: 1, idle: 2, ok: 3 };
          const aOrd = order[a.status] ?? 2;
          const bOrd = order[b.status] ?? 2;
          if (aOrd !== bOrd) return aOrd - bOrd;
          // Within same status, sort by staleness
          return (a.lastSuccessAt ?? 0) - (b.lastSuccessAt ?? 0);
        })
        .map(([key, fh]) => {
          const freshness = computeFreshness(key, fh.lastSuccessAt);
          const dotColor =
            freshness === "fresh" ? "bg-green-400"
            : freshness === "aging" ? "bg-yellow-400"
            : freshness === "stale" ? "bg-orange-400"
            : "bg-red-400";
          const ago = fh.lastSuccessAt
            ? `${Math.round((Date.now() - fh.lastSuccessAt) / 1000)}s ago`
            : "never";
          return (
            <div key={key} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
                <span>{key}</span>
              </div>
              <div className="flex items-center gap-2 text-[#a89984]">
                <span>{ago}</span>
                {fh.circuitState !== "closed" && (
                  <span className="rounded bg-red-900/50 px-1 text-[8px] text-red-300">
                    {fh.circuitState}
                  </span>
                )}
                {fh.consecutiveFailures > 0 && (
                  <span className="text-red-400">({fh.consecutiveFailures}x)</span>
                )}
              </div>
            </div>
          );
        })}
    </div>
  </div>
</CollapsibleSection>
)}
```

- [ ] **Step 4: Run type check and verify in browser**

```bash
cd argus-app && npx tsc --noEmit
```

Start the dev server and verify:
- Header shows "N/M feeds" with correct color
- Clicking badge opens Status tab
- Status tab shows freshness dots, relative timestamps, circuit state badges
- Feeds sort by error state first

- [ ] **Step 5: Commit**

```bash
git add argus-app/src/components/HudOverlay.tsx
git commit -m "feat: data source health panel with freshness tracking, header badge, upgraded status tab"
```

---

## Phase 2: Analysis Engine

### Task 6: Welford Temporal Baselines

**Files:**
- Create: `argus-app/src/lib/analysis/baselines.ts`

- [ ] **Step 1: Create baselines.ts**

Create `argus-app/src/lib/analysis/baselines.ts`:

```typescript
const STORAGE_KEY = "argus_baselines";
const MIN_SAMPLES = 20;

export interface BaselineStat {
  count: number;
  mean: number;
  m2: number;
  lastUpdated: number;
}

export type BaselineKey = `${string}:${string}`; // "eventType:region"

export class BaselineTracker {
  private stats = new Map<BaselineKey, BaselineStat>();

  constructor() {
    this.load();
  }

  /** Record an observation for a given metric key */
  observe(key: BaselineKey, value: number): void {
    let stat = this.stats.get(key);
    if (!stat) {
      stat = { count: 0, mean: 0, m2: 0, lastUpdated: 0 };
      this.stats.set(key, stat);
    }

    stat.count++;
    const delta = value - stat.mean;
    stat.mean += delta / stat.count;
    const delta2 = value - stat.mean;
    stat.m2 += delta * delta2;
    stat.lastUpdated = Date.now();
  }

  /** Get the z-score for an observed value. Returns null if insufficient samples. */
  zScore(key: BaselineKey, observed: number): number | null {
    const stat = this.stats.get(key);
    if (!stat || stat.count < MIN_SAMPLES) return null;

    const variance = stat.m2 / (stat.count - 1);
    if (variance === 0) return 0;
    const sigma = Math.sqrt(variance);
    return (observed - stat.mean) / sigma;
  }

  /** Get raw stats for a key */
  get(key: BaselineKey): BaselineStat | undefined {
    return this.stats.get(key);
  }

  /** Get mean for a key, or null if no data */
  getMean(key: BaselineKey): number | null {
    return this.stats.get(key)?.mean ?? null;
  }

  /** Persist to localStorage */
  save(): void {
    try {
      const data = Object.fromEntries(this.stats.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage quota exceeded — silently skip
    }
  }

  /** Restore from localStorage */
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, BaselineStat>;
      for (const [key, stat] of Object.entries(data)) {
        this.stats.set(key as BaselineKey, stat);
      }
    } catch {
      // Corrupted data — start fresh
    }
  }
}

/** Singleton instance */
export const baselines = new BaselineTracker();
```

- [ ] **Step 2: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/lib/analysis/baselines.ts
git commit -m "feat: Welford temporal baseline tracker with localStorage persistence"
```

---

### Task 7: Country Lookup Table

**Files:**
- Create: `argus-app/src/lib/analysis/countryLookup.ts`

- [ ] **Step 1: Create country lookup**

Create `argus-app/src/lib/analysis/countryLookup.ts`:

```typescript
/** Simplified country bounding boxes + centroids for CII mapping.
 *  Uses point-in-bbox for fast reverse geocoding without API calls.
 *  Covers ~190 countries. Edge cases at borders are acceptable.
 */

export interface CountryInfo {
  iso: string;
  name: string;
  centroid: [number, number]; // [lat, lon]
  bbox: [number, number, number, number]; // [minLat, minLon, maxLat, maxLon]
  region: string; // CENTCOM, EUCOM, INDOPACOM, AFRICOM, SOUTHCOM, NORTHCOM
}

// Top ~60 countries by geopolitical relevance (expand as needed)
export const COUNTRIES: CountryInfo[] = [
  { iso: "US", name: "United States", centroid: [39.8, -98.5], bbox: [24.5, -125.0, 49.4, -66.9], region: "NORTHCOM" },
  { iso: "RU", name: "Russia", centroid: [61.5, 105.3], bbox: [41.2, 19.6, 81.9, 180.0], region: "EUCOM" },
  { iso: "CN", name: "China", centroid: [35.9, 104.2], bbox: [18.2, 73.5, 53.6, 135.1], region: "INDOPACOM" },
  { iso: "UA", name: "Ukraine", centroid: [48.4, 31.2], bbox: [44.4, 22.1, 52.4, 40.2], region: "EUCOM" },
  { iso: "IR", name: "Iran", centroid: [32.4, 53.7], bbox: [25.1, 44.0, 39.8, 63.3], region: "CENTCOM" },
  { iso: "IQ", name: "Iraq", centroid: [33.2, 43.7], bbox: [29.1, 38.8, 37.4, 48.6], region: "CENTCOM" },
  { iso: "SY", name: "Syria", centroid: [34.8, 39.0], bbox: [32.3, 35.7, 37.3, 42.4], region: "CENTCOM" },
  { iso: "IL", name: "Israel", centroid: [31.0, 34.9], bbox: [29.5, 34.3, 33.3, 35.9], region: "CENTCOM" },
  { iso: "SA", name: "Saudi Arabia", centroid: [23.9, 45.1], bbox: [16.4, 34.5, 32.2, 55.7], region: "CENTCOM" },
  { iso: "KP", name: "North Korea", centroid: [40.3, 127.5], bbox: [37.7, 124.2, 43.0, 130.7], region: "INDOPACOM" },
  { iso: "KR", name: "South Korea", centroid: [35.9, 127.8], bbox: [33.1, 124.6, 38.6, 131.9], region: "INDOPACOM" },
  { iso: "JP", name: "Japan", centroid: [36.2, 138.3], bbox: [24.0, 122.9, 45.5, 153.0], region: "INDOPACOM" },
  { iso: "TW", name: "Taiwan", centroid: [23.7, 121.0], bbox: [21.9, 120.1, 25.3, 122.0], region: "INDOPACOM" },
  { iso: "IN", name: "India", centroid: [20.6, 79.0], bbox: [6.7, 68.2, 35.5, 97.4], region: "INDOPACOM" },
  { iso: "PK", name: "Pakistan", centroid: [30.4, 69.3], bbox: [23.7, 60.9, 37.1, 77.8], region: "CENTCOM" },
  { iso: "AF", name: "Afghanistan", centroid: [33.9, 67.7], bbox: [29.4, 60.5, 38.5, 74.9], region: "CENTCOM" },
  { iso: "GB", name: "United Kingdom", centroid: [55.4, -3.4], bbox: [49.9, -8.2, 60.9, 1.8], region: "EUCOM" },
  { iso: "DE", name: "Germany", centroid: [51.2, 10.5], bbox: [47.3, 5.9, 55.1, 15.0], region: "EUCOM" },
  { iso: "FR", name: "France", centroid: [46.2, 2.2], bbox: [41.3, -5.6, 51.1, 9.6], region: "EUCOM" },
  { iso: "PL", name: "Poland", centroid: [51.9, 19.1], bbox: [49.0, 14.1, 54.8, 24.1], region: "EUCOM" },
  { iso: "TR", name: "Turkey", centroid: [39.9, 32.9], bbox: [36.0, 26.0, 42.1, 44.8], region: "EUCOM" },
  { iso: "EG", name: "Egypt", centroid: [26.8, 30.8], bbox: [22.0, 25.0, 31.7, 36.9], region: "CENTCOM" },
  { iso: "NG", name: "Nigeria", centroid: [9.1, 8.7], bbox: [4.3, 2.7, 13.9, 14.7], region: "AFRICOM" },
  { iso: "ZA", name: "South Africa", centroid: [-30.6, 22.9], bbox: [-34.8, 16.5, -22.1, 33.0], region: "AFRICOM" },
  { iso: "ET", name: "Ethiopia", centroid: [9.1, 40.5], bbox: [3.4, 33.0, 14.9, 48.0], region: "AFRICOM" },
  { iso: "SD", name: "Sudan", centroid: [12.9, 30.2], bbox: [8.7, 21.8, 22.2, 38.6], region: "AFRICOM" },
  { iso: "BR", name: "Brazil", centroid: [-14.2, -51.9], bbox: [-33.8, -73.9, 5.3, -34.8], region: "SOUTHCOM" },
  { iso: "MX", name: "Mexico", centroid: [23.6, -102.6], bbox: [14.5, -118.4, 32.7, -86.7], region: "NORTHCOM" },
  { iso: "VE", name: "Venezuela", centroid: [6.4, -66.6], bbox: [0.6, -73.4, 12.2, -59.8], region: "SOUTHCOM" },
  { iso: "CO", name: "Colombia", centroid: [4.6, -74.3], bbox: [-4.2, -79.0, 13.4, -66.9], region: "SOUTHCOM" },
  { iso: "AU", name: "Australia", centroid: [-25.3, 133.8], bbox: [-43.6, 113.2, -10.1, 153.6], region: "INDOPACOM" },
  { iso: "PH", name: "Philippines", centroid: [12.9, 121.8], bbox: [4.6, 116.9, 21.1, 126.6], region: "INDOPACOM" },
  { iso: "ID", name: "Indonesia", centroid: [-0.8, 113.9], bbox: [-11.0, 95.0, 6.1, 141.0], region: "INDOPACOM" },
  { iso: "MY", name: "Malaysia", centroid: [4.2, 101.9], bbox: [0.9, 99.6, 7.4, 119.3], region: "INDOPACOM" },
  { iso: "MM", name: "Myanmar", centroid: [21.9, 96.0], bbox: [9.8, 92.2, 28.5, 101.2], region: "INDOPACOM" },
  { iso: "YE", name: "Yemen", centroid: [15.6, 48.5], bbox: [12.1, 42.6, 19.0, 54.5], region: "CENTCOM" },
  { iso: "LY", name: "Libya", centroid: [26.3, 17.2], bbox: [19.5, 9.3, 33.2, 25.2], region: "AFRICOM" },
  { iso: "SO", name: "Somalia", centroid: [5.2, 46.2], bbox: [-1.7, 40.9, 12.0, 51.4], region: "AFRICOM" },
  { iso: "CD", name: "DR Congo", centroid: [-4.0, 21.8], bbox: [-13.5, 12.2, 5.4, 31.3], region: "AFRICOM" },
  { iso: "RO", name: "Romania", centroid: [45.9, 25.0], bbox: [43.6, 20.3, 48.3, 29.7], region: "EUCOM" },
  { iso: "NO", name: "Norway", centroid: [60.5, 8.5], bbox: [58.0, 4.6, 71.2, 31.1], region: "EUCOM" },
  { iso: "SE", name: "Sweden", centroid: [60.1, 18.6], bbox: [55.3, 11.1, 69.1, 24.2], region: "EUCOM" },
  { iso: "FI", name: "Finland", centroid: [61.9, 25.7], bbox: [59.8, 20.6, 70.1, 31.6], region: "EUCOM" },
  { iso: "LB", name: "Lebanon", centroid: [33.9, 35.9], bbox: [33.1, 35.1, 34.7, 36.6], region: "CENTCOM" },
  { iso: "JO", name: "Jordan", centroid: [30.6, 36.2], bbox: [29.2, 34.9, 33.4, 39.3], region: "CENTCOM" },
  { iso: "AE", name: "UAE", centroid: [23.4, 53.8], bbox: [22.6, 51.6, 26.1, 56.4], region: "CENTCOM" },
  { iso: "KE", name: "Kenya", centroid: [-0.0, 38.0], bbox: [-4.7, 33.9, 5.0, 41.9], region: "AFRICOM" },
];

/** Reverse-geocode a lat/lon to an ISO country code using bbox lookup.
 *  Returns null if no match found.
 */
export function latLonToCountry(lat: number, lon: number): string | null {
  for (const c of COUNTRIES) {
    if (
      lat >= c.bbox[0] && lat <= c.bbox[2] &&
      lon >= c.bbox[1] && lon <= c.bbox[3]
    ) {
      return c.iso;
    }
  }
  return null;
}

/** Get combatant command region for a lat/lon */
export function latLonToRegion(lat: number, lon: number): string {
  for (const c of COUNTRIES) {
    if (
      lat >= c.bbox[0] && lat <= c.bbox[2] &&
      lon >= c.bbox[1] && lon <= c.bbox[3]
    ) {
      return c.region;
    }
  }
  return "GLOBAL";
}

/** Get country info by ISO code */
export function getCountry(iso: string): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.iso === iso);
}
```

- [ ] **Step 2: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/lib/analysis/countryLookup.ts
git commit -m "feat: static country lookup table for CII reverse geocoding"
```

---

### Task 8: Country Instability Index (CII)

**Files:**
- Create: `argus-app/src/lib/analysis/cii.ts`
- Modify: `argus-app/src/store/useArgusStore.ts` (add CII state)
- Modify: `argus-app/src/types/intel.ts` (add LayerKey "instability")

- [ ] **Step 1: Add CII types and store state**

In `argus-app/src/types/intel.ts`, add `"instability"` to `LayerKey`:

```typescript
export type LayerKey =
  | "flights"
  | "military"
  | "satellites"
  | "satelliteLinks"
  | "seismic"
  | "bases"
  | "outages"
  | "threats"
  | "gdelt"
  | "anomalies"
  | "weather"
  | "vessels"
  | "instability";
```

In `argus-app/src/store/useArgusStore.ts`, add to the `ArgusStore` type and initial state:

```typescript
// Add to type definition
ciiScores: Record<string, { score: number; signals: Record<string, number>; updatedAt: number }>;

// Add to initial state
ciiScores: {},

// Add to layers initial state
instability: false,
```

Add setter:

```typescript
setCiiScores: (scores: Record<string, { score: number; signals: Record<string, number>; updatedAt: number }>) =>
  set({ ciiScores: scores }),
```

- [ ] **Step 2: Create CII computation engine**

Create `argus-app/src/lib/analysis/cii.ts`:

```typescript
import { baselines } from "./baselines";
import { COUNTRIES, latLonToCountry } from "./countryLookup";

export interface CiiScore {
  score: number;
  signals: Record<string, number>;
  updatedAt: number;
}

interface CiiInputs {
  gdeltEvents: Array<{ lat: number; lon: number; goldsteinScale: number; avgTone: number }>;
  militaryFlights: Array<{ latitude: number; longitude: number }>;
  seismicEvents: Array<{ latitude: number; longitude: number; magnitude: number }>;
  threatPulses: Array<{ targetedCountry?: string; lat?: number; lon?: number }>;
  outages: Array<{ location?: string; lat?: number; lon?: number; severity?: number }>;
  fredIndicators: Record<string, number>; // country ISO → stress score (pre-normalized 0-100)
}

const WEIGHTS = {
  gdelt: 0.40,
  military: 0.15,
  economic: 0.15,
  cyber: 0.10,
  outages: 0.10,
  seismic: 0.10,
};

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

/** Normalize Goldstein scale (-10 to +10) → instability score (0-100).
 *  Negative = conflict/instability → high score. Positive = cooperation → low score.
 */
function normalizeGoldstein(avgGoldstein: number): number {
  // -10 → 100, 0 → 50, +10 → 0
  return clamp(50 - avgGoldstein * 5);
}

/** Normalize avg tone (typically -10 to +10) → instability score (0-100). */
function normalizeTone(avgTone: number): number {
  return clamp(50 - avgTone * 5);
}

/** Compute CII scores for all countries with available data */
export function computeCii(inputs: CiiInputs): Record<string, CiiScore> {
  const scores: Record<string, CiiScore> = {};

  // Aggregate GDELT per country
  const gdeltByCountry = new Map<string, { goldsteinSum: number; toneSum: number; count: number }>();
  for (const e of inputs.gdeltEvents) {
    const iso = latLonToCountry(e.lat, e.lon);
    if (!iso) continue;
    const entry = gdeltByCountry.get(iso) ?? { goldsteinSum: 0, toneSum: 0, count: 0 };
    entry.goldsteinSum += e.goldsteinScale;
    entry.toneSum += e.avgTone;
    entry.count++;
    gdeltByCountry.set(iso, entry);
  }

  // Aggregate military flights per country
  const milByCountry = new Map<string, number>();
  for (const f of inputs.militaryFlights) {
    const iso = latLonToCountry(f.latitude, f.longitude);
    if (!iso) continue;
    milByCountry.set(iso, (milByCountry.get(iso) ?? 0) + 1);
  }

  // Aggregate seismic per country
  const seismicByCountry = new Map<string, number>();
  for (const e of inputs.seismicEvents) {
    const iso = latLonToCountry(e.latitude, e.longitude);
    if (!iso) continue;
    seismicByCountry.set(iso, (seismicByCountry.get(iso) ?? 0) + e.magnitude);
  }

  // Aggregate cyber threats per country
  const cyberByCountry = new Map<string, number>();
  for (const t of inputs.threatPulses) {
    const iso = t.targetedCountry ?? (t.lat != null && t.lon != null ? latLonToCountry(t.lat, t.lon) : null);
    if (!iso) continue;
    cyberByCountry.set(iso, (cyberByCountry.get(iso) ?? 0) + 1);
  }

  // Aggregate outages per country
  const outageByCountry = new Map<string, number>();
  for (const o of inputs.outages) {
    const iso = o.lat != null && o.lon != null ? latLonToCountry(o.lat, o.lon) : null;
    if (!iso) continue;
    outageByCountry.set(iso, (outageByCountry.get(iso) ?? 0) + (o.severity ?? 1));
  }

  // Compute per country
  for (const country of COUNTRIES) {
    const iso = country.iso;
    const signals: Record<string, number> = {};

    // GDELT signal
    const gdelt = gdeltByCountry.get(iso);
    if (gdelt && gdelt.count > 0) {
      const avgGoldstein = gdelt.goldsteinSum / gdelt.count;
      const avgTone = gdelt.toneSum / gdelt.count;
      signals.gdelt = (normalizeGoldstein(avgGoldstein) + normalizeTone(avgTone)) / 2;
    } else {
      signals.gdelt = 0;
    }

    // Military signal (σ-deviation from baseline)
    const milCount = milByCountry.get(iso) ?? 0;
    const baselineKey = `military:${iso}` as const;
    baselines.observe(baselineKey, milCount);
    const milZ = baselines.zScore(baselineKey, milCount);
    signals.military = milZ !== null ? clamp(milZ * 20 + 30) : clamp(milCount * 2); // fallback: raw count * 2

    // Economic signal
    signals.economic = inputs.fredIndicators[iso] ?? 0;

    // Cyber signal (normalize: 10+ threats → 100)
    const cyberCount = cyberByCountry.get(iso) ?? 0;
    signals.cyber = clamp(cyberCount * 10);

    // Outage signal (normalize: severity 5+ → 100)
    const outageScore = outageByCountry.get(iso) ?? 0;
    signals.outages = clamp(outageScore * 20);

    // Seismic signal (normalize: cumulative mag 20+ → 100)
    const seismicMag = seismicByCountry.get(iso) ?? 0;
    signals.seismic = clamp(seismicMag * 5);

    // Composite weighted score
    const score = clamp(
      signals.gdelt * WEIGHTS.gdelt +
      signals.military * WEIGHTS.military +
      signals.economic * WEIGHTS.economic +
      signals.cyber * WEIGHTS.cyber +
      signals.outages * WEIGHTS.outages +
      signals.seismic * WEIGHTS.seismic,
    );

    // Only store if score > 0 (don't clutter with zeros)
    if (score > 0) {
      scores[iso] = { score, signals, updatedAt: Date.now() };
    }
  }

  return scores;
}
```

- [ ] **Step 3: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/lib/analysis/cii.ts argus-app/src/store/useArgusStore.ts argus-app/src/types/intel.ts
git commit -m "feat: Country Instability Index computation engine with weighted multi-signal scoring"
```

---

### Task 9: CII Visualization Layer

**Files:**
- Create: `argus-app/src/lib/cesium/layers/ciiLayer.ts`
- Modify: `argus-app/src/components/CesiumGlobe.tsx` (init CII layer + polling)
- Modify: `argus-app/src/components/HudOverlay.tsx` (add Instability layer toggle)

- [ ] **Step 1: Create CII Cesium layer**

Create `argus-app/src/lib/cesium/layers/ciiLayer.ts`:

```typescript
import {
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  NearFarScalar,
  type Viewer,
} from "cesium";

import { createTacticalMarkerSvg } from "@/lib/cesium/tacticalMarker";
import { getCountry } from "@/lib/analysis/countryLookup";

interface CiiEntry {
  iso: string;
  score: number;
  signals: Record<string, number>;
}

const scoreColor = (score: number): string => {
  if (score >= 80) return "#dc2626";      // dark red
  if (score >= 60) return "#f97316";      // orange
  if (score >= 40) return "#eab308";      // yellow
  return "#22c55e";                        // green
};

const scoreScale = (score: number): number => {
  // Map 60-100 → 0.6-1.4
  return 0.6 + ((score - 60) / 40) * 0.8;
};

export class CiiLayer {
  private viewer: Viewer;
  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /** Update hotspot markers. Only shows countries with score > 60. */
  updateHotspots(entries: CiiEntry[]): number {
    const seen = new Set<string>();

    for (const entry of entries) {
      if (entry.score <= 60) continue;

      const country = getCountry(entry.iso);
      if (!country) continue;

      seen.add(entry.iso);
      const position = Cartesian3.fromDegrees(country.centroid[1], country.centroid[0]);
      const existing = this.entities.get(entry.iso);

      if (existing) {
        // Update position (unlikely to change but keeps pattern consistent)
        const positionProperty = existing.position as ConstantPositionProperty | undefined;
        if (positionProperty?.setValue) positionProperty.setValue(position);

        // Update billboard
        if (existing.billboard) {
          existing.billboard.image = new ConstantProperty(
            createTacticalMarkerSvg({
              fill: scoreColor(entry.score),
              glow: scoreColor(entry.score),
              stroke: "#121820",
            }),
          );
          existing.billboard.scale = new ConstantProperty(scoreScale(entry.score));
        }
        continue;
      }

      const entity = this.viewer.entities.add({
        id: `cii-${entry.iso}`,
        position,
        billboard: {
          image: new ConstantProperty(
            createTacticalMarkerSvg({
              fill: scoreColor(entry.score),
              glow: scoreColor(entry.score),
              stroke: "#121820",
            }),
          ),
          scale: new ConstantProperty(scoreScale(entry.score)),
          scaleByDistance: new NearFarScalar(1_000_000, 1.2, 20_000_000, 0.5),
          disableDepthTestDistance: 0,
        },
        description: `${country.name} — CII: ${entry.score.toFixed(0)}/100\n${Object.entries(entry.signals).map(([k, v]) => `${k}: ${v.toFixed(0)}`).join(", ")}`,
        properties: {
          kind: "cii",
          iso: entry.iso,
          score: entry.score,
        },
      });

      this.entities.set(entry.iso, entity);
    }

    // Remove stale markers
    for (const [iso, entity] of this.entities.entries()) {
      if (!seen.has(iso)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(iso);
      }
    }

    return this.entities.size;
  }

  setVisible(visible: boolean): void {
    for (const entity of this.entities.values()) {
      entity.show = visible;
    }
  }
}
```

- [ ] **Step 2: Add Instability layer toggle to HudOverlay**

In `argus-app/src/components/HudOverlay.tsx`, add to the `layerDefs` array (around line 78):

```typescript
  { key: "instability", label: "Instability Index", feed: "CII" },
```

- [ ] **Step 3: Initialize CII layer in CesiumGlobe.tsx**

In `argus-app/src/components/CesiumGlobe.tsx`, after the other layer initializations (~line 1032):

Add import:
```typescript
import { CiiLayer } from "@/lib/cesium/layers/ciiLayer";
```

Add initialization:
```typescript
    const ciiLayer = new CiiLayer(viewer);
```

Add ref:
```typescript
    const ciiLayerRef = useRef<CiiLayer | null>(null);
    // ... in the init block:
    ciiLayerRef.current = ciiLayer;
```

Add a polling task for CII (runs every 15 min, after GDELT):
```typescript
    poller.add({
      id: "cii",
      intervalMs: 15 * 60_000,
      run: async () => {
        if (platformModeRef.current !== "live") return;
        const store = useArgusStore.getState();
        // Gather inputs from store (latest feed data)
        // CII computation happens client-side using already-fetched data
        const { computeCii } = await import("@/lib/analysis/cii");
        // We'll need to collect the feed data from the store — this will be wired in Phase 4
        // For now, just compute with whatever data is available
      },
    });
```

- [ ] **Step 4: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add argus-app/src/lib/cesium/layers/ciiLayer.ts argus-app/src/components/CesiumGlobe.tsx argus-app/src/components/HudOverlay.tsx
git commit -m "feat: CII hotspot visualization layer on Cesium globe"
```

---

### Task 10: Corroboration Engine

**Files:**
- Create: `argus-app/src/lib/analysis/corroboration.ts`
- Modify: `argus-app/src/store/useArgusStore.ts` (add alerts state)

- [ ] **Step 1: Add alert types and store state**

In `argus-app/src/types/intel.ts`, add:

```typescript
export type SourceDomain = "news" | "gdelt" | "military" | "seismic" | "maritime" | "economic" | "cyber" | "infrastructure" | "conflict";

export interface CorroborationAlert {
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

In `argus-app/src/store/useArgusStore.ts`, add to the store type and initial state:

```typescript
// Type
alerts: CorroborationAlert[];
addAlert: (alert: CorroborationAlert) => void;
updateAlert: (id: string, patch: Partial<CorroborationAlert>) => void;

// Initial state
alerts: [],

// Setters
addAlert: (alert) =>
  set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 100) })),
updateAlert: (id, patch) =>
  set((s) => ({
    alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  })),
```

- [ ] **Step 2: Create corroboration engine**

Create `argus-app/src/lib/analysis/corroboration.ts`:

```typescript
import type { CorroborationAlert, SourceDomain } from "@/types/intel";
import { baselines } from "./baselines";

const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
let alertCounter = 0;

interface RegionEvent {
  domain: SourceDomain;
  region: string;
  timestamp: number;
  severity: number;
  keywords: string[];
}

interface RegionWindow {
  region: string;
  events: RegionEvent[];
  stage: 1 | 2 | 3 | 4 | 5;
  domains: Set<SourceDomain>;
  keywords: Set<string>;
  alertId: string | null;
  createdAt: number;
}

export class CorroborationEngine {
  private windows = new Map<string, RegionWindow>();
  private onAlert: ((alert: CorroborationAlert) => void) | null = null;
  private onUpdate: ((id: string, patch: Partial<CorroborationAlert>) => void) | null = null;

  /** Provide callbacks for alert creation and update */
  setCallbacks(
    onAlert: (alert: CorroborationAlert) => void,
    onUpdate: (id: string, patch: Partial<CorroborationAlert>) => void,
  ): void {
    this.onAlert = onAlert;
    this.onUpdate = onUpdate;
  }

  /** Ingest a batch of events from a single domain */
  ingest(events: RegionEvent[]): void {
    for (const event of events) {
      let window = this.windows.get(event.region);
      if (!window) {
        window = {
          region: event.region,
          events: [],
          stage: 1,
          domains: new Set(),
          keywords: new Set(),
          alertId: null,
          createdAt: Date.now(),
        };
        this.windows.set(event.region, window);
      }

      window.events.push(event);
      window.domains.add(event.domain);
      for (const kw of event.keywords) window.keywords.add(kw);

      this.evaluateStage(window);
    }

    this.evictStale();
  }

  /** Check if a spike is detected for a region (used by breaking news pipeline) */
  hasSpikeInRegion(region: string): boolean {
    const window = this.windows.get(region);
    return window !== undefined && window.stage >= 2;
  }

  /** Get current stage for a region */
  getStage(region: string): number {
    return this.windows.get(region)?.stage ?? 0;
  }

  /** Get all active windows above a minimum stage */
  getActiveAlerts(minStage: 1 | 2 | 3 | 4 | 5 = 1): CorroborationAlert[] {
    const alerts: CorroborationAlert[] = [];
    for (const window of this.windows.values()) {
      if (window.stage >= minStage && window.alertId) {
        alerts.push({
          id: window.alertId,
          stage: window.stage,
          region: window.region,
          domains: [...window.domains],
          keywords: [...window.keywords].slice(0, 10),
          summary: this.buildSummary(window),
          createdAt: window.createdAt,
          updatedAt: Date.now(),
        });
      }
    }
    return alerts.sort((a, b) => b.stage - a.stage || b.updatedAt - a.updatedAt);
  }

  private evaluateStage(window: RegionWindow): void {
    const prevStage = window.stage;
    const domainCount = window.domains.size;

    // Check for baseline spike (Stage 2)
    let hasSigmaSpike = false;
    for (const event of window.events) {
      const key = `${event.domain}:${event.region}` as const;
      const z = baselines.zScore(key, event.severity);
      if (z !== null && z > 2) {
        hasSigmaSpike = true;
        break;
      }
    }

    // Stage assignment (only escalate, never de-escalate)
    let newStage = window.stage;
    if (domainCount >= 3) {
      newStage = 4; // High Confidence
    } else if (domainCount >= 2) {
      newStage = 3; // Corroborated
    } else if (hasSigmaSpike) {
      newStage = Math.max(window.stage, 2) as 1 | 2 | 3 | 4 | 5; // Developing
    }

    // Stage 5: requires Stage 4 + CII check (done externally via setCiiThreshold)
    // For now, Stage 5 is assigned by calling promoteToStrategic()

    if (newStage > window.stage) {
      window.stage = newStage as 1 | 2 | 3 | 4 | 5;
    }

    // Emit alert on stage change
    if (window.stage > prevStage || !window.alertId) {
      if (!window.alertId) {
        window.alertId = `corr-${++alertCounter}-${window.region}`;
      }

      const alert: CorroborationAlert = {
        id: window.alertId,
        stage: window.stage,
        region: window.region,
        domains: [...window.domains],
        keywords: [...window.keywords].slice(0, 10),
        summary: this.buildSummary(window),
        createdAt: window.createdAt,
        updatedAt: Date.now(),
      };

      if (prevStage === 0 || !window.alertId) {
        this.onAlert?.(alert);
      } else {
        this.onUpdate?.(window.alertId, {
          stage: window.stage,
          domains: [...window.domains],
          keywords: [...window.keywords].slice(0, 10),
          summary: this.buildSummary(window),
          updatedAt: Date.now(),
        });
      }
    }
  }

  /** Promote a region to Stage 5 (called externally when CII > 60) */
  promoteToStrategic(region: string): void {
    const window = this.windows.get(region);
    if (!window || window.stage < 4) return;
    window.stage = 5;
    if (window.alertId) {
      this.onUpdate?.(window.alertId, {
        stage: 5,
        summary: this.buildSummary(window),
        updatedAt: Date.now(),
      });
    }
  }

  private buildSummary(window: RegionWindow): string {
    const stageNames = { 1: "Raw Signal", 2: "Developing", 3: "Corroborated", 4: "High Confidence", 5: "Strategic Alert" };
    const domainList = [...window.domains].join(", ");
    const kwList = [...window.keywords].slice(0, 5).join(", ");
    return `[${stageNames[window.stage]}] ${window.region}: ${domainList}${kwList ? ` — ${kwList}` : ""}`;
  }

  private evictStale(): void {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [region, window] of this.windows.entries()) {
      window.events = window.events.filter((e) => e.timestamp > cutoff);
      if (window.events.length === 0) {
        this.windows.delete(region);
      }
    }
  }
}

/** Singleton instance */
export const corroborationEngine = new CorroborationEngine();
```

- [ ] **Step 3: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/lib/analysis/corroboration.ts argus-app/src/store/useArgusStore.ts argus-app/src/types/intel.ts
git commit -m "feat: 5-stage corroboration engine with sliding windows and domain independence"
```

---

### Task 11: Breaking News Pipeline

**Files:**
- Create: `argus-app/src/lib/analysis/breakingNews.ts`

- [ ] **Step 1: Create breaking news pipeline**

Create `argus-app/src/lib/analysis/breakingNews.ts`:

```typescript
import { baselines } from "./baselines";
import { corroborationEngine } from "./corroboration";
import { latLonToRegion } from "./countryLookup";

interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
  lat?: number;
  lon?: number;
  tags?: string[];
}

export interface BreakingNewsCard {
  headline: string;
  sources: string[];
  region: string;
  corroborationStage: number;
  spikedKeywords: string[];
  timestamp: number;
}

const STOPWORDS = new Set([
  "the", "a", "an", "to", "in", "on", "for", "of", "is", "it",
  "and", "or", "but", "not", "with", "at", "by", "from", "as",
  "has", "had", "have", "was", "were", "be", "been", "are",
  "this", "that", "will", "would", "could", "should", "can",
  "its", "his", "her", "their", "our", "my", "your",
  "says", "said", "new", "also", "more", "than",
]);

/** Extract significant keywords from a headline */
function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Process a batch of news items through the breaking news pipeline */
export function processBreakingNews(items: NewsItem[]): BreakingNewsCard[] {
  const cards: BreakingNewsCard[] = [];

  // Step 1: Extract keywords from all items
  const keywordCounts = new Map<string, number>();
  for (const item of items) {
    const keywords = extractKeywords(item.title);
    for (const kw of keywords) {
      keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
    }
  }

  // Step 2: Check keyword frequencies against baselines
  const spikedKeywords: string[] = [];
  for (const [keyword, count] of keywordCounts) {
    const key = `news_kw:${keyword}` as const;
    baselines.observe(key, count);
    const z = baselines.zScore(key, count);
    if (z !== null && z > 2) {
      spikedKeywords.push(keyword);
    }
  }

  if (spikedKeywords.length === 0) return cards;

  // Step 3: Group items by region that contain spiked keywords
  const regionItems = new Map<string, NewsItem[]>();
  for (const item of items) {
    const keywords = extractKeywords(item.title);
    const hasSpiked = keywords.some((kw) => spikedKeywords.includes(kw));
    if (!hasSpiked) continue;

    const region = item.lat != null && item.lon != null
      ? latLonToRegion(item.lat, item.lon)
      : "GLOBAL";

    const list = regionItems.get(region) ?? [];
    list.push(item);
    regionItems.set(region, list);
  }

  // Step 4: For each region, check cross-domain corroboration
  for (const [region, regionNews] of regionItems) {
    const corrobStage = corroborationEngine.getStage(region);
    const hasNonNewsCorroboration = corrobStage >= 3;

    // Step 5: Generate breaking card if corroborated or strong spike
    const matchingKeywords = spikedKeywords.filter((kw) =>
      regionNews.some((item) => extractKeywords(item.title).includes(kw)),
    );

    if (hasNonNewsCorroboration || matchingKeywords.length >= 3) {
      cards.push({
        headline: regionNews[0].title,
        sources: [...new Set(regionNews.map((n) => n.source))],
        region,
        corroborationStage: corrobStage,
        spikedKeywords: matchingKeywords.slice(0, 5),
        timestamp: Date.now(),
      });
    }
  }

  return cards;
}
```

- [ ] **Step 2: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/lib/analysis/breakingNews.ts
git commit -m "feat: breaking news pipeline with keyword spike detection and cross-domain verification"
```

---

### Task 12: News Clustering

**Files:**
- Create: `argus-app/src/lib/analysis/newsClustering.ts`

- [ ] **Step 1: Create news clustering utility**

Create `argus-app/src/lib/analysis/newsClustering.ts`:

```typescript
const STOPWORDS = new Set([
  "the", "a", "an", "to", "in", "on", "for", "of", "is", "it",
  "and", "or", "but", "not", "with", "at", "by", "from", "as",
  "has", "had", "have", "was", "were", "be", "been", "are",
  "this", "that", "will", "would", "could", "should", "can",
  "says", "said", "new", "also", "more", "than",
]);

const SIMILARITY_THRESHOLD = 0.4;

export interface NewsCluster<T> {
  lead: T;
  related: T[];
}

/** Extract a token set from a title for similarity comparison */
function tokenize(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .slice(0, 10);
  return new Set(tokens);
}

/** Jaccard similarity between two token sets */
function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Union-Find data structure for transitive clustering */
class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
    if (this.rank[px] < this.rank[py]) {
      this.parent[px] = py;
    } else if (this.rank[px] > this.rank[py]) {
      this.parent[py] = px;
    } else {
      this.parent[py] = px;
      this.rank[px]++;
    }
  }
}

/**
 * Cluster news items by title similarity.
 * Items must have a `title` string property and a `score` number property.
 * Returns clusters with the highest-scored item as lead.
 */
export function clusterNews<T extends { title: string; score: number }>(items: T[]): NewsCluster<T>[] {
  if (items.length === 0) return [];

  const tokenSets = items.map((item) => tokenize(item.title));
  const uf = new UnionFind(items.length);

  // Pairwise Jaccard comparison
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (jaccard(tokenSets[i], tokenSets[j]) > SIMILARITY_THRESHOLD) {
        uf.union(i, j);
      }
    }
  }

  // Group by cluster root
  const groups = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = uf.find(i);
    const group = groups.get(root) ?? [];
    group.push(i);
    groups.set(root, group);
  }

  // Build clusters with highest-scored as lead
  const clusters: NewsCluster<T>[] = [];
  for (const indices of groups.values()) {
    const sorted = indices.sort((a, b) => items[b].score - items[a].score);
    clusters.push({
      lead: items[sorted[0]],
      related: sorted.slice(1).map((i) => items[i]),
    });
  }

  // Sort clusters by lead score
  return clusters.sort((a, b) => b.lead.score - a.lead.score);
}
```

- [ ] **Step 2: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/lib/analysis/newsClustering.ts
git commit -m "feat: Jaccard similarity news clustering with union-find transitive grouping"
```

---

## Phase 3: New Data Sources

### Task 13: ACLED Feed

**Files:**
- Create: `argus-app/src/app/api/feeds/acled/route.ts`
- Modify: `argus-app/src/lib/config.ts` (add endpoint + poll interval)

- [ ] **Step 1: Add config entries**

In `argus-app/src/lib/config.ts`, add to `endpoints`:
```typescript
    acled: "/api/feeds/acled",
```

Add to `pollMs`:
```typescript
    acled: 30 * 60_000, // 30 minutes
```

- [ ] **Step 2: Create ACLED API route**

Create `argus-app/src/app/api/feeds/acled/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";

const ACLED_BASE = "https://api.acleddata.com/acled/read";

interface AcledEvent {
  event_type: string;
  country: string;
  location: string;
  fatalities: number;
  actor1: string;
  actor2: string;
  event_date: string;
  notes: string;
  latitude: number;
  longitude: number;
  region: string;
}

interface AcledResponse {
  events: AcledEvent[];
  meta: { fetchedAt: string; count: number };
}

const negCache = new NegativeCache<AcledResponse>({ negativeTtlMs: 5 * 60_000 });

export async function GET() {
  const apiKey = process.env.ACLED_API_KEY;
  const email = process.env.ACLED_EMAIL;

  if (!apiKey || !email) {
    return NextResponse.json(
      { events: [], meta: { fetchedAt: new Date().toISOString(), count: 0, error: "ACLED_API_KEY or ACLED_EMAIL not configured" } },
      { status: 200 },
    );
  }

  try {
    const data = await negCache.fetch(async () => {
      // Fetch last 7 days of events
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const url = `${ACLED_BASE}?key=${apiKey}&email=${encodeURIComponent(email)}&event_date=${since}|${new Date().toISOString().split("T")[0]}&event_date_where=BETWEEN&limit=200`;

      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`ACLED ${res.status}`);

      const json = await res.json();
      const rawEvents = json.data ?? [];

      const events: AcledEvent[] = rawEvents.map((e: Record<string, string>) => ({
        event_type: e.event_type ?? "Unknown",
        country: e.country ?? "",
        location: e.location ?? "",
        fatalities: parseInt(e.fatalities, 10) || 0,
        actor1: e.actor1 ?? "",
        actor2: e.actor2 ?? "",
        event_date: e.event_date ?? "",
        notes: e.notes ?? "",
        latitude: parseFloat(e.latitude) || 0,
        longitude: parseFloat(e.longitude) || 0,
        region: e.region ?? "",
      }));

      return { events, meta: { fetchedAt: new Date().toISOString(), count: events.length } };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { events: [], meta: { fetchedAt: new Date().toISOString(), count: 0, error: String(error) } },
      { status: 200 },
    );
  }
}
```

- [ ] **Step 3: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/app/api/feeds/acled/route.ts argus-app/src/lib/config.ts
git commit -m "feat: ACLED armed conflict events feed (panel-only, 30min poll)"
```

---

### Task 14: Polymarket Feed

**Files:**
- Create: `argus-app/src/app/api/feeds/polymarket/route.ts`

- [ ] **Step 1: Add config entries**

In `argus-app/src/lib/config.ts`, add to `endpoints`:
```typescript
    polymarket: "/api/feeds/polymarket",
```

Add to `pollMs`:
```typescript
    polymarket: 5 * 60_000, // 5 minutes
```

- [ ] **Step 2: Create Polymarket API route**

Create `argus-app/src/app/api/feeds/polymarket/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";

const GAMMA_API = "https://gamma-api.polymarket.com/events";

// Geopolitical category tags to filter on
const GEO_TAGS = ["politics", "geopolitics", "world", "conflict", "elections", "war", "military"];

interface PolymarketEvent {
  question: string;
  probability: number;
  change24h: number;
  volume: number;
  category: string;
  endDate: string;
  slug: string;
}

interface PolymarketResponse {
  events: PolymarketEvent[];
  meta: { fetchedAt: string; count: number };
}

const negCache = new NegativeCache<PolymarketResponse>({ negativeTtlMs: 30_000 });

export async function GET() {
  try {
    const data = await negCache.fetch(async () => {
      const res = await fetch(`${GAMMA_API}?active=true&closed=false&limit=100&order=volume24hr&ascending=false`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Polymarket ${res.status}`);

      const json = await res.json();
      const rawEvents: Array<Record<string, unknown>> = Array.isArray(json) ? json : [];

      const events: PolymarketEvent[] = rawEvents
        .filter((e) => {
          const tags = String(e.slug ?? "").toLowerCase();
          const title = String(e.title ?? "").toLowerCase();
          return GEO_TAGS.some((t) => tags.includes(t) || title.includes(t));
        })
        .slice(0, 50)
        .map((e) => {
          const markets = Array.isArray(e.markets) ? e.markets : [];
          const topMarket = markets[0] as Record<string, unknown> | undefined;
          return {
            question: String(e.title ?? ""),
            probability: Number(topMarket?.outcomePrices?.[0] ?? topMarket?.lastTradePrice ?? 0),
            change24h: 0, // Gamma API doesn't expose 24h change directly
            volume: Number(e.volume ?? 0),
            category: String(e.slug ?? "").split("-")[0],
            endDate: String(e.endDate ?? ""),
            slug: String(e.slug ?? ""),
          };
        });

      return { events, meta: { fetchedAt: new Date().toISOString(), count: events.length } };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { events: [], meta: { fetchedAt: new Date().toISOString(), count: 0, error: String(error) } },
      { status: 200 },
    );
  }
}
```

- [ ] **Step 3: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/app/api/feeds/polymarket/route.ts argus-app/src/lib/config.ts
git commit -m "feat: Polymarket prediction markets feed (panel-only, geopolitical filter)"
```

---

### Task 15: GDACS Feed

**Files:**
- Create: `argus-app/src/app/api/feeds/gdacs/route.ts`

- [ ] **Step 1: Add config entries**

In `argus-app/src/lib/config.ts`, add to `endpoints`:
```typescript
    gdacs: "/api/feeds/gdacs",
```

Add to `pollMs`:
```typescript
    gdacs: 10 * 60_000, // 10 minutes
```

- [ ] **Step 2: Create GDACS API route**

Create `argus-app/src/app/api/feeds/gdacs/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";

const GDACS_RSS = "https://www.gdacs.org/xml/rss.xml";

interface GdacsEvent {
  type: string;
  severity: "green" | "orange" | "red";
  country: string;
  title: string;
  populationExposed: number;
  date: string;
  lat: number;
  lon: number;
  link: string;
}

interface GdacsResponse {
  events: GdacsEvent[];
  meta: { fetchedAt: string; count: number };
}

const negCache = new NegativeCache<GdacsResponse>({ negativeTtlMs: 5 * 60_000 });

function parseAlertLevel(text: string): "green" | "orange" | "red" {
  const lower = text.toLowerCase();
  if (lower.includes("red")) return "red";
  if (lower.includes("orange")) return "orange";
  return "green";
}

function parseEventType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("earthquake")) return "EQ";
  if (lower.includes("flood")) return "FL";
  if (lower.includes("cyclone") || lower.includes("hurricane") || lower.includes("typhoon")) return "TC";
  if (lower.includes("volcano")) return "VO";
  if (lower.includes("drought")) return "DR";
  return "OTHER";
}

export async function GET() {
  try {
    const data = await negCache.fetch(async () => {
      const res = await fetch(GDACS_RSS, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/xml, text/xml" },
      });
      if (!res.ok) throw new Error(`GDACS ${res.status}`);

      const xml = await res.text();

      // Simple XML parsing (no dependency needed for RSS)
      const events: GdacsEvent[] = [];
      const items = xml.split("<item>").slice(1);

      for (const item of items) {
        const tag = (name: string): string => {
          const match = item.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`));
          return match?.[1]?.trim() ?? "";
        };
        const gdacsTag = (name: string): string => {
          const match = item.match(new RegExp(`<gdacs:${name}[^>]*>([^<]*)</gdacs:${name}>`));
          return match?.[1]?.trim() ?? "";
        };
        // Also check for attributes
        const gdacsAttr = (name: string, attr: string): string => {
          const match = item.match(new RegExp(`<gdacs:${name}[^>]*${attr}="([^"]*)"`));
          return match?.[1]?.trim() ?? "";
        };

        const title = tag("title");
        const lat = parseFloat(item.match(/<geo:lat>([^<]*)/)?.[1] ?? "") || 0;
        const lon = parseFloat(item.match(/<geo:long>([^<]*)/)?.[1] ?? "") || 0;
        const alertLevel = gdacsTag("alertlevel") || gdacsAttr("alertlevel", "value");
        const population = parseInt(gdacsTag("population") || gdacsAttr("population", "value"), 10) || 0;
        const country = gdacsTag("country") || tag("gdacs:country") || "";

        if (!title) continue;

        events.push({
          type: parseEventType(title),
          severity: parseAlertLevel(alertLevel || title),
          country,
          title,
          populationExposed: population,
          date: tag("pubDate"),
          lat,
          lon,
          link: tag("link"),
        });
      }

      return { events: events.slice(0, 50), meta: { fetchedAt: new Date().toISOString(), count: events.length } };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { events: [], meta: { fetchedAt: new Date().toISOString(), count: 0, error: String(error) } },
      { status: 200 },
    );
  }
}
```

- [ ] **Step 3: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/app/api/feeds/gdacs/route.ts argus-app/src/lib/config.ts
git commit -m "feat: GDACS natural disasters feed (panel-only, RSS parse)"
```

---

### Task 16: FAA Delays + NOTAM Feed

**Files:**
- Create: `argus-app/src/app/api/feeds/faa/route.ts`

- [ ] **Step 1: Add config entries**

In `argus-app/src/lib/config.ts`, add to `endpoints`:
```typescript
    faa: "/api/feeds/faa",
```

Add to `pollMs`:
```typescript
    faa: 10 * 60_000, // 10 minutes
```

- [ ] **Step 2: Create FAA API route**

Create `argus-app/src/app/api/feeds/faa/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NegativeCache } from "@/lib/cache/negativeCache";

const FAA_STATUS_URL = "https://nasstatus.faa.gov/api/airport-status-information";

interface FaaDelay {
  airport: string;
  delayType: string;
  reason: string;
  avgDelay: string;
}

interface Notam {
  id: string;
  location: string;
  type: string;
  effectiveStart: string;
  effectiveEnd: string;
  description: string;
}

interface FaaResponse {
  delays: FaaDelay[];
  notams: Notam[];
  meta: { fetchedAt: string; delayCount: number; notamCount: number };
}

const negCache = new NegativeCache<FaaResponse>({ negativeTtlMs: 3 * 60_000 });

export async function GET() {
  try {
    const data = await negCache.fetch(async () => {
      // Fetch airport delays
      const delayRes = await fetch(FAA_STATUS_URL, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });

      const delays: FaaDelay[] = [];
      if (delayRes.ok) {
        const json = await delayRes.json();
        const entries = Array.isArray(json) ? json : json?.data ?? [];

        for (const entry of entries) {
          // FAA API returns different formats; handle both
          const airport = entry.airportCode ?? entry.arpt ?? entry.ARPT ?? "";
          const reason = entry.reason ?? entry.Reason ?? "";
          const delayType = entry.type ?? entry.Type ?? "delay";
          const avgDelay = entry.avgDelay ?? entry.Avg ?? "";

          if (airport) {
            delays.push({ airport, delayType, reason, avgDelay: String(avgDelay) });
          }
        }
      }

      // NOTAM/TFR: use FAA TFR feed
      const notams: Notam[] = [];
      try {
        const tfrRes = await fetch("https://tfr.faa.gov/tfr2/list.json", {
          signal: AbortSignal.timeout(8_000),
          headers: { Accept: "application/json" },
        });
        if (tfrRes.ok) {
          const tfrJson = await tfrRes.json();
          const tfrList = Array.isArray(tfrJson) ? tfrJson : tfrJson?.data ?? [];
          for (const tfr of tfrList.slice(0, 30)) {
            notams.push({
              id: String(tfr.notamNumber ?? tfr.id ?? ""),
              location: String(tfr.facility ?? tfr.location ?? ""),
              type: "TFR",
              effectiveStart: String(tfr.effectiveDate ?? tfr.startDate ?? ""),
              effectiveEnd: String(tfr.expireDate ?? tfr.endDate ?? ""),
              description: String(tfr.description ?? tfr.comment ?? ""),
            });
          }
        }
      } catch {
        // TFR endpoint is optional
      }

      return {
        delays,
        notams,
        meta: { fetchedAt: new Date().toISOString(), delayCount: delays.length, notamCount: notams.length },
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { delays: [], notams: [], meta: { fetchedAt: new Date().toISOString(), delayCount: 0, notamCount: 0, error: String(error) } },
      { status: 200 },
    );
  }
}
```

- [ ] **Step 3: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/app/api/feeds/faa/route.ts argus-app/src/lib/config.ts
git commit -m "feat: FAA airport delays + TFR/NOTAM feed (panel-only)"
```

---

## Phase 4: Integration

### Task 17: Wire New Feeds Into Polling + Feed Panel

**Files:**
- Modify: `argus-app/src/components/CesiumGlobe.tsx` (add polling for new feeds)
- Modify: `argus-app/src/store/useArgusStore.ts` (add state for new feed data)
- Modify: `argus-app/src/components/HudOverlay.tsx` (add feed panel sections)

- [ ] **Step 1: Add new feed data to store**

In `argus-app/src/store/useArgusStore.ts`, add to the store type:

```typescript
acledEvents: Array<{ event_type: string; country: string; location: string; fatalities: number; actor1: string; event_date: string }>;
polymarketEvents: Array<{ question: string; probability: number; volume: number; category: string }>;
gdacsEvents: Array<{ type: string; severity: string; country: string; title: string; populationExposed: number; date: string }>;
faaDelays: Array<{ airport: string; delayType: string; reason: string; avgDelay: string }>;
faaNotams: Array<{ id: string; location: string; type: string; description: string }>;
breakingNews: Array<{ headline: string; sources: string[]; region: string; corroborationStage: number; spikedKeywords: string[]; timestamp: number }>;
```

Add to initial state (all empty arrays) and add setters for each.

- [ ] **Step 2: Add polling tasks in CesiumGlobe.tsx**

In `argus-app/src/components/CesiumGlobe.tsx`, add polling tasks for each new feed after the existing poller.add blocks:

```typescript
    poller.add({
      id: "acled",
      intervalMs: ARGUS_CONFIG.pollMs.acled,
      run: async () => {
        try {
          const res = await fetch(ARGUS_CONFIG.endpoints.acled, { signal: AbortSignal.timeout(15_000) });
          if (!res.ok) throw new Error(`ACLED ${res.status}`);
          const { events } = await res.json();
          useArgusStore.getState().setAcledEvents(events);
          setFeedHealthy("acled");
        } catch (error) {
          setFeedError("acled", error instanceof Error ? error.message : "ACLED fetch failed");
          throw error;
        }
      },
    });

    poller.add({
      id: "polymarket",
      intervalMs: ARGUS_CONFIG.pollMs.polymarket,
      run: async () => {
        try {
          const res = await fetch(ARGUS_CONFIG.endpoints.polymarket, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`Polymarket ${res.status}`);
          const { events } = await res.json();
          useArgusStore.getState().setPolymarketEvents(events);
          setFeedHealthy("polymarket");
        } catch (error) {
          setFeedError("polymarket", error instanceof Error ? error.message : "Polymarket fetch failed");
          throw error;
        }
      },
    });

    poller.add({
      id: "gdacs",
      intervalMs: ARGUS_CONFIG.pollMs.gdacs,
      run: async () => {
        try {
          const res = await fetch(ARGUS_CONFIG.endpoints.gdacs, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`GDACS ${res.status}`);
          const { events } = await res.json();
          useArgusStore.getState().setGdacsEvents(events);
          setFeedHealthy("gdacs");
        } catch (error) {
          setFeedError("gdacs", error instanceof Error ? error.message : "GDACS fetch failed");
          throw error;
        }
      },
    });

    poller.add({
      id: "faa",
      intervalMs: ARGUS_CONFIG.pollMs.faa,
      run: async () => {
        try {
          const res = await fetch(ARGUS_CONFIG.endpoints.faa, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`FAA ${res.status}`);
          const { delays, notams } = await res.json();
          const store = useArgusStore.getState();
          store.setFaaDelays(delays);
          store.setFaaNotams(notams);
          setFeedHealthy("faa");
        } catch (error) {
          setFeedError("faa", error instanceof Error ? error.message : "FAA fetch failed");
          throw error;
        }
      },
    });
```

- [ ] **Step 3: Add feed panel sections in HudOverlay.tsx**

In `argus-app/src/components/HudOverlay.tsx`, add new `CollapsibleSection` blocks for each feed in the appropriate workspace. These should be rendered in the sidebar alongside existing feed panels.

For ACLED (conflict events):
```tsx
<CollapsibleSection title="Conflict Events" badge={String(acledEvents.length)}>
  <div className="space-y-1">
    {acledEvents.slice(0, 20).map((e, i) => (
      <div key={i} className="rounded border border-[#3c3836] bg-[#1d2021] px-2 py-1 font-mono text-[10px]">
        <div className="flex justify-between">
          <span className={
            e.event_type === "Battles" ? "text-red-400" :
            e.event_type === "Protests" ? "text-yellow-400" :
            e.event_type === "Riots" ? "text-orange-400" :
            "text-[#7fb4c5]"
          }>{e.event_type}</span>
          <span className="text-[#a89984]">{e.event_date}</span>
        </div>
        <div className="text-[#d4be98]">{e.location}, {e.country}</div>
        {e.fatalities > 0 && <div className="text-red-400">Fatalities: {e.fatalities}</div>}
      </div>
    ))}
  </div>
</CollapsibleSection>
```

For Polymarket (prediction markets):
```tsx
<CollapsibleSection title="Prediction Markets" badge={String(polymarketEvents.length)}>
  <div className="space-y-1">
    {polymarketEvents.slice(0, 15).map((e, i) => (
      <div key={i} className="rounded border border-[#3c3836] bg-[#1d2021] px-2 py-1 font-mono text-[10px]">
        <div className="text-[#d4be98]">{e.question}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-[#3c3836]">
            <div
              className="h-1.5 rounded-full bg-[#7fb4c5]"
              style={{ width: `${Math.round(e.probability * 100)}%` }}
            />
          </div>
          <span className="text-[#7fb4c5]">{Math.round(e.probability * 100)}%</span>
        </div>
        <div className="text-[#a89984]">Vol: ${(e.volume / 1000).toFixed(0)}k</div>
      </div>
    ))}
  </div>
</CollapsibleSection>
```

For GDACS (natural disasters):
```tsx
<CollapsibleSection title="Natural Disasters" badge={String(gdacsEvents.length)}>
  <div className="space-y-1">
    {gdacsEvents.slice(0, 15).map((e, i) => {
      const borderColor = e.severity === "red" ? "border-l-red-500" : e.severity === "orange" ? "border-l-orange-400" : "border-l-green-400";
      return (
        <div key={i} className={`rounded border border-[#3c3836] border-l-2 ${borderColor} bg-[#1d2021] px-2 py-1 font-mono text-[10px]`}>
          <div className="text-[#d4be98]">{e.title}</div>
          <div className="flex justify-between text-[#a89984]">
            <span>{e.country}</span>
            {e.populationExposed > 0 && <span>Pop: {(e.populationExposed / 1000).toFixed(0)}k</span>}
          </div>
        </div>
      );
    })}
  </div>
</CollapsibleSection>
```

For FAA (delays + NOTAM):
```tsx
<CollapsibleSection title="Aviation Status" badge={String(faaDelays.length + faaNotams.length)}>
  <div className="space-y-1">
    {faaDelays.map((d, i) => (
      <div key={`delay-${i}`} className="rounded border border-[#3c3836] bg-[#1d2021] px-2 py-1 font-mono text-[10px]">
        <div className="flex justify-between">
          <span className="font-bold text-[#d4be98]">{d.airport}</span>
          <span className="text-orange-400">{d.delayType}</span>
        </div>
        <div className="text-[#a89984]">{d.reason} {d.avgDelay && `— avg ${d.avgDelay}`}</div>
      </div>
    ))}
    {faaNotams.filter((n) => n.type === "TFR").slice(0, 10).map((n, i) => (
      <div key={`notam-${i}`} className="rounded border border-[#3c3836] border-l-2 border-l-red-500 bg-[#1d2021] px-2 py-1 font-mono text-[10px]">
        <div className="flex justify-between">
          <span className="text-red-400">TFR</span>
          <span className="text-[#a89984]">{n.location}</span>
        </div>
        <div className="text-[#d4be98] line-clamp-2">{n.description}</div>
      </div>
    ))}
  </div>
</CollapsibleSection>
```

- [ ] **Step 4: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add argus-app/src/store/useArgusStore.ts argus-app/src/components/CesiumGlobe.tsx argus-app/src/components/HudOverlay.tsx
git commit -m "feat: wire ACLED, Polymarket, GDACS, FAA feeds into polling and sidebar panels"
```

---

### Task 18: Wire Feeds Into Corroboration + CII + Baselines

**Files:**
- Modify: `argus-app/src/components/CesiumGlobe.tsx` (corroboration + CII + baseline integration)

- [ ] **Step 1: Initialize corroboration engine and baselines**

In `argus-app/src/components/CesiumGlobe.tsx`, add imports:

```typescript
import { baselines } from "@/lib/analysis/baselines";
import { corroborationEngine } from "@/lib/analysis/corroboration";
import { computeCii } from "@/lib/analysis/cii";
import { latLonToRegion } from "@/lib/analysis/countryLookup";
import { processBreakingNews } from "@/lib/analysis/breakingNews";
import { clusterNews } from "@/lib/analysis/newsClustering";
```

In the useEffect init block (near where poller is created), wire up the corroboration engine callbacks:

```typescript
    const store = useArgusStore.getState();
    corroborationEngine.setCallbacks(
      (alert) => useArgusStore.getState().addAlert(alert),
      (id, patch) => useArgusStore.getState().updateAlert(id, patch),
    );
```

- [ ] **Step 2: Feed existing poll results into corroboration engine**

In each existing poll task's success handler, after updating the store, feed events into the corroboration engine. For example, after the GDELT polling success:

```typescript
        // After setFeedHealthy("gdelt"):
        const gdeltRegionEvents = events.map((e: { lat: number; lon: number; goldsteinScale: number; eventCode: string }) => ({
          domain: "gdelt" as const,
          region: latLonToRegion(e.lat, e.lon),
          timestamp: Date.now(),
          severity: Math.abs(e.goldsteinScale) / 10,
          keywords: [e.eventCode],
        }));
        corroborationEngine.ingest(gdeltRegionEvents);
```

Apply similar patterns for:
- Military flights → domain `"military"`, region from lat/lon
- USGS seismic → domain `"seismic"`, region from lat/lon
- OTX threats → domain `"cyber"`, region from targeted country
- AIS vessels → domain `"maritime"`, region from lat/lon
- Cloudflare outages → domain `"infrastructure"`, region from location
- ACLED → domain `"conflict"`, region from country
- GDACS → domain `"seismic"`, region from lat/lon
- News → domain `"news"`, region from tags

- [ ] **Step 3: Feed baselines**

In each poll success handler, also feed the baseline tracker:

```typescript
        // After GDELT success:
        baselines.observe(`gdelt:${region}`, events.length);

        // After military success:
        baselines.observe(`military:${region}`, flightCount);

        // etc.
```

Periodically save baselines (every 5 minutes):

```typescript
    const baselineSaveInterval = setInterval(() => baselines.save(), 5 * 60_000);
    // In cleanup:
    return () => { clearInterval(baselineSaveInterval); poller.stopAll(); };
```

- [ ] **Step 4: Wire CII computation**

Update the CII polling task (from Task 9) to actually gather inputs:

```typescript
    poller.add({
      id: "cii",
      intervalMs: 15 * 60_000,
      run: async () => {
        if (platformModeRef.current !== "live") return;
        const s = useArgusStore.getState();

        // Gather data from store — these are the latest poll results
        // The actual data shapes depend on what's stored; adapt as needed
        const ciiScores = computeCii({
          gdeltEvents: [], // Will be populated from stored GDELT data
          militaryFlights: [], // From stored military data
          seismicEvents: [], // From stored seismic data
          threatPulses: [], // From stored OTX data
          outages: [], // From stored outage data
          fredIndicators: {}, // From stored FRED data
        });

        s.setCiiScores(ciiScores);

        // Update CII layer
        if (ciiLayerRef.current) {
          const entries = Object.entries(ciiScores).map(([iso, data]) => ({
            iso,
            score: data.score,
            signals: data.signals,
          }));
          ciiLayerRef.current.updateHotspots(entries);
        }

        // Check for Stage 5 promotion
        for (const [iso, data] of Object.entries(ciiScores)) {
          if (data.score > 60) {
            corroborationEngine.promoteToStrategic(iso);
          }
        }
      },
    });
```

- [ ] **Step 5: Wire news clustering + breaking news**

In the news polling success handler:

```typescript
        // After fetching news:
        const clustered = clusterNews(items);
        useArgusStore.getState().setNewsClusters(clustered);

        // Run breaking news pipeline
        const breaking = processBreakingNews(items);
        if (breaking.length > 0) {
          useArgusStore.getState().setBreakingNews(breaking);
        }
```

- [ ] **Step 6: Run type check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat: wire all feeds into corroboration engine, baselines, CII scoring, and news clustering"
```

---

### Task 19: Alert Display in HUD

**Files:**
- Modify: `argus-app/src/components/HudOverlay.tsx`

- [ ] **Step 1: Add alert display section**

In `argus-app/src/components/HudOverlay.tsx`, add an alerts section near the top of the sidebar (high visibility):

```tsx
{/* ALERTS — show Stage 3+ prominently */}
{alerts.filter((a) => a.stage >= 3).length > 0 && (
  <div className="space-y-1 px-2">
    {alerts
      .filter((a) => a.stage >= 3)
      .slice(0, 10)
      .map((alert) => {
        const bgColor =
          alert.stage === 5 ? "bg-red-900/40 border-red-500" :
          alert.stage === 4 ? "bg-orange-900/30 border-orange-500" :
          "bg-yellow-900/20 border-yellow-500";
        const stageLabel =
          alert.stage === 5 ? "STRATEGIC" :
          alert.stage === 4 ? "HIGH CONFIDENCE" :
          "CORROBORATED";
        return (
          <div key={alert.id} className={`rounded border-l-2 ${bgColor} border border-[#3c3836] px-2 py-1.5 font-mono text-[10px]`}>
            <div className="flex items-center justify-between">
              <span className={
                alert.stage === 5 ? "font-bold text-red-400" :
                alert.stage === 4 ? "font-bold text-orange-400" :
                "text-yellow-400"
              }>
                {stageLabel}
              </span>
              <span className="text-[#a89984]">{alert.region}</span>
            </div>
            <div className="mt-0.5 text-[#d4be98]">{alert.summary}</div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {alert.domains.map((d) => (
                <span key={d} className="rounded bg-[#3c3836] px-1 text-[8px] text-[#a89984]">{d}</span>
              ))}
            </div>
            {alert.keywords.length > 0 && (
              <div className="mt-0.5 text-[8px] text-[#a89984]">
                {alert.keywords.slice(0, 5).join(", ")}
              </div>
            )}
          </div>
        );
      })}
  </div>
)}
```

- [ ] **Step 2: Add breaking news cards**

Add a breaking news section:

```tsx
{breakingNews.length > 0 && (
  <CollapsibleSection title="BREAKING" badge={String(breakingNews.length)}>
    <div className="space-y-1">
      {breakingNews.slice(0, 5).map((bn, i) => (
        <div key={i} className="rounded border border-red-800 bg-red-900/20 px-2 py-1 font-mono text-[10px]">
          <div className="font-bold text-red-400">BREAKING — {bn.region}</div>
          <div className="text-[#d4be98]">{bn.headline}</div>
          <div className="mt-0.5 text-[8px] text-[#a89984]">
            {bn.sources.join(", ")} &middot; Stage {bn.corroborationStage}
          </div>
          {bn.spikedKeywords.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {bn.spikedKeywords.map((kw) => (
                <span key={kw} className="rounded bg-red-900/50 px-1 text-[8px] text-red-300">{kw}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  </CollapsibleSection>
)}
```

- [ ] **Step 3: Add news clustering display**

Update the news feed rendering to use clusters. Where news items are currently rendered, replace with cluster-aware display:

```tsx
{/* Replace individual news items with clustered display */}
{newsClusters.map((cluster, i) => (
  <div key={i} className="rounded border border-[#3c3836] bg-[#1d2021] px-2 py-1 font-mono text-[10px]">
    <div className="text-[#d4be98]">{cluster.lead.title}</div>
    <div className="text-[#a89984]">{cluster.lead.source}</div>
    {cluster.related.length > 0 && (
      <button
        className="mt-0.5 text-[8px] text-[#7fb4c5] hover:underline"
        onClick={() => { /* toggle expansion */ }}
      >
        +{cluster.related.length} related
      </button>
    )}
  </div>
))}
```

- [ ] **Step 4: Pulse header badge on Stage 5 alerts**

Update the health badge to pulse when there are Stage 5 alerts:

```tsx
const hasStrategicAlert = alerts.some((a) => a.stage === 5);

<button
  onClick={() => setWorkspace("status")}
  className={`font-mono text-[10px] ${healthBadgeColor} hover:underline ${hasStrategicAlert ? "animate-pulse" : ""}`}
>
  {activeFeedCount}/{feedTotal} feeds
</button>
```

- [ ] **Step 5: Request browser notification permission on Stage 5**

In CesiumGlobe.tsx, when a Stage 5 alert is created, request notification:

```typescript
// In corroboration callback:
corroborationEngine.setCallbacks(
  (alert) => {
    useArgusStore.getState().addAlert(alert);
    if (alert.stage === 5 && typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`ARGUS Strategic Alert — ${alert.region}`, {
        body: alert.summary,
        icon: "/favicon.ico",
      });
    }
  },
  (id, patch) => useArgusStore.getState().updateAlert(id, patch),
);
```

- [ ] **Step 6: Run type check and verify in browser**

```bash
cd argus-app && npx tsc --noEmit
```

Start dev server and verify:
- Alerts appear in sidebar with correct color coding
- Breaking news cards show with spike keywords
- News items are clustered with "+N related" badges
- Header badge pulses on Stage 5
- Status tab shows all feeds with freshness

- [ ] **Step 7: Commit**

```bash
git add argus-app/src/components/HudOverlay.tsx argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat: alert display with stage-colored cards, breaking news pipeline, news clustering, browser notifications"
```

---

## Final Verification

After all tasks are complete:

- [ ] Run `cd argus-app && npx next build` to verify production build
- [ ] Start dev server and test each new feed endpoint manually
- [ ] Verify health panel shows all feeds with freshness dots
- [ ] Verify circuit breaker behavior by temporarily breaking a feed URL
- [ ] Verify news clustering groups duplicate headlines
- [ ] Check that CII hotspot markers appear for high-instability regions
- [ ] Verify corroboration stages escalate when multiple domains report for same region
