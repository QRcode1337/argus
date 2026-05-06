# Argus Mobile HUD Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-tab mobile HUD with a 5-tab layout (Brief / GDELT / Strange / Live / Ops) that surfaces the Anomaly Atlas, GDELT digest+events, live YouTube feeds, and a contextual per-tab AI summary button — without cluttering the small viewport.

**Architecture:** A new `MobileHud` component, mounted from `HudOverlay.tsx` when viewport is `<= 767px`, that owns its own active-tab state and renders status rail + active panel + 5-segment tab bar. Each tab is a small functional component reading existing props/state from `HudOverlay`. One shared `AiActionButton` atom is reused across all tabs with per-tab copy + endpoint. The mobile branches inside `HudOverlay.tsx` are deleted, reducing it from 3220 LoC.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind. No new runtime dependencies. Existing endpoints (`/api/ai/summarize`, `/api/ai/gdelt-digest`, `/api/feeds/health`), existing data modules (`@/data/anomalyAtlas`, `@/data/liveFeeds`), existing `fetchGdeltEvents` ingestor.

**Source spec:** `docs/superpowers/specs/2026-05-06-argus-mobile-redesign-design.md`

**Verification gates** (project has no unit-test framework; per `argus/CLAUDE.md`):
- `npx tsc --noEmit` after every code task — must pass clean.
- `npx next build` after the final task — must succeed.
- Live smoke via deploy + iPhone/Pixel viewport on `argusweb.bond` after final task.

---

## File map

**New files:**
- `argus-app/src/lib/hooks/useIsMobile.ts` — viewport hook.
- `argus-app/src/components/mobile/AiActionButton.tsx` — shared button atom.
- `argus-app/src/components/mobile/MobileHud.tsx` — orchestrator (status rail + tab bar + active body).
- `argus-app/src/components/mobile/MobileHudProps.ts` — shared props type for MobileHud and tabs.
- `argus-app/src/components/mobile/tabs/BriefTab.tsx`
- `argus-app/src/components/mobile/tabs/OpsTab.tsx`
- `argus-app/src/components/mobile/tabs/GdeltTab.tsx`
- `argus-app/src/components/mobile/tabs/StrangeTab.tsx`
- `argus-app/src/components/mobile/tabs/LiveTab.tsx`

**Modified files:**
- `argus-app/src/components/HudOverlay.tsx` — short-circuit to `MobileHud` on mobile; delete existing mobile sections (status header ~880–935, mobile tab panels ~2496–2900, plus `mobileTabDefs`/`mobileTab` state lines 162–166, 310, 617–624).

---

## Task 1: useIsMobile viewport hook

**Files:**
- Create: `argus-app/src/lib/hooks/useIsMobile.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Returns true while the viewport matches a mobile breakpoint.
 * Defaults to false during SSR; updates on mount and on viewport changes.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
```

- [ ] **Step 2: Type-check**

Run from `argus-app/`:
```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/lib/hooks/useIsMobile.ts
git commit -m "feat(mobile): add useIsMobile viewport hook"
```

---

## Task 2: AiActionButton shared atom

