# Vercel Deployment Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the Vercel deployment so the Cesium globe loads with terrain and all live data feeds (flights, satellites, seismic, CCTV) work in production.

**Architecture:** Set missing env vars via Vercel CLI, convert CelesTrak proxy to Edge runtime to bypass response size limits, add in-memory caching to OpenSky proxy to avoid rate-limiting, and update vercel.json for longer function timeouts.

**Tech Stack:** Next.js 16 App Router, Vercel CLI, Vercel Edge Functions, CesiumJS

---

### Task 1: Set Cesium Ion Token on Vercel

**Files:**
- None (CLI-only operation)

**Step 1: Add NEXT_PUBLIC_CESIUM_ION_TOKEN to Vercel**

Run from `argus-app/` directory (the linked Vercel project):

```bash
cd /Users/patrickgallowaypro/Documents/PROJECTS/Argus/argus-app
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlZGZjNjgzNy0wYzc0LTQzMjItOWE3ZC00YTIzNWE4Mzk1ZDgiLCJpZCI6Mzk1MTY0LCJpYXQiOjE3NzIxNjMxNzJ9.u6sXmTK2HzqQNm9uG0Vn57OcAub-xBrjhc-7onDH278" | vercel env add NEXT_PUBLIC_CESIUM_ION_TOKEN production
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlZGZjNjgzNy0wYzc0LTQzMjItOWE3ZC00YTIzNWE4Mzk1ZDgiLCJpZCI6Mzk1MTY0LCJpYXQiOjE3NzIxNjMxNzJ9.u6sXmTK2HzqQNm9uG0Vn57OcAub-xBrjhc-7onDH278" | vercel env add NEXT_PUBLIC_CESIUM_ION_TOKEN preview
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlZGZjNjgzNy0wYzc0LTQzMjItOWE3ZC00YTIzNWE4Mzk1ZDgiLCJpZCI6Mzk1MTY0LCJpYXQiOjE3NzIxNjMxNzJ9.u6sXmTK2HzqQNm9uG0Vn57OcAub-xBrjhc-7onDH278" | vercel env add NEXT_PUBLIC_CESIUM_ION_TOKEN development
```

**Step 2: Verify the env var is set**

```bash
vercel env ls
```

Expected: `NEXT_PUBLIC_CESIUM_ION_TOKEN` listed for Production, Preview, Development.

---

### Task 2: Convert CelesTrak Route to Edge Runtime

**Files:**
- Modify: `argus-app/src/app/api/feeds/celestrak/route.ts`

**Step 1: Add Edge runtime export and stream the response**

Replace the full file content with:

```ts
export const runtime = "edge";

export async function GET() {
  const upstream =
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json";

  try {
    const response = await fetch(upstream, { cache: "no-store" });

    if (!response.ok || !response.body) {
      return new Response(
        JSON.stringify({ error: `CelesTrak HTTP ${response.status}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "CelesTrak proxy failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
```

Key changes:
- `export const runtime = "edge"` — runs on Edge (no body size limit, 25s timeout)
- Removed `NextResponse` — Edge uses native `Response` (lighter, no Node.js deps)
- Streams `response.body` directly through instead of buffering with `.text()`
- Added `Cache-Control` header so Vercel CDN caches for 30s
- Removed `process.env.CELESTRAK_ENDPOINT` — Edge runtime doesn't support non-`NEXT_PUBLIC_` env vars via `process.env`; hardcoded the default since there's no override needed

**Step 2: Verify the file compiles**

```bash
cd /Users/patrickgallowaypro/Documents/PROJECTS/Argus/.claude/worktrees/vibrant-tharp/argus-app
npx tsc --noEmit src/app/api/feeds/celestrak/route.ts 2>&1 || echo "Type check done (warnings ok)"
```

**Step 3: Commit**

```bash
git add src/app/api/feeds/celestrak/route.ts
git commit -m "fix: convert CelesTrak proxy to Edge runtime for Vercel body size limit"
```

---

### Task 3: Add In-Memory Cache to OpenSky Route

**Files:**
- Modify: `argus-app/src/app/api/feeds/opensky/route.ts`

**Step 1: Add TTL cache (same pattern as webcams route)**

Replace the full file content with:

```ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cachedBody: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10_000;

export async function GET() {
  const now = Date.now();
  if (cachedBody && now - cachedAt < CACHE_TTL_MS) {
    return new NextResponse(cachedBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "HIT",
      },
    });
  }

  const upstream =
    process.env.OPENSKY_ENDPOINT ?? "https://opensky-network.org/api/states/all";

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const body = await response.text();

    if (response.ok) {
      cachedBody = body;
      cachedAt = now;
    }

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    if (cachedBody) {
      return new NextResponse(cachedBody, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "STALE",
        },
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OpenSky proxy failed" },
      { status: 502 },
    );
  }
}
```

Key changes:
- 10s in-memory cache prevents hammering OpenSky from Vercel
- `X-Cache` header for debugging (HIT/MISS/STALE)
- On fetch error, returns stale cached data instead of 502 (graceful degradation)

**Step 2: Commit**

```bash
git add src/app/api/feeds/opensky/route.ts
git commit -m "fix: add 10s TTL cache to OpenSky proxy to avoid upstream rate limits"
```

---

### Task 4: Update vercel.json Configuration

**Files:**
- Modify: `argus-app/vercel.json`

**Step 1: Add maxDuration and function config**

Replace full file content with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "npm run setup-cesium && npm run build",
  "installCommand": "npm install",
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 25
    }
  }
}
```

Key change: `maxDuration: 25` gives serverless functions 25 seconds (up from default 10s) to fetch from slow upstreams like OpenSky.

**Step 2: Commit**

```bash
git add vercel.json
git commit -m "build: set maxDuration 25s for API routes in vercel.json"
```

---

### Task 5: Deploy to Vercel

**Files:**
- None (CLI-only operation)

**Step 1: Push code changes to trigger deployment**

```bash
cd /Users/patrickgallowaypro/Documents/PROJECTS/Argus/.claude/worktrees/vibrant-tharp
git push origin claude/vibrant-tharp
```

Then create a PR or deploy directly:

```bash
cd argus-app
vercel --prod
```

**Step 2: Verify the deployment**

```bash
vercel ls
```

Expected: New deployment with status `Ready`.

**Step 3: Smoke-test the live feeds**

```bash
curl -s "https://argus-gmqykwi5i-epsilosec.vercel.app/api/feeds/opensky" | head -c 200
curl -s "https://argus-gmqykwi5i-epsilosec.vercel.app/api/feeds/celestrak" | head -c 200
curl -s "https://argus-gmqykwi5i-epsilosec.vercel.app/api/feeds/usgs" | head -c 200
```

Expected: JSON responses (not 502 errors) from all three endpoints.

---

## Summary

| Task | What | Time |
|------|------|------|
| 1 | Set Cesium Ion env var on Vercel | 2 min |
| 2 | CelesTrak route → Edge runtime | 3 min |
| 3 | OpenSky route → in-memory cache | 3 min |
| 4 | vercel.json maxDuration | 2 min |
| 5 | Deploy and verify | 5 min |
| **Total** | | **~15 min** |
