---
name: stack-audit
description: Audit the running Docker stack against all docker-compose*.yml files and flag missing services, missing health checks, restart loops, and resource pressure
user_invocable: true
---

# Stack Audit

Catches the class of bug we hit when `docker-compose.realtime.yml` was defined but never started, leaving `argus_api` to spam `Redis ConnectionTimeoutError` for 30+ minutes. Run periodically or after any infrastructure change.

## Steps

1. **List declared services across every compose file.**
   ```bash
   for f in /home/volta/argus/docker-compose*.yml; do
     echo "=== $f ==="
     docker compose -f "$f" config --services 2>/dev/null
   done
   ```

2. **Cross-check against running containers.**
   ```bash
   running=$(docker ps --format '{{.Names}}' | sort)
   echo "$running"
   ```
   Flag any declared service that isn't represented by a running container. Note: profile-gated services (`profiles: [tools]`, `profiles: [workers]`) are intentionally optional — list them as "optional, not running" rather than "missing".

3. **Restart counts.** `docker inspect -f '{{.RestartCount}} {{.Name}}' $(docker ps -aq) | sort -rn`. Anything ≥3 is a restart loop — investigate logs.

4. **Health checks.**
   `docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}} {{.Name}}' $(docker ps -q)`
   Flag any `unhealthy`. `no-healthcheck` is a soft warning — list affected services so we can add `HEALTHCHECK` directives over time.

5. **Recent error noise (last 30 min).**
   For each running container, count log lines matching `error|fatal|panic|exception|fail` with `-i`. Anything ≥50 is a noisy container — quote 5 sample lines.

6. **Disk pressure.** `docker system df` and `df -h /`. Flag if root disk >75% used, or if reclaimable build cache + dangling images >5 GB.

7. **Nginx 5xx (last 30 min).** `docker logs --since 30m argus_nginx 2>&1 | grep -E ' 5[0-9]{2} ' | wc -l`. Anything >5 is real user impact — break down by status code and path.

8. **Report**, grouped by severity:
   - **CRITICAL** — missing required service, restart loop, unhealthy, nginx 5xx storm
   - **WARN** — error-noise containers, disk pressure, no-healthcheck
   - **INFO** — optional/profile services, dangling images count

## Rules

- Do not fix anything automatically — this is read-only diagnosis. Surface findings and let the user choose what to act on.
- Treat profile-gated compose services (`profiles:` key) as opt-in, not missing.
- If the only compose file with a service is `docker-compose.observability.yml` and observability isn't currently desired, classify as INFO not CRITICAL.
