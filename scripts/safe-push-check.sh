#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
NC='\033[0m'

fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
warn() { echo -e "${YEL}! $1${NC}"; }
ok()   { echo -e "${GRN}✓ $1${NC}"; }

echo "Running ARGUS safe push checks..."

# 1) staged secrets / risky files
staged=$(git diff --cached --name-only)
if [[ -z "$staged" ]]; then
  fail "No staged files. Stage changes before push."
fi

echo "$staged" | grep -E '(^|/)(\.env($|\.)|.*credentials.*\.json$|.*\.pem$|.*\.key$|.*\.bak$)' >/dev/null && \
  fail "Staged files include secret/backup patterns (.env*, credentials.json, .pem, .key, .bak)."
ok "No obvious secret/backup filenames staged"

# 2) working tree cleanliness (warn only)
if [[ -n "$(git status --porcelain)" ]]; then
  warn "Working tree not clean (allowed, but verify intentional)."
else
  ok "Working tree clean"
fi

# 3) lint check for app when app files touched
if echo "$staged" | grep -E '^argus-app/' >/dev/null; then
  echo "argus-app changes detected -> running lint"
  (cd argus-app && npm run lint >/dev/null)
  ok "argus-app lint passed"
fi

# 4) compose config check when infra touched
if echo "$staged" | grep -E '(^docker-compose.*\.yml$|^nginx/|^cloudflared/)' >/dev/null; then
  docker compose config >/dev/null
  ok "docker compose config valid"
fi

# 5) simple secret content scan (staged diff)
if git diff --cached | grep -E '(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----|xox[baprs]-|ghp_[A-Za-z0-9]{36}|[0-9]{8,}:[A-Za-z0-9_-]{35})' >/dev/null; then
  fail "Possible secret detected in staged diff."
fi
ok "No obvious token/private-key patterns in staged diff"

echo -e "${GRN}All checks passed. Safe to push.${NC}"
