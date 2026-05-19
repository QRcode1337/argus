# GDELT Digest Enrichment + Mobile HUD Execution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the GDELT digest's 1–100 event clamp into a tiered prompt over all ~600 events, return structured JSON alongside the existing narrative, surface that data as five desktop panels, and execute the existing 2026-05-06 mobile HUD redesign with a single GDELT enrichment pickup.

**Architecture:** Server-side enrichment is the prerequisite — the digest route returns a backwards-compatible payload (preserves `summary`) plus a new `structured` field with hotspots, top actors, top events (with source URLs), region stats, and a Goldstein histogram. Desktop renders panels above the existing narrative card; mobile reuses the existing redesign plan and gains source-URL links on raw GDELT rows. Phase A (server + desktop) ships first, then Phase B (mobile) executes the pre-existing plan.

**Tech Stack:** Next.js 14 (App Router) API route, React/TypeScript, Tailwind, Docker Compose deploy, no test framework. Verification gate is `npx tsc --noEmit` + curl on the live droplet + browser smoke per CLAUDE.md.

---

## Reference

- Spec: `docs/superpowers/specs/2026-05-19-gdelt-enrichment-and-mobile-design.md`
- Phase B existing plan: `docs/superpowers/plans/2026-05-06-argus-mobile-redesign.md`
- Existing digest route: `argus-app/src/app/api/ai/gdelt-digest/route.ts`
- Existing GDELT type: `argus-app/src/types/gdelt.ts`
- HudOverlay digest references: lines 397–405 (state shape), 796–822 (fetch), 824–847 (export), 2220–2244 (slider + CTA), 3052–3136 (modal)

## File Structure

**Phase A — create:**
- `argus-app/src/data/gdeltEventCodes.ts` — CAMEO label map + helper
- `argus-app/src/components/gdelt/GdeltDigestPanels.tsx` — five panel components

**Phase A — modify:**
- `argus-app/src/types/gdelt.ts` — add `GdeltDigestStructured` type
- `argus-app/src/app/api/ai/gdelt-digest/route.ts` — replace clamp, add structured payload, tier the prompt, update system prompt
- `argus-app/src/components/HudOverlay.tsx` — state shape, slider range, fetch destructure, render panels above narrative

**Phase B:** Files defined by `docs/superpowers/plans/2026-05-06-argus-mobile-redesign.md`. One incremental addition: render `sourceUrl` link on raw event rows in `argus-app/src/components/mobile/tabs/GdeltTab.tsx`.

---

# PHASE A — GDELT Digest Enrichment

## Task A1: Add CAMEO event-code label data

**Files:**
- Create: `argus-app/src/data/gdeltEventCodes.ts`

- [ ] **Step 1: Create the CAMEO label module**

Create `argus-app/src/data/gdeltEventCodes.ts` with the following exact contents:

```ts
// CAMEO event-code labels for GDELT. Covers root codes 01-20 and the
// dominant subcodes seen in GDELT 2.0 daily slices. Unknown codes fall
// back to the 3-digit prefix, then to "Event <code>".

export const GDELT_EVENT_CODE_LABELS: Record<string, string> = {
  // 01 — Make Public Statement
  "010": "Make public statement",
  "011": "Decline to comment",
  "012": "Make pessimistic comment",
  "013": "Make optimistic comment",
  "014": "Consider policy option",
  "015": "Acknowledge or claim responsibility",
  // 02 — Appeal
  "020": "Appeal",
  "023": "Appeal for material aid",
  "025": "Appeal for de-escalation",
  // 03 — Express Intent to Cooperate
  "030": "Express intent to cooperate",
  "031": "Express intent for material cooperation",
  "036": "Express intent to meet or negotiate",
  // 04 — Consult
  "040": "Consult",
  "043": "Host a visit",
  "044": "Meet at a third location",
  "046": "Engage in negotiation",
  // 05 — Engage in Diplomatic Cooperation
  "050": "Engage in diplomatic cooperation",
  "051": "Praise or endorse",
  "054": "Grant diplomatic recognition",
  "057": "Sign formal agreement",
  // 06 — Material Cooperation
  "060": "Engage in material cooperation",
  "061": "Cooperate economically",
  "062": "Cooperate militarily",
  // 07 — Provide Aid
  "070": "Provide aid",
  "071": "Provide economic aid",
  "072": "Provide military aid",
  "073": "Provide humanitarian aid",
  // 08 — Yield
  "080": "Yield",
  "081": "Ease administrative sanctions",
  "084": "Return or release",
  "086": "De-escalate military engagement",
  // 09 — Investigate
  "090": "Investigate",
  "091": "Investigate crime or corruption",
  // 10 — Demand
  "100": "Demand",
  "101": "Demand information",
  "103": "Demand material aid",
  "106": "Demand de-escalation",
  // 11 — Disapprove
  "110": "Disapprove",
  "111": "Criticize or denounce",
  "112": "Accuse",
  "113": "Rally opposition against",
  "114": "Complain officially",
  "115": "Bring lawsuit against",
  // 12 — Reject
  "120": "Reject",
  "121": "Reject material cooperation",
  "122": "Reject request or demand",
  "123": "Reject proposal to meet",
  "125": "Defy norms or law",
  // 13 — Threaten
  "130": "Threaten",
  "131": "Threaten non-force action",
  "132": "Threaten with administrative sanctions",
  "138": "Threaten with military force",
  // 14 — Protest
  "140": "Engage in political dissent",
  "141": "Demonstrate or rally",
  "143": "Conduct hunger strike",
  "145": "Protest violently, riot",
  // 15 — Exhibit Force Posture
  "150": "Exhibit force posture",
  "151": "Increase police alert status",
  "152": "Increase military alert status",
  "153": "Mobilize or increase armed forces",
  // 16 — Reduce Relations
  "160": "Reduce relations",
  "161": "Reduce or break diplomatic relations",
  "162": "Reduce or stop material aid",
  "163": "Impose embargo, boycott, or sanctions",
  // 17 — Coerce
  "170": "Coerce",
  "171": "Seize or damage property",
  "172": "Impose administrative sanctions",
  "173": "Arrest or detain",
  "175": "Use tactics of violent repression",
  // 18 — Assault
  "180": "Use unconventional violence",
  "181": "Abduct, hijack, or take hostage",
  "182": "Physically assault",
  "183": "Conduct suicide, car, or other non-military bombing",
  "184": "Use as human shield",
  // 19 — Fight
  "190": "Use conventional military force",
  "191": "Impose blockade or restrict movement",
  "192": "Occupy territory",
  "193": "Fight with small arms and light weapons",
  "194": "Fight with artillery and tanks",
  "195": "Employ aerial weapons",
  "196": "Violate ceasefire",
  // 20 — Unconventional Mass Violence
  "200": "Use unconventional mass violence",
  "201": "Engage in mass expulsion",
  "202": "Engage in mass killings",
  "203": "Engage in ethnic cleansing",
  "204": "Use weapons of mass destruction",
};

export function labelForEventCode(code: string): string {
  if (!code) return "Unknown event";
  const trimmed = String(code).trim();
  if (GDELT_EVENT_CODE_LABELS[trimmed]) return GDELT_EVENT_CODE_LABELS[trimmed];
  const prefix = trimmed.slice(0, 3);
  if (GDELT_EVENT_CODE_LABELS[prefix]) return GDELT_EVENT_CODE_LABELS[prefix];
  return `Event ${trimmed}`;
}
```

