# workers/argus

Cloudflare Worker in front of the existing Tunnel → DO origin for `argusweb.bond` (Option A).

## Behavior
- **Default traffic:** passthrough (no Workers AI)
- **`/analyze`:** requires `Authorization: Bearer $ANALYZE_SECRET` (or `x-argus-analyze-secret`); pulls **zone-scoped** Cloudflare GraphQL Analytics for `argusweb.bond`, then summarizes with Workers AI

## Setup
```bash
cd workers/argus
wrangler secret put ANALYZE_SECRET
wrangler secret put CF_API_TOKEN
wrangler secret put CF_ACCOUNT_ID
wrangler secret put CF_ZONE_ID   # argusweb.bond zone id/tag
# optional: wrangler secret put ORIGIN_URL
wrangler deploy
```

Leave the duplicate Worker named `argusweb` alone for now. Hold deploy until secrets are set.
