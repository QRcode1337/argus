# Argus Remaining Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining features from the Codex spec: Settings panel with local LLM integration, ThreatRadar/offseq data feed, working GFS weather tiles, Sentinel imagery, and AI-powered summaries for intel items.

**Architecture:** File-based settings storage (JSON on disk), unified LLM client supporting Ollama and OpenAI-compatible endpoints, new API routes for ThreatRadar proxy and AI summarization, direct tile URLs for GFS/Sentinel raster layers, and HUD integration for settings UI and AI summary display.

**Tech Stack:** Next.js 14 App Router, TypeScript, Zustand, Cesium.js, Ollama/OpenAI-compatible LLM APIs

---

## Chunk 1: Settings System & LLM Client

### Task 1: Settings Types & File Storage

**Files:**
- Create: `argus-app/src/types/settings.ts`
- Create: `argus-app/src/lib/settings.ts`

- [ ] **Step 1: Create settings type definitions**

```typescript
// argus-app/src/types/settings.ts
export type LlmProvider = "ollama" | "openai_compatible";

export interface LlmSettings {
  provider: LlmProvider;
  endpoint: string;       // e.g. http://localhost:11434
  model: string;          // e.g. llama3, mistral
  apiKey?: string;        // optional, for OpenAI-compatible
}

export interface AppSettings {
  llm: LlmSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llm: {
    provider: "ollama",
    endpoint: "http://localhost:11434",
    model: "llama3",
  },
};
```

- [ ] **Step 2: Create file-based settings read/write**

```typescript
// argus-app/src/lib/settings.ts
import { promises as fs } from "fs";
import path from "path";
import { AppSettings, DEFAULT_SETTINGS } from "@/types/settings";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}
```

---

### Task 2: Settings API Route

**Files:**
- Create: `argus-app/src/app/api/settings/route.ts`

- [ ] **Step 1: Create GET/POST settings endpoint**

```typescript
// argus-app/src/app/api/settings/route.ts
import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/settings";
import { AppSettings } from "@/types/settings";

export async function GET() {
  const settings = await readSettings();
  // Strip apiKey from response for security
  const safe = {
    ...settings,
    llm: { ...settings.llm, apiKey: settings.llm.apiKey ? "••••••" : undefined },
  };
  return NextResponse.json(safe);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<AppSettings>;
  const current = await readSettings();
  const merged: AppSettings = {
    ...current,
    llm: {
      ...current.llm,
      ...(body.llm ?? {}),
      // Only update apiKey if a real value is sent (not masked)
      apiKey: body.llm?.apiKey === "••••••" ? current.llm.apiKey : (body.llm?.apiKey ?? current.llm.apiKey),
    },
  };
  await writeSettings(merged);
  return NextResponse.json({ ok: true });
}
```

---

### Task 3: LLM Client

**Files:**
- Create: `argus-app/src/lib/ai/llmClient.ts`

- [ ] **Step 1: Create unified LLM client**

Ollama uses `POST /api/generate` with `{ model, prompt }`.
OpenAI-compatible uses `POST /v1/chat/completions` with `{ model, messages }`.

