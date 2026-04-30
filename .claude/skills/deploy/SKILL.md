---
name: deploy
description: Build, commit, push, rebuild the droplet container, and smoke-test the live endpoints
user_invocable: true
---

# Deploy Skill

Full deployment pipeline for Argus. Runs on the droplet itself — no SSH needed.

## Steps

1. **Type-check.** `cd argus-app && npx tsc --noEmit`. Stop if errors.
2. **Production build.** `npx next build` in `argus-app/`. Stop if build fails.
3. **Stage + commit + push.**
   - Show `git status` and `git diff --stat`.
   - Stage only the files relevant to this change set, by name (never `git add -A`, never stage `.env*` or `data/settings.json`).
   - Commit with a descriptive message ending with the standard `Co-Authored-By` line.
   - `git push origin master`. If the push is rejected, `git pull --rebase origin master` (stashing any unrelated dirty files like `data/settings.json` first) and retry.
4. **Rebuild the droplet container.**
   `docker compose up -d --no-deps --build --force-recreate argus-app`
   `--no-deps` prevents unrelated sibling services from being touched and avoids the orphan-container conflict that bites when phantom/api are also recreated.
5. **Verify the new image is actually serving.**
   `docker inspect -f '{{.Image}} created={{.Created}}' argus_app` — confirm the timestamp matches the build that just finished.
6. **Smoke-test the live endpoints.** Invoke `/verify-deploy` (or curl inline). Always hit `/api/feeds/health` plus the route(s) touched by this change. Quote HTTP code + first ~200 bytes. Any 5xx = failure; do not declare success.
7. **Report.** Commit sha, files changed, image sha, smoke-test results. The droplet rebuild + smoke test IS the deploy — do not tell the user to "check Vercel"; Vercel auto-builds but isn't on the serving path.

## Rules

- Do not skip step 6 — verify-before-victory is mandatory.
- Do not stage `data/settings.json` — it is intentionally local on the droplet.
- Do not run `docker system prune` or destructive volume ops as part of deploy.
- If smoke tests fail, diagnose and iterate; do not claim success.
