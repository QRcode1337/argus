# ARGUS + Epsilon Space Threat Intelligence Synthesis Engine

Working teaming brief for DIU PROJ00716  
Version: 0.1 — unclassified planning draft  
Opportunity: [Space Threat Intelligence Synthesis Engine](https://www.diu.mil/work-with-us/submit-solution/PROJ00716)  
Response deadline: September 24, 2026 at 11:59 p.m. US/Eastern

This document is structured as a five-page-equivalent solution brief. It is not submission-ready until the named teammates, commercial traction, clearance path, deployment evidence, benchmark results, and ROM ownership are confirmed.

## Page 1 — Executive summary and mission fit

Space and missile operators must reconcile high-volume, heterogeneous observations quickly enough to support time-sensitive decisions. The proposed team combines three separable products:

| Component | Proposed role | Evidence available now |
| --- | --- | --- |
| ARGUS | Human-readable analyst workspace, geospatial/orbital visualization, event playback, alert review, and evidence inspection | Dockerized Next.js/Cesium application plus the `/demo/space-threat` unclassified synthetic demonstrator |
| Epsilon | Provenance envelopes, confidence contribution records, access-policy enforcement, partner partitioning, and auditable decision records | Architecture claim to substantiate with product artifacts and customer evidence before submission |
| Cleared space-data partner | Multi-INT adapters, space-domain models, representative operational data, classified integration, FCL sponsorship/path, and TS/SCI personnel | Partner not yet named |

The near-term prototype would ingest observations through modular adapters, correlate them into candidate events, retain each supporting and contradictory artifact, and publish two synchronized products: an operator assessment in ARGUS and a non-proprietary machine response for downstream C2 workflows. Epsilon would bind every assessment to its inputs, scoring procedure, policy context, and human or machine decision.

The commercial thesis is not “a globe plus infrastructure.” It is a composable evidence-to-decision system in which ARGUS makes fusion legible to an operator, Epsilon makes it governable and auditable, and a space-domain teammate makes the correlation operationally credible.

### Why this opportunity is actionable

- The solicitation explicitly permits individual or teamed submissions and says the Government may request teaming.
- It calls for an unclassified demonstration, allowing the team to show product behavior before classified integration.
- Synthetic data and modeling are named differentiators.
- The five-second arrival-to-display threshold can be instrumented directly in the demonstrator.
- A successful prototype can lead to a follow-on production award without a new competition.

### Bid thesis

Bid only as a team. ARGUS and Epsilon can credibly lead the operator experience, evidence assurance, policy, and modular deployment story. A teammate must own representative space-sensor ingestion, domain validation, classified deployment execution, and the clearance/staffing path.

## Page 2 — Technical approach

### Logical architecture

```text
Video / imagery / radar / telemetry / reports
                  │
        partner-owned Multi-INT adapters
                  │
       correlation + domain-model services
                  │
      confidence-scored event/track updates
                  │
        Epsilon evidence assurance layer
   provenance │ policy │ signatures │ audit
                  │
        ┌─────────┴─────────┐
        │                   │
 ARGUS operator UI    open machine API
 explanation + map    C2 / mission systems
```

Each service boundary is containerized and independently upgradeable. Inter-service contracts use versioned, non-proprietary JSON/JSON-LD or protobuf schemas; the final format should be selected with the Government and partner systems. Raw artifacts remain addressable by immutable IDs and content digests. Assessment records retain the model/version, normalized feature inputs, confidence contributions, contrary evidence, timestamps, and policy decision.

### Transparent confidence model

The first demonstrator intentionally uses a simple, deterministic weighted log-odds reducer rather than an opaque model:

```text
effective weight = reliability × quality × relevance × independence
signed contribution = stance × 1.25 × effective weight
posterior log-odds = prior log-odds + Σ signed contributions
confidence = logistic(posterior log-odds)
```

This is a demonstration scoring policy, not a proposed production threat model. Its purpose is to prove that the system can expose every input and signed contribution. A production prototype would accept partner-validated likelihood models, calibration curves, and benchmark libraries while preserving the same audit contract.

### Human and machine outputs

ARGUS provides:

- a lean Cesium orbital scene with protected and assessed objects;
- play, pause, single-step, replay, and reset controls;
- a confidence timeline that visibly falls when contradictory evidence arrives;
- expandable source lineage with publisher, collection method, transformations, SHA-256 digest, and raw artifact;
- explicit evidence-conflict and confidence indicators;
- measured HTTP-ingress-to-Cesium-post-render latency.

The same evaluation endpoint returns the observation window, confidence, confidence band, support and contradiction weights, conflict index, signed contributions, and reasoning lines as JSON. That response is a demonstrator machine interface, not yet a production C2 contract.

## Page 3 — Unclassified demonstration and empirical evidence

### Scenario

`synthetic-leo-keepout-001` asks whether fictional object `SYN-90002` will enter a 15 km keep-out volume around protected fictional asset `SYN-90001`. All artifacts and objects are visibly marked `UNCLASSIFIED // SYNTHETIC`.

| Seq. | Modality | Observation | Stance | Fused confidence |
| ---: | --- | --- | --- | ---: |
| Prior | — | Initial calibrated fixture prior | — | 30.0% |
| 1 | Catalog | 11.8 km projected miss | Supports | 47.8% |
| 2 | EO/IR | 9.6 ± 2.2 km projected miss | Supports | 69.7% |
| 3 | Radar | 43.7 ± 1.1 km projected miss | Contradicts | 44.0% |
| 4 | EO/IR | 12.4 ± 2.8 km projected miss | Supports | 63.6% |

The high-quality radar result produces an approximately 25.7-point confidence reversal. The final supporting cue recovers confidence but leaves the conflict index above 60%, preventing the operator from mistaking a majority of supporting sources for resolved agreement.

### Run the demonstrator

```bash
cd argus-app
npm run build
npm start
```

Open `http://localhost:3000/demo/space-threat`, select **Play**, and expand any observation in **Evidence lineage**. **Step** advances one observation at a time. **Replay** starts a new run ID.

Use `npm run dev` for implementation work only. Its first on-demand route compilation and Fast Refresh activity are intentionally included in the displayed measurement and can make a development replay fail the threshold; retain production-build measurements for proposal evidence.

### Latency definition

For each observation, the browser records a monotonic timestamp immediately before POSTing the synthetic ingress event. The stateless server evaluates the visible observation window and returns its own fusion duration. ARGUS updates the evidence workspace and orbital entities, then closes the measurement on the next Cesium `scene.postRender` event. The UI reports per-event values, p95, maximum, and pass/fail against 5,000 ms.

This measures the deployed demo path: browser ingress request → HTTP proxy → Next route → fusion → response → React state → Cesium render. It does not prove sensor-edge latency, clock synchronization across external systems, or performance at the solicitation's ~5 GB/min burst objective.

### Evidence still required before submission

1. Run at least 20 containerized replay cycles and retain p50/p95/max output with host specifications.
2. Build a load harness with representative payload-size and modality distributions for 20–30 MB/min nominal and ~5 GB/min burst conditions.
3. Demonstrate sub-two-second objective behavior under an agreed representative workload.
4. Add failure tests for delayed, duplicated, out-of-order, malformed, and revoked observations.
5. Benchmark a partner domain model against an accepted operational or synthetic truth set.

## Page 4 — Security, deployment, interoperability, and sustainment

### Deployment

ARGUS already runs as a Dockerized multi-service system with nginx, a Next.js application, an Express API, PostGIS/TimescaleDB, raster tiles, ingestion jobs, and a Cloudflare tunnel. The demo is isolated from live feed polling and heavy terrain/building rendering to keep its measurement legible. A prototype deployment should preserve independent containers for adapters, fusion/domain models, evidence assurance, APIs, UI, and observability.

### Security workstream

The team must turn the following from roadmap statements into reviewed evidence:

- NIST SP 800-171 control implementation and CUI boundary;
- PKI certificate authentication and service identity;
- attribute- or policy-based partner partitions;
- data tagging from ingress through derived assessment;
- SBOM generation, signed images, vulnerability gates, and zero Critical/High CVEs;
- immutable audit export and key-management design;
- disconnected/degraded operation, reconciliation, and revocation behavior;
- classified hosting, cross-domain, and accreditation approach owned with the cleared partner.

No submission should imply that the public ARGUS deployment is currently authorized for CUI or classified data.

### Interoperability

The prototype should publish:

- versioned observation, artifact, track, hypothesis, assessment, and decision schemas;
- synchronous query and event-driven update interfaces;
- stable identifiers and content digests across partner boundaries;
- non-proprietary assessment exports for workflow capture and training evaluation;
- adapters for Government-selected data pipelines and C2 systems.

### Sustainment

Define service-level objectives, health and backlog metrics, model/data drift indicators, replayable incident records, upgrade/rollback procedures, and 24/7 escalation ownership. The Government must be able to update one adapter or model without replacing the operator workspace or evidence contract.

## Page 5 — Team, transition, schedule, and bid decision

### Workshare

| Work package | ARGUS | Epsilon | Cleared partner |
| --- | :---: | :---: | :---: |
| Operator workflow and orbital visualization | Lead | Support | Validate |
| Multi-INT adapters and space-domain correlation | Support | Interface | Lead |
| Provenance, confidence records, policy, and audit | Integrate | Lead | Validate |
| Machine API and Government interoperability | Co-lead | Co-lead | Co-lead |
| Representative data and truth sets | — | Support | Lead |
| CUI/classified environment and cleared staffing | Support | Support | Lead |
| Container platform, test harness, and observability | Lead | Co-lead | Validate |

### Proposed prototype increments

1. **Unclassified baseline:** synthetic scenario, evidence contract, confidence history, lineage, machine JSON, and measured rendering latency.
2. **Representative data:** partner adapters, truth data, calibrated models, accuracy and attribution benchmarks.
3. **Performance:** nominal and burst load harness, backpressure, horizontal scaling, multi-year retrieval benchmark, sub-two-second objective tuning.
4. **Security/interoperability:** CUI boundary, PKI, partner partitions, image signing/SBOM, Government pipeline and C2 adapters.
5. **Operational evaluation:** analyst workflow study, degraded-data cases, automated/human approval policies, sustainment and transition package.

### 48-hour bid gates

Proceed only if all red gates have named owners:

- **Clearance:** identify the entity able to obtain/maintain the FCL and assign TS/SCI-cleared personnel for the agreement term and possible follow-on.
- **Space-domain credibility:** secure a teammate with representative sensors/data, accepted domain models, and benchmark history.
- **Commercial viability:** assemble evidence that each offered commercial component is more than a bespoke proposal artifact.
- **Performance plan:** agree on hardware, payload mix, load generator, pass/fail measures, and who owns the 5 GB/min demonstration.
- **Security plan:** name the CUI/classified boundary owner and document the path to NIST, PKI, vulnerability, and accreditation requirements.
- **Submission owner:** assign the five-page PDF, 10 MB limit, company registrations, OT eligibility representation, and Phase 2 ROM preparation.

### Immediate actions

1. Share this brief and the `/demo/space-threat` route with two candidate cleared space-data partners.
2. Run the containerized latency replay and capture evidence.
3. Replace every “proposed” Epsilon capability with a product artifact, test result, or clearly labeled development commitment.
4. Select the prime/sub workshare and confirm the award-eligibility path.
5. Make the bid/no-bid decision within 48 hours; if “bid,” freeze the narrative and begin the performance/security evidence sprint.
