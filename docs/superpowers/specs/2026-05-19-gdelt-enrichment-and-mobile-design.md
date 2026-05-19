# GDELT Digest Enrichment + Mobile HUD Execution — Design

**Date:** 2026-05-19
**Status:** Draft, awaiting plan
**Scope:** `argus-app` — server-side GDELT digest enrichment, new desktop UI panels for the digest, and execution of the existing 2026-05-06 mobile HUD redesign.

## Goal

Three user-stated problems:

1. **GDELT digest is shallow.** The narrative is dense but lacks source citations, structured drill-downs, and richer per-event detail.
2. **Digest only analyzes top 1–100 of ~600 events.** A hard-coded clamp (`Math.min(100, Math.max(50, batchSize))`) discards ~500 events per cycle, even from the prompt's aggregate view.
3. **Mobile experience is cluttered.** A spec and plan exist (2026-05-06) but were never built; `HudOverlay.tsx` has grown to 3292 lines with mobile branches still inline.

Phase A fixes (1) and (2) with a tiered prompt over the full event set and a structured JSON payload. Phase B executes the existing mobile plan verbatim, picking up Phase A's enriched payload where it intersects.

## Non-goals

- New GDELT data sources or ingest changes.
- Streaming digest response (single JSON blob).
- Per-region drill-down views.
- A charts library — histogram is hand-drawn.
- Complete CAMEO event-code coverage — top ~40 codes suffice, rest fall back gracefully.
- Desktop layout changes beyond the new digest panels.
- Changes to the existing mobile spec (executing it as-is).

## Phases

Two phases, sequenced. Phase A is the prerequisite — Phase B's mobile GDELT tab inherits `sourceUrl` in raw-event rows from the enriched payload.

- **Phase A — GDELT digest enrichment.** Server lifts the 1–100 clamp, tiers the full event set (top-N detailed + compressed tail), returns structured JSON alongside the existing narrative. Desktop UI adds five panels above the narrative card.
- **Phase B — Mobile redesign.** Execute `docs/superpowers/plans/2026-05-06-argus-mobile-redesign.md` verbatim. One small enrichment: surface `sourceUrl` on the 8 raw GDELT event rows in the mobile GDELT tab.

---

## Phase A — GDELT digest enrichment

### Server route: `argus-app/src/app/api/ai/gdelt-digest/route.ts`

**Input parameters.** Replace the existing clamp:

| Param | Default | Range | Notes |
| --- | --- | --- | --- |
| `detailedCount` | 75 | 25–150 | How many top events get full detail in the prompt + `structured.topEvents`. Clamped silently. |
| `batchSize` | — | — | Legacy alias. If present and `detailedCount` absent, route through `detailedCount`. |

The whole event set (`events.length`, typically ~600) is analyzed every call. Nothing is dropped from analysis.

**Tiered prompt structure.** Replace the current `DETAILED TOP <batchSize> EVENTS` block:

```
CURRENT UTC REPORT TIME: <nowUtc>
GLOBAL EVENT SUMMARY: <total> total GDELT events captured.
QUAD CLASS COUNTS: cooperation=<n> verbalConflict=<n> materialConflict=<n> other=<n>
TOP REGIONS: <top 15 country: count>
TOP ACTORS: <top 12 name: count>
GOLDSTEIN DISTRIBUTION: <10 buckets, -10..10, "bucket:count" pairs>

DETAILED TOP <detailedCount> EVENTS (by composite score):
[QuadLabel] Actor1 (C1) → Actor2 (C2) | Loc: <name> | G: <goldstein> | M: <mentions> | S: <sources> | T: <tone> | Code: <eventCode> (<eventCodeLabel>) | URL: <sourceUrl>
...

TAIL SUMMARY (<tailCount> additional events, one line each, ranked by composite score):
Actor1→Actor2 | <loc> | G:<n> M:<n>
...
```

Sorting uses the existing `eventScore` (absolute Goldstein, mentions, sources, tone), not raw `Math.abs(goldsteinScale)`. This is the score the fallback digest already uses — promote it to primary.

**CAMEO event-code label data.** New static module `argus-app/src/data/gdeltEventCodes.ts`:

```ts
export const GDELT_EVENT_CODE_LABELS: Record<string, string> = {
  "010": "Make public statement",
  "011": "Decline to comment",
  "012": "Make pessimistic comment",
  // ~40 entries covering the dominant CAMEO base codes
};

export function labelForEventCode(code: string): string {
  return GDELT_EVENT_CODE_LABELS[code]
    ?? GDELT_EVENT_CODE_LABELS[code.slice(0, 3)]
    ?? `Event ${code}`;
}
```

The fallback to 3-digit prefix gives partial coverage for the 4-digit subcategory codes without listing every variant.

