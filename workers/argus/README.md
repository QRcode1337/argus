# workers/argus

Cloudflare Worker in front of the existing Tunnel → DO origin for `argusweb.bond` (Option A).

## Behavior
- **Default traffic:** passthrough (no Workers AI)
- **`/analyze`:** requires `Authorization: Bearer $ANALYZE_SECRET` (or `x-argus-analyze-secret`); pulls Cloudflare GraphQL Analytics, then summarizes with Workers AI

## Setup
```bash
cd workers/argus
wrangler secret put ANALYZE_SECRET
wrangler secret put CF_API_TOKEN
wrangler secret put CF_ACCOUNT_ID
# optional: wrangler secret put ORIGIN_URL   # if not relying on zone route alone
wrangler deploy
```

Leave the duplicate Worker named `argusweb` alone for now.
