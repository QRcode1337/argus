# Spatial Proxy Routing for Argus

This document explains how the Zerve-hosted spatial app is exposed through Argus.

## Routing behavior

Argus nginx now proxies the spatial app under:

- `https://argusweb.bond/spatial/`

The proxy configuration also redirects:

- `/spatial` → `/spatial/`

## Zerve app requirements

The Zerve FastAPI app should be deployed with:

```bash
APP_BASE_PATH=/spatial
```

and run with:

```bash
uvicorn main:app --host 0.0.0.0 --port 8080
```

## Proxy headers

The reverse proxy forwards:

- `Host`
- `X-Forwarded-For`
- `X-Forwarded-Proto`
- `X-Forwarded-Prefix: /spatial`

This allows the app to generate correct URLs and SSE stream paths behind the prefix.

## SSE behavior

The live update stream uses SSE and is configured to be proxy-safe:

- `X-Accel-Buffering: no`
- keepalive comments
- long read/send timeouts
- buffering disabled

## Zerve artifact layout

The Zerve deployment should keep the generated files in:

```text
spatial/
  spatial_dashboard.html
  spatial_quality_scorecard.json
  postgis_extension_report.md
  spatial_index_audit.md
```

These files are served directly by the FastAPI app.

## Operational notes

- Keep the spatial app separate from the core Argus Next.js app.
- The Zerve deployment is the analysis/rendering layer.
- Argus nginx only proxies traffic to it.