- [ ] **Step 2: Type-check**

Run from `argus-app/`:
```bash
cd argus-app && npx tsc --noEmit
```
Expected: exits 0 with no output.

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/data/gdeltEventCodes.ts
git commit -m "feat(gdelt): add CAMEO event-code label map"
```

---

## Task A2: Add structured digest type

**Files:**
- Modify: `argus-app/src/types/gdelt.ts`

- [ ] **Step 1: Append the structured type**

Append to the end of `argus-app/src/types/gdelt.ts` (after the `QUAD_CLASS_COLORS` export):

```ts
export interface GdeltDigestHotspot {
  country: string;
  count: number;
  topGoldstein: number;
}

export interface GdeltDigestActor {
  name: string;
  country: string;
  count: number;
  avgGoldstein: number;
  avgTone: number;
}

export interface GdeltDigestTopEvent {
  id: string;
  actor1Name: string;
  actor1Country: string;
  actor2Name: string;
  actor2Country: string;
  location: string;
  goldsteinScale: number;
  numMentions: number;
  numSources: number;
  avgTone: number;
  eventCode: string;
  eventCodeLabel: string;
  quadClass: GdeltQuadClass;
  quadLabel: string;
  sourceUrl: string;
}

export interface GdeltDigestRegionStat {
  country: string;
  count: number;
  avgGoldstein: number;
  avgTone: number;
}

export interface GdeltDigestHistogramBucket {
  bucket: string;
  count: number;
}

export interface GdeltDigestStructured {
  quadCounts: {
    cooperation: number;
    verbalConflict: number;
    materialConflict: number;
    other: number;
  };
  hotspots: GdeltDigestHotspot[];
  topActors: GdeltDigestActor[];
  topEvents: GdeltDigestTopEvent[];
  regionStats: GdeltDigestRegionStat[];
  goldsteinHistogram: GdeltDigestHistogramBucket[];
  tailCount: number;
}
```

- [ ] **Step 2: Type-check**

```bash
cd argus-app && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/types/gdelt.ts
git commit -m "feat(gdelt): add GdeltDigestStructured response type"
```

---

## Task A3: Rewrite the digest route

**Files:**
- Modify: `argus-app/src/app/api/ai/gdelt-digest/route.ts` (full rewrite)

- [ ] **Step 1: Replace the entire route file**

Overwrite `argus-app/src/app/api/ai/gdelt-digest/route.ts` with the following exact contents (preserves the existing fallback digest verbatim, replaces clamp logic and adds structured builders):

```ts
import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import { ARGUS_CONFIG } from "@/lib/config";
import {
  QUAD_CLASS_LABELS,
  type GdeltQuadClass,
  type GdeltDigestStructured,
  type GdeltDigestTopEvent,
} from "@/types/gdelt";
import { labelForEventCode } from "@/data/gdeltEventCodes";

const SYSTEM_PROMPT = `You are a senior all-source intelligence analyst producing a formal strategic intelligence report for a principal decision-maker. Write in a clean, authoritative intelligence-report format that feels like a legitimate watchfloor product: dense, specific, operationally useful, and free of consumer-blog tone.

CRITICAL OUTPUT RULES:
- Do NOT use Markdown.
- Do NOT use #, ##, ###, *, **, ***, bullet symbols, or code fences.
- Use plain text only.
- Use uppercase section headers on their own lines.
- Write in developed paragraphs and numbered watch items only.
- Target roughly 1200-1800 words unless the data is genuinely too thin.
- When citing key developments, you may reference source domains in parentheses where they aid attribution (e.g., "reuters.com"). Do not invent domains; only cite those present in the source material.

Required structure:

REPORT DATE/TIME (UTC)
One line with the current UTC timestamp supplied in the source material.

BOTTOM LINE
One dense paragraph of 4-6 sentences capturing the most strategically important conclusion, the immediate implication for posture, and the single most important decision or collection priority.

OPERATING PICTURE
Two full paragraphs explaining the overall global pattern in the dataset: conflict vs cooperation balance, tempo, escalation signals, stabilizing signals, and the broad alignment picture.

KEY DEVELOPMENTS
8-12 numbered items. Each item must identify actors, location, event character, Goldstein score, mention count, tone, and why it matters.

ACTOR INTENT AND MOTIVATION
4-6 actor-focused paragraphs covering objectives, constraints, incentives, and likely next moves.

REGIONAL HOTSPOTS
4-6 region-focused paragraphs covering local dynamics, trajectory, spillover risk, and confidence caveats.

COOPERATION AND DIPLOMATIC TRACK
At least one full paragraph on meaningful cooperative or stabilizing signals.

ANOMALIES AND WEAK SIGNALS
At least one full paragraph identifying unusual pairings, outliers, and thin-but-important signals.

INFORMATION ENVIRONMENT
One paragraph analyzing tone, media attention, amplification patterns, and any divergence between narrative heat and material significance.

INDICATORS TO WATCH
Two subsections in plain text:
NEAR-TERM (6-48 HOURS)
1-6 numbered indicators.
FOLLOW-ON (1-2 WEEKS)
1-5 numbered indicators.

OUTLOOK
One final synthesis paragraph stating the base case, the main swing factors, and what would invalidate the assessment.

Tradecraft rules: explicitly mark observation vs inference using the labels OBSERVED and ASSESSED. Cite specific actors, locations, Goldstein values, mention counts, and tone values wherever relevant. Do not be generic. Do not output markdown.`;

type GdeltEvent = Awaited<ReturnType<typeof fetchGdeltEvents>>[number];

function formatActor(name?: string, country?: string) {
  const safeName = name?.trim() || "UNKNOWN";
  const safeCountry = country?.trim() || "?";
  return `${safeName} (${safeCountry})`;
}

