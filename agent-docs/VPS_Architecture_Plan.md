# Argus VPS Architecture Implementation Plan

This document serves as the implementation plan and architectural documentation for setting up the Argus project on the VPS server. Provide this document to the AI agent handling the VPS setup.

## Goal Description
Deploy the Argus project using a split Node/Docker architecture. The architecture separates the Next.js frontend (`argus-app`) from a newly formed dedicated Node.js backend (`argus-api`), running alongside existing infrastructure services (`postgis`, `titiler`, and `ingestor`).

## Node/Docker Split Architecture Docs

### Components
1. **Next.js Frontend (`argus-app`)**: Serves the UI. Deployed in its own Docker container. Connects to the API proxy for backend data needs.
2. **Node.js Backend (`argus-api`)**: A new Express (or Fastify) service that handles database connections, feeds, and analytics logic, which will be migrated from the Next.js API routes.
3. **PostGIS (`postgis`)**: PostgreSQL with PostGIS extensions for spatial data (already defined).
4. **TiTiler (`titiler`)**: Tile server (already defined).
5. **Ingestor (`ingestor`)**: Python/Node cron-based data ingestor (already defined).
6. **Nginx Reverse Proxy (`nginx`)**: Acts as the unified API Gateway/Router. Runs on port 80/443 and routes traffic:
   - `/` -> `argus-app:3000` (Frontend)
   - `/api/` -> `argus-api:3001` (Backend)
   - `/tiles/` -> `titiler:80` (Tile Server)
   
### Docker Network
All containers will run on a single custom `argus_network` defined within `docker-compose.yml`, allowing containers to communicate using their service names.

## Proposed Changes

### [Docker Setup]
#### [MODIFY] `docker-compose.yml`
- Add `argus-app` service building from `./argus-app/Dockerfile`.
- Add `argus-api` service building from `./argus-api/Dockerfile`.
- Add `nginx` service using an official Nginx image sharing `./nginx/nginx.conf`.
- Expose port `80` (and `443` if setting up SSL) via `nginx`. Remove direct port mappings for other services to enforce routing through the proxy.
- Ensure all services connect to a shared Docker network.

#### [NEW] `argus-app/Dockerfile`
- Multi-stage build for Next.js standalone output to minimize image size and ensure production-ready deployment.

#### [NEW] `nginx/nginx.conf`
- Configuration file for the Nginx proxy to map incoming requests to the respective upstream containers.

### [VPS Backend Scaffold (`argus-api`)]
The following outlines how the VPS agent should scaffold the new API backend.

#### [NEW] `argus-api/Dockerfile`
- Standard Node.js image (e.g., `node:18-alpine` or `node:20-alpine`) for building and running the backend server.

#### [NEW] `argus-api/package.json`
- Initialize via `npm init -y`.
- Install dependencies: `express`, `cors`, `dotenv`, `pg` (and any other DB tools like `drizzle-orm` or `prisma` used by the project).
- Add scripts for `start` and `dev`.

#### [NEW] `argus-api/src/index.js` (or `.ts`)
- Initial Express server skeleton.
- Configure `cors` to allow requests (or configure Nginx to handle CORS).
- Set up route structures matching the current `argus-app/src/app/api` directory (e.g., `/api/analytics`, `/api/feeds`).

## Execution Steps for VPS Agent

1. **Create the Backend Skeleton:**
   - Create the `argus-api` directory at the project root.
   - Run `npm init -y` inside `argus-api`.
   - Install required dependencies.
   - Scaffold `src/index.js` with a basic Express setup listening on port 3001, including a health check route (`/api/health`).
2. **Setup Docker Configuration:**
   - Write `argus-app/Dockerfile`. Ensure `next.config.js` or `next.config.ts` has `output: 'standalone'` enabled.
   - Write `argus-api/Dockerfile`.
   - Create `nginx/nginx.conf` routing `/`, `/api/`, and `/tiles/` respectively.
   - Update the root `docker-compose.yml` to merge the new services with `postgis`, `titiler`, and `ingestor`.
3. **Migration of API Logic:**
   - Review logic inside `argus-app/src/app/api` (`analytics` and `feeds`).
   - Re-implement or move this logic into `argus-api/src/routes/`.
   - Update the frontend environment variables so API calls are directed to the relative path `/api` (which Nginx will forward to the backend).
4. **Deploy & Spin Up:**
   - Run `docker-compose up -d --build`.

## Verification Plan
### Manual Verification
1. **Container Health**: Run `docker-compose ps` to ensure all 6 containers (`nginx`, `argus-app`, `argus-api`, `postgis`, `titiler`, `ingestor`) have an "Up" status and are not restarting.
2. **Nginx Routing Test**:
   - `curl http://localhost/` -> Should return the Argus Next.js HTML page.
   - `curl http://localhost/api/health` -> Should return a 200 OK from the new `argus-api` service.
   - `curl http://localhost/tiles/...` -> Should successfully hit the TiTiler service.
3. **Frontend Integration**: Load the web app in a browser to confirm data is successfully fetching from the `/api` routes without CORS or 502 errors.