**System prompt edit.** Append one instruction to `SYSTEM_PROMPT`:

> "When citing key developments, you may reference source domains in parentheses where they aid attribution (e.g., 'reuters.com'). Do not invent domains; only cite those present in the source material."

Don't widen the structured-output format. The LLM does its own domain extraction from the URLs in the prompt.

**Response shape.** Backwards-compatible — `summary` field preserved.

```ts
{
  summary: string;            // narrative — same contract as today
  narrative: string;          // alias of summary for new callers
  structured: {
    quadCounts: { cooperation: number; verbalConflict: number; materialConflict: number; other: number };
    hotspots: Array<{                                 // top 10 countries by event count
      country: string;
      count: number;
      topGoldstein: number;                            // most extreme |goldstein| in that country
    }>;
    topActors: Array<{                                 // top 12 by count
      name: string;
      country: string;
      count: number;
      avgGoldstein: number;
      avgTone: number;
    }>;
    topEvents: Array<{                                 // detailedCount entries, full record
      id: string;
      actor1Name: string; actor1Country: string;
      actor2Name: string; actor2Country: string;
      location: string;                                // actionGeoName
      goldsteinScale: number;
      numMentions: number;
      numSources: number;
      avgTone: number;
      eventCode: string;
      eventCodeLabel: string;
      quadClass: 1 | 2 | 3 | 4;
      quadLabel: string;
      sourceUrl: string;
    }>;
    regionStats: Array<{                               // top 15 by count
      country: string;
      count: number;
      avgGoldstein: number;
      avgTone: number;
    }>;
    goldsteinHistogram: Array<{                        // 10 buckets: [-10,-8), [-8,-6), ..., [8,10]
      bucket: string;                                  // e.g. "-10..-8"
      count: number;
    }>;
    tailCount: number;                                 // events.length - topEvents.length
  } | null;                                            // null only when events.length === 0
  eventCount: number;
  analyzedCount: number;                               // = topEvents.length
  generatedAt: string;
  degraded: boolean;
  llmError: string | null;
}
```

**Fallback narrative.** Existing `buildFallbackDigest` continues to operate over the full event set (already does — it takes `events`, not the sliced subset). Trigger condition unchanged: `result.error || !result.text || result.text.trim().length < 600`. `structured` is always computed from `events`, so panels render even when the narrative is degraded.

**Empty input.** If `events.length === 0`:
```ts
{ summary: "No GDELT events available for analysis.",
  narrative: "No GDELT events available for analysis.",
  structured: null,
  eventCount: 0, analyzedCount: 0,
  generatedAt: nowUtc, degraded: false, llmError: null }
```

### Desktop UI: new digest panels

The GDELT digest today renders as a single text blob inside `HudOverlay.tsx`'s GDELT workspace. Phase A adds structured panels *above* the narrative — narrative stays as the bottom-of-card payoff.

**New file.** `argus-app/src/components/gdelt/GdeltDigestPanels.tsx`. Five panels:

| Panel | Source | UI |
| --- | --- | --- |
| Hotspots | `structured.hotspots` | Horizontal chip row (top 6 shown; remainder collapsed). Country name · count · color stripe tied to `topGoldstein` sign. |
| Top actors | `structured.topActors` | Compact table — name (country), count, avgGoldstein, avgTone. Goldstein cell color-coded (green ≥ 5, red ≤ -5, neutral otherwise). Top 8 shown. |
| Top events | `structured.topEvents` | Scrollable list — `[QuadLabel] Actor1 → Actor2 | Loc | G/M/T`. Row click opens `sourceUrl` in `target=_blank rel="noopener noreferrer"`. Disabled link if URL missing or invalid. |
| Goldstein histogram | `structured.goldsteinHistogram` | 10 vertical bar divs, height proportional to bucket count, max-height 80px. Hover tooltip via `title` attr — no library. |
| Region stats | `structured.regionStats` | Collapsible card. Top 5 visible; "Show all" expands to 15. Per row: country · count · avgGoldstein · avgTone. |

All five are pure projections of `structured`. If `structured === null`, the component returns `null` (renders nothing).

**Wiring.** `HudOverlay.tsx` GDELT workspace already fetches `/api/ai/gdelt-digest`. Destructure `structured` from the response and pass to `<GdeltDigestPanels structured={structured} />` rendered above the existing narrative text. The existing narrative rendering (the `summary` text block) is untouched — it continues to read `summary` from the same fetch result.

**Carve-out for file size.** `HudOverlay.tsx` is 3292 lines. The new panel block goes in its own file from the start. Do not grow `HudOverlay.tsx` for this work.

