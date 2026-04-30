# Argus Intelligence Dashboard

## Project Context

- The repo is at `~/argus`. Never search in `/home/volta` root — the project is always here.
- Main app code lives in `argus-app/src/`.
- Always confirm repo path before git operations.

## Deployment (READ BEFORE ANY DEPLOY ACTION)

- **You are already on the production droplet.** No SSH. Run `docker` commands directly.
- **Primary backend = Docker on this DigitalOcean droplet.** A `git push` does NOT redeploy the droplet — you must rebuild the container:
  `docker compose up -d --no-deps --build --force-recreate argus-app`
- **Vercel auto-deploys from GitHub master**, but it is the **secondary** target. Pushing to master triggers Vercel automatically; the droplet still needs its own rebuild.
- **Live domain:** `argusweb.bond` via Cloudflare Tunnel (`argus_cloudflared` container). `argusweb.space` is suspended; ignore it.
- **`data/settings.json` is volume-mounted and intentionally not committed** (contains live LLM apiKey). Edit directly — no rebuild needed for settings changes.
- **Default flow after any code change**: build + commit + push + droplet rebuild + verify, all without asking. Use `/deploy`. Skip only if user says "don't commit" or is mid-iteration.

## Verification (READ BEFORE CLAIMING "FIXED")

- Do not claim a bug is fixed until you have evidence from the live container — curl the endpoint, tail the logs, or load the page. Show the output.
- For LLM/API/feed bugs, hit the route via `curl http://localhost/api/...` after the rebuild and quote the response.
- For UI/Cesium bugs you can't load directly, say so explicitly rather than declaring success.

## Working Style

- When the user gives a numbered list, repair plan, or directive ("fix X, Y, Z"), implement directly. Do not invoke brainstorming or ask clarifying questions unless a step is genuinely impossible to start.
- When unsure between two reasonable choices on a small detail, make the call and proceed; surface it in the summary.

## Tech Stack

- TypeScript, Next.js 14 (App Router), React, Cesium.js, D3.js
- LLM: Gradient (DigitalOcean agent endpoint, OpenAI-compatible) — primary; Ollama optional
- Compose stacks: `docker-compose.yml` (main), `docker-compose.realtime.yml` (redis), `docker-compose.observability.yml` (glitchtip). Realtime stack must be up — `argus_api` depends on Redis.
- Run `npx tsc --noEmit` or `npx next build` (in `argus-app/`) after non-trivial changes.

## Environment Constraints

- Linux droplet, has Docker, has `sudo` if needed (but rarely required).
- HTTPS via Cloudflare Tunnel, not certbot.
- Vercel CLI may not be logged in — prefer the GitHub-push auto-deploy path or the Vercel dashboard.

## Code Changes

- When removing dead code, grep for ALL references (imports, components, API routes, types, `.env` files) before committing. Always do a final verification grep.
- Run `npx next build` after removals.

## Active Data Feeds

- Public (no key): USGS, Celestrak, ADSB.lol military, GDELT, News RSS, ISS
- Keyed: OpenSky, OTX, FRED, AISStream, Cloudflare Radar

## Git

- Default branch: master
- Remote: origin (GitHub QRcode1337/argus — public repo, never commit secrets)
