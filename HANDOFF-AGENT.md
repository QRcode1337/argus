# Handoff Spec Outline — Argus Feed Reliability + Intel Robustness

## 1) Objective
Stabilize Argusweb feed availability (AISStream + OTX) and upgrade AI intel analysis quality, with graceful degradation and clear observability.

## 2) Current Context (as of handoff)
- **AISStream**
  - Migrated from dead REST endpoint assumptions to websocket-first approach.
  - Route currently implemented in `argus-app/src/app/api/feeds/aisstream/route.ts`.
  - Returns degraded payloads (`vessels: []`, `_degraded`, `_reason`) when upstream fails.
- **OTX**
  - Route in `argus-app/src/app/api/feeds/otx/route.ts`.
  - Added timeout + degraded fallback (`results: []`, `_degraded`, `_reason`) and cache behavior.
- **Intel Analysis**
  - Core engine: `argus-app/src/lib/intel/analysisEngine.ts`
  - Baseline alerts exist; briefing logic needs stronger robustness and scoring confidence model.

## 3) Required Deliverables
### A) Feed Reliability
1. **AISStream**
   - Confirm websocket subscription schema (APIKey casing, bounding box format).
   - Ensure short-lived snapshot collection and safe close behavior.
   - Keep degraded-mode responses non-fatal to UI.
2. **OTX**
   - Preserve no-store fetch with timeout.
   - Maintain stale cache fallback if available.
   - Return structured degraded output when upstream unavailable.

### B) Intel Robustness
1. **Briefing Model Enhancements**
   - Add:
     - `riskScore` (0+ numeric)
     - `dominantCategories` (top 1–2 categories)
2. **Scoring Logic**
   - Weighted severity + category.
   - Deduplicate near-identical alerts in short time buckets.
   - Threat level derived from risk score + critical count thresholds.
3. **Output Quality**
   - Keep deterministic sorting (severity > recency).
   - Preserve concise summary string with risk score.
   - Avoid alert spam via dedup.

### C) Observability
1. Add/verify feed health metadata:
   - last success timestamp
   - degraded status
   - error reason
2. Optional endpoint:
   - `/api/feeds/health` or equivalent aggregate status.

## 4) Files in Scope
- `argus-app/src/app/api/feeds/aisstream/route.ts`
- `argus-app/src/app/api/feeds/otx/route.ts`
- `argus-app/src/lib/intel/analysisEngine.ts`
- (Optional UI wiring) components that display feed health/intel summary.

## 5) Acceptance Criteria
1. **No hard failures in UI** when AIS/OTX upstreams are unreachable.
2. Feed routes return **valid JSON always** (data or degraded payload).
3. Intel briefing includes:
   - threat level
   - risk score
   - dominant categories
   - deduplicated alert counts.
4. Build and deploy complete successfully:
   - `docker compose up -d --build argus-app`
5. Sanity checks:
   - `/api/feeds/aisstream` returns either vessels or degraded payload.
   - `/api/feeds/otx` returns either results or degraded payload.
   - Intel briefing generation handles empty/degraded input gracefully.

## 6) Testing Checklist
- Upstream available:
  - AIS returns non-empty vessels snapshot.
  - OTX returns pulse results.
- Upstream unavailable:
  - Both return degraded payloads (HTTP 200 preferred for UI continuity if design allows).
- Intel:
  - Inject synthetic critical/warning/info mixes.
  - Verify dedup and risk score behavior.
  - Confirm threat level transitions (GREEN/AMBER/RED) match thresholds.

## 7) Risks / Notes
- AISStream websocket behavior is environment-sensitive in bundled Next runtime.
- Keep WS dependencies minimal and avoid optional native addon pitfalls.
- Do not regress existing HUD/feed health rendering.

## 8) Definition of Done
- Feed outage no longer appears as full app breakage.
- Intel analysis is measurably richer and less noisy.
- Handoff agent provides final diff summary + before/after sample outputs.