```typescript
// argus-app/src/lib/ai/llmClient.ts
import { readSettings } from "@/lib/settings";

interface LlmResponse {
  text: string;
  error?: string;
}

export async function queryLlm(prompt: string, systemPrompt?: string): Promise<LlmResponse> {
  const { llm } = await readSettings();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    if (llm.provider === "ollama") {
      const res = await fetch(`${llm.endpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: llm.model,
          prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return { text: "", error: `Ollama error: ${res.status}` };
      const data = await res.json();
      return { text: data.response ?? "" };
    }

    // OpenAI-compatible
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (llm.apiKey) headers["Authorization"] = `Bearer ${llm.apiKey}`;

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const res = await fetch(`${llm.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: llm.model, messages, max_tokens: 512 }),
      signal: controller.signal,
    });
    if (!res.ok) return { text: "", error: `LLM error: ${res.status}` };
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { text: "", error: msg };
  } finally {
    clearTimeout(timeout);
  }
}
```

---

### Task 4: AI Summarize API Route

**Files:**
- Create: `argus-app/src/app/api/ai/summarize/route.ts`

- [ ] **Step 1: Create summarize endpoint**

```typescript
// argus-app/src/app/api/ai/summarize/route.ts
import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";

const SYSTEM_PROMPT = `You are an intelligence analyst. Provide a concise 2-3 sentence summary and analysis of the following item. Focus on strategic significance, potential implications, and key facts. Be direct and factual.`;

export async function POST(req: Request) {
  const { text, context } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const prompt = context
    ? `Context: ${context}\n\nItem to analyze:\n${text}`
    : `Item to analyze:\n${text}`;

  const result = await queryLlm(prompt, SYSTEM_PROMPT);
  if (result.error) {
    return NextResponse.json({ summary: null, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ summary: result.text });
}
```

---

## Chunk 2: ThreatRadar / offseq.com Integration

### Task 5: ThreatRadar Types & Ingest

**Files:**
- Create: `argus-app/src/lib/ingest/threatradar.ts`

- [ ] **Step 1: Create ThreatRadar types and normalizer**

```typescript
// argus-app/src/lib/ingest/threatradar.ts
export interface ThreatRadarThreat {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  cve?: string;
  source: string;
  publishedAt: string;
  tags: string[];
  iocs?: { type: string; value: string }[];
}

export interface ThreatRadarResponse {
  threats: ThreatRadarThreat[];
  total: number;
  updatedAt: string;
}

export function normalizeThreatRadar(raw: unknown): ThreatRadarResponse {
  const data = raw as Record<string, unknown>;
  const threats = Array.isArray(data.threats) ? data.threats : Array.isArray(data.data) ? data.data : [];
  return {
    threats: threats.map((t: Record<string, unknown>) => ({
      id: String(t.id ?? t._id ?? ""),
      title: String(t.title ?? t.name ?? "Unknown Threat"),
      description: String(t.description ?? t.summary ?? ""),
      severity: normalizeSeverity(String(t.severity ?? t.risk ?? "info")),
      cve: t.cve ? String(t.cve) : undefined,
      source: String(t.source ?? "ThreatRadar"),
      publishedAt: String(t.publishedAt ?? t.published ?? t.created ?? new Date().toISOString()),
      tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
      iocs: Array.isArray(t.iocs) ? t.iocs : undefined,
    })),
    total: Number(data.total ?? threats.length),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSeverity(s: string): ThreatRadarThreat["severity"] {
  const low = s.toLowerCase();
  if (low === "critical") return "critical";
  if (low === "high") return "high";
  if (low === "medium" || low === "moderate") return "medium";
  if (low === "low") return "low";
  return "info";
}
```

---

### Task 6: ThreatRadar API Routes

**Files:**
- Create: `argus-app/src/app/api/feeds/threatradar/route.ts`
- Create: `argus-app/src/app/api/feeds/threatradar/search/route.ts`
- Create: `argus-app/src/app/api/feeds/threatradar/ioc/route.ts`

- [ ] **Step 1: Create main threats endpoint**

```typescript
// argus-app/src/app/api/feeds/threatradar/route.ts
import { NextResponse } from "next/server";
import { normalizeThreatRadar } from "@/lib/ingest/threatradar";

const BASE = "https://radar.offseq.com/api/v1";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ?? "10";
  try {
    const res = await fetch(`${BASE}/threats?limit=${limit}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`ThreatRadar: ${res.status}`);
    const raw = await res.json();
    return NextResponse.json(normalizeThreatRadar(raw));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ThreatRadar unavailable";
    return NextResponse.json({ threats: [], total: 0, updatedAt: new Date().toISOString(), error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create CVE search endpoint**

```typescript
// argus-app/src/app/api/feeds/threatradar/search/route.ts
import { NextResponse } from "next/server";

const BASE = "https://radar.offseq.com/api/v1";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (!q) return NextResponse.json({ error: "q param required" }, { status: 400 });
  try {
    const res = await fetch(`${BASE}/threats/search?q=${encodeURIComponent(q)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Search: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ results: [], error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 3: Create IoC check endpoint**

```typescript
// argus-app/src/app/api/feeds/threatradar/ioc/route.ts
import { NextResponse } from "next/server";

const BASE = "https://radar.offseq.com/api/v1";

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const res = await fetch(`${BASE}/threats/check-iocs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`IoC check: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "IoC check failed";
    return NextResponse.json({ matches: [], error: msg }, { status: 502 });
  }
}
```

---

### Task 7: Wire ThreatRadar into Config & Store

**Files:**
- Modify: `argus-app/src/lib/config.ts` — add ThreatRadar endpoint + poll interval
- Modify: `argus-app/src/store/useArgusStore.ts` — add `threatradar` to feedHealth
- Modify: `argus-app/src/types/intel.ts` — add `threatradar` to FeedKey

- [ ] **Step 1: Add ThreatRadar to config endpoints**

Add to `ARGUS_CONFIG.endpoints`:
```typescript
threatRadar: "/api/feeds/threatradar",
threatRadarSearch: "/api/feeds/threatradar/search",
threatRadarIoc: "/api/feeds/threatradar/ioc",
```

Add to `ARGUS_CONFIG.pollIntervals`:
```typescript
threatRadar: 300_000, // 5 minutes
```

- [ ] **Step 2: Add to FeedKey type in intel.ts**

Add `"threatradar"` to the FeedKey union type.

- [ ] **Step 3: Add to feedHealth in store**

Add `threatradar: { status: "idle", lastSuccessAt: null, lastError: null }` to default feedHealth.

---

## Chunk 3: GFS Weather & Sentinel Imagery (Working Tiles)

### Task 8: GFS Weather Direct Tile Source

**Files:**
- Modify: `argus-app/src/app/api/analytics/layers/route.ts`
- Modify: `argus-app/src/lib/config.ts`

- [ ] **Step 1: Update analytics layers route with direct tile URLs**

Replace the fallback payload with working tile URLs. Use OpenWeatherMap free tile layer (no key needed for basic weather tiles) and/or NOAA GOES imagery.

Available free tile sources:
- OpenWeatherMap: `https://tile.openweathermap.org/map/{layer}/{z}/{x}/{y}.png?appid={key}` (needs free key)
- RainViewer (free, no key): `https://tilecache.rainviewer.com/v2/radar/{timestamp}/{size}/{z}/{x}/{y}/{color}/{options}.png`
- NOAA GOES (free): `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes-vis-1km-900913/{z}/{x}/{y}.png`

Use RainViewer (precipitation radar) + NOAA GOES (satellite weather) as they need no API key:

```typescript
const WEATHER_LAYERS = [
  {
    id: "gfs_precip_radar",
    label: "Precipitation Radar",
    source: "RainViewer",
    type: "xyz",
    // timestamp will be fetched from RainViewer API
    tileUrl: "https://tilecache.rainviewer.com/v2/radar/{timestamp}/256/{z}/{x}/{y}/6/1_1.png",
    available: true,
  },
  {
    id: "gfs_satellite_ir",
    label: "Satellite IR (GOES)",
    source: "NOAA/Iowa Mesonet",
    type: "xyz",
    tileUrl: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes-vis-1km-900913/{z}/{x}/{y}.png",
    available: true,
  },
];
```

- [ ] **Step 2: Add RainViewer timestamp fetch**

RainViewer requires a current radar timestamp. Add a helper to fetch it from `https://api.rainviewer.com/public/weather-maps.json` and inject into tile URL.

---

### Task 9: Sentinel Imagery Tile Source

**Files:**
- Modify: `argus-app/src/app/api/analytics/layers/route.ts`
- Modify: `argus-app/src/lib/config.ts`

- [ ] **Step 1: Add Sentinel-2 WMTS tile source**

Use the free Sentinel-2 cloudless mosaic from EOX (no key required):
`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`

Or Sentinel Hub free WMS (limited but functional):

```typescript
{
  id: "sentinel_imagery",
  label: "Sentinel-2 Imagery",
  source: "EOX/Sentinel-2 Cloudless",
  type: "xyz",
  tileUrl: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
  available: true,
}
```

- [ ] **Step 2: Enable sentinel_imagery in store defaults**

Change `sentinel_imagery` available flag from `false` to `true` in the analytics layer definitions.

---

## Chunk 4: Settings UI & AI Summary Integration in HUD

### Task 10: Settings Workspace in HUD

**Files:**
- Modify: `argus-app/src/components/HudOverlay.tsx`

- [ ] **Step 1: Add Settings workspace tab**

Add a 6th workspace "Settings" (gear icon) to the HUD sidebar. Contains:
- LLM Provider dropdown (Ollama / OpenAI-Compatible)
- Endpoint URL text input
- Model name text input
- API Key password input (optional)
- Save button that POSTs to `/api/settings`
- Connection test button that calls `/api/ai/summarize` with a test prompt

- [ ] **Step 2: Load current settings on mount**

Fetch `GET /api/settings` when Settings workspace opens, populate form fields.

---

### Task 11: AI Summary in Target Intel Panel

**Files:**
- Modify: `argus-app/src/components/HudOverlay.tsx`

- [ ] **Step 1: Add AI summary trigger to intel selection**

When a news item, GDELT event, or other intel item is selected into the Target Intel panel:
1. Check if `analysisSummary` is already populated (from static analysis)
2. If not, show a "Generate AI Summary" button
3. On click, POST to `/api/ai/summarize` with the item's text/description
4. Display the returned summary in the intel panel
5. Show loading state while waiting
6. If LLM not configured, show "Configure LLM in Settings" link

- [ ] **Step 2: Add AI summary to Intel Brief**

Add a "Summarize Brief" button in the Intel workspace that sends the current `intelBriefing.summary` + top alerts to `/api/ai/summarize` for a more detailed AI-generated analysis.

---

## Chunk 5: Final Wiring & Build Verification

### Task 12: Add .gitignore entry for settings

**Files:**
- Modify: `argus-app/.gitignore`

- [ ] **Step 1: Add data/settings.json to gitignore**

Ensure user settings (which may contain API keys) are not committed:
```
data/settings.json
```

### Task 13: Build Verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd argus-app && npx tsc --noEmit
```

- [ ] **Step 2: Run lint**

```bash
cd argus-app && npm run lint
```

- [ ] **Step 3: Run build**

```bash
cd argus-app && npx next build
```

Fix any errors that arise.
