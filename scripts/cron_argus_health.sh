#!/usr/bin/env bash
set -euo pipefail

SITE_BASE="https://argusweb.space"
API_HEALTH="${SITE_BASE}/api/health"

REPO_URL="$(git -C /home/volta/argus config --get remote.origin.url || true)"

LOG_DIR="/home/volta/argus/logs"
LOG_FILE="${LOG_DIR}/health-cron.log"
mkdir -p "${LOG_DIR}"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

check_url() {
  local name="$1"
  local url="$2"

  local out code total
  out=$(curl -sS -o /tmp/argus_health_body.$$ -w "%{http_code} %{time_total}" --max-time 25 "$url" || echo "000 0")
  code="${out%% *}"
  total="${out##* }"

  if [[ "$code" =~ ^2|3 ]]; then
    echo "$(ts) | OK   | ${name} | code=${code} | total=${total}s | url=${url}" >> "$LOG_FILE"
    return 0
  else
    local snippet
    snippet=$(head -c 160 /tmp/argus_health_body.$$ 2>/dev/null | tr '\n' ' ' || true)
    echo "$(ts) | FAIL | ${name} | code=${code} | total=${total}s | url=${url} | body=${snippet}" >> "$LOG_FILE"
    return 1
  fi
}

status=0
check_url "argus-root" "$SITE_BASE" || status=1
check_url "argus-api-health" "$API_HEALTH" || status=1

# GitHub platform reachability
check_url "github-root" "https://github.com" || status=1

# Repository reachability via git remote (works for private repos too)
if [[ -n "$REPO_URL" ]]; then
  if git -C /home/volta/argus ls-remote --exit-code origin HEAD >/tmp/argus_git_head.$$ 2>/tmp/argus_git_err.$$; then
    head_sha=$(awk '{print $1}' /tmp/argus_git_head.$$ | head -n1)
    echo "$(ts) | OK   | github-origin-head | sha=${head_sha} | remote=${REPO_URL}" >> "$LOG_FILE"
  else
    err_snip=$(head -c 180 /tmp/argus_git_err.$$ | tr '\n' ' ' || true)
    echo "$(ts) | FAIL | github-origin-head | remote=${REPO_URL} | err=${err_snip}" >> "$LOG_FILE"
    status=1
  fi
else
  echo "$(ts) | WARN | github-origin-head | remote.origin missing" >> "$LOG_FILE"
fi

rm -f /tmp/argus_health_body.$$ /tmp/argus_git_head.$$ /tmp/argus_git_err.$$ || true
exit $status
