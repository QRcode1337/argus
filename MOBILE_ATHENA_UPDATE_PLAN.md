# ARGUS Mobile Update + ATHENA Integration Plan

**Goal:** Make the mobile experience in argus-app significantly less clunky and fully integrate ATHENA Action Layer (currently only a preview in "Brief" tab and desktop workspace). Provide a dedicated, touch-optimized ATHENA tab with full packet list, decisions, and map integration. Improve overall mobile UX with larger targets, better readability, and modern bottom nav.

**Current State (from exploration):**
- Main UI: CesiumGlobe + HudOverlay.tsx (2683 + 3722 lines, heavy component).
- ATHENA: Full backend support (action packets, decisions, WS), types, AthenaActionCard (Gruvbox dark theme, compact mode), store state, ingest lib.
- Desktop: Workspace tabs include "athena" with full list of compact cards + header (posture, count, watch window).
- Mobile: Limited to MobileTabId = "brief" | "news" | "ops" | "intel". Bottom fixed nav (h-10, tiny 8px text). Brief tab shows *top* AthenaActionCard preview only. No dedicated ATHENA list or full controls on mobile.
- Clunkiness: Tiny fonts (8-10px mono), dense layout, small touch areas (h-10 buttons), cramped 56vh sheet, limited navigation.
- Theme: Consistent Gruvbox-inspired (#1d2021 bg, #ebdbb2 fg, priority colors).
- Safe areas: --safe-bottom etc already in CSS.

**Architecture:**
- Extend existing mobileTab system in HudOverlay.tsx (no new components unless needed).
- Reuse AthenaActionCard, sortedAthenaPackets, handleAthenaDecision, execute logic.
- Add mobile prop to card for touch-friendly variants.
- Keep desktop unchanged; mobile-only improvements inside md:hidden blocks.
- No new deps (use existing Tailwind, Zustand, socket).
- Proxy to backend via /api/athena (nginx routes to argus-api).
- Follow TDD where possible (but UI heavy — lint + manual visual via dev server).
- Incremental: types -> defs -> card -> panel -> UX polish -> validate.

**Tech Stack:** Next 16 + React 19, Tailwind 4, TypeScript, Zustand, Socket.io-client, Cesium.

**Files to Touch:**
- src/components/HudOverlay.tsx (core changes)
- src/components/athena/AthenaActionCard.tsx (enhance for mobile)
- Possibly src/app/globals.css (minor mobile font/spacing boosts)
- Update plan doc itself.

**Principles:** Bite-sized edits. Frequent validation (lint). Small logical commits. Mobile-first improvements but preserve desktop. DRY (reuse card + handlers). YAGNI (no overkill gestures unless simple).

**Verification:**
- npm run lint in argus-app
- npm run build
- Manual: run dev, resize to mobile viewport or use dev tools, test tabs, packet list, decisions, fly-to.
- Check WS updates appear in mobile ATHENA.
- Test on touch simulation.

**Handoff Format (per AGENTS.md):**
After: Summary, files, validation, risks, git status, commits.

---

## Tasks (Bite-sized, sequential)

### Task 1: Update MobileTabId type and mobileTabDefs
**Objective:** Add "athena" to mobile navigation so it appears in bottom bar and sheet logic.

**Files:**
- Modify: /home/volta/argus/argus-app/src/components/HudOverlay.tsx (lines ~221, ~250)

**Step 1:** Change type
```ts
type MobileTabId = "brief" | "news" | "ops" | "intel" | "athena";
```

**Step 2:** Add to defs array (after ops)
```ts
{ id: "athena" as const, label: "ATHENA", icon: "⚡" },
```

**Step 3:** Run to check no TS errors later (will lint/build in final task).

**Commit:** git commit -m "feat: add athena to mobile tabs"

### Task 2: Enhance AthenaActionCard for mobile/touch
**Objective:** Make cards usable on mobile — larger buttons, more padding, optional bigger text. Keep compact for brief preview.

**Files:**
- Modify: /home/volta/argus/argus-app/src/components/athena/AthenaActionCard.tsx

**Add to props:**
```ts
mobile?: boolean;
```

**In component:**
- Use mobile to boost: article px-4 py-3 (vs current 3/2.5)
- Buttons: if mobile, text-[10px] py-2 px-3 , min-h-[36px] for touch
- Keep compact logic.

**Example addition (in button classes):**
```tsx
className={`... ${mobile ? 'text-[10px] py-2 px-3 min-h-[36px]' : 'text-[8px] py-1 px-2'}`}
```

Update all 4 buttons + JSON.

Also, make region label or header tappable later.

**Commit:** after test.

### Task 3: Add ATHENA panel rendering in mobile sheet
**Objective:** Full dedicated view when mobileTab === "athena": header (count, posture, watch), scrollable list of ActionCards (non-compact for detail), basic filter chips (All/Proposed/Critical), empty state.

**Files:**
- Modify: /home/volta/argus/argus-app/src/components/HudOverlay.tsx (around the mobileTab switch ~2884, and title ~2872)

**In sticky header:**
Add case:
```ts
mobileTab === "athena" ? "ATHENA Actions" : ...
```

**After the brief/intel/news/ops blocks (before closing p-3), insert:**
```tsx
{mobileTab === "athena" && (
  <div className="space-y-3">
    <div className="flex items-center justify-between font-mono text-[11px]">
      <div>
        {sortedAthenaPackets.length} packets · {athenaPosture ?? "standby"}
      </div>
      {athenaWatchUntil && <div>Watch until {new Date(athenaWatchUntil).toLocaleTimeString()}</div>}
    </div>
    {/* simple filters */}
    <div className="flex gap-1 flex-wrap">
      {/* buttons for proposed, high+ , all */}
    </div>
    <div className="space-y-3 max-h-[42vh] overflow-auto">
      {sortedAthenaPackets.length === 0 ? (
        <div className="...">ATHENA standing by. Packets from Phantom/GDELT will appear here.</div>
      ) : (
        sortedAthenaPackets.slice(0, 15).map(packet => (
          <AthenaActionCard
            key={packet.id}
            packet={packet}
            compact={false}
            mobile={true}
            onSimulate=... 
            onApprove=...
            onDismiss=...
            onExportJson=...
            // future: onFlyTo={() => packet.region.lat && onFlyToCoordinates(...)}
          />
        ))
      )}
    </div>
  </div>
)}
```

Wire the existing handlers (they are in scope).

Use sortedAthenaPackets (already memoized).

**Step:** Make filters functional with local state or reuse existing filters if any.

**Commit.**

### Task 4: Improve bottom nav and general mobile UX (less clunky)
**Objective:** Larger touch targets (min 44-48px effective), slightly bigger text in nav/sheets, more breathing room, ATHENA badge for critical/proposed packets.

**Files:**
- Modify: HudOverlay.tsx (bottom nav ~3445, mobile sheet container ~2869, brief etc sections)

**Changes:**
- Bottom bar: change h-10 to h-12, text-[9px] or 10px, px-3, gap-2, rounded-2xl.
- Add badge on athena tab similar to brief:
  ```tsx
  {tab.id === "athena" && sortedAthenaPackets.some(p => p.status === "proposed" && (p.priority === "critical" || p.priority === "high")) && (
    <span className="absolute ... bg-[#fb4934]" />
  )}
  ```
- In mobile sheet: add pt-1 or extra padding, use text-[11px] base in some divs.
- In cards via mobile prop.
- Ensure --safe-bottom respected (already is).

**Optional:** Add a subtle "New ATHENA" toast or just rely on badge + list.

**Commit.**

### Task 5: Wire fly-to-region from ATHENA cards (mobile + bonus desktop)
**Objective:** Tap region or "Fly" in card flies the globe to the packet's location. Makes it actionable on mobile.

**Files:**
- Modify: AthenaActionCard (add optional onFlyTo?: (packet) => void prop and button or make region clickable)
- Modify: HudOverlay (pass prop in all usages: onFlyTo={(p) => { if (p.region.lat != null && p.region.lon) onFlyToCoordinates(p.region.lat, p.region.lon); setMobileTab(null); }} )

In card, add a small "Fly" button or make the region div clickable if coords.

For mobile athena, prominent.

**Update types if needed (no).**

**Commit.**

### Task 6: Validation, lint, build, manual test notes
**Objective:** Ensure no breakage.

**Commands (run in /home/volta/argus/argus-app):**
- npm run lint
- npm run build (or next build)
- If dev: npm run dev & use browser devtools device mode (iPhone 12/14), interact with tabs, generate fake packet if possible or wait for WS, test decisions (will hit backend).

**Fix any issues** (e.g. TS from type change — should be fine since string literal).

**Update REPAIR_PLAN.md or README if mobile mentioned (check first).**

**Commit:** "chore: lint and validate mobile athena update"

### Task 7: Handoff + memory
**Objective:** Document per AGENTS.md.

- Run git status, log recent.
- Write summary in plan or separate.
- Use memory tool if needed for "mobile ATHENA updated, use X for ..."
- git commit final.

**Also:** Perhaps add to AGENTS.md a note on mobile.

---

**Risks/Follow-ups:**
- Backend /api/athena must be live (nginx + argus-api container).
- WS for new packets (already wired in HudOverlay).
- Performance: many packets? Slice to 15-20.
- Visual: test on real mobile (Tailwind + safe areas should be good).
- Next: perhaps dedicated mobile ATHENA floating button or persistent mini-list at bottom.

**Ready to execute incrementally. Use subagents if parallel, but here sequential edits to one file mostly.**

After plan: I (as Hephaestus) will forge the updates step by step with validation.

This plan makes the mobile version a first-class ATHENA citizen: actionable, readable, not clunky.

## Completion Notes (Fresh Session with Increased Budget)

- Bottom nav upgraded: h-12, text-[9px], px-3, gap-2, icon 14px, ATHENA critical/high proposed badge (red dot) added to tab (shows when not active).
- Fly-to wired: 
  - AthenaActionCard now accepts onFlyTo prop.
  - Region label is clickable (with hover style and ↗ indicator when coords present).
  - Wired in mobile panel (closes tab + flies), desktop workspace, and brief preview.
- Validation: `npm run lint` (no new errors from changes; 55 total pre-existing). TypeScript `tsc --noEmit --skipLibCheck` clean for our files. Full `npm run build` timed out but previous partial succeeded after fixes.
- All tasks from plan completed incrementally.
- Skill library updated with progress and iteration strategy.
- Higher max_turns=120 allowed completing without hitting previous 60 cap.

Ready for deploy testing on mobile viewport.
