# Argus Intelligence Dashboard

## Project Context

- The repo is at `~/argus`. Never search in `/home/volta` root — the project is always here.
- Main app code lives in `argus-app/src/`.
- Always confirm repo path before git operations.

## Tech Stack

- TypeScript, Next.js 14 (App Router), React, Cesium.js, D3.js
- Docker deployment droplet
- Vercel for production hosting at argusweb.space (Cloudflare Tunnel)
- Always run `npx tsc --noEmit` or `npx next build` after significant changes to verify nothing is broken.

## Environment Constraints

- Runs on a Raspberry Pi. `sudo` may not be available.
- Prefer solutions that don't require root. Check sudo availability before planning root-dependent approaches.
- Vercel CLI may not be logged in — prefer dashboard for env var changes.
- HTTPS is via Cloudflare Tunnel, not certbot/Let's Encrypt.

## Code Changes

- When removing dead code or features, do a thorough grep for ALL references (imports, components, API routes, types, config, .env files) before committing.
- Never assume a single pass caught everything — always verify with a final grep.
- Run `npx next build` after removals to confirm nothing broke.

## Active Data Feeds

Public (no key): USGS, Celestrak, ADSB.lol military, GDELT, News RSS
Keyed: OpenSky, OTX, FRED, AISStream, Cloudflare Radar

## Git

- Default branch: master
- Remote: origin (GitHub)
- Commit and push only when asked.
