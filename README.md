# ARGUS (VPS Deployment)

ARGUS is a geospatial intelligence platform running on a VPS with a **Dockerized multi-service backend** and a Next.js/Cesium frontend.

This repository is the canonical source of truth for:
- application code (`argus-app`, `argus-api`, `ingestor`)
- infrastructure (`docker-compose.yml`, `nginx`, `cloudflared`, `infra`)
- operational docs (`docs`, `VPS_CHANGELOG_AND_NEXT_STEPS.md`)

---

## Architecture Overview

ARGUS runs as containers on a VPS (single host deployment):

- **nginx** (`argus_nginx`)  
  Reverse proxy / edge entrypoint.
- **argus-app** (`argus_app`)  
  Next.js frontend + API routes for feed proxies.
- **argus-api** (`argus_api`)  
  Express backend (analytics, health, server APIs).
- **postgis / timescaledb** (`argus_postgis`)  
  Primary database.
- **titiler** (`argus_titiler`)  
  Raster tile serving.
- **ingestor** (`argus_ingestor`)  
  Scheduled ingest/processing jobs (e.g., GFS).
- **cloudflared** (`argus_cloudflared`)  
  Cloudflare Tunnel to expose services securely.

All services communicate on `argus_network`.

---

## Service Map

### User-facing path

1. Internet traffic enters through Cloudflare Tunnel / DNS.
2. `cloudflared` forwards traffic to `nginx`.
3. `nginx` routes:
   - `/` -> `argus-app`
   - `/spatial/*` -> Zerve-hosted spatial FastAPI app
   - `/api/feeds/*` -> `argus-app` proxy routes
   - `/api/*` -> `argus-api`
   - `/tiles/*` -> `titiler`

### Data path

- `ingestor` writes raster outputs to `data/tiles`.
- `argus-api` advertises available analytics layers.
- `titiler` serves those raster files as tile endpoints.
- `argus-app` renders overlays in Cesium.

---

## Feeds / Integrations

Current feed integrations include:

- OpenSky commercial flights
- ADS-B military flights
- CelesTrak satellites
- USGS earthquakes
- TFL CCTV + webcam sources
- Cloudflare Radar outages
- AlienVault OTX threat pulses
- FRED macro feed
- AISStream vessel snapshot

Most third-party feeds are proxied through server routes to avoid browser CORS/API key exposure.

---

## Repo Layout

```text
argus/
  argus-app/         # Next.js app + Cesium UI + feed proxy routes
  argus-api/         # Express API service
  ingestor/          # Data ingestion/processing jobs
  nginx/             # Nginx config
  cloudflared/       # Cloudflare tunnel config
  infra/             # DB init / infra assets
  data/              # Local data mounts (tiles, etc)
  docs/              # Architecture plans and technical notes
  docker-compose.yml
```

---

## Running on VPS (Docker)

### 1) Prerequisites

- Docker + Docker Compose plugin installed
- `.env` file present at repo root (never commit secrets)

### 2) Start stack

```bash
docker compose up -d --build
```

### 3) Check health

```bash
docker compose ps
docker compose logs -f --tail=100
```

### 4) Stop stack

```bash
docker compose down
```

---

## Common Operations

### Rebuild only app/api

```bash
docker compose up -d --build argus-app argus-api
```

### Restart a single service

```bash
docker compose restart argus-app
```

### Open container shell

```bash
docker compose exec argus-app sh
docker compose exec argus-api sh
```

### Verify API from inside network

```bash
docker compose exec -T argus-api node -e "fetch('http://localhost:3001/api/health').then(r=>r.text()).then(console.log)"
```

---

## Environment Variables

Primary runtime env file: `.env` (repo root)

Important keys include (non-exhaustive):
- `CESIUM_ION_TOKEN`
- `CLOUDFLARE_RADAR_TOKEN`
- `OTX_API_KEY`
- `FRED_API_KEY`, `FRED_SERIES_ID`
- `AISSTREAM_API_KEY`, `AISSTREAM_ENDPOINT`
- `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `CORS_ORIGIN` (comma-separated allowlist for `argus-api`)
- GlitchTip / Sentry DSNs

Do not commit secret-bearing files. `.gitignore` excludes local env variants.

---

## Development Notes

- Frontend-specific docs: `argus-app/README.md`
- Infra updates and incident notes: `VPS_CHANGELOG_AND_NEXT_STEPS.md`
- Large architecture/design proposals: `docs/plans/*`

---

## Git / Branching Expectations

- `master` is actively used for deployment work.
- Keep commits focused and operationally readable.
- Avoid committing local secret files (`.env*`, credentials, backup configs).
- Verify `git status` before push.

---

## Troubleshooting Quicklist

1. `docker compose ps` -> confirm all services are up.
2. `docker compose logs <service>` -> inspect errors.
3. Verify route flow: Cloudflare -> nginx -> target service.
4. Verify tiles path consistency: `/data/tiles` mounted where expected.
5. Validate env keys are present when feed routes return auth errors.

---

## Security Notes

- Secrets in chat should be rotated and reissued.
- Never hardcode API keys in source.
- Keep credentials in `.env` or secret manager only.
- Remove stale `.bak` / scratch config artifacts from commits.

---

If you are onboarding to this repo, read `AGENTS.md` next.