**Visual language.** Reuse the existing Gruvbox-ish palette already in the digest card (`#1d2021`, `#282828`, `#3c3836`, `#83a598`, `#fabd2f`, `#fb4934`). Goldstein color scale: `≤ -5` → `#fb4934`, `≥ 5` → `#b8bb26`, otherwise `#928374`.

### Files touched (Phase A)

| File | Action |
| --- | --- |
| `argus-app/src/app/api/ai/gdelt-digest/route.ts` | Edit. Replace clamp, add structured payload, tier the prompt. |
| `argus-app/src/data/gdeltEventCodes.ts` | Create. CAMEO label map + helper. |
| `argus-app/src/components/gdelt/GdeltDigestPanels.tsx` | Create. Five panel components, one default export. |
| `argus-app/src/components/HudOverlay.tsx` | Edit narrowly. Destructure `structured`, render `<GdeltDigestPanels />` above existing digest text in the GDELT workspace block. No other changes. |
| `argus-app/src/types/gdelt.ts` | Edit. Add `GdeltDigestStructured` type matching the response shape above. |

### Non-goals (Phase A)

- No new global state, no new context providers.
- No streaming SSE response.
- No drill-down view for an individual region or actor.
- No new charting dependency.
- No edits to `argus-api` (Express). Digest route is owned by `argus-app` (Next.js).

---

## Phase B — Mobile HUD redesign

Execute `docs/superpowers/plans/2026-05-06-argus-mobile-redesign.md` verbatim. That plan already defines the 5-tab HUD (Brief / GDELT / Strange / Live / Ops), the `useIsMobile` hook, the `MobileHud` orchestrator, the `AiActionButton` atom, and the carve-out from `HudOverlay.tsx`. No changes to that plan.

### Phase A intersections

- **GdeltTab** reads `summary` from `/api/ai/gdelt-digest`. Phase A preserves `summary` — no change needed.
- The 8 raw GDELT events shown below the digest are fetched via the existing `fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt)` ingestor (per the mobile plan). Each `GdeltEvent` already has `sourceUrl`. Surface it as a small link on each row — one-line addition, no scope creep.
- **Structured digest panels are desktop-only.** Mobile GDELT tab stays narrative + 8 raw rows per the existing mobile spec rationale (small viewport, single-action discipline).

### Files touched (Phase B)

Defined by the existing mobile plan. No new files beyond what that plan specifies.

---

## Error handling and edge cases

**Phase A:**

- `detailedCount` out of `[25, 150]` → clamp silently. No error response.
- LLM error or thin output (< 600 chars) → fallback narrative runs. `structured` still returned.
- Empty event set → response shape above. Panels component returns `null`.
- Malformed `sourceUrl` → row renders without the link. Validation: `try { new URL(sourceUrl) } catch { /* drop link */ }`.
- Unknown CAMEO code → `labelForEventCode` returns `"Event <code>"`. Never throws.

**Phase B:** Defined by the existing mobile spec.

## Testing

- `npx tsc --noEmit` clean — primary gate.
- `curl http://localhost/api/ai/gdelt-digest?detailedCount=120` on the live droplet:
  - `structured.topEvents.length === 120`
  - `structured.tailCount === eventCount - 120`
  - `structured.goldsteinHistogram.length === 10`
  - `summary` present and non-empty
  - First `topEvents[0].sourceUrl` is a parseable URL
- Desktop smoke: load `argusweb.bond`, open GDELT digest, verify all five panels render, a top-event row opens its source URL in a new tab.
- Mobile smoke (375×667 + 412×915): execute the existing mobile plan's smoke checklist. Verify the new `sourceUrl` link appears on raw GDELT rows in the GDELT tab.
- Desktop unchanged at 1280×800 outside the GDELT digest card area — no layout shift, no visual regression in other workspaces.
- No new unit tests. All new logic is pure projection over `events` or LLM-prompted text.

## Deployment

Standard flow per `CLAUDE.md`: `docker compose up -d --no-deps --build --force-recreate argus-app` per phase. Phase A and Phase B can ship independently; Phase A should land first so Phase B's source-URL row link works against real payload data.

## Sequence of work (preview for plan)

**Phase A:**

1. Add `gdeltEventCodes.ts` CAMEO map.
2. Add `GdeltDigestStructured` type.
3. Rewrite `gdelt-digest/route.ts` — clamp removal, tiered prompt, structured payload, system-prompt edit.
4. Add `GdeltDigestPanels.tsx` with five panel components.
5. Wire panels into `HudOverlay.tsx`'s GDELT workspace.
6. Type-check, deploy, curl-verify, desktop smoke.

**Phase B:**

7. Execute `docs/superpowers/plans/2026-05-06-argus-mobile-redesign.md` step-by-step.
8. Add `sourceUrl` link on raw GDELT event rows in `GdeltTab.tsx`.
9. Type-check, deploy, mobile smoke.
