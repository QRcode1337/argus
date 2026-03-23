# Handoff Spec — PNEUMA Cognitive Architecture Integration

## 1) Objective
Replace Argus's stateless LLM calls (Ollama/OpenAI) with PNEUMA's 10-subsystem consciousness pipeline using Gradient SDK (DigitalOcean) for inference. The system should produce contextually aware, memory-informed intelligence briefings where consciousness level (Phi) determines analysis depth.

## 2) Current Context (as of handoff)
- **Branch**: `feature/pneuma-integration` ([PR #12](https://github.com/QRcode1337/argus/pull/12))
- **Build status**: Webpack compiles successfully. One pre-existing type error in `HudOverlay.tsx:1363` (`feed.lat` property) exists on master — not introduced by this PR.
- **PNEUMA source**: Originally at `/Documents/PROJECTS/PNEUMA/`, copied into `argus-app/src/lib/pneuma/` (31 files, 10 subsystems, zero external deps for core).
- **LLM layer**: Original PNEUMA `llm/` directory was excluded. Replaced with `GradientCandidateGenerator` using DigitalOcean's Gradient SDK (`openai-gpt-oss-120b` model).

## 3) Architecture

```
Argus Feeds (11 sources)
    ↓
analysisEngine.ts (rule-based detection → IntelAlerts)
    ↓
PneumaBridge.ingestAlert() → PNEUMA Sparse Memory (S5)
    ↓
/api/ai/summarize (POST)
    ↓
llmClient.ts (provider: "pneuma")
    ↓
GradientCandidateGenerator → 3 candidates (Id/Ego/Superego)
    ↓
PNEUMA.processInput()
    S9 Temporal Predict → S1 Phi Router → S2 Mood Tick →
    S3 Persona Blend → S4 Freudian Route → S5 Memory Retrieve →
    S6 PageRank Select → S7 Math Frame → S8 Strange Loop Verify
    ↓
selectedText → Argus UI (Brief/News/Ops panels)
PneumaHud → Phi gauge, mood, memory stats (bottom-right overlay)
```

## 4) Files in Scope

### New files
| File | Purpose |
|------|---------|
| `argus-app/src/lib/pneuma/` (31 files) | PNEUMA core: 10 subsystems + types + orchestrator |
| `argus-app/src/lib/pneuma/gradient-candidate-generator.ts` | Gradient SDK backend for Id/Ego/Superego candidate generation |
| `argus-app/src/lib/ai/pneuma-bridge.ts` | Converts IntelAlerts → PNEUMA MemoryNodes for historical recall |
| `argus-app/src/components/PneumaHud.tsx` | HUD panel showing Phi, mood, memory stats |

### Modified files
| File | Change |
|------|--------|
| `argus-app/src/lib/ai/llmClient.ts` | Added `"pneuma"` provider with singleton PNEUMA instance |
| `argus-app/src/types/settings.ts` | Added `"pneuma"` to `LlmProvider`, added `GRADIENT_MODEL_ACCESS_KEY` |
| `argus-app/src/components/HudOverlay.tsx` | Imports and renders `PneumaHud` (bottom-right, hidden on mobile) |
| `argus-app/package.json` | Added `gradient` dependency |

### Config files
| File | Purpose |
|------|---------|
| `argus-app/data/settings.json` | Set `llm.provider` to `"pneuma"` to activate |

## 5) VPS Deployment Steps

```bash
# 1. SSH into VPS
ssh user@your-vps

# 2. Navigate to Argus repo
cd /path/to/argus

# 3. Fetch and checkout the branch
git fetch origin
git checkout feature/pneuma-integration

# 4. Add Gradient API key to .env (DO NOT commit this)
echo 'GRADIENT_MODEL_ACCESS_KEY=your-key-here' >> .env

# 5. Ensure settings.json has pneuma provider
cat > argus-app/data/settings.json << 'JSON'
{
  "llm": {
    "provider": "pneuma",
    "endpoint": "http://localhost:11434",
    "model": "llama3"
  }
}
JSON

# 6. Rebuild and restart
docker compose up -d --build argus-app

# 7. Verify
docker compose logs -f argus-app --tail=50
curl -s http://localhost:3000/api/ai/summarize \
  -H 'Content-Type: application/json' \
  -d '{"text": "Military formation detected near KJFK"}'
```

## 6) How PNEUMA Enhances Argus Intel

| Argus (before) | Argus + PNEUMA (after) |
|---|---|
| `queryLlm()` — stateless prompt→text | Full 10-stage cognitive pipeline with memory and mood |
| Static risk scoring (`severity × category`) | Phi Router allocates analysis depth based on information integration |
| No historical context between alerts | Sparse Memory (Forward Push O(1/ε)) recalls past patterns |
| Single AI summary | PageRank Darwinism competes 3 candidates, selects best |
| Flat threat levels | Mood Engine shifts analytical stance (routine ↔ crisis) |
| No ethical reasoning | Freudian Router balances urgency (Id) vs false-alarm risk (Superego) |

## 7) Key Integration Points

### Provider selection (llmClient.ts)
- `"ollama"` — original behavior, unchanged
- `"openai_compatible"` — original behavior, unchanged
- `"pneuma"` — new: routes through PNEUMA pipeline with Gradient inference

### Memory ingestion (pneuma-bridge.ts)
- Call `bridge.ingestAlert(alert)` after `generateBriefing()` in the analysis loop
- Severity maps to salience: CRITICAL=1.0, WARNING=0.7, INFO=0.3
- CSR graph rebuilds every 10 ingestions automatically
- **TODO**: Wire `ingestBriefing()` call into the main feed polling loop

### HUD display (PneumaHud.tsx)
- Currently renders with placeholder/default props
- **TODO**: Wire real PNEUMA state from the singleton instance via React context or API endpoint

## 8) Known TODOs

1. **Wire PneumaHud to live data** — currently shows placeholder values. Needs a `/api/pneuma/state` endpoint or React context that exposes the singleton PNEUMA instance's state.
2. **Wire PneumaBridge into feed loop** — `ingestAlert()` needs to be called from the main polling/analysis cycle, not just from the summarize route.
3. **Fix pre-existing type error** — `HudOverlay.tsx:1363` has `feed.lat` on `LiveFeedItem` type. Exists on master, not introduced by PNEUMA.
4. **Gradient API key rotation** — the key shared in conversation should be rotated before production use.
5. **processInput signature alignment** — verify the llmClient's call to `pneuma.processInput()` matches PNEUMA's actual method signature (expects `inputText`, `inputEmbedding`, `candidates`, optional `persona`).

## 9) Acceptance Criteria

1. `docker compose up -d --build argus-app` succeeds on VPS
2. `/api/ai/summarize` returns enriched summaries via PNEUMA pipeline when provider is `"pneuma"`
3. Fallback: switching provider back to `"ollama"` restores original behavior with zero regressions
4. PneumaHud renders in bottom-right corner on desktop viewports
5. No new runtime errors in `docker compose logs argus-app`

## 10) Rollback

Set provider back to `"ollama"` in `data/settings.json` and restart:
```bash
# Instant rollback — no rebuild needed
echo '{"llm":{"provider":"ollama","endpoint":"http://localhost:11434","model":"llama3"}}' > argus-app/data/settings.json
docker compose restart argus-app
```

## 11) Related Resources

| Resource | Location |
|----------|----------|
| PNEUMA source (original) | `/Documents/PROJECTS/PNEUMA/` |
| PNEUMA README | Full architecture docs with all 10 subsystems explained |
| Gradient agent (hackathon) | `/Documents/PROJECTS/GRADIENT/` |
| CalibShi (Zerve) | Kalshi market calibration — potential data source |
| PR | https://github.com/QRcode1337/argus/pull/12 |