function eventScore(event: {
  goldsteinScale: number;
  numMentions: number;
  numSources: number;
  avgTone: number;
}) {
  return (
    Math.abs(event.goldsteinScale) * 2 +
    event.numMentions * 0.6 +
    event.numSources * 0.4 +
    Math.abs(event.avgTone) * 0.2
  );
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeUrl(raw: string): string {
  if (!raw) return "";
  try {
    return new URL(raw).toString();
  } catch {
    return "";
  }
}

function buildHotspots(events: GdeltEvent[]) {
  const counts = new Map<string, { count: number; topGoldstein: number }>();
  for (const e of events) {
    const key = e.actionGeoCountry || "Unknown";
    const prev = counts.get(key) ?? { count: 0, topGoldstein: 0 };
    prev.count += 1;
    if (Math.abs(e.goldsteinScale) > Math.abs(prev.topGoldstein)) {
      prev.topGoldstein = e.goldsteinScale;
    }
    counts.set(key, prev);
  }
  return [...counts.entries()]
    .map(([country, v]) => ({ country, count: v.count, topGoldstein: v.topGoldstein }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildTopActors(events: GdeltEvent[]) {
  const stats = new Map<
    string,
    { name: string; country: string; count: number; sumGoldstein: number; sumTone: number }
  >();
  for (const e of events) {
    for (const [name, country] of [
      [e.actor1Name, e.actor1Country],
      [e.actor2Name, e.actor2Country],
    ] as const) {
      if (!name) continue;
      const key = `${name}|${country || "?"}`;
      const prev = stats.get(key) ?? {
        name,
        country: country || "?",
        count: 0,
        sumGoldstein: 0,
        sumTone: 0,
      };
      prev.count += 1;
      prev.sumGoldstein += e.goldsteinScale;
      prev.sumTone += e.avgTone;
      stats.set(key, prev);
    }
  }
  return [...stats.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((s) => ({
      name: s.name,
      country: s.country,
      count: s.count,
      avgGoldstein: s.sumGoldstein / s.count,
      avgTone: s.sumTone / s.count,
    }));
}

function buildTopEvents(events: GdeltEvent[], n: number): GdeltDigestTopEvent[] {
  return [...events]
    .sort((a, b) => eventScore(b) - eventScore(a))
    .slice(0, n)
    .map((e) => {
      const quadClass = e.quadClass as GdeltQuadClass;
      return {
        id: e.id,
        actor1Name: e.actor1Name,
        actor1Country: e.actor1Country,
        actor2Name: e.actor2Name,
        actor2Country: e.actor2Country,
        location: e.actionGeoName,
        goldsteinScale: e.goldsteinScale,
        numMentions: e.numMentions,
        numSources: e.numSources,
        avgTone: e.avgTone,
        eventCode: e.eventCode,
        eventCodeLabel: labelForEventCode(e.eventCode),
        quadClass,
        quadLabel: QUAD_CLASS_LABELS[quadClass] ?? "Unknown",
        sourceUrl: safeUrl(e.sourceUrl),
      };
    });
}

function buildRegionStats(events: GdeltEvent[]) {
  const stats = new Map<
    string,
    { count: number; sumGoldstein: number; sumTone: number }
  >();
  for (const e of events) {
    const key = e.actionGeoCountry || "Unknown";
    const prev = stats.get(key) ?? { count: 0, sumGoldstein: 0, sumTone: 0 };
    prev.count += 1;
    prev.sumGoldstein += e.goldsteinScale;
    prev.sumTone += e.avgTone;
    stats.set(key, prev);
  }
  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([country, v]) => ({
      country,
      count: v.count,
      avgGoldstein: v.sumGoldstein / v.count,
      avgTone: v.sumTone / v.count,
    }));
}

function buildGoldsteinHistogram(events: GdeltEvent[]) {
  const buckets: Array<{ lo: number; hi: number; count: number }> = [];
  for (let lo = -10; lo < 10; lo += 2) {
    buckets.push({ lo, hi: lo + 2, count: 0 });
  }
  for (const e of events) {
    const g = Math.max(-10, Math.min(10, e.goldsteinScale));
    let index = Math.floor((g + 10) / 2);
    if (index >= buckets.length) index = buckets.length - 1;
    if (index < 0) index = 0;
    buckets[index].count += 1;
  }
  return buckets.map((b) => ({ bucket: `${b.lo}..${b.hi}`, count: b.count }));
}

function buildTailLines(events: GdeltEvent[], skip: number): string[] {
  return [...events]
    .sort((a, b) => eventScore(b) - eventScore(a))
    .slice(skip)
    .map((e) => {
      const a1 = `${e.actor1Name || "Unknown"}(${e.actor1Country || "?"})`;
      const a2 = `${e.actor2Name || "Unknown"}(${e.actor2Country || "?"})`;
      const loc = e.actionGeoName || e.actionGeoCountry || "Unknown";
      return `${a1}→${a2} | ${loc} | G:${e.goldsteinScale} M:${e.numMentions}`;
    });
}

function buildFallbackDigest(
  nowUtc: string,
  events: GdeltEvent[],
  analyzedCount: number,
) {
  const sortedByScore = [...events].sort((a, b) => eventScore(b) - eventScore(a));
  const topEvents = sortedByScore.slice(0, Math.min(10, analyzedCount));
  const positiveEvents = [...events]
    .filter((e) => e.goldsteinScale >= 5)
    .sort((a, b) => eventScore(b) - eventScore(a))
    .slice(0, 4);
  const negativeEvents = [...events]
    .filter((e) => e.goldsteinScale <= -5)
    .sort((a, b) => eventScore(b) - eventScore(a))
    .slice(0, 4);
  const weakSignals = [...events]
    .filter((e) => Math.abs(e.goldsteinScale) >= 7 && e.numMentions <= 3)
    .sort((a, b) => eventScore(b) - eventScore(a))
    .slice(0, 3);

  const quadCounts = { cooperation: 0, verbalConflict: 0, materialConflict: 0, other: 0 };
  const regionCounts = new Map<string, number>();
  const actorStats = new Map<
    string,
    { count: number; mentions: number; avgTone: number; avgGoldstein: number }
  >();

  for (const event of events) {
    const region = event.actionGeoCountry || "Unknown";
    regionCounts.set(region, (regionCounts.get(region) || 0) + 1);

    if (event.quadClass === 1 || event.quadClass === 2) quadCounts.cooperation++;
    else if (event.quadClass === 3) quadCounts.verbalConflict++;
    else if (event.quadClass === 4) quadCounts.materialConflict++;
    else quadCounts.other++;

    for (const [name, country] of [
      [event.actor1Name, event.actor1Country],
      [event.actor2Name, event.actor2Country],
    ] as const) {
      const key = formatActor(name, country);
      const prev =
        actorStats.get(key) ?? { count: 0, mentions: 0, avgTone: 0, avgGoldstein: 0 };
      prev.count += 1;
      prev.mentions += event.numMentions;
      prev.avgTone += event.avgTone;
      prev.avgGoldstein += event.goldsteinScale;
      actorStats.set(key, prev);
    }
  }

  const topRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topActors = [...actorStats.entries()]
    .map(([actor, stat]) => ({
      actor,
      count: stat.count,
      mentions: stat.mentions,
      avgTone: stat.avgTone / stat.count,
      avgGoldstein: stat.avgGoldstein / stat.count,
    }))
    .sort((a, b) => b.count - a.count || b.mentions - a.mentions)
    .slice(0, 5);

  const total = events.length;
  const avgTone = average(events.map((e) => e.avgTone));
  const avgMentions = average(events.map((e) => e.numMentions));
  const avgGoldstein = average(events.map((e) => e.goldsteinScale));
  const conflictShare = total
    ? ((quadCounts.verbalConflict + quadCounts.materialConflict) / total) * 100
    : 0;
  const cooperationShare = total ? (quadCounts.cooperation / total) * 100 : 0;

  const lines: string[] = [];
  lines.push("REPORT DATE/TIME (UTC)");
  lines.push(nowUtc);
  lines.push("");

  lines.push("BOTTOM LINE");
  lines.push(
    `OBSERVED the current GDELT slice contains ${total} filtered events, with ${quadCounts.materialConflict} material-conflict and ${quadCounts.verbalConflict} verbal-conflict entries against ${quadCounts.cooperation} cooperative entries. OBSERVED the highest-volume geographies are ${topRegions.map(([region, count]) => `${region} (${count})`).join(", ")}. ASSESSED the operating picture remains conflict-leaning when measured by event intensity because the most consequential items cluster around Goldstein extremes rather than raw event count alone, especially in ${negativeEvents[0]?.actionGeoName || "the leading negative-signal locations"}. ASSESSED immediate decision advantage will come from tracking whether the current high-severity negative cluster attracts higher mention velocity over the next one to two update cycles or whether cooperative items begin to dominate attention. ASSESSED the single most useful collection priority is corroboration of the top negative-signal events with independent sourcing because the strongest Goldstein outliers are the most likely to drive false urgency if they remain thinly sourced.`,
  );
  lines.push("");

  lines.push("OPERATING PICTURE");
  lines.push(
    `OBSERVED conflict-coded activity accounts for ${conflictShare.toFixed(1)} percent of filtered events, while cooperation-coded activity accounts for ${cooperationShare.toFixed(1)} percent. OBSERVED average tone sits at ${avgTone.toFixed(1)} and average Goldstein at ${avgGoldstein.toFixed(1)}, indicating that the feed is not uniformly crisis-saturated but is being pulled by a smaller set of high-severity negative events. OBSERVED the top actors by frequency are ${topActors.map((actor) => `${actor.actor} (${actor.count} events, average Goldstein ${actor.avgGoldstein.toFixed(1)})`).join("; ")}. ASSESSED the dataset shows a familiar pattern in which broad institutional and state activity continues in parallel with a narrower set of violence- or coercion-heavy incidents that carry disproportionate strategic weight.`,
  );
  lines.push(
    `OBSERVED the most consequential event set is led by ${topEvents.slice(0, 3).map((event) => `${formatActor(event.actor1Name, event.actor1Country)} to ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, mentions ${event.numMentions}, tone ${event.avgTone.toFixed(1)})`).join("; ")}. OBSERVED positive but high-salience cooperative activity still exists in ${positiveEvents.map((event) => event.actionGeoName || "unknown locations").slice(0, 3).join(", ") || "the current sample"}. ASSESSED the key question is not whether conflict exists, but whether negative items begin converting into broader diplomatic, military, or domestic-security follow-on reporting. ASSESSED unless mention velocity rises materially above the current average of ${avgMentions.toFixed(1)}, the base case remains localized friction with selective amplification rather than immediate system-wide escalation.`,
  );
  lines.push("");

  lines.push("KEY DEVELOPMENTS");
  topEvents.forEach((event, index) => {
    const quadLabel = QUAD_CLASS_LABELS[event.quadClass as GdeltQuadClass] ?? "Unknown";
    lines.push(
      `${index + 1}. OBSERVED ${formatActor(event.actor1Name, event.actor1Country)} engaged ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName || "UNKNOWN LOCATION"}. Event character: ${quadLabel}. Goldstein ${event.goldsteinScale}. Mention count ${event.numMentions}. Tone ${event.avgTone.toFixed(1)}. ASSESSED significance: ${event.goldsteinScale <= -5 ? "this is a high-severity negative signal that can shift posture quickly if follow-on reporting broadens" : event.goldsteinScale >= 5 ? "this is a meaningful stabilizing or alignment signal worth watching for durability" : "this is a medium-salience directional signal that matters mainly in aggregate with adjacent reporting"}.`,
    );
  });
  lines.push("");

  lines.push("ACTOR INTENT AND MOTIVATION");
  topActors.slice(0, 4).forEach((actor) => {
    lines.push(
      `OBSERVED ${actor.actor} appears ${actor.count} times in the filtered event set with ${actor.mentions} cumulative mentions, average Goldstein ${actor.avgGoldstein.toFixed(1)}, and average tone ${actor.avgTone.toFixed(1)}. ASSESSED this actor is operating inside a high-visibility information environment where repeated appearance may reflect both real activity and media concentration. ASSESSED if the actor's average Goldstein remains ${actor.avgGoldstein < 0 ? "negative" : "positive"} across the next cycle, it will likely remain a useful anchor for trend direction rather than a one-off anomaly.`,
    );
  });
  lines.push("");

  lines.push("REGIONAL HOTSPOTS");
  topRegions.slice(0, 4).forEach(([region, count]) => {
    const regionalEvents = events
      .filter((event) => (event.actionGeoCountry || "Unknown") === region)
      .sort((a, b) => eventScore(b) - eventScore(a))
      .slice(0, 2);
    lines.push(
      `OBSERVED ${region} accounts for ${count} filtered events. Lead signals include ${regionalEvents.map((event) => `${event.actionGeoName || region} with Goldstein ${event.goldsteinScale} and ${event.numMentions} mentions`).join("; ")}. ASSESSED this region's near-term trajectory depends on whether current top events remain isolated or begin to generate adjacent reporting from additional actors, sources, or locations. Confidence is moderate because event density is measurable, but causality remains partly inferential at this stage.`,
    );
  });
  lines.push("");

  lines.push("COOPERATION AND DIPLOMATIC TRACK");
  lines.push(
    positiveEvents.length
      ? `OBSERVED cooperative or stabilizing signals remain present despite the conflict-heavy top line. The strongest positive items include ${positiveEvents.map((event) => `${formatActor(event.actor1Name, event.actor1Country)} and ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, mentions ${event.numMentions}, tone ${event.avgTone.toFixed(1)})`).join("; ")}. ASSESSED these items matter less as proof of immediate resolution than as evidence that institutional coordination, diplomatic signaling, or non-kinetic engagement channels remain active in parallel with coercive behavior.`
      : `OBSERVED the current filtered sample offers limited high-salience cooperative reporting. ASSESSED that absence does not prove diplomacy is absent, but it does mean the information environment is weighting conflict and coercion more heavily than overt stabilization messaging in this cycle.`,
  );
  lines.push("");

  lines.push("ANOMALIES AND WEAK SIGNALS");
  lines.push(
    weakSignals.length
      ? `OBSERVED several thinly sourced but high-intensity outliers merit caution: ${weakSignals.map((event) => `${formatActor(event.actor1Name, event.actor1Country)} to ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, mentions ${event.numMentions}, tone ${event.avgTone.toFixed(1)})`).join("; ")}. ASSESSED these are classic weak signals: potentially important if corroborated, but equally capable of exaggerating risk if they remain isolated in low-volume reporting.`
      : `OBSERVED the present event set is dominated more by repeated mainstream signals than by isolated edge cases. ASSESSED the anomaly burden is therefore lower this cycle, though that also means genuine early indicators may be harder to distinguish from routine churn without watching mention acceleration.`,
  );
  lines.push("");

  lines.push("INFORMATION ENVIRONMENT");
  lines.push(
    `OBSERVED average tone is ${avgTone.toFixed(1)} and the mean mention count is ${avgMentions.toFixed(1)}, while the top-scoring events materially exceed that attention baseline. ASSESSED the information environment is amplifying a small number of sharper events rather than distributing attention evenly. ASSESSED divergence between narrative heat and material significance is most likely when negative Goldstein outliers carry low mention counts, meaning analysts should separate emotional tone from evidence of broader mobilization.`,
  );
  lines.push("");

  lines.push("INDICATORS TO WATCH");
  lines.push("NEAR-TERM (6-48 HOURS)");
  [
    `Watch whether the top negative event cluster in ${negativeEvents[0]?.actionGeoName || "the leading hotspot"} gains additional mentions or sources above the current average of ${avgMentions.toFixed(1)}.`,
    `Watch for repeat appearance of the current top actors, especially ${topActors[0]?.actor || "the lead actor"}, with more negative average Goldstein values.`,
    `Watch for spillover reporting into adjacent geographies beyond ${topRegions[0]?.[0] || "the leading region"}.`,
    `Watch whether cooperative items remain visible or disappear from the next cycle altogether.`,
  ].forEach((text, index) => lines.push(`${index + 1}. ${text}`));
  lines.push("FOLLOW-ON (1-2 WEEKS)");
  [
    `Track whether today's top hotspots persist as recurrent reporting nodes or decay back into background churn.`,
    `Track whether actor frequency consolidates around a narrower crisis set or broadens into multi-actor diplomatic management.`,
    `Track whether tone stays negative while Goldstein moderates, which would suggest narrative heat exceeding material escalation.`,
    `Track whether positive high-Goldstein events mature into sustained cooperation rather than one-cycle signaling.`,
  ].forEach((text, index) => lines.push(`${index + 1}. ${text}`));
  lines.push("");

  lines.push("OUTLOOK");
  lines.push(
    `ASSESSED the base case is continued localized instability embedded inside a broader but still manageable global operating picture. The main swing factors are whether the highest-severity negative events attract wider sourcing, whether top actors repeat with worsening Goldstein values, and whether cooperative items retain enough visibility to indicate functioning stabilizing channels. This assessment would weaken if the next update cycle shows sharp growth in mentions, source count, and geographic spread for the current negative outliers, or if today's positive signals collapse entirely from the feed.`,
  );

  return lines.join("\n");
}

export async function GET(req: Request) {
  try {
    const nowUtc = new Date().toUTCString();
    const url = new URL(req.url);
    const rawDetailed = url.searchParams.get("detailedCount") ?? url.searchParams.get("batchSize");
    const parsed = Number.parseInt(rawDetailed ?? "75", 10);
    const detailedCount = Number.isFinite(parsed)
      ? Math.min(150, Math.max(25, parsed))
      : 75;

    const events = await fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt);

    if (!events.length) {
      return NextResponse.json({
        summary: "No GDELT events available for analysis.",
        narrative: "No GDELT events available for analysis.",
        structured: null,
        eventCount: 0,
        analyzedCount: 0,
        generatedAt: nowUtc,
        degraded: false,
        llmError: null,
      });
    }

    // Aggregate stats for the prompt
    const regionCounts: Record<string, number> = {};
    const quadCounts = { cooperation: 0, verbalConflict: 0, materialConflict: 0, other: 0 };
    for (const e of events) {
      const region = e.actionGeoCountry || "Unknown";
      regionCounts[region] = (regionCounts[region] || 0) + 1;
      if (e.quadClass === 1 || e.quadClass === 2) quadCounts.cooperation++;
      else if (e.quadClass === 3) quadCounts.verbalConflict++;
      else if (e.quadClass === 4) quadCounts.materialConflict++;
      else quadCounts.other++;
    }
    const topRegions = Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([r, c]) => `${r}: ${c}`)
      .join(", ");

    const actorCounts: Record<string, number> = {};
    for (const e of events) {
      const actors = [e.actor1Name, e.actor2Name].filter(Boolean) as string[];
      for (const actor of actors) actorCounts[actor] = (actorCounts[actor] || 0) + 1;
    }
    const topActorsStr = Object.entries(actorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([a, c]) => `${a}: ${c}`)
      .join(", ");

    // Structured payload (computed from full event set)
    const structured: GdeltDigestStructured = {
      quadCounts,
      hotspots: buildHotspots(events),
      topActors: buildTopActors(events),
      topEvents: buildTopEvents(events, detailedCount),
      regionStats: buildRegionStats(events),
      goldsteinHistogram: buildGoldsteinHistogram(events),
      tailCount: Math.max(0, events.length - detailedCount),
    };

    // Histogram string for the prompt
    const histogramStr = structured.goldsteinHistogram
      .map((b) => `${b.bucket}:${b.count}`)
      .join(" ");

    // Detailed top events for the prompt
    const detailLines = structured.topEvents.map((e) => {
      return [
        `[${e.quadLabel}] ${e.actor1Name || "Unknown"} (${e.actor1Country || "?"})`,
        `→ ${e.actor2Name || "Unknown"} (${e.actor2Country || "?"})`,
        `| Loc: ${e.location} | G: ${e.goldsteinScale}`,
        `| M: ${e.numMentions} | S: ${e.numSources} | T: ${e.avgTone.toFixed(1)}`,
        `| Code: ${e.eventCode} (${e.eventCodeLabel})`,
        e.sourceUrl ? `| URL: ${e.sourceUrl}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    });

    // Tail summary lines
    const tailLines = buildTailLines(events, detailedCount);

    const prompt = [
      `CURRENT UTC REPORT TIME: ${nowUtc}`,
      `GLOBAL EVENT SUMMARY: ${events.length} total GDELT events captured.`,
      `QUAD CLASS COUNTS: cooperation=${quadCounts.cooperation} verbalConflict=${quadCounts.verbalConflict} materialConflict=${quadCounts.materialConflict} other=${quadCounts.other}`,
      `TOP REGIONS: ${topRegions}`,
      `TOP ACTORS: ${topActorsStr}`,
      `GOLDSTEIN DISTRIBUTION: ${histogramStr}`,
      "",
      `DETAILED TOP ${detailLines.length} EVENTS (by composite score):`,
      ...detailLines,
      "",
      `TAIL SUMMARY (${tailLines.length} additional events, one line each, ranked by composite score):`,
      ...tailLines,
    ].join("\n");

    const result = await queryLlm(prompt, SYSTEM_PROMPT, {
      maxTokens: 4096,
      timeoutMs: 120000,
    });
    const fallbackSummary = buildFallbackDigest(nowUtc, events, detailLines.length);
    const summary =
      result.error || !result.text || result.text.trim().length < 600
        ? fallbackSummary
        : result.text;

    return NextResponse.json({
      summary,
      narrative: summary,
      structured,
      eventCount: events.length,
      analyzedCount: detailLines.length,
      generatedAt: nowUtc,
      degraded: Boolean(result.error || !result.text || result.text.trim().length < 600),
      llmError: result.error ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        summary: null,
        narrative: null,
        structured: null,
        error: error instanceof Error ? error.message : "Failed to generate digest",
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd argus-app && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 3: Deploy**

From repo root `/home/volta/argus`:
```bash
docker compose up -d --no-deps --build --force-recreate argus-app
```
Wait for the build to complete and container to be `healthy`. Confirm with:
```bash
docker compose ps argus-app
```

- [ ] **Step 4: Curl-verify the endpoint**

```bash
curl -s "http://localhost/api/ai/gdelt-digest?detailedCount=120" \
  | jq '{eventCount, analyzedCount, tailCount: .structured.tailCount, hot: (.structured.hotspots | length), actors: (.structured.topActors | length), top: (.structured.topEvents | length), buckets: (.structured.goldsteinHistogram | length), firstUrl: .structured.topEvents[0].sourceUrl, summaryLen: (.summary | length)}'
```
Expected JSON shape (counts depend on live data):
```json
{
  "eventCount": <some number, typically ~400–800>,
  "analyzedCount": 120,
  "tailCount": <eventCount - 120>,
  "hot": 10,
  "actors": 12,
  "top": 120,
  "buckets": 10,
  "firstUrl": "<a parseable URL or empty string>",
  "summaryLen": <number >= 600>
}
```

If `eventCount < 120`, `analyzedCount === eventCount` and `tailCount === 0` is acceptable.

- [ ] **Step 5: Smoke the legacy param**

```bash
curl -s "http://localhost/api/ai/gdelt-digest?batchSize=50" | jq '.analyzedCount'
```
Expected: `50` (legacy alias still routes through `detailedCount`).

- [ ] **Step 6: Commit**

```bash
git add argus-app/src/app/api/ai/gdelt-digest/route.ts
git commit -m "feat(gdelt): tiered digest over full event set with structured payload"
```

---

## Task A4: Create GdeltDigestPanels component

**Files:**
- Create: `argus-app/src/components/gdelt/GdeltDigestPanels.tsx`

- [ ] **Step 1: Create the panels file**

Create the directory if needed and write `argus-app/src/components/gdelt/GdeltDigestPanels.tsx` with these exact contents:

```tsx
"use client";

import type {
  GdeltDigestStructured,
  GdeltDigestHotspot,
  GdeltDigestActor,
  GdeltDigestTopEvent,
  GdeltDigestRegionStat,
  GdeltDigestHistogramBucket,
} from "@/types/gdelt";
import { useState } from "react";

function goldsteinColor(value: number): string {
  if (value <= -5) return "#fb4934";
  if (value >= 5) return "#b8bb26";
  return "#928374";
}

function HotspotsStrip({ hotspots }: { hotspots: GdeltDigestHotspot[] }) {
  if (!hotspots.length) return null;
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#a89984]">
        Hotspots
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {hotspots.slice(0, 6).map((h) => (
          <div
            key={h.country}
            className="flex items-center gap-1.5 rounded-full border border-[#3c3836] bg-[#1d2021] px-2 py-0.5 font-mono text-[10px] text-[#d5c4a1]"
            title={`Top |Goldstein|: ${h.topGoldstein.toFixed(1)}`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: goldsteinColor(h.topGoldstein) }}
            />
            <span>{h.country}</span>
            <span className="text-[#a89984]">·</span>
            <span className="tabular-nums text-[#fabd2f]">{h.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopActorsTable({ actors }: { actors: GdeltDigestActor[] }) {
  if (!actors.length) return null;
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#a89984]">
        Top actors
      </div>
      <div className="mt-2 overflow-hidden rounded-md border border-[#3c3836]">
        <table className="w-full font-mono text-[10px] text-[#d5c4a1]">
          <thead className="bg-[#1d2021] text-[#a89984]">
            <tr>
              <th className="px-2 py-1 text-left">Actor</th>
              <th className="px-2 py-1 text-right">Count</th>
              <th className="px-2 py-1 text-right">Avg G</th>
              <th className="px-2 py-1 text-right">Avg Tone</th>
            </tr>
          </thead>
          <tbody>
            {actors.slice(0, 8).map((a) => (
              <tr key={`${a.name}|${a.country}`} className="border-t border-[#3c3836]">
                <td className="px-2 py-1">
                  <span>{a.name}</span>
                  <span className="ml-1 text-[#a89984]">({a.country})</span>
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{a.count}</td>
                <td
                  className="px-2 py-1 text-right tabular-nums"
                  style={{ color: goldsteinColor(a.avgGoldstein) }}
                >
                  {a.avgGoldstein.toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{a.avgTone.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopEventsList({ events }: { events: GdeltDigestTopEvent[] }) {
  if (!events.length) return null;
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#a89984]">
        Top events (with sources)
      </div>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
        {events.slice(0, 30).map((e) => {
          const linkable = Boolean(e.sourceUrl);
          const inner = (
            <div className="rounded-md border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 font-mono text-[10px] text-[#d5c4a1] transition hover:border-[#83a598]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <span className="text-[#83a598]">[{e.quadLabel}]</span>{" "}
                  <span>{e.actor1Name || "?"}</span>
                  <span className="text-[#a89984]"> → </span>
                  <span>{e.actor2Name || "?"}</span>
                  <span className="text-[#a89984]"> · {e.location || "?"}</span>
                </span>
                <span
                  className="shrink-0 tabular-nums"
                  style={{ color: goldsteinColor(e.goldsteinScale) }}
                >
                  G {e.goldsteinScale.toFixed(1)}
                </span>
              </div>
              <div className="mt-0.5 text-[9px] text-[#a89984]">
                {e.eventCodeLabel} · M {e.numMentions} · S {e.numSources} · T{" "}
                {e.avgTone.toFixed(1)}
                {linkable ? " · source ↗" : ""}
              </div>
            </div>
          );
          return linkable ? (
            <a
              key={e.id}
              href={e.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {inner}
            </a>
          ) : (
            <div key={e.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

function GoldsteinHistogram({ buckets }: { buckets: GdeltDigestHistogramBucket[] }) {
  if (!buckets.length) return null;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#a89984]">
        Goldstein distribution
      </div>
      <div className="mt-2 flex h-20 items-end gap-1 rounded-md border border-[#3c3836] bg-[#1d2021] px-2 py-2">
        {buckets.map((b) => {
          const heightPct = (b.count / max) * 100;
          const mid =
            (Number(b.bucket.split("..")[0]) + Number(b.bucket.split("..")[1])) / 2;
          return (
            <div
              key={b.bucket}
              className="flex-1"
              title={`${b.bucket}: ${b.count} events`}
            >
              <div
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: goldsteinColor(mid),
                }}
                className="w-full rounded-sm"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[8px] text-[#a89984]">
        <span>-10</span>
        <span>0</span>
        <span>+10</span>
      </div>
    </div>
  );
}

function RegionStatsCard({ stats }: { stats: GdeltDigestRegionStat[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!stats.length) return null;
  const visible = expanded ? stats : stats.slice(0, 5);
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#a89984]">
          Region stats
        </div>
        {stats.length > 5 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#83a598] hover:text-[#b8e0d2]"
          >
            {expanded ? "Show top 5" : `Show all (${stats.length})`}
          </button>
        ) : null}
      </div>
      <div className="mt-2 overflow-hidden rounded-md border border-[#3c3836]">
        <table className="w-full font-mono text-[10px] text-[#d5c4a1]">
          <thead className="bg-[#1d2021] text-[#a89984]">
            <tr>
              <th className="px-2 py-1 text-left">Country</th>
              <th className="px-2 py-1 text-right">Events</th>
              <th className="px-2 py-1 text-right">Avg G</th>
              <th className="px-2 py-1 text-right">Avg Tone</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.country} className="border-t border-[#3c3836]">
                <td className="px-2 py-1">{r.country}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.count}</td>
                <td
                  className="px-2 py-1 text-right tabular-nums"
                  style={{ color: goldsteinColor(r.avgGoldstein) }}
                >
                  {r.avgGoldstein.toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{r.avgTone.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface GdeltDigestPanelsProps {
  structured: GdeltDigestStructured | null;
}

export default function GdeltDigestPanels({ structured }: GdeltDigestPanelsProps) {
  if (!structured) return null;
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      <div className="space-y-3">
        <HotspotsStrip hotspots={structured.hotspots} />
        <GoldsteinHistogram buckets={structured.goldsteinHistogram} />
        <TopActorsTable actors={structured.topActors} />
      </div>
      <div className="space-y-3">
        <TopEventsList events={structured.topEvents} />
        <RegionStatsCard stats={structured.regionStats} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd argus-app && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/components/gdelt/GdeltDigestPanels.tsx
git commit -m "feat(gdelt): structured digest panels component"
```

---

## Task A5: Wire panels into HudOverlay + extend slider range

**Files:**
- Modify: `argus-app/src/components/HudOverlay.tsx` (4 narrow edits)

- [ ] **Step 1: Add import**

In `argus-app/src/components/HudOverlay.tsx`, find the existing import block at the top of the file. Add (place near other component imports):

```tsx
import GdeltDigestPanels from "@/components/gdelt/GdeltDigestPanels";
import type { GdeltDigestStructured } from "@/types/gdelt";
```

- [ ] **Step 2: Extend the `gdeltDigestDocument` state shape**

Locate `argus-app/src/components/HudOverlay.tsx:397-405`. Replace:

```tsx
  const [gdeltDigestDocument, setGdeltDigestDocument] = useState<{
    title: string;
    content: string;
    analyzedCount?: number;
    eventCount?: number;
    generatedAt: string;
    degraded?: boolean;
    llmError?: string | null;
  } | null>(null);
```

with:

```tsx
  const [gdeltDigestDocument, setGdeltDigestDocument] = useState<{
    title: string;
    content: string;
    analyzedCount?: number;
    eventCount?: number;
    generatedAt: string;
    degraded?: boolean;
    llmError?: string | null;
    structured?: GdeltDigestStructured | null;
  } | null>(null);
```

- [ ] **Step 3: Capture `structured` in the fetch handler**

Locate `argus-app/src/components/HudOverlay.tsx:796-822`. Replace:

```tsx
  const requestGdeltDigest = async () => {
    if (gdeltDigestLoading) return;
    setGdeltDigestLoading(true);
    setGdeltDigestError(null);
    try {
      const res = await fetch(`/api/ai/gdelt-digest?batchSize=${gdeltDigestBatchSize}`);
      const data = await res.json();
      if (data.summary) {
        setShowPneumaPanel(false);
        setGdeltDigestDocument({
          title: "GDELT STRATEGIC DIGEST",
          content: data.summary,
          analyzedCount: data.analyzedCount,
          eventCount: data.eventCount,
          generatedAt: data.generatedAt ?? new Date().toUTCString(),
          degraded: Boolean(data.degraded),
          llmError: data.llmError ?? null,
        });
      } else {
        setGdeltDigestError(data.error ?? "No summary returned — check LLM configuration in Settings");
      }
    } catch (e) {
      setGdeltDigestError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGdeltDigestLoading(false);
    }
  };
```

with:

```tsx
  const requestGdeltDigest = async () => {
    if (gdeltDigestLoading) return;
    setGdeltDigestLoading(true);
    setGdeltDigestError(null);
    try {
      const res = await fetch(`/api/ai/gdelt-digest?detailedCount=${gdeltDigestBatchSize}`);
      const data = await res.json();
      if (data.summary) {
        setShowPneumaPanel(false);
        setGdeltDigestDocument({
          title: "GDELT STRATEGIC DIGEST",
          content: data.summary,
          analyzedCount: data.analyzedCount,
          eventCount: data.eventCount,
          generatedAt: data.generatedAt ?? new Date().toUTCString(),
          degraded: Boolean(data.degraded),
          llmError: data.llmError ?? null,
          structured: (data.structured as GdeltDigestStructured | null) ?? null,
        });
      } else {
        setGdeltDigestError(data.error ?? "No summary returned — check LLM configuration in Settings");
      }
    } catch (e) {
      setGdeltDigestError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGdeltDigestLoading(false);
    }
  };
```

- [ ] **Step 4: Extend the slider range**

Locate `argus-app/src/components/HudOverlay.tsx:2222-2231`. Replace:

```tsx
                    <input
                      id="gdelt-batch-size"
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={gdeltDigestBatchSize}
                      onChange={(e) => setGdeltDigestBatchSize(Number(e.target.value))}
                      className="h-1 w-24 accent-[#fabd2f]"
                    />
```

with:

```tsx
                    <input
                      id="gdelt-batch-size"
                      type="range"
                      min={25}
                      max={150}
                      step={5}
                      value={gdeltDigestBatchSize}
                      onChange={(e) => setGdeltDigestBatchSize(Number(e.target.value))}
                      className="h-1 w-32 accent-[#fabd2f]"
                    />
```

- [ ] **Step 5: Bump the default slider state**

Locate `argus-app/src/components/HudOverlay.tsx:391`:
```tsx
  const [gdeltDigestBatchSize, setGdeltDigestBatchSize] = useState(50);
```
Replace with:
```tsx
  const [gdeltDigestBatchSize, setGdeltDigestBatchSize] = useState(75);
```

- [ ] **Step 6: Render the panels above the narrative**

Locate `argus-app/src/components/HudOverlay.tsx:3109-3132` (the digest modal body that contains the narrative card). Find this exact block:

```tsx
            <div className="h-[calc(78vh-10.5rem)] overflow-y-auto px-5 py-5">
              <div className="mx-auto max-w-3xl rounded-xl border border-[#3c3836] bg-[#191d20cc] px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-4 border-b border-[#3c3836] pb-3">
```

Replace with:

```tsx
            <div className="h-[calc(78vh-10.5rem)] overflow-y-auto px-5 py-5">
              <div className="mx-auto max-w-3xl">
                <GdeltDigestPanels structured={gdeltDigestDocument.structured ?? null} />
              </div>
              <div className="mx-auto max-w-3xl rounded-xl border border-[#3c3836] bg-[#191d20cc] px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-4 border-b border-[#3c3836] pb-3">
```

- [ ] **Step 7: Type-check**

```bash
cd argus-app && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 8: Deploy**

From `/home/volta/argus`:
```bash
docker compose up -d --no-deps --build --force-recreate argus-app
```
Wait for the container to become healthy:
```bash
docker compose ps argus-app
```

- [ ] **Step 9: Browser smoke test (desktop)**

1. Open `https://argusweb.bond` in a desktop browser (≥ 1280×800).
2. Open the GDELT workspace.
3. Click "Generate Strategic Digest". Wait for response.
4. Verify the modal opens and:
   - A "Hotspots" chip row, Goldstein histogram, and "Top actors" table appear in the left column above the narrative.
   - A "Top events (with sources)" list and "Region stats" table appear in the right column.
   - Clicking a top-event row with a source URL opens that URL in a new tab.
   - The narrative text still renders below the panels.
5. Click "Refresh Strategic Digest" — verify the panels update.
6. Verify the slider now ranges 25–150, default 75.

If the slider moves and the value updates in the CTA label, that's enough. Report any layout breakage by viewport size.

- [ ] **Step 10: Commit**

```bash
git add argus-app/src/components/HudOverlay.tsx
git commit -m "feat(gdelt): render structured digest panels above narrative, extend detailedCount range"
```

---

# PHASE B — Execute Mobile HUD Redesign

## Task B1: Execute the existing mobile redesign plan

**Files:** Defined by `docs/superpowers/plans/2026-05-06-argus-mobile-redesign.md`.

- [ ] **Step 1: Re-read the mobile plan**

Read `docs/superpowers/plans/2026-05-06-argus-mobile-redesign.md` end-to-end. It is self-contained — 1441 lines covering: `useIsMobile` hook, `AiActionButton` atom, `MobileHud` orchestrator, five tab components (Brief, GDELT, Strange, Live, Ops), `HudOverlay.tsx` short-circuit wiring, and removal of the old inline mobile branches.

- [ ] **Step 2: Execute the mobile plan task-by-task**

Follow that plan in order. Do not skip its smoke-test steps. Use one commit per task as that plan instructs.

- [ ] **Step 3: Confirm the mobile plan's final type-check passes**

```bash
cd argus-app && npx tsc --noEmit
```
Expected: exits 0.

---

## Task B2: Add source-URL link on raw GDELT event rows in the mobile GDELT tab

**Files:**
- Modify: `argus-app/src/components/mobile/tabs/GdeltTab.tsx` (created by Task B1)

- [ ] **Step 1: Locate the raw event row render**

Open `argus-app/src/components/mobile/tabs/GdeltTab.tsx`. Per the mobile spec, this file renders a list of "latest 8 raw GDELT events as compact rows (timestamp · region · headline)".

- [ ] **Step 2: Add a source-URL chip**

For each raw event row, where the timestamp/region/headline string is rendered, append a small "↗" link element when `event.sourceUrl` is present and parseable. Example pattern:

```tsx
{event.sourceUrl ? (
  (() => {
    let safe: string | null = null;
    try {
      safe = new URL(event.sourceUrl).toString();
    } catch {
      safe = null;
    }
    return safe ? (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="ml-1 inline-flex items-center text-[#83a598] hover:text-[#b8e0d2]"
        aria-label="Open source"
      >
        ↗
      </a>
    ) : null;
  })()
) : null}
```

Use `e.stopPropagation()` so tapping the chip does not also fire the row's expand handler.

- [ ] **Step 3: Type-check**

```bash
cd argus-app && npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step 4: Deploy**

From `/home/volta/argus`:
```bash
docker compose up -d --no-deps --build --force-recreate argus-app
```

- [ ] **Step 5: Mobile smoke test**

On a real phone (or DevTools emulating 375×667 and 412×915):

1. Load `https://argusweb.bond`.
2. Verify the new mobile HUD shows the 5-tab bar (Brief, GDELT, Strange, Live, Ops).
3. Open the GDELT tab. Tap "Digest GDELT". Verify the narrative appears (collapsible to 4 lines, tap to expand).
4. Verify 8 raw GDELT events appear as compact rows.
5. Verify a small "↗" link appears on rows whose backing event has a valid `sourceUrl`. Tap one — opens the source in a new tab; does not expand the row.
6. Run the mobile plan's full smoke checklist (Brief, Strange Fly-to, Live swipe, Ops health summary).

If any tab fails to render or the mobile detection short-circuit is missing, return to the mobile plan's relevant task before proceeding.

- [ ] **Step 6: Commit**

```bash
git add argus-app/src/components/mobile/tabs/GdeltTab.tsx
git commit -m "feat(mobile): surface source URL on raw GDELT event rows"
```

---

# Final verification

- [ ] **`npx tsc --noEmit`** in `argus-app/` exits 0.
- [ ] **`curl http://localhost/api/ai/gdelt-digest?detailedCount=120 | jq '.structured.topEvents | length'`** returns `120` (or `eventCount` if fewer events available).
- [ ] **Desktop browser** at `argusweb.bond`: GDELT digest modal shows five structured panels above the narrative; top-event rows with URLs are clickable.
- [ ] **Mobile browser** (375×667 + 412×915): 5-tab HUD renders; GDELT tab shows narrative + 8 raw rows with `↗` source links where applicable.
- [ ] **Memory update (manual):** consider noting in `project_argus_session.md` that GDELT digest now returns structured payload and supports detailedCount 25–150 — saves future agents from re-checking the clamp.
