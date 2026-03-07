# AGENTS.md (ARGUS Repository)

This file defines expectations for humans and coding agents working in this repo.

## Purpose

ARGUS is a **VPS-hosted, Dockerized, multi-service system**. Changes should preserve deployability and operational clarity.

---

## Ground Rules

1. **Do not commit secrets.**
   - Never commit `.env`, credential JSON, private keys, tokens.
2. **Assume production impact.**
   - `master` may be deployed directly from VPS workflows.
3. **Prefer small, reviewable commits.**
4. **Update docs when behavior changes.**
   - If infra/service flow changes, update `README.md` and/or `docs/`.
5. **Run quick validation before handoff.**
   - Lint/build where relevant, plus container sanity checks for infra changes.

---

## System Topology (for agent context)

Primary services in `docker-compose.yml`:
- `nginx` (edge reverse proxy)
- `argus-app` (Next.js + feed route proxies)
- `argus-api` (Express APIs)
- `postgis` (timescaledb image)
- `titiler` (raster tiles)
- `ingestor` (data jobs)
- `cloudflared` (tunnel)

Route intent:
- `/` -> `argus-app`
- `/api/feeds/*` -> `argus-app`
- `/api/*` -> `argus-api`
- `/tiles/*` -> `titiler`

---

## File Ownership Heuristics

- `argus-app/**` -> frontend, Cesium UI, Next API routes
- `argus-api/**` -> backend APIs, analytics metadata
- `ingestor/**` -> ingestion jobs + scheduler behavior
- `nginx/**` -> routing/edge behavior
- `cloudflared/**` -> tunnel config
- `docker-compose*.yml` -> service topology/runtime wiring

For cross-cutting changes, call out touched boundaries in commit messages.

---

## Required Pre-Commit Checklist

Before committing, run what applies:

### App/API
```bash
cd argus-app && npm run lint
```

### Compose / infra edits
```bash
docker compose config
```

### Final sanity
```bash
git status --short
./scripts/safe-push-check.sh
```

Confirm no accidental files are staged (especially `.env*`, backups, credentials).

---

## Commit Style

Recommended prefixes:
- `feat:` new capability
- `fix:` bug fix
- `chore:` maintenance/refactor/no feature change
- `docs:` documentation-only
- `infra:` deployment/compose/nginx/tunnel changes

Examples:
- `feat: add RSS news aggregation endpoint and UI workspace`
- `infra: align titiler mount path with analytics tile URLs`

---

## Deployment / Ops Commands

Use from repo root:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
```

Rebuild specific service:

```bash
docker compose up -d --build argus-app
```

---

## Newsfeed Work (Current Direction)

When implementing news aggregation:
- Keep AP/Reuters optional unless verified reliable/licensed RSS source is available.
- Start with stable feeds (BBC, Guardian, NPR, DW, Al Jazeera, HN, GDELT).
- Aggregate server-side, dedupe aggressively, and keep UI uncluttered.
- Do not overpack the existing left accordion; prefer workspace/tab model.

---

## Safety / Hygiene

- Ignore local scratch: `.env.plugin`, `*.bak`, temporary files.
- If you discover exposed keys, notify maintainer and rotate immediately.
- Avoid destructive git commands unless explicitly requested.

---

## Codex / Claude Code Workflow (Strict)

If using Codex or Claude Code on this repo, follow this exact sequence:

1. **Sync first**
   - `git pull --rebase origin master`
2. **Plan in plain text**
   - 3–7 bullet implementation plan before edits
3. **Implement in small commits**
   - keep commits scoped (UI, API, infra separated when possible)
4. **Run validation**
   - App/UI: `cd argus-app && npm run lint`
   - Compose/infra change: `docker compose config`
5. **Check for secret leakage**
   - ensure `.env*`, tokens, backup files are not staged
6. **Handoff report**
   - include the template below verbatim

Required handoff format:

- **Summary:**
- **Files changed:**
- **Validation:**
- **Risks/Follow-ups:**
- **Git status:**
- **Commit(s):**

## Handoff Template (for agents)

When reporting completed work, include:
1. What changed (high-level)
2. Files touched
3. Validation run + result
4. Any risks / follow-up items
5. Git status (clean/dirty)

Keep handoffs concise and operational.
