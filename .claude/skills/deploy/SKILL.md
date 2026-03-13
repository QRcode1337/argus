name: deploy
description: Build, commit, push, and verify the Argus app deployment
user_invocable: true

---

# Deploy Skill

Run the full deployment pipeline for Argus.

## Steps

1. Run `npx tsc --noEmit` in `argus-app/` to check for type errors. Stop if errors found.
2. Run `npx next build` in `argus-app/` to verify production build. Stop if build fails.
3. Show `git status` and `git diff --stat` to summarize changes.
4. Stage relevant files (never stage .env files with secrets).
5. Create a commit with a descriptive message.
6. Push to origin/master.
7. Report success and remind user to check Vercel deployment status.
