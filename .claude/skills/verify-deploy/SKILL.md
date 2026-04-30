---
name: verify-deploy
description: Smoke-test the live Argus endpoints after a deploy and report HTTP codes plus payload preview
user_invocable: true
---

# Verify Deploy

Hits the running Argus stack on the droplet and reports whether each endpoint is healthy. **Use this immediately after `/deploy`, after any container rebuild, or any time you suspect a regression — before claiming "fixed".**

## How

Run a single Bash command that curls each endpoint with a tight timeout and prints `{name | http | bytes | first 200 chars}`. The endpoint list is grouped by tier so you can scope the check to just AI, just feeds, etc.

### Default suite (run all of these)

```
=== CORE ===
GET  http://localhost/api/feeds/health
GET  http://localhost/api/settings

=== FEEDS (no key) ===
GET  http://localhost/api/feeds/usgs
GET  http://localhost/api/feeds/celestrak
GET  http://localhost/api/feeds/gdelt
GET  http://localhost/api/feeds/iss
GET  http://localhost/api/feeds/news
GET  http://localhost/api/feeds/adsb-military

=== AI ===
GET  http://localhost/api/ai/gdelt-digest?batchSize=50

=== ANALYTICS ===
GET  http://localhost/api/analytics/layers
```

### Recipe

```bash
# Per-row format: "group timeout path"  (timeout in seconds; AI/digest paths need 60+ for cold Gradient)
ENDPOINTS=(
  "core  10 /api/feeds/health"
  "core  10 /api/settings"
  "feeds 20 /api/feeds/usgs"
  "feeds 20 /api/feeds/celestrak"
  "feeds 30 /api/feeds/gdelt"
  "feeds 10 /api/feeds/iss"
  "feeds 20 /api/feeds/news"
  "feeds 20 /api/feeds/adsb-military"
  "ai    90 /api/ai/gdelt-digest?batchSize=50"
  "ana   10 /api/analytics/layers"
)
fail=0
printf "%-6s %-40s %-5s %-8s %s\n" GROUP PATH HTTP BYTES PREVIEW
for line in "${ENDPOINTS[@]}"; do
  read -r group timeout path <<< "$line"
  : > /tmp/vd.body  # clear previous body so timeouts don't show stale preview
  out=$(curl -s -m "$timeout" -o /tmp/vd.body -w "%{http_code} %{size_download}" "http://localhost${path}")
  http="${out% *}"; bytes="${out##* }"
  preview=$(head -c 100 /tmp/vd.body | tr '\n' ' ')
  printf "%-6s %-40s %-5s %-8s %.100s\n" "$group" "$path" "$http" "$bytes" "$preview"
  if [[ "$http" =~ ^5 ]] || [[ "$http" == "000" ]]; then fail=1; fi
done
[ $fail -eq 1 ] && echo "FAIL: at least one 5xx or timeout — DO NOT claim fixed" || echo "OK: all endpoints healthy"
```

## Rules

- A 5xx or `000` (timeout) on any endpoint means the deploy is **not** healthy. Do not declare success.
- A 4xx on a feed that requires an API key is acceptable if the key is intentionally absent — note it but don't fail the run.
- If the user asks to verify only a subset, take a comma-separated list of paths or group names (`ai`, `feeds`, `core`, `ana`) as input and filter the array.
- Always quote the actual `http` and `bytes` columns back to the user. Do not paraphrase as "looks good".
