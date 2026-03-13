name: cleanup
description: Remove dead code with thorough verification — grep all references, remove, rebuild, confirm
user_invocable: true

---

# Dead Code Cleanup Skill

Thoroughly remove dead code or unused features from the Argus codebase.

## Steps

1. Ask the user what feature/code to remove (if not already specified).
2. Grep the entire `argus-app/src/` directory for ALL references: imports, components, API routes, types, interfaces, config keys, .env entries.
3. List every file and line that references the target.
4. Remove all references across all files.
5. Run `npx next build` in `argus-app/` to verify nothing broke.
6. Run a final grep to prove zero remaining references. Show the output.
7. If any references remain, remove them and repeat from step 5.
8. Summarize what was removed (files deleted, lines removed, config cleaned).
