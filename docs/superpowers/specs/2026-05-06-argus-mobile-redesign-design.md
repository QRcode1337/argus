# Argus Mobile HUD Redesign — Design

**Date:** 2026-05-06
**Status:** Draft, awaiting plan
**Scope:** Mobile-only HUD redesign for `argus-app` (Next.js). Desktop unchanged.

## Goal

Surface four features that today are desktop-only or absent on mobile — **Anomaly Atlas (STRANGE)**, **GDELT digest + events**, **live feed videos**, and the **AI summary button** — without cluttering the small viewport. Deliver an obvious visual hierarchy and a single contextual primary action across the whole experience.

## Non-goals

- Desktop layout changes.
- Cesium globe rendering, layer rendering, or any feed-route changes.
- New backend endpoints.
- New global state or new data fetches (mobile is a pure projection over existing state).

## Layout

Three frozen layers, top to bottom, no floating overlays, no modals, no side drawers.

```
┌────────────────────────────────┐
│  ① STATUS RAIL  (36 px)         │  threat lvl · region · UTC
├────────────────────────────────┤
│                                 │
│                                 │
│  ② ACTIVE TAB BODY  (~75% h)    │  one tab visible at a time
│                                 │  inline AI button at TOP
│                                 │
├────────────────────────────────┤
│ ③ TAB BAR  (52 px) ─ 5 segments │  [◆ Brief][◳ GDELT][◉ Strange][▶ Live][⚙ Ops]
└────────────────────────────────┘
```

Hierarchy:

1. **Status rail** — what is the world doing.
2. **Active tab body** — what am I looking at right now.
3. **Tab bar** — what else can I look at.

The active tab is the only one that shows a label; inactive tabs show their glyph only. This is how five tabs fit on small screens without crowding.

## Per-tab content

### ◆ Brief
- AI button at top → `Summarize Brief` → calls `/api/ai/summarize`.
- Status pills row (live count, feeds active, layers active) — kept as today.
- 1-paragraph intel briefing summary.
- "Mission Brief" sub-card listing up to 5 alerts (existing data).

### ◳ GDELT
- AI button at top → `Digest GDELT` → calls `/api/ai/gdelt-digest`.
- Digest text once returned. Collapses to a 4-line preview; tap to expand the full digest inline.
- Below: latest 8 raw GDELT events as compact rows (timestamp · region · headline). Tap a row → inline mini-summary for that event (uses `/api/ai/summarize`).

### ◉ Strange (Anomaly Atlas)
- AI button at top → `Summarize this site`. Disabled (faded) when no site is selected.
- Filter chip row (horizontally scrollable): `All · Geometric · Crater · Censored · Desert · Underwater · Military · Natural · Vanished · Antarctica · Other`. Active chip shows a count badge.
- Vertical list of sites — one row each: `[status icon] Name · category dot · lat,lon`. Category dot color uses existing `CATEGORY_COLORS` from `src/data/anomalyAtlas.ts`, so visual language matches the desktop globe.
- Tap a row → row expands inline with the site description and a **Fly to** action that drives the existing Cesium camera-fly. Tap again to collapse. AI button activates while a row is selected.

### ▶ Live
- AI button at top → `Caption this stream`. Sends current visible feed metadata to `/api/ai/summarize`, returns a 2-line caption + threat tag.
- Full-width 16:9 player (current feed from `LIVE_FEEDS` in `src/data/liveFeeds.ts`).
- Caption row: feed title · source · `1/10` position.
- Swipe left/right anywhere on the player → prev/next feed.
- Page indicator: 10 dots below the player.

### ⚙ Ops
- AI button at top → `Audit Ops`.
- Layer toggles in a 2-column grid (existing layer set, condensed).
- Feed health summary in 3 columns: ok / degraded / error counts, derived from `/api/feeds/health`.
- Settings shortcut.

## Architecture

### New files (`argus-app/src/components/mobile/`)

| File | Responsibility |
| --- | --- |
| `MobileHud.tsx` | Orchestrator. Owns active-tab state. Renders status rail + active panel + tab bar. |
| `AiActionButton.tsx` | Shared single-button component. Props: `label`, `onClick`, `loading`, `disabled`. |
| `tabs/BriefTab.tsx` | Brief panel content. |
| `tabs/GdeltTab.tsx` | GDELT panel content. |
| `tabs/StrangeTab.tsx` | Anomaly Atlas panel content. |
| `tabs/LiveTab.tsx` | Live video swiper + caption + AI button. |
| `tabs/OpsTab.tsx` | Layer toggles + feed health + settings shortcut. |

### Wiring into existing code

`HudOverlay.tsx` is 3220 lines — already too large to keep growing. We carve the mobile branch out:

At the top of `HudOverlay`, when `window.matchMedia("(max-width: 767px)")` is true, return `<MobileHud {...sameProps} />` and short-circuit. The desktop branch stays untouched. The redesign therefore both adds the new mobile HUD and reduces `HudOverlay`'s scope by removing the existing mobile sections (HudOverlay.tsx lines ~880–935 status header and ~2496–2900 mobile tab panels).

