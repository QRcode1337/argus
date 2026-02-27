# ARGUS

Real-time browser geospatial intelligence dashboard built with Next.js + CesiumJS + Zustand.

## Stack

- Next.js App Router + React 19
- Tailwind CSS v4
- CesiumJS (OSM + OSM Buildings)
- Zustand state store
- `satellite.js` for live TLE propagation

## Live Feeds

- OpenSky commercial flights (`/api/feeds/opensky`)
- ADS-B military flights (`/api/feeds/adsb-military`)
- CelesTrak TLE satellites (`/api/feeds/celestrak`)
- USGS earthquakes (`/api/feeds/usgs`)
- TFL JamCam CCTV (`/api/feeds/tfl-cctv`)

## Visual Modes

- `Normal`
- `NVG` (night vision)
- `FLIR` (thermal ramp)
- `CRT` (scanline + chromatic offset)

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

```bash
npm run lint
npm run build
```

## Notes

- Cesium static assets are copied to `public/cesium` during `postinstall`.
- Feed upstreams are proxied through local API routes to avoid client CORS issues and support optional API keys.
- Architecture and backlog details are documented in `docs/ARGUS_MVP_V2.md`.