**Files:**
- Create: `argus-app/src/components/mobile/AiActionButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { ReactNode } from "react";

interface AiActionButtonProps {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  errorMessage?: string | null;
  icon?: ReactNode;
}

/**
 * Single shared mobile primary action. One stable affordance whose
 * meaning shifts with the active tab.
 */
export function AiActionButton({
  label,
  onClick,
  loading = false,
  disabled = false,
  errorMessage = null,
  icon,
}: AiActionButtonProps) {
  const inactive = disabled || loading;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={inactive}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition ${
          inactive
            ? "border-[#3c3836] bg-[#1d2021] text-[#7c6f64]"
            : "border-[#83a598] bg-[#1d2021] text-[#83a598] hover:bg-[#282828]"
        }`}
      >
        {icon ? <span aria-hidden>{icon}</span> : <span aria-hidden>✶</span>}
        <span>{loading ? "Working…" : label}</span>
      </button>
      {errorMessage ? (
        <p className="px-1 font-mono text-[10px] text-[#fb4934]">{errorMessage}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run from `argus-app/`:
```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/components/mobile/AiActionButton.tsx
git commit -m "feat(mobile): add AiActionButton shared atom"
```

---

## Task 3: Define MobileHud props contract

**Files:**
- Create: `argus-app/src/components/mobile/MobileHudProps.ts`

This task defines the typed contract `MobileHud` and tabs share, so later tasks can reference one source of truth instead of duplicating prop shapes.

- [ ] **Step 1: Create the props type**

```ts
import type { IntelAlert, IntelBriefing, NewsItem, SelectedIntel } from "@/types/intel";
import type { LayerKey } from "@/types/layers";
import type { FeedHealthStatus } from "@/types/feeds";

export type MobileTabId = "brief" | "gdelt" | "strange" | "live" | "ops";

export interface MobileHudProps {
  // status rail
  threatLevel: string | null;
  newsRegionFilter: string;
  platformMode: string;
  utcTimestamp: string;
  totalLiveCount: number;
  activeFeedCount: number;
  feedTotal: number;
  activeLayerCount: number;
  layerTotal: number;

  // brief
  intelBriefing: IntelBriefing | null;
  alerts: IntelAlert[];
  newsItems: NewsItem[];

  // selected target / strange
  selectedIntel: SelectedIntel | null;
  onFlyToCoordinates: (lat: number, lon: number) => void;
  onFlyToEntityById: (id: string) => void;

  // ops / layers
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey) => void;
  feedHealth: Record<string, FeedHealthStatus>;
  onOpenSettings: () => void;
}
```

- [ ] **Step 2: Verify referenced types exist**

Run from `argus-app/`:
```bash
grep -n "IntelAlert\|IntelBriefing\|NewsItem\|SelectedIntel\|LayerKey\|FeedHealthStatus" src/types/intel.ts src/types/layers.ts src/types/feeds.ts 2>/dev/null
```
Expected: all six type names appear at least once in the listed files.

If any type is missing or named differently, run:
```bash
grep -rn "export type \(IntelAlert\|IntelBriefing\|NewsItem\|SelectedIntel\|LayerKey\|FeedHealthStatus\)\|export interface \(IntelAlert\|IntelBriefing\|NewsItem\|SelectedIntel\|LayerKey\|FeedHealthStatus\)" src/types src/lib 2>/dev/null
```
…and adjust the imports in `MobileHudProps.ts` to point at the actual export locations. The intent is "one shared props type" — the names themselves are not load-bearing.

- [ ] **Step 3: Type-check**

Run from `argus-app/`:
```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/components/mobile/MobileHudProps.ts
git commit -m "feat(mobile): add MobileHud shared props type"
```

---

## Task 4: MobileHud shell (status rail + tab bar + empty bodies)

**Files:**
- Create: `argus-app/src/components/mobile/MobileHud.tsx`

`MobileHud` renders the three frozen layers. Tab bodies are placeholder `null`s in this task; later tasks fill them in. This lets us land the shell behind a viewport gate before any tab content exists.

- [ ] **Step 1: Create the orchestrator**

```tsx
"use client";

import { useRef, useState, type ReactNode } from "react";
import type { MobileHudProps, MobileTabId } from "./MobileHudProps";

interface TabDef {
  id: MobileTabId;
  label: string;
  glyph: string;
}

const TABS: TabDef[] = [
  { id: "brief",   label: "Brief",   glyph: "◆" },
  { id: "gdelt",   label: "GDELT",   glyph: "◳" },
  { id: "strange", label: "Strange", glyph: "◉" },
  { id: "live",    label: "Live",    glyph: "▶" },
  { id: "ops",     label: "Ops",     glyph: "⚙" },
];

export function MobileHud(props: MobileHudProps) {
  const [active, setActive] = useState<MobileTabId>("brief");
  const bodyRef = useRef<HTMLElement | null>(null);

  // Re-tap on the active tab scrolls its body back to top.
  const onTabTap = (id: MobileTabId) => {
    if (id === active) {
      bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setActive(id);
    }
  };

  let body: ReactNode = null;
  // tab bodies wired in later tasks
  switch (active) {
    case "brief":
    case "gdelt":
    case "strange":
    case "live":
    case "ops":
      body = (
        <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.24em] text-[#7c6f64]">
          {active} tab — pending
        </div>
      );
      break;
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex flex-col bg-[#1d2021] text-[#ebdbb2] md:hidden">
      {/* ① Status rail */}
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-[#3c3836] bg-[#282828] px-3 font-mono text-[9px] uppercase tracking-[0.2em] text-[#a89984]">
        <span className="text-[#fabd2f]">{props.threatLevel ?? "STANDBY"}</span>
        <span className="text-[#83a598]">{props.newsRegionFilter}</span>
        <span className="text-[#7298a8]">{props.platformMode}</span>
        <span>{props.utcTimestamp || "SYNC"}</span>
      </header>

      {/* ② Active body */}
      <main ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3">{body}</main>

      {/* ③ Tab bar */}
      <nav className="flex h-[52px] shrink-0 items-stretch border-t border-[#3c3836] bg-[#282828]">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabTap(tab.id)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 font-mono text-[9px] uppercase tracking-[0.18em] transition ${
                isActive
                  ? "border-t-2 border-[#83a598] text-[#ebdbb2]"
                  : "border-t-2 border-transparent text-[#7c6f64] hover:text-[#a89984]"
              }`}
              aria-pressed={isActive}
              aria-label={tab.label}
            >
              <span className="text-[14px] leading-none">{tab.glyph}</span>
              {isActive ? <span>{tab.label}</span> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run from `argus-app/`:
```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/components/mobile/MobileHud.tsx
git commit -m "feat(mobile): add MobileHud shell — status rail, tab bar, empty bodies"
```

---

## Task 5: Mount MobileHud from HudOverlay; delete old mobile branches

**Files:**
- Modify: `argus-app/src/components/HudOverlay.tsx`

The existing mobile branches in `HudOverlay.tsx` are: `mobileTabDefs` (~lines 162–166), `mobileTab` state (~line 310), `mobileAlerts`/`mobileAlertPreview`/`mobileHeadlinePreview` memos (~lines 617–624), the mobile status header (~lines ~880–935), and the mobile tab panel block (~lines 2496–2900). All of these get removed in this task. The new mobile path is a single short-circuit at the top of the component.

- [ ] **Step 1: Add the short-circuit at the top of HudOverlay's render**

In `argus-app/src/components/HudOverlay.tsx`, near the top of the file with the other component imports, add:

```tsx
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { MobileHud } from "@/components/mobile/MobileHud";
```

Then, inside the `HudOverlay` component body, immediately after the props are destructured and any required hooks (like `useIsMobile`) are called but **before** the existing mobile JSX is reached, add:

```tsx
const isMobile = useIsMobile();

if (isMobile) {
  return (
    <MobileHud
      threatLevel={intelBriefing?.threatLevel ?? null}
      newsRegionFilter={newsRegionFilter}
      platformMode={platformMode}
      utcTimestamp={utcTimestamp}
      totalLiveCount={totalLiveCount}
      activeFeedCount={activeFeedCount}
      feedTotal={feedTotal}
      activeLayerCount={activeLayerCount}
      layerTotal={layerDefs.length}
      intelBriefing={intelBriefing}
      alerts={alerts}
      newsItems={filteredNewsItems}
      selectedIntel={selectedIntel}
      onFlyToCoordinates={onFlyToCoordinates}
      onFlyToEntityById={onFlyToEntityById}
      layers={layers}
      onToggleLayer={onToggleLayer}
      feedHealth={feedHealth}
      onOpenSettings={onOpenSettings}
    />
  );
}
```

If a referenced variable on the right side of any prop has a different local name in HudOverlay, use the local name. The contract is what's fed to MobileHud (left side); the right side is whatever HudOverlay already calls them.

- [ ] **Step 2: Delete the obsolete mobile blocks**

Search-and-remove these blocks (anchors are content, not exact line numbers — line numbers may have shifted):

1. `const mobileTabDefs = [` … its closing `];` — full constant.
2. `const [mobileTab, setMobileTab] = useState<MobileTabId | null>(null);` — full statement, plus the `MobileTabId` local type if it was declared only for this state.
3. `const mobileAlerts = useMemo(...` plus `const mobileAlertPreview = useMemo(...` plus `const mobileHeadlinePreview = useMemo(...` — three memos.
4. The mobile status header `<section ...>` block that contains the `Brief` button referencing `setMobileTab(mobileTab === "brief" ? null : "brief")` (~line 894 anchor). Delete the whole `<section>...</section>`.
5. The mobile tab panel block `{mobileTab && (` … its matching `)}` — full conditional render block, including the inner branches for `mobileTab === "brief"`, `"news"`, and `"ops"`.

Verify nothing else references the deleted symbols:
```bash
grep -n "mobileTab\|mobileTabDefs\|mobileAlerts\|mobileAlertPreview\|mobileHeadlinePreview\|MobileTabId" argus-app/src/components/HudOverlay.tsx
```
Expected: zero matches.

- [ ] **Step 3: Type-check**

Run from `argus-app/`:
```bash
npx tsc --noEmit
```
Expected: clean exit. If errors complain about missing `onFlyToCoordinates` / `feedHealth` / `layers` / `onToggleLayer` / `onOpenSettings` props on `HudOverlay`, those props already exist on the component (see CesiumGlobe.tsx ~lines 2611–2640 for the call site). If the type errors say a prop name differs, rename in the `<MobileHud …>` call to match the actual existing prop, not the other way around — do **not** rename existing HudOverlay props.

- [ ] **Step 4: Visual smoke (desktop unchanged)**

Run from `argus-app/`:
```bash
npx next build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add argus-app/src/components/HudOverlay.tsx
git commit -m "feat(mobile): mount MobileHud; remove legacy mobile branches from HudOverlay"
```

---

## Task 6: BriefTab

**Files:**
- Create: `argus-app/src/components/mobile/tabs/BriefTab.tsx`
- Modify: `argus-app/src/components/mobile/MobileHud.tsx`

- [ ] **Step 1: Create BriefTab**

```tsx
"use client";

import { useState } from "react";
import type { MobileHudProps } from "../MobileHudProps";
import { AiActionButton } from "../AiActionButton";

type BriefTabProps = Pick<
  MobileHudProps,
  | "intelBriefing"
  | "alerts"
  | "totalLiveCount"
  | "activeFeedCount"
  | "feedTotal"
  | "activeLayerCount"
  | "layerTotal"
>;

export function BriefTab(props: BriefTabProps) {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summarize = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Mission Brief",
          briefing: props.intelBriefing,
          alerts: props.alerts.slice(0, 10),
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const data = (await res.json()) as { summary?: string };
      setAiSummary(data.summary ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed");
    } finally {
      setLoading(false);
    }
  };

  const previewAlerts = props.alerts.slice(0, 5);

  return (
    <div className="flex flex-col gap-3">
      <AiActionButton
        label="Summarize Brief"
        onClick={summarize}
        loading={loading}
        errorMessage={error ? "AI temporarily unavailable" : null}
      />

      <div className="flex flex-wrap gap-1">
        {[
          { label: "Live",   value: props.totalLiveCount },
          { label: "Feeds",  value: `${props.activeFeedCount}/${props.feedTotal}` },
          { label: "Layers", value: `${props.activeLayerCount}/${props.layerTotal}` },
        ].map((p) => (
          <span
            key={p.label}
            className="rounded-full border border-[#3c3836] bg-[#1d2021] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]"
          >
            {p.label}{" "}
            <span className="ml-1 text-[#d5c4a1]">{String(p.value)}</span>
          </span>
        ))}
      </div>

      {aiSummary ? (
        <section className="rounded-lg border border-[#83a598] bg-[#1d2021] p-3 font-mono text-[11px] leading-relaxed text-[#d5c4a1]">
          {aiSummary}
        </section>
      ) : null}

      <section className="rounded-lg border border-[#3c3836] bg-[#1d2021] p-3">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#83a598]">
          Mission Brief
        </h2>
        <p className="font-mono text-[11px] leading-relaxed text-[#d5c4a1]">
          {props.intelBriefing?.summary ?? "Collecting live feeds…"}
        </p>
      </section>

      <section className="rounded-lg border border-[#3c3836] bg-[#1d2021] p-3">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#83a598]">
          Alerts ({previewAlerts.length}/{props.alerts.length})
        </h2>
        {previewAlerts.length === 0 ? (
          <p className="font-mono text-[10px] text-[#7c6f64]">No alerts in queue.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {previewAlerts.map((alert) => (
              <li
                key={alert.id}
                className="border-l-2 border-[#fabd2f] pl-2 font-mono text-[10px] text-[#d5c4a1]"
              >
                {alert.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

If `IntelAlert` has a different identifier field than `id` or different display field than `title`, adjust the two references — keep all other code identical.

- [ ] **Step 2: Wire BriefTab into MobileHud**

In `argus-app/src/components/mobile/MobileHud.tsx`:

Add import below the existing imports:
```tsx
import { BriefTab } from "./tabs/BriefTab";
```

Replace the entire `switch (active)` block with:

```tsx
switch (active) {
  case "brief":
    body = (
      <BriefTab
        intelBriefing={props.intelBriefing}
        alerts={props.alerts}
        totalLiveCount={props.totalLiveCount}
        activeFeedCount={props.activeFeedCount}
        feedTotal={props.feedTotal}
        activeLayerCount={props.activeLayerCount}
        layerTotal={props.layerTotal}
      />
    );
    break;
  case "gdelt":
  case "strange":
  case "live":
  case "ops":
    body = (
      <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.24em] text-[#7c6f64]">
        {active} tab — pending
      </div>
    );
    break;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/components/mobile/tabs/BriefTab.tsx argus-app/src/components/mobile/MobileHud.tsx
git commit -m "feat(mobile): add Brief tab"
```

---

## Task 7: OpsTab

**Files:**
- Create: `argus-app/src/components/mobile/tabs/OpsTab.tsx`
- Modify: `argus-app/src/components/mobile/MobileHud.tsx`

- [ ] **Step 1: Create OpsTab**

```tsx
"use client";

import { useMemo, useState } from "react";
import type { MobileHudProps } from "../MobileHudProps";
import { AiActionButton } from "../AiActionButton";

type OpsTabProps = Pick<
  MobileHudProps,
  "layers" | "onToggleLayer" | "feedHealth" | "onOpenSettings"
>;

export function OpsTab(props: OpsTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<string | null>(null);

  const counts = useMemo(() => {
    const summary = { ok: 0, degraded: 0, error: 0 };
    for (const item of Object.values(props.feedHealth)) {
      if (item.status === "ok") summary.ok += 1;
      else if (item.status === "degraded") summary.degraded += 1;
      else if (item.status === "error") summary.error += 1;
    }
    return summary;
  }, [props.feedHealth]);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Operations audit",
          layers: props.layers,
          feedHealth: props.feedHealth,
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const data = (await res.json()) as { summary?: string };
      setAudit(data.summary ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed");
    } finally {
      setLoading(false);
    }
  };

  const layerEntries = Object.entries(props.layers) as [keyof typeof props.layers, boolean][];

  return (
    <div className="flex flex-col gap-3">
      <AiActionButton
        label="Audit Ops"
        onClick={runAudit}
        loading={loading}
        errorMessage={error ? "AI temporarily unavailable" : null}
      />

      {audit ? (
        <section className="rounded-lg border border-[#83a598] bg-[#1d2021] p-3 font-mono text-[11px] leading-relaxed text-[#d5c4a1]">
          {audit}
        </section>
      ) : null}

      <section className="rounded-lg border border-[#3c3836] bg-[#1d2021] p-3">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#83a598]">
          Layers
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {layerEntries.map(([key, on]) => (
            <button
              key={String(key)}
              type="button"
              onClick={() => props.onToggleLayer(key)}
              className={`rounded-md border px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                on
                  ? "border-[#83a598] bg-[#1d2021] text-[#ebdbb2]"
                  : "border-[#3c3836] bg-[#282828] text-[#7c6f64]"
              }`}
            >
              {String(key)}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#3c3836] bg-[#1d2021] p-3">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#83a598]">
          Feed Health
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {([
            { label: "OK",       count: counts.ok,       tone: "text-[#b8bb26]" },
            { label: "Degraded", count: counts.degraded, tone: "text-[#fabd2f]" },
            { label: "Error",    count: counts.error,    tone: "text-[#fb4934]" },
          ]).map((cell) => (
            <div
              key={cell.label}
              className="flex flex-col items-center rounded border border-[#3c3836] bg-[#282828] px-2 py-2"
            >
              <span className={`font-mono text-[18px] font-semibold ${cell.tone}`}>{cell.count}</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">
                {cell.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={props.onOpenSettings}
        className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89984] transition hover:border-[#83a598]"
      >
        Open Settings
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire OpsTab into MobileHud**

In `MobileHud.tsx` add the import:
```tsx
import { OpsTab } from "./tabs/OpsTab";
```

In the switch, replace the `case "ops":` placeholder with:
```tsx
case "ops":
  body = (
    <OpsTab
      layers={props.layers}
      onToggleLayer={props.onToggleLayer}
      feedHealth={props.feedHealth}
      onOpenSettings={props.onOpenSettings}
    />
  );
  break;
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/components/mobile/tabs/OpsTab.tsx argus-app/src/components/mobile/MobileHud.tsx
git commit -m "feat(mobile): add Ops tab"
```

---

## Task 8: GdeltTab (with own fetch + 5 min interval)

**Files:**
- Create: `argus-app/src/components/mobile/tabs/GdeltTab.tsx`
- Modify: `argus-app/src/components/mobile/MobileHud.tsx`

GDELT events are not currently in `HudOverlay`'s props (today they are fetched only when desktop workspace is `"gdelt"`). On mobile this tab owns its own fetch.

- [ ] **Step 1: Create GdeltTab**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ARGUS_CONFIG } from "@/lib/config";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import type { GdeltEvent } from "@/types/gdelt";
import { AiActionButton } from "../AiActionButton";

interface GdeltDigestDocument {
  title: string;
  generatedAt: string;
  body: string;
}

interface GdeltTabProps {
  active: boolean;
}

export function GdeltTab({ active }: GdeltTabProps) {
  const [events, setEvents] = useState<GdeltEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [digest, setDigest] = useState<GdeltDigestDocument | null>(null);
  const [digestExpanded, setDigestExpanded] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);

  // Fetch events when tab becomes active; poll while active.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = async () => {
      setEventsLoading(true);
      try {
        const fresh = await fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt);
        if (!cancelled) setEvents(fresh);
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active]);

  const runDigest = async () => {
    setDigestLoading(true);
    setDigestError(null);
    try {
      const res = await fetch("/api/ai/gdelt-digest?batchSize=50");
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const data = (await res.json()) as GdeltDigestDocument;
      setDigest(data);
      setDigestExpanded(false);
    } catch (e) {
      setDigestError(e instanceof Error ? e.message : "AI failed");
    } finally {
      setDigestLoading(false);
    }
  };

  const previewEvents = events.slice(0, 8);

  return (
    <div className="flex flex-col gap-3">
      <AiActionButton
        label="Digest GDELT"
        onClick={runDigest}
        loading={digestLoading}
        errorMessage={digestError ? "AI temporarily unavailable" : null}
      />

      {digest ? (
        <section className="rounded-lg border border-[#83a598] bg-[#1d2021] p-3">
          <header className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[#83a598]">
            <span>{digest.title}</span>
            <button
              type="button"
              onClick={() => setDigestExpanded((v) => !v)}
              className="text-[#a89984] underline-offset-2 hover:underline"
            >
              {digestExpanded ? "Collapse" : "Expand"}
            </button>
          </header>
          <p
            className={`font-mono text-[11px] leading-relaxed text-[#d5c4a1] ${
              digestExpanded ? "" : "line-clamp-4"
            }`}
          >
            {digest.body}
          </p>
        </section>
      ) : null}

      <section className="rounded-lg border border-[#3c3836] bg-[#1d2021] p-3">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#83a598]">
          Latest Events {eventsLoading ? "(updating…)" : `(${previewEvents.length})`}
        </h2>
        {previewEvents.length === 0 ? (
          <p className="font-mono text-[10px] text-[#7c6f64]">
            {eventsLoading ? "Loading…" : "No fresh events"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {previewEvents.map((event) => (
              <li
                key={event.id}
                className="rounded border border-[#3c3836] bg-[#282828] p-2 font-mono text-[10px] text-[#d5c4a1]"
              >
                <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">
                  <span>{event.timestamp}</span>
                  <span className="text-[#83a598]">{event.region ?? "—"}</span>
                </div>
                <div className="mt-1 line-clamp-2">{event.headline ?? event.title ?? ""}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

If `GdeltEvent`'s actual fields differ from `id` / `timestamp` / `region` / `headline` / `title`, adjust those property reads — verify with:
```bash
grep -n "interface GdeltEvent\|type GdeltEvent" argus-app/src/types/gdelt.ts
```

- [ ] **Step 2: Wire GdeltTab into MobileHud**

Add import:
```tsx
import { GdeltTab } from "./tabs/GdeltTab";
```

In the switch, replace the `case "gdelt":` placeholder with:
```tsx
case "gdelt":
  body = <GdeltTab active={active === "gdelt"} />;
  break;
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/components/mobile/tabs/GdeltTab.tsx argus-app/src/components/mobile/MobileHud.tsx
git commit -m "feat(mobile): add GDELT tab with self-managed fetch"
```

---

## Task 9: StrangeTab (Anomaly Atlas with filter chips, fly-to)

**Files:**
- Create: `argus-app/src/components/mobile/tabs/StrangeTab.tsx`
- Modify: `argus-app/src/components/mobile/MobileHud.tsx`

- [ ] **Step 1: Create StrangeTab**

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  ANOMALY_SITES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  STATUS_ICONS,
  type AnomalyCategory,
  type AnomalySite,
} from "@/data/anomalyAtlas";
import { AiActionButton } from "../AiActionButton";

interface StrangeTabProps {
  onFlyToCoordinates: (lat: number, lon: number) => void;
}

const CATEGORY_ORDER: (AnomalyCategory | "all")[] = [
  "all",
  "geometric",
  "crater",
  "censored",
  "desert",
  "underwater",
  "military",
  "natural",
  "vanished",
  "antarctica",
  "other",
];

export function StrangeTab({ onFlyToCoordinates }: StrangeTabProps) {
  const [filter, setFilter] = useState<AnomalyCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sites = useMemo<AnomalySite[]>(
    () => (filter === "all" ? ANOMALY_SITES : ANOMALY_SITES.filter((s) => s.category === filter)),
    [filter],
  );

  const selected = useMemo(
    () => (selectedId ? ANOMALY_SITES.find((s) => s.id === selectedId) ?? null : null),
    [selectedId],
  );

  const summarize = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setAiText(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Anomaly site: ${selected.name}`,
          description: selected.description,
          coordinates: { lat: selected.lat, lon: selected.lon },
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const data = (await res.json()) as { summary?: string };
      setAiText(data.summary ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <AiActionButton
        label="Summarize this site"
        onClick={summarize}
        loading={loading}
        disabled={!selected}
        errorMessage={error ? "AI temporarily unavailable" : null}
      />

      {/* Filter chips */}
      <div className="flex shrink-0 gap-1 overflow-x-auto pb-1">
        {CATEGORY_ORDER.map((cat) => {
          const count =
            cat === "all" ? ANOMALY_SITES.length : ANOMALY_SITES.filter((s) => s.category === cat).length;
          const active = filter === cat;
          const label = cat === "all" ? "All" : CATEGORY_LABELS[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] transition ${
                active
                  ? "border-[#83a598] bg-[#1d2021] text-[#ebdbb2]"
                  : "border-[#3c3836] bg-[#282828] text-[#7c6f64]"
              }`}
            >
              {label}
              {active ? (
                <span className="ml-1 rounded-full bg-[#83a598] px-1 text-[#1d2021]">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Site list */}
      <ul className="flex flex-col gap-1">
        {sites.length === 0 ? (
          <li className="rounded border border-[#3c3836] bg-[#1d2021] p-3 font-mono text-[10px] text-[#7c6f64]">
            No sites in this category
          </li>
        ) : (
          sites.map((site) => {
            const expanded = selectedId === site.id;
            return (
              <li
                key={site.id}
                className={`rounded border bg-[#1d2021] transition ${
                  expanded ? "border-[#83a598]" : "border-[#3c3836]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(expanded ? null : site.id)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left font-mono text-[11px] text-[#d5c4a1]"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{STATUS_ICONS[site.status]}</span>
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[site.category] }}
                    />
                    <span>{site.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">
                    {site.lat.toFixed(2)},{site.lon.toFixed(2)}
                  </span>
                </button>
                {expanded ? (
                  <div className="border-t border-[#3c3836] px-3 py-2">
                    <p className="font-mono text-[10px] leading-relaxed text-[#d5c4a1]">
                      {site.description}
                    </p>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onFlyToCoordinates(site.lat, site.lon)}
                        className="rounded border border-[#83a598] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[#83a598] transition hover:bg-[#282828]"
                      >
                        Fly to →
                      </button>
                    </div>
                    {aiText ? (
                      <p className="mt-2 rounded border border-[#83a598] bg-[#1d2021] p-2 font-mono text-[10px] leading-relaxed text-[#d5c4a1]">
                        {aiText}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Wire StrangeTab into MobileHud**

Add import:
```tsx
import { StrangeTab } from "./tabs/StrangeTab";
```

In the switch, replace the `case "strange":` placeholder with:
```tsx
case "strange":
  body = <StrangeTab onFlyToCoordinates={props.onFlyToCoordinates} />;
  break;
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/components/mobile/tabs/StrangeTab.tsx argus-app/src/components/mobile/MobileHud.tsx
git commit -m "feat(mobile): add Strange tab — Anomaly Atlas with fly-to"
```

---

## Task 10: LiveTab (full-width player with hand-rolled swipe)

**Files:**
- Create: `argus-app/src/components/mobile/tabs/LiveTab.tsx`
- Modify: `argus-app/src/components/mobile/MobileHud.tsx`

- [ ] **Step 1: Create LiveTab**

```tsx
"use client";

import { useRef, useState } from "react";
import { LIVE_FEEDS, type LiveFeedItem } from "@/data/liveFeeds";
import { AiActionButton } from "../AiActionButton";

const SWIPE_THRESHOLD_PX = 60;

export function LiveTab() {
  const [index, setIndex] = useState(0);
  const [iframeError, setIframeError] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startXRef = useRef<number | null>(null);

  const feeds: LiveFeedItem[] = LIVE_FEEDS;
  const current = feeds[index];

  const goNext = () => {
    setCaption(null);
    setIframeError(false);
    setIndex((i) => (i + 1) % feeds.length);
  };
  const goPrev = () => {
    setCaption(null);
    setIframeError(false);
    setIndex((i) => (i - 1 + feeds.length) % feeds.length);
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    startXRef.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = startXRef.current;
    startXRef.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const captionStream = async () => {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Live feed: ${current.title}`,
          source: current.streamUrl,
          context: current,
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const data = (await res.json()) as { summary?: string };
      setCaption(data.summary ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <AiActionButton
        label="Caption this stream"
        onClick={captionStream}
        loading={loading}
        disabled={!current}
        errorMessage={error ? "AI temporarily unavailable" : null}
      />

      <div
        className="relative w-full overflow-hidden rounded-lg border border-[#3c3836] bg-black"
        style={{ aspectRatio: "16 / 9" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {current && !iframeError ? (
          <iframe
            key={current.id}
            src={current.streamUrl}
            title={current.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            onError={() => setIframeError(true)}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89984]">
            <span>Stream unavailable</span>
            <button
              type="button"
              onClick={goNext}
              className="rounded border border-[#83a598] px-2 py-1 text-[#83a598]"
            >
              Try next →
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[#a89984]">
        <span className="flex flex-col">
          <span className="text-[#d5c4a1]">{current?.title ?? "—"}</span>
          <span className="text-[#7c6f64]">{current?.source ?? ""}</span>
        </span>
        <span>{`${index + 1}/${feeds.length}`}</span>
      </div>

      <div className="flex justify-center gap-1">
        {feeds.map((feed, i) => (
          <button
            key={feed.id}
            type="button"
            aria-label={`Go to feed ${i + 1}`}
            onClick={() => {
              setCaption(null);
              setIframeError(false);
              setIndex(i);
            }}
            className={`h-1.5 w-1.5 rounded-full transition ${
              i === index ? "bg-[#83a598]" : "bg-[#3c3836]"
            }`}
          />
        ))}
      </div>

      {caption ? (
        <section className="rounded-lg border border-[#83a598] bg-[#1d2021] p-3 font-mono text-[11px] leading-relaxed text-[#d5c4a1]">
          {caption}
        </section>
      ) : null}
    </div>
  );
}
```

If `LiveFeedItem`'s actual fields differ from `id` / `title` / `source` / `streamUrl`, adjust accordingly. Verify with:
```bash
grep -n "interface LiveFeedItem\|type LiveFeedItem" argus-app/src/data/liveFeeds.ts
```

- [ ] **Step 2: Wire LiveTab into MobileHud**

Add import:
```tsx
import { LiveTab } from "./tabs/LiveTab";
```

In the switch, replace the `case "live":` placeholder with:
```tsx
case "live":
  body = <LiveTab />;
  break;
```

After this task the switch should have a real component for every tab and no `pending` placeholder.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/components/mobile/tabs/LiveTab.tsx argus-app/src/components/mobile/MobileHud.tsx
git commit -m "feat(mobile): add Live tab with swipeable player"
```

---

## Task 11: Build, deploy, and live smoke

**Files:** none (verification only).

- [ ] **Step 1: Production build**

Run from `argus-app/`:
```bash
npx next build
```
Expected: build completes without errors. ESLint warnings about pre-existing files are tolerated; new files in `src/components/mobile/` and `src/lib/hooks/useIsMobile.ts` must be warning-clean.

- [ ] **Step 2: Push and rebuild on droplet**

Run from `~/argus`:
```bash
git push origin master
docker compose up -d --no-deps --build --force-recreate argus-app
```
Expected: `argus_app` reaches `Up` status within ~60s.

- [ ] **Step 3: Verify desktop is byte-identical**

```bash
curl -s -o /tmp/home.html -w "code=%{http_code} size=%{size_download}\n" https://www.argusweb.bond/
grep -q "Cesium" /tmp/home.html && echo "cesium markup intact"
```
Expected: 200 status, `cesium markup intact` printed. (Cesium markup is the desktop sentinel — its presence on the homepage means the desktop branch was not affected.)

- [ ] **Step 4: Mobile viewport smoke**

Load `https://www.argusweb.bond/` on a phone (or Chrome DevTools with iPhone SE 375×667 and Pixel 7 412×915). Verify:

  - Status rail visible at top (threat / region / mode / UTC).
  - Tab bar visible at bottom with 5 glyphs.
  - Tap each tab; active tab shows label, others show glyph only.
  - **Brief**: AI button present, tapping returns text into a teal-bordered card; pills row + Mission Brief + Alerts render.
  - **GDELT**: events list populates within ~10 s; AI button returns digest text; expand/collapse toggle works.
  - **Strange**: filter chips horizontally scroll; tapping a row expands it; **Fly to** triggers the globe behind the HUD to fly. AI button enabled only with a row selected.
  - **Live**: video plays; swipe left/right changes feed; dot indicator updates; "Caption this stream" returns text.
  - **Ops**: layer toggles flip on tap; OK/Degraded/Error counts non-zero; Open Settings reaches the existing settings modal.

- [ ] **Step 5: Confirm no regressions in app logs**

Run on droplet:
```bash
docker logs argus_app --since 5m 2>&1 | grep -iE "error|exception|fail|warn" | grep -v "Failed to find Server Action" | tail -20
```
Expected: no new mobile-related errors. (Pre-existing "Server Action" lines are unrelated noise.)

- [ ] **Step 6: Final commit (only if anything was patched during smoke)**

If smoke testing revealed an issue you fixed, commit it; otherwise skip:
```bash
git add -A
git commit -m "fix(mobile): smoke-test patches"
git push origin master
docker compose up -d --no-deps --build --force-recreate argus-app
```

---

## Self-review checklist (for the implementer)

Before declaring the feature done, run through this list:

- [ ] All 5 tab cases in `MobileHud.tsx` route to a real component (no `pending` placeholders).
- [ ] No references to `mobileTab`, `mobileTabDefs`, `mobileAlerts`, `mobileAlertPreview`, `mobileHeadlinePreview`, or `MobileTabId` remain in `HudOverlay.tsx`.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npx next build` passes.
- [ ] Desktop visual smoke at 1280×800 is unchanged.
- [ ] Mobile smoke at 375×667 and 412×915 covers all 5 tabs.
- [ ] AI button appears once and only once per tab, always at the top.
- [ ] No floating overlays, no modals, no side drawers were introduced.