Mobile detection uses a small hook:

```tsx
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}
```

Lives in `argus-app/src/lib/hooks/useIsMobile.ts`.

### Data flow

Most data comes from props the parent (`CesiumGlobe`) already passes into `HudOverlay`: intel briefing, news items, alerts, layer toggles, feed health, selected intel, plus camera helpers `onFlyToCoordinates(lat, lon)` and `onFlyToEntityById(id)`. `ANOMALY_SITES` and `LIVE_FEEDS` are static module imports (`src/data/anomalyAtlas.ts`, `src/data/liveFeeds.ts`) — no props needed.

**One exception — GDELT events.** Today they are fetched inside `HudOverlay` only when desktop `workspace === "gdelt"` (see HudOverlay.tsx ~line 388). Mobile has no workspace concept. `MobileHud` will own its own GDELT fetch, triggered by a `useEffect` that fires the first time the GDELT tab becomes active in the session, using the same `fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt)` ingestor. Refetch on a 5-minute interval while the tab is active; pause when another tab is active. State is local to `MobileHud`.

`MobileHud` is otherwise a pure projection — no other new fetches, no new global state, no new context providers.

### AI button behavior

The shared `AiActionButton` calls existing endpoints:

| Tab | Action | Endpoint |
| --- | --- | --- |
| Brief | Summarize Brief | `POST /api/ai/summarize` (briefing payload) |
| GDELT | Digest GDELT | `GET /api/ai/gdelt-digest?batchSize=…` |
| Strange | Summarize this site | `POST /api/ai/summarize` (selected site description) |
| Live | Caption this stream | `POST /api/ai/summarize` (feed metadata) |
| Ops | Audit Ops | `POST /api/ai/summarize` (feed health + layer state) |

Loading and error handled locally per-tab. Errors render as a small inline pill (`AI temporarily unavailable`) under the button — no toasts, no modals.

### Live video swiping

Hand-rolled touch handlers (~30 LoC, in `LiveTab.tsx`) — track `touchstart`/`touchmove`/`touchend`, fire `next`/`prev` when horizontal swipe exceeds a 60 px threshold. Avoids adding a new dependency. Vertical swipes are ignored to coexist with page scroll.

### Tab persistence and re-tap behavior

Active tab is `useState` in `MobileHud` — survives orientation change. Not in URL, not in localStorage; keeps URLs clean and avoids stale state across sessions. Tapping the already-active tab scrolls its body back to top (no-op if already at top).

### Camera coupling (Strange "Fly to")

The Strange tab's per-row **Fly to** action calls `onFlyToCoordinates(site.lat, site.lon)`, a prop already passed from `CesiumGlobe` to `HudOverlay`. `MobileHud` simply forwards it. No new globe code.

## Edge cases and errors

- **No site selected on Strange**: AI button disabled, label `Summarize this site`, faded.
- **YouTube embed blocked or fails to load**: centered placeholder `Stream unavailable — try another feed` with a `→` skip button. Detected by `iframe` `onError` plus a 5 s readiness timeout.
- **AI endpoint fails**: inline pill under the button; no retry button (user taps the AI button again).
- **GDELT digest empty**: shows `No fresh events` instead of an empty card.
- **Anomaly list empty for filter**: shows `No sites in this category` row.

## Testing

- `npx tsc --noEmit` is the gate. Must pass clean.
- No new unit tests — components are presentation layers over existing data.
- Manual smoke test on the deployed droplet at two viewports: 375×667 (iPhone SE) and 412×915 (Pixel 7). Verify each tab renders, AI button works, swipe works on Live, fly-to works on Strange.
- Verify desktop is byte-identical (no visual diff, no layout shift) at 1280×800.

## Visual language

- Reuse existing palette and font stack from `globals.css` and current HudOverlay (Gruvbox-ish: `#1d2021`, `#282828`, `#3c3836`, `#504945`, `#83a598`, `#ebdbb2`, `#fabd2f`, `#fb4934`).
- Borders are 1 px hairlines (`border-[#3c3836]`); active states use `#83a598`.
- Anomaly category dots use the existing `CATEGORY_COLORS` map directly.

## Out of scope

- Desktop layout, desktop tabs, desktop panels.
- Cesium globe rendering and any layer logic.
- New API endpoints.
- New backend feed routes.
- Authentication, rate limiting, or any infra changes.

## Sequence of work (preview for plan)

1. Add `useIsMobile` hook.
2. Add `AiActionButton` (shared atom).
3. Add `MobileHud` shell with empty tabs + tab bar + status rail.
4. Wire `HudOverlay` to short-circuit to `MobileHud` on mobile viewport. Remove old mobile branches from `HudOverlay`.
5. Implement each tab in dependency order: Brief → Ops → GDELT → Strange → Live.
6. Type-check, deploy, smoke on phone.
