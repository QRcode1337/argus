# Vercel Deployment Fix — Design Document

**Date**: 2026-02-27
**Status**: Approved
**Scope**: Environment variables, feed reliability, Vercel configuration

## Problem Statement

The Vercel deployment at `argus-gmqykwi5i-epsilosec.vercel.app` is live but non-functional:

1. **No environment variables** set on Vercel — `NEXT_PUBLIC_CESIUM_ION_TOKEN` is empty, preventing Cesium globe/terrain initialization
2. **Live flights (OpenSky)** not loading — upstream API rate-limits cloud IPs; rapid polling from serverless functions triggers throttling
3. **Satellites (CelesTrak)** not loading — `GROUP=active` returns 10,000+ records (15-30MB JSON), exceeding Vercel's 4.5MB serverless response body limit

## Solution Design

### 1. Environment Variables via Vercel CLI

Set `NEXT_PUBLIC_CESIUM_ION_TOKEN` for all environments using `vercel env add`.

Only this one variable is needed immediately. Other upstream endpoints (OpenSky, CelesTrak, USGS, ADS-B, TfL) use public APIs with defaults hardcoded in `.env.example`.

### 2. CelesTrak Route — Edge Runtime

Convert `src/app/api/feeds/celestrak/route.ts` to Edge runtime:

```ts
export const runtime = 'edge';
```

**Why**: Edge Functions have no response body size limit and 25s timeout (vs 4.5MB limit and 10s timeout for serverless). The route is a pure JSON proxy — no Node.js-specific APIs required.

### 3. OpenSky Route — In-Memory TTL Cache

Add a 10-second in-memory cache to `src/app/api/feeds/opensky/route.ts`:

- Store last successful response body + timestamp
- Return cached data if age < 10 seconds
- Dramatically reduces upstream request volume from Vercel
- Same pattern already used successfully in the webcams route

### 4. Vercel Configuration Updates

Update `vercel.json` with:

- `maxDuration: 25` for serverless functions (allows longer upstream fetches)
- Proper function configuration for the API routes

### 5. Redeploy

After env vars are set and code changes merged, trigger a production deployment.

## Files Changed

| File | Change |
|------|--------|
| `argus-app/src/app/api/feeds/celestrak/route.ts` | Add `export const runtime = 'edge'` |
| `argus-app/src/app/api/feeds/opensky/route.ts` | Add in-memory TTL cache (10s) |
| `argus-app/vercel.json` | Add `maxDuration`, function config |
| Vercel env vars | Set `NEXT_PUBLIC_CESIUM_ION_TOKEN` |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| OpenSky still rate-limits even with caching | Cache reduces requests 10x; can increase TTL if needed |
| Edge runtime incompatibility | Route is pure fetch-proxy, no Node.js APIs used |
| CelesTrak response still too large for client | Already limited to 1,200 satellites in `ARGUS_CONFIG.limits.maxSatellites` client-side |

## Success Criteria

- Globe loads with terrain and buildings on Vercel deployment
- Flight entities appear on the globe (OpenSky feed healthy)
- Satellite entities appear on the globe (CelesTrak feed healthy)
- No 502 errors on `/api/feeds/*` routes
